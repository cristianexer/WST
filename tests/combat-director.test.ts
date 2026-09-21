import { describe, expect, it } from 'vitest';
import {
  createMatch,
  getObservation,
  legalActions,
  moves,
  stepMatch,
  TICKS_PER_SECOND,
  type ActionId,
  type MatchState,
} from '../packages/combat-core/src';
import { CombatDirector } from '../apps/web/src/ai';
import type { Decision } from '../apps/web/src/ai/types';

function fighting(seed = 0x517): MatchState {
  let state = createMatch({ seed });
  while (state.phase === 'ready') state = stepMatch(state, ['idle', 'idle']);
  return state;
}

function laya(action: ActionId): Decision {
  return { action, latencyMs: 500, source: 'laya' };
}

function observationAtDistance(distanceMetres: number): MatchState {
  const state = fighting();
  state.fighters[0].x = -distanceMetres / 2;
  state.fighters[1].x = distanceMetres / 2;
  return state;
}

describe('CombatDirector model handoff', () => {
  it('keeps one reachable non-idle Laya proposal and labels it as model output', () => {
    const state = observationAtDistance(moves.light.reach * 0.8);
    const observation = getObservation(state, 0);
    const director = new CombatDirector('standard', 4);

    director.acceptModel(laya('light'), observation.tick, observation.round);
    const choice = director.choose(observation, legalActions(state, 0));

    expect(choice).toMatchObject({ action: 'light', origin: 'model' });
    expect(choice.reason).toContain('Laya');

    // The proposal is deliberately one-shot, even if the state is unchanged.
    const afterConsumption = director.choose(observation, legalActions(state, 0));
    expect(afterConsumption.origin).toBe('combat');
  });

  it('rejects stale, illegal, and out-of-range model attacks without relabelling a reflex as Laya', () => {
    const distant = observationAtDistance(moves.light.reach + 1);
    const observation = getObservation(distant, 0);
    const director = new CombatDirector('standard', 8);

    director.acceptModel(laya('light'), observation.tick, observation.round);
    const outOfRange = director.choose(observation, legalActions(distant, 0));
    expect(outOfRange).toMatchObject({ action: 'advance', origin: 'combat' });

    director.acceptModel(laya('heavy'), observation.tick - 121, observation.round);
    const stale = director.choose(observation, legalActions(distant, 0));
    expect(stale.origin).toBe('combat');

    director.acceptModel(laya('heavy'), observation.tick, observation.round);
    const illegal = director.choose(observation, ['idle', 'advance']);
    expect(illegal).toMatchObject({ action: 'advance', origin: 'combat' });
  });
});

describe('CombatDirector public reflexes', () => {
  it('uses public low, height, and meter context for guard, defensive signature, anti-air, and air kick', () => {
    const lowState = observationAtDistance(moves.low.reach * 0.7);
    lowState.fighters[1].action = 'low';
    lowState.fighters[1].actionTick = Math.max(1, Math.min(moves.low.startup, 2));
    const lowDirector = new CombatDirector('standard', 11);
    const lowChoice = lowDirector.choose(getObservation(lowState, 0), legalActions(lowState, 0));
    expect(lowChoice).toMatchObject({ action: 'guard_low', origin: 'combat' });

    const defenceState = observationAtDistance(moves.low.reach * 0.7);
    defenceState.fighters[0].meter = moves.special_veto.meterCost;
    defenceState.fighters[1].action = 'low';
    defenceState.fighters[1].actionTick = Math.max(1, Math.min(moves.low.startup, 2));
    const defenceDirector = new CombatDirector('standard', 13);
    const defenceChoice = defenceDirector.choose(getObservation(defenceState, 0), legalActions(defenceState, 0));
    expect(defenceChoice).toMatchObject({ action: 'special_veto', origin: 'combat' });

    const airState = observationAtDistance(moves.anti_air.reach * 0.7);
    airState.fighters[1].action = 'jump';
    airState.fighters[1].actionTick = 8;
    airState.fighters[1].y = 0.5;
    airState.fighters[1].airTicksTotal = 32;
    const airDirector = new CombatDirector('expert', 12);
    const airChoice = airDirector.choose(getObservation(airState, 0), legalActions(airState, 0));
    expect(airChoice).toMatchObject({ action: 'anti_air', origin: 'combat' });

    const airborneState = observationAtDistance(moves.air_kick.reach * 0.7);
    airborneState.fighters[0].action = 'jump';
    airborneState.fighters[0].actionTick = 8;
    airborneState.fighters[0].y = 0.5;
    airborneState.fighters[0].airTicksTotal = 32;
    const airborneDirector = new CombatDirector('standard', 14);
    const airborneChoice = airborneDirector.choose(getObservation(airborneState, 0), legalActions(airborneState, 0));
    expect(airborneChoice).toMatchObject({ action: 'air_kick', origin: 'combat' });
  });

  it('turns repeated idle model replies into visible combat movement and real damage', () => {
    const director = new CombatDirector('standard', 0x7a);
    let state = fighting(0x7a);
    const startDistance = Math.abs(state.fighters[1].x - state.fighters[0].x);
    let closestDistance = startDistance;
    let applied: ActionId = 'idle';
    const origins: string[] = [];

    // 10 seconds at 60 Hz; decisions are refreshed at 15 Hz. Each refresh is
    // intentionally given a genuine-but-passive Laya reply.
    for (let tick = 0; tick < TICKS_PER_SECOND * 10; tick += 1) {
      if (tick % 4 === 0) {
        const observation = getObservation(state, 0);
        director.acceptModel(laya('idle'), observation.tick, observation.round);
        const choice = director.choose(observation, legalActions(state, 0));
        applied = choice.action;
        origins.push(choice.origin);
      }
      state = stepMatch(state, [applied, 'idle']);
      closestDistance = Math.min(closestDistance, Math.abs(state.fighters[1].x - state.fighters[0].x));
    }

    expect(origins).toContain('combat');
    expect(origins).not.toContain('model');
    expect(closestDistance).toBeLessThan(startDistance);
    expect(state.fighters[1].health).toBeLessThan(1_000);
  });
});
