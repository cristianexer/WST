import { describe, expect, it } from 'vitest';
import { CombatWorkerRuntime } from '../apps/web/src/game/combat-worker';
import { replayState, type ReplayData } from '../apps/web/src/game/replay';
import { signatureForCharacter, type ActionId } from '../packages/combat-core/src';

describe('selected fighter profiles across worker and replay boundaries', () => {
  it('uses both selected builds and reconstructs their exact applied simulation', () => {
    const fighters: [string, string] = ['milei', 'kim'];
    const specials = [signatureForCharacter(fighters[0]).id, signatureForCharacter(fighters[1]).id] as const;
    const runtime = new CombatWorkerRuntime(() => undefined);
    runtime.handle({ type: 'start', requestId: 1, options: { epoch: 1, seed: 517, fighters, specials: [...specials], snapshotBatchTicks: 1 } });
    expect(runtime.currentState?.fighters.map(fighter => fighter.maxHealth)).toEqual([850, 1100]);
    const inputs: [ActionId, ActionId][] = [];
    for (let tick = 0; tick < 420; tick++) {
      runtime.handle({ type: 'submit', epoch: 1, inputs: tick < 160 ? ['advance', 'advance'] : tick % 40 === 0 ? ['heavy', 'light'] : ['idle', 'guard_high'] });
      inputs.push(...runtime.advanceTicks(1).map(frame => frame.inputs));
    }
    const replay: ReplayData = { version: 5, id: 'fighter-profiles', createdAt: '2026-09-21', seed: 517, player: fighters[0], opponent: fighters[1], specials: [...specials], controller: 'baseline', inputs, wins: runtime.currentState!.wins, winner: runtime.currentState!.winner };
    expect(replayState(replay)).toEqual(runtime.currentState);
  });
});

// A direction release/change and an attack may arrive during the same display frame.
it('changes held direction atomically with an attack, without an old advance leaking into the next tick', () => {
  const runtime = new CombatWorkerRuntime(() => undefined);
  runtime.handle({ type: 'start', requestId: 1, options: { epoch: 1 } });
  runtime.advanceTicks(90);
  runtime.handle({ type: 'submit', epoch: 1, inputs: ['advance', 'idle'] });
  runtime.advanceTicks(3);
  runtime.handle({ type: 'submit', epoch: 1, inputs: ['light', 'idle'], heldInputs: ['retreat', 'idle'] });
  const frames = runtime.advanceTicks(3);
  expect(frames.map(frame => frame.inputs[0])).toEqual(['light', 'retreat', 'retreat']);
  runtime.handle({ type: 'submit', epoch: 1, inputs: ['heavy', 'idle'], heldInputs: ['idle', 'idle'] });
  expect(runtime.advanceTicks(2).map(frame => frame.inputs[0])).toEqual(['heavy', 'idle']);
});
