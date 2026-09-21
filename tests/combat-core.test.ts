import { describe, expect, it } from 'vitest';
import {
  READY_TICKS,
  ROUND_END_TICKS,
  ROUND_TICKS,
  actionIds,
  baseActionIds,
  createMatch,
  fighterProfileForCharacter,
  fighterProfiles,
  getObservation,
  legalActions,
  moves,
  neutralFighterProfile,
  resolveActionCandidates,
  signatureActionIds,
  signatureForCharacter,
  signatureProfiles,
  stepMatch,
  type ActionId,
  type MatchState,
} from '../packages/combat-core/src';

const idle: [ActionId, ActionId] = ['idle', 'idle'];

function advance(state: MatchState, ticks: number, inputs: [ActionId, ActionId] = idle): MatchState {
  let result = state;
  for (let tick = 0; tick < ticks; tick += 1) result = stepMatch(result, inputs);
  return result;
}

function fighting(distance = 0.8): MatchState {
  let state = advance(createMatch({ seed: 7 }), READY_TICKS);
  state.fighters[0].x = -distance / 2;
  state.fighters[1].x = distance / 2;
  return state;
}

function untilEvent(
  initial: MatchState,
  type: string,
  inputs: [ActionId, ActionId],
  limit = 200,
): MatchState {
  let state = initial;
  for (let tick = 0; tick < limit; tick += 1) {
    state = stepMatch(state, inputs);
    if (state.events.some((event) => event.type === type)) return state;
  }
  throw new Error(`No ${type} event within ${limit} ticks`);
}

describe('V1 move register', () => {
  it('preserves the 21 base actions and adds one fixed signature per roster character', () => {
    expect(baseActionIds).toHaveLength(21);
    expect(signatureActionIds).toHaveLength(21);
    expect(actionIds).toHaveLength(42);
    expect(actionIds).not.toContain('special_summit');
    expect(moves.light).toMatchObject({ startup: 4, active: 2, recovery: 9, damage: 45, reach: 0.9 });
    expect(moves.body).toMatchObject({ startup: 7, active: 3, recovery: 12 });
    expect(moves.heavy).toMatchObject({ startup: 12, active: 3, recovery: 18 });
    expect(moves.low).toMatchObject({ startup: 9, active: 3, recovery: 16 });
    expect(moves.overhead).toMatchObject({ startup: 16, active: 3, recovery: 20 });
    expect(moves.anti_air).toMatchObject({ startup: 8, active: 4, recovery: 18 });
    expect(moves.air_kick).toMatchObject({ startup: 6, active: 4, recovery: 14 });
    expect(moves.throw).toMatchObject({ startup: 12, active: 2, recovery: 30, damage: 105 });
    expect(moves.special_papers).toMatchObject({ meterCost: 100, damage: 150, reach: 1.4 });
  });
});

describe('balanced delegate profiles', () => {
  it('gives all 21 delegates a unique five-stat tuple from the same 500-point budget', () => {
    const profiles = Object.values(fighterProfiles);
    expect(profiles).toHaveLength(21);
    const tuples = profiles.map(({ stats }) => Object.values(stats));
    for (const tuple of tuples) {
      expect(tuple.reduce((sum, value) => sum + value, 0)).toBe(500);
      expect(Math.min(...tuple)).toBeGreaterThanOrEqual(85);
      expect(Math.max(...tuple)).toBeLessThanOrEqual(115);
    }
    // Power and vitality are reciprocal combat trades rather than a stackable
    // damage-and-health advantage; mobility/resources spend the other 300.
    for (const { stats } of profiles) expect(stats.power + stats.vitality).toBe(200);
    expect(new Set(tuples.map((tuple) => tuple.join(','))).size).toBe(21);
    expect(fighterProfileForCharacter('missing')).toBe(neutralFighterProfile);
    expect(fighterProfileForCharacter('__proto__')).toBe(neutralFighterProfile);
    expect(fighterProfileForCharacter('constructor')).toBe(neutralFighterProfile);
  });

  it('derives health and stamina maxima and preserves profile IDs across rounds', () => {
    let state = createMatch({ fighters: ['kim', 'von-der-leyen'] });
    expect(state.fighters[0]).toMatchObject({ profileId: 'kim', health: 1_100, maxHealth: 1_100, stamina: 100, maxStamina: 100 });
    expect(state.fighters[1]).toMatchObject({ profileId: 'von-der-leyen', health: 1_100, maxHealth: 1_100, stamina: 110, maxStamina: 110 });
    state = advance(state, READY_TICKS);
    state.fighters[1].health = 0;
    state = stepMatch(state, idle);
    state = advance(state, ROUND_END_TICKS);
    expect(state.fighters.map((fighter) => fighter.profileId)).toEqual(['kim', 'von-der-leyen']);
    expect(state.fighters.map((fighter) => fighter.health)).toEqual([1_100, 1_100]);
  });

  it('scales movement and every health-damage route exactly once from power or speed', () => {
    let fast = advance(createMatch({ fighters: ['albanese', 'neutral'] }), READY_TICKS);
    let slow = advance(createMatch({ fighters: ['burnham', 'neutral'] }), READY_TICKS);
    fast = advance(fast, 8, ['advance', 'idle']);
    slow = advance(slow, 8, ['advance', 'idle']);
    expect(fast.fighters[0].x + 2).toBeGreaterThan(slow.fighters[0].x + 2);
    expect(fast.fighters[0].velocityX).toBeCloseTo(2.4 * 1.1, 4);
    expect(slow.fighters[0].velocityX).toBeCloseTo(2.4 * 0.9, 4);

    let normal = advance(createMatch({ fighters: ['prabowo', 'neutral'] }), READY_TICKS);
    normal.fighters[0].x = -0.35; normal.fighters[1].x = 0.35;
    normal = untilEvent(normal, 'hit', ['light', 'idle']);
    expect(normal.events.find((event) => event.type === 'hit')?.damage).toBe(52);

    let thrown = advance(createMatch({ fighters: ['prabowo', 'neutral'] }), READY_TICKS);
    thrown.fighters[0].x = -0.3; thrown.fighters[1].x = 0.3;
    thrown = untilEvent(thrown, 'throw-hit', ['throw', 'idle']);
    expect(thrown.events.find((event) => event.type === 'throw-hit')?.damage).toBe(121);

    const signature = signatureForCharacter('prabowo');
    let special = advance(createMatch({ fighters: ['prabowo', 'neutral'], specials: [signature.id, 'special_veto'] }), READY_TICKS);
    special.fighters[0].x = -0.4; special.fighters[1].x = 0.4; special.fighters[0].meter = 100;
    special = untilEvent(special, 'hit', [signature.id, 'idle']);
    expect(special.events.find((event) => event.type === 'hit')?.damage).toBe(Math.round(signature.damage * 1.15));

    const counter = signatureForCharacter('carney');
    let countered = advance(createMatch({ fighters: ['neutral', 'carney'], specials: ['special_veto', counter.id] }), READY_TICKS);
    countered.fighters[0].x = -0.35; countered.fighters[1].x = 0.35; countered.fighters[1].meter = 100;
    countered = stepMatch(countered, ['idle', counter.id]);
    countered = untilEvent(countered, 'counter-hit', ['light', 'idle']);
    expect(countered.events.find((event) => event.type === 'counter-hit')?.damage).toBe(Math.round(counter.damage * 0.9));
  });

  it('scales stamina regeneration while respecting each fighter maximum', () => {
    let state = advance(createMatch({ fighters: ['carney', 'putin'] }), READY_TICKS);
    state.fighters[0].stamina = 50;
    state.fighters[1].stamina = 50;
    state = advance(state, 60);
    expect(state.fighters[0].stamina).toBeCloseTo(63.2, 4);
    expect(state.fighters[1].stamina).toBeCloseTo(61.4, 4);
    state = advance(state, 600);
    expect(state.fighters[0].stamina).toBe(state.fighters[0].maxStamina);
    expect(state.fighters[1].stamina).toBe(state.fighters[1].maxStamina);
  });
});

describe('fixed character signatures', () => {
  it('exports 21 unique profiles with stable action, audio and FX identities', () => {
    const profiles = Object.values(signatureProfiles);
    expect(profiles).toHaveLength(21);
    expect(new Set(profiles.map((item) => item.id)).size).toBe(21);
    expect(new Set(profiles.map((item) => item.name)).size).toBe(21);
    expect(new Set(profiles.map((item) => item.audioCue)).size).toBe(21);
    expect(new Set(profiles.map((item) => JSON.stringify({
      kind: item.kind,
      startup: item.startup,
      active: item.active,
      recovery: item.recovery,
      damage: item.damage,
      reach: item.reach,
      travel: item.travel,
      staminaDamage: item.staminaDamage,
      meterDrain: item.meterDrain,
      knockdown: item.knockdown,
    }))).size).toBe(21);
    expect(signatureForCharacter('trump')).toMatchObject({
      id: 'signature_executive_order',
      name: 'Executive Order',
      audioCue: 'signature.trump',
    });
  });

  it('emits one release event on the first active tick and applies profile hit data', () => {
    const profile = signatureForCharacter('merz');
    let state = fighting(0.9);
    state.fighters[0].special = profile.id;
    state.fighters[0].meter = 100;
    state = stepMatch(state, [profile.id, 'idle']);
    let releases = 0;
    for (let tick = 0; tick < profile.startup + profile.active + 2; tick += 1) {
      state = stepMatch(state, idle);
      releases += state.events.filter((event) => event.type === 'signature-release').length;
    }
    expect(releases).toBe(1);
    expect(state.fighters[1].health).toBe(1_000 - profile.damage);
    expect(state.fighters[1].knockdown).toBeGreaterThan(0);
  });

  it('moves rush signatures during their active frames without changing base timings', () => {
    const profile = signatureForCharacter('burnham');
    let state = fighting(4);
    state.fighters[0].special = profile.id;
    state.fighters[0].meter = 100;
    const startX = state.fighters[0].x;
    state = stepMatch(state, [profile.id, 'idle']);
    state = advance(state, profile.startup + profile.active + 1);
    expect(state.fighters[0].x).toBeCloseTo(startX + profile.travel, 3);
  });

  it('gives shield and counter signatures distinct defensive resolutions', () => {
    const shield = signatureForCharacter('xi');
    let shielded = fighting(0.8);
    shielded.fighters[1].special = shield.id;
    shielded.fighters[1].meter = 100;
    shielded = stepMatch(shielded, ['idle', shield.id]);
    shielded = advance(shielded, shield.startup);
    shielded = untilEvent(shielded, 'shield-absorb', ['light', 'idle']);
    expect(shielded.fighters[1].health).toBe(1_000);
    expect(shielded.events[0]).toMatchObject({ actor: 1, action: shield.id });

    const counter = signatureForCharacter('putin');
    let countered = fighting(0.8);
    countered.fighters[1].special = counter.id;
    countered.fighters[1].meter = 100;
    countered = stepMatch(countered, ['idle', counter.id]);
    countered = untilEvent(countered, 'counter-hit', ['light', 'idle']);
    expect(countered.events.find((event) => event.type === 'counter-hit')).toMatchObject({
      actor: 1,
      action: counter.id,
      damage: counter.damage,
    });
    expect(countered.fighters[0].health).toBe(1_000 - counter.damage);
    expect(countered.fighters[1].health).toBe(1_000);
  });

  it('applies the profile-specific resource drain and knockdown', () => {
    const profile = signatureForCharacter('kim');
    let state = fighting(0.9);
    state.fighters[0].special = profile.id;
    state.fighters[0].meter = 100;
    state.fighters[1].meter = 50;
    state = untilEvent(state, 'hit', [profile.id, 'idle']);
    expect(state.fighters[1]).toMatchObject({
      health: 1_000 - profile.damage,
      stamina: 100 - profile.staminaDamage,
      meter: 50 + 3 - profile.meterDrain,
    });
    expect(state.fighters[1].knockdown).toBeGreaterThanOrEqual(profile.knockdown);
  });

  it('charges special meter faster on clean hits while retaining a 100 meter cost', () => {
    let state = fighting(0.8);
    state = untilEvent(state, 'hit', ['light', 'idle']);
    expect(state.fighters[0].meter).toBe(14);
    expect(state.fighters[1].meter).toBe(3);
    expect(signatureForCharacter('lee').meterCost).toBe(100);
  });
});

describe('fixed-step match lifecycle', () => {
  it('uses a 60-second timer and advances one deterministic immutable tick at a time', () => {
    const initial = createMatch({ seed: 123 });
    const stateA = advance(initial, READY_TICKS + 30, ['advance', 'advance']);
    const stateB = advance(createMatch({ seed: 123 }), READY_TICKS + 30, ['advance', 'advance']);

    expect(initial.tick).toBe(0);
    expect(initial.fighters[0].x).toBe(-2);
    expect(stateA).toEqual(stateB);
    expect(stateA.tick).toBe(READY_TICKS + 30);
    expect(stateA.timer).toBe(ROUND_TICKS - 30);
  });

  it('allows one fourth deciding round and then declares a drawn match', () => {
    let state = fighting();
    for (let round = 1; round <= 4; round += 1) {
      state.timer = 1;
      state.fighters[0].health = 500;
      state.fighters[1].health = 500;
      state = stepMatch(state, idle);
      expect(state.events[0]).toMatchObject({ type: 'round-end', outcome: 'draw' });
      state = advance(state, ROUND_END_TICKS);
      if (round < 4) state = advance(state, READY_TICKS);
    }
    expect(state.phase).toBe('match-end');
    expect(state.round).toBe(4);
    expect(state.winner).toBe('draw');
  });

  it('resolves simultaneous knockouts as a drawn round', () => {
    let state = fighting(0.8);
    state.fighters[0].health = moves.light.damage;
    state.fighters[1].health = moves.light.damage;
    state = untilEvent(state, 'hit', ['light', 'light']);
    expect(state.fighters.map((fighter) => fighter.health)).toEqual([0, 0]);
    expect(state.phase).toBe('round-end');
    expect(state.wins).toEqual([0, 0]);
  });

  it('compares normalized remaining health at timeout across different vitality maxima', () => {
    let full = advance(createMatch({ fighters: ['milei', 'kim'] }), READY_TICKS);
    full.timer = 1;
    full = stepMatch(full, idle);
    expect(full.events[0]).toMatchObject({ type: 'round-end', outcome: 'draw' });

    let tied = advance(createMatch({ fighters: ['milei', 'kim'] }), READY_TICKS);
    tied.timer = 1;
    tied.fighters[0].health = tied.fighters[0].maxHealth / 2;
    tied.fighters[1].health = tied.fighters[1].maxHealth / 2;
    tied = stepMatch(tied, idle);
    expect(tied.events[0]).toMatchObject({ type: 'round-end', outcome: 'draw' });

    let won = advance(createMatch({ fighters: ['milei', 'kim'] }), READY_TICKS);
    won.timer = 1;
    won.fighters[0].health = won.fighters[0].maxHealth / 2 + 1;
    won.fighters[1].health = won.fighters[1].maxHealth / 2;
    won = stepMatch(won, idle);
    expect(won.events[0]).toMatchObject({ type: 'round-end', outcome: 0 });
  });

  it('ends the match after a fighter earns two round wins', () => {
    let state = fighting();
    for (let win = 0; win < 2; win += 1) {
      state.fighters[1].health = 0;
      state = stepMatch(state, idle);
      expect(state.wins[0]).toBe(win + 1);
      state = advance(state, ROUND_END_TICKS);
      if (win === 0) state = advance(state, READY_TICKS);
    }
    expect(state.phase).toBe('match-end');
    expect(state.winner).toBe(0);
  });
});

describe('strikes and directional defence', () => {
  it('activates a move on startup + 1 and applies hitstop once', () => {
    let state = fighting(0.8);
    state = stepMatch(state, ['light', 'idle']);
    state = advance(state, moves.light.startup, idle);
    expect(state.fighters[1].health).toBe(1_000);
    state = stepMatch(state, idle);
    expect(state.fighters[1].health).toBe(955);
    expect(state.events[0]).toMatchObject({ type: 'hit', action: 'light', damage: 45 });
    expect(state.hitstop).toBeGreaterThan(0);
  });

  it('releases an action lock at its nominal startup + active + recovery duration', () => {
    let state = fighting(4);
    state = stepMatch(state, ['light', 'idle']);
    state = advance(state, moves.light.startup + moves.light.active + moves.light.recovery);
    expect(state.fighters[0]).toMatchObject({ action: 'idle', actionTick: 0 });
  });

  it('makes high guard block overhead while low guard is opened by it', () => {
    let high = fighting(0.9);
    high = stepMatch(high, ['idle', 'guard_high']);
    high = advance(high, 2, ['idle', 'guard_high']);
    high = untilEvent(high, 'block', ['overhead', 'guard_high']);
    expect(high.fighters[1].health).toBe(1_000);
    expect(high.fighters[1].stamina).toBeLessThan(100);

    let low = fighting(0.9);
    low = stepMatch(low, ['idle', 'guard_low']);
    low = advance(low, 3, ['idle', 'guard_low']);
    low = untilEvent(low, 'hit', ['overhead', 'guard_low']);
    expect(low.fighters[1].health).toBe(900);
  });

  it('does not open a combo cancel from a blocked light', () => {
    let state = fighting(0.8);
    state = advance(state, 2, ['idle', 'guard_high']);
    state = untilEvent(state, 'block', ['light', 'guard_high']);
    state = advance(state, state.hitstop);
    while (state.fighters[0].actionTick < 10) state = stepMatch(state, idle);
    expect(state.fighters[0].hitConnected).toBe(false);
    expect(legalActions(state, 0)).not.toContain('body');
  });

  it('lets a fully crouched fighter evade a high strike', () => {
    let state = fighting(0.8);
    state = advance(state, 4, ['idle', 'crouch']);
    state = advance(state, 40, ['light', 'crouch']);
    expect(state.fighters[1].health).toBe(1_000);
  });

  it('keeps grounded strikes below an airborne hurtbox and lets anti-air knock it down', () => {
    let missed = fighting(0.8);
    missed = stepMatch(missed, ['idle', 'jump']);
    missed = advance(missed, moves.jump.startup + 16);
    expect(missed.fighters[1].y).toBe(0.9);
    missed = advance(missed, 12, ['light', 'idle']);
    expect(missed.fighters[1].health).toBe(1_000);

    let antiAir = fighting(0.8);
    antiAir = stepMatch(antiAir, ['idle', 'jump']);
    antiAir = advance(antiAir, 16);
    antiAir = untilEvent(antiAir, 'knockdown', ['anti_air', 'idle']);
    expect(antiAir.fighters[1].health).toBe(915);
    expect(antiAir.fighters[1].y).toBe(0);
    expect(antiAir.fighters[1].knockdown).toBeGreaterThan(0);
  });

  it('parries mid/high/overhead attacks but not lows', () => {
    let parried = fighting(0.8);
    parried = stepMatch(parried, ['heavy', 'idle']);
    parried = advance(parried, 8);
    parried = untilEvent(parried, 'parry', ['idle', 'parry']);
    expect(parried.fighters[0].stun).toBe(24);
    expect(parried.fighters[1].health).toBe(1_000);

    let low = fighting(0.8);
    low = stepMatch(low, ['low', 'idle']);
    low = advance(low, 5);
    low = untilEvent(low, 'hit', ['idle', 'parry']);
    expect(low.fighters[1].health).toBe(935);
  });

  it('marks and consistently rounds counter hits during attack startup', () => {
    let state = fighting(0.8);
    state = stepMatch(state, ['light', 'heavy']);
    state = untilEvent(state, 'counter-hit', idle);
    expect(state.events[0]).toMatchObject({ type: 'counter-hit', actor: 0, damage: 52, counter: true });
    expect(state.fighters[1].health).toBe(948);
  });
});

describe('resources, throws and combos', () => {
  it('breaks a captured throw during its 12-tick escape window', () => {
    let state = fighting(0.6);
    state = untilEvent(state, 'throw-capture', ['throw', 'idle']);
    expect(state.fighters[1].capturedBy).toBe(0);
    state = stepMatch(state, ['idle', 'throw']);
    expect(state.events[0]).toMatchObject({ type: 'throw-break', actor: 1, target: 0 });
    expect(state.fighters[1].health).toBe(1_000);
    expect(Math.abs(state.fighters[1].x - state.fighters[0].x)).toBeCloseTo(0.9);
  });

  it('offers capture victims the semantic choice to wait or break', () => {
    let state = fighting(0.6);
    state = untilEvent(state, 'throw-capture', ['throw', 'idle']);
    expect(legalActions(state, 1)).toEqual(['idle', 'throw_break']);
    const remaining = state.fighters[1].captureTicks;
    state = stepMatch(state, ['idle', 'idle']);
    expect(state.fighters[1].capturedBy).toBe(0);
    expect(state.fighters[1].captureTicks).toBe(remaining - 1);
  });

  it('resolves the throw-break interaction with fighter zero on the right', () => {
    let state = fighting(0.6);
    state.fighters[0].x = 0.3;
    state.fighters[1].x = -0.3;
    state = untilEvent(state, 'throw-capture', ['throw', 'idle']);
    state = stepMatch(state, ['idle', 'throw_break']);
    expect(state.events[0]).toMatchObject({ type: 'throw-break', actor: 1, target: 0 });
    expect(state.fighters[0].x).toBeGreaterThan(state.fighters[1].x);
  });

  it('applies unbroken throw damage only after the break window', () => {
    let state = fighting(0.6);
    state = untilEvent(state, 'throw-capture', ['throw', 'idle']);
    state = untilEvent(state, 'throw-hit', idle, 20);
    expect(state.fighters[1].health).toBe(895);
    expect(state.fighters[1].stun).toBe(42);
    expect(state.fighters[1].knockdown).toBe(42);
    expect(state.events.some((event) => event.type === 'knockdown')).toBe(true);
  });

  it('enforces hit-confirmed light-to-body cancellation and combo scaling', () => {
    let state = fighting(0.7);
    state = untilEvent(state, 'hit', ['light', 'idle']);
    state = untilEvent(state, 'cancel', ['body', 'idle']);
    expect(state.events.find((event) => event.type === 'cancel')).toMatchObject({ action: 'body' });
    state = untilEvent(state, 'hit', ['idle', 'idle']);
    expect(state.events[0]).toMatchObject({ action: 'body', damage: 51, combo: 2 });
  });

  it('caps the exported light-to-body-to-heavy route at three scaled strikes', () => {
    let state = fighting(0.7);
    state = untilEvent(state, 'hit', ['light', 'idle']);
    state = untilEvent(state, 'cancel', ['body', 'idle']);
    state = untilEvent(state, 'hit', idle);
    state = untilEvent(state, 'cancel', ['heavy', 'idle']);
    expect(state.events.find((event) => event.type === 'cancel')).toMatchObject({ action: 'heavy' });
    state = untilEvent(state, 'hit', idle);
    expect(state.events[0]).toMatchObject({ action: 'heavy', damage: 81, combo: 3 });
    expect(state.fighters[0].combo).toBe(3);
    expect(state.fighters[1].health).toBe(823);
  });

  it('does not continue a combo through an undeclared delayed route', () => {
    let state = fighting(0.7);
    state = untilEvent(state, 'hit', ['light', 'idle']);
    state = advance(state, state.hitstop);
    while (state.fighters[0].action !== 'idle') state = stepMatch(state, idle);
    state = untilEvent(state, 'hit', ['overhead', 'idle']);
    expect(state.events[0]).toMatchObject({ action: 'overhead', damage: 100, combo: 1 });
  });

  it('buffers a tapped action during the final eight recovery ticks', () => {
    let state = fighting(4);
    state = stepMatch(state, ['light', 'idle']);
    const duration = moves.light.startup + moves.light.active + moves.light.recovery;
    state = advance(state, duration - 8);
    state = stepMatch(state, ['light', 'idle']);
    state = untilEvent(state, 'action-start', idle, 9);
    expect(state.fighters[0]).toMatchObject({ action: 'light', actionTick: 0 });
  });

  it('does not retain released held movement through attack recovery', () => {
    let state = fighting(4);
    state = stepMatch(state, ['light', 'idle']);
    const duration = moves.light.startup + moves.light.active + moves.light.recovery;
    state = advance(state, duration - 4, ['advance', 'idle']);
    expect(state.fighters[0].buffered).toBeNull();
    state = advance(state, 5, idle);
    expect(state.fighters[0]).toMatchObject({ action: 'idle', buffered: null, velocityX: 0 });
  });

  it('honors the currently held retreat as soon as attack recovery ends', () => {
    let state = fighting(4);
    state = stepMatch(state, ['light', 'idle']);
    const duration = moves.light.startup + moves.light.active + moves.light.recovery;
    state = advance(state, duration, ['retreat', 'idle']);
    state = stepMatch(state, ['retreat', 'idle']);
    expect(state.fighters[0].action).toBe('retreat');
    expect(state.fighters[0].velocityX).toBeLessThan(0);
  });

  it('spends special meter and prevents the unequipped special', () => {
    let state = fighting();
    state.fighters[0].meter = 100;
    expect(legalActions(state, 0)).toContain('special_veto');
    expect(legalActions(state, 0)).not.toContain('special_papers');
    state = stepMatch(state, ['special_veto', 'idle']);
    expect(state.fighters[0].meter).toBe(0);
    state = advance(state, moves.special_veto.startup + moves.special_veto.active + moves.special_veto.recovery + 1);
    expect(legalActions(state, 0)).not.toContain('special_veto');
  });

  it('breaks guard, locks it for 36 ticks, then restores 25 stamina', () => {
    let state = fighting(0.8);
    state.fighters[1].stamina = 5;
    state = advance(state, 2, ['idle', 'guard_high']);
    state = untilEvent(state, 'guard-break', ['heavy', 'guard_high']);
    expect(state.fighters[1]).toMatchObject({ stamina: 0, stun: 36, guardBroken: true });
    state = advance(state, state.hitstop + 36);
    expect(state.fighters[1].guardBroken).toBe(false);
    expect(state.fighters[1].stamina).toBeGreaterThanOrEqual(25);
  });

  it('lets Diplomatic shield absorb one non-throw hit without health damage', () => {
    let state = fighting(0.8);
    state.fighters[1].special = 'special_veto';
    state.fighters[1].meter = 100;
    state = stepMatch(state, ['idle', 'special_veto']);
    state = advance(state, moves.special_veto.startup);
    state = untilEvent(state, 'shield-absorb', ['light', 'idle']);
    expect(state.fighters[1].health).toBe(1_000);
    expect(state.fighters[1].meter).toBe(0);
    expect(state.fighters[0].recoveryLock).toBe(12);
  });
});

describe('canonical movement', () => {
  it('stops ordinary walking at body contact without moving an idle defender', () => {
    let state = fighting(0.6);
    const defenderX = state.fighters[1].x;
    state = advance(state, 20, ['advance', 'idle']);
    expect(state.fighters[1].x).toBe(defenderX);
    expect(state.fighters[0].x).toBeCloseTo(defenderX - 0.6, 4);
  });

  it('stops a dash at an idle defender, including when the defender is against the wall', () => {
    let state = fighting(0.6);
    const defenderX = state.fighters[1].x;
    state = stepMatch(state, ['dash_forward', 'idle']);
    state = advance(state, 10);
    expect(state.fighters[1].x).toBe(defenderX);
    expect(state.fighters[0].x).toBeCloseTo(defenderX - 0.6, 4);

    state = fighting();
    state.fighters[0].x = 6.1;
    state.fighters[1].x = 6.7;
    state = stepMatch(state, ['dash_forward', 'idle']);
    state = advance(state, 10);
    expect(state.fighters[1].x).toBe(6.7);
    expect(state.fighters[0].x).toBeCloseTo(6.1, 4);
  });

  it('shares collision correction between two approaching fighters without wall clipping', () => {
    let state = fighting(2);
    state = advance(state, 60, ['advance', 'advance']);
    expect(state.fighters[0].x).toBeGreaterThan(-1);
    expect(state.fighters[1].x).toBeLessThan(1);
    expect(state.fighters[1].x - state.fighters[0].x).toBeGreaterThanOrEqual(0.6);
    expect(state.fighters.every((fighter) => Math.abs(fighter.x) <= 6.7)).toBe(true);
  });

  it('accelerates immediately, coasts briefly on release, then settles exactly', () => {
    let state = fighting(5);
    const start = state.fighters[0].x;
    state = stepMatch(state, ['advance', 'idle']);
    expect(state.fighters[0]).toMatchObject({ velocityX: 0.75 });
    expect(state.fighters[0].x).toBeCloseTo(start + 0.0125, 4);
    state = advance(state, 3, ['advance', 'idle']);
    expect(state.fighters[0].velocityX).toBe(2.4);

    const releasedAt = state.fighters[0].x;
    state = stepMatch(state, idle);
    expect(state.fighters[0].velocityX).toBe(1.4);
    expect(state.fighters[0].x).toBeGreaterThan(releasedAt);
    state = advance(state, 2);
    expect(state.fighters[0].velocityX).toBe(0);
  });

  it('reverses grounded direction through a short deterministic inertia window', () => {
    let state = advance(fighting(5), 4, ['advance', 'idle']);
    expect(state.fighters[0].velocityX).toBe(2.4);
    state = stepMatch(state, ['retreat', 'idle']);
    expect(state.fighters[0].velocityX).toBe(1.2);
    state = stepMatch(state, ['retreat', 'idle']);
    expect(state.fighters[0].velocityX).toBe(0);
    state = stepMatch(state, ['retreat', 'idle']);
    expect(state.fighters[0].velocityX).toBe(-0.75);
  });

  it('keeps attack momentum bounded without crossing the opponent', () => {
    let state = advance(fighting(5), 4, ['advance', 'idle']);
    state.fighters[0].x = -0.3;
    state.fighters[1].x = 0.3;
    state = stepMatch(state, ['light', 'idle']);
    expect(state.fighters[0].velocityX).toBe(0);
    expect(state.fighters[0].x).toBeLessThan(state.fighters[1].x);
    expect(state.fighters[1].x - state.fighters[0].x).toBeGreaterThanOrEqual(0.6);
    state = advance(state, 3);
    expect(state.fighters[0].velocityX).toBe(0);
    expect(state.fighters[0].x).toBeLessThan(state.fighters[1].x);
  });

  it('moves a forward dash exactly 0.8m and preserves fighter order', () => {
    let state = fighting(4);
    const start = state.fighters[0].x;
    state = stepMatch(state, ['dash_forward', 'idle']);
    state = advance(state, 10);
    expect(state.fighters[0].x).toBeCloseTo(start + 0.8, 4);
    expect(state.fighters[0].x).toBeLessThan(state.fighters[1].x);
  });

  it('scales authored dash distance with speed', () => {
    let fast = advance(createMatch({ fighters: ['albanese', 'neutral'] }), READY_TICKS);
    let slow = advance(createMatch({ fighters: ['burnham', 'neutral'] }), READY_TICKS);
    const fastStart = fast.fighters[0].x;
    const slowStart = slow.fighters[0].x;
    fast = stepMatch(fast, ['dash_forward', 'idle']);
    slow = stepMatch(slow, ['dash_forward', 'idle']);
    fast = advance(fast, 10);
    slow = advance(slow, 10);
    expect(fast.fighters[0].x - fastStart).toBeCloseTo(0.8 * 1.1, 4);
    expect(slow.fighters[0].x - slowStart).toBeCloseTo(0.8 * 0.9, 4);
  });

  it('preserves explicit strike and authored signature knockback', () => {
    let normal = fighting(0.8);
    const normalStart = normal.fighters[1].x;
    normal = untilEvent(normal, 'hit', ['light', 'idle']);
    expect(normal.fighters[1].x).toBeCloseTo(normalStart + 0.1, 4);

    const signature = signatureForCharacter('trump');
    let special = advance(createMatch({ fighters: ['trump', 'neutral'], specials: [signature.id, 'special_veto'] }), READY_TICKS);
    special.fighters[0].x = -0.4;
    special.fighters[1].x = 0.4;
    special.fighters[0].meter = 100;
    const signatureStart = special.fighters[1].x;
    special = untilEvent(special, 'hit', [signature.id, 'idle']);
    expect(special.fighters[1].x).toBeCloseTo(signatureStart + signature.pushback, 4);
  });

  it('preserves the canonical separation when both fighters are at an arena wall', () => {
    let state = fighting();
    state.fighters[0].x = 6.15;
    state.fighters[1].x = 6.7;
    state = stepMatch(state, ['advance', 'retreat']);
    expect(state.fighters[1].x).toBeLessThanOrEqual(6.7);
    expect(state.fighters[1].x - state.fighters[0].x).toBeGreaterThanOrEqual(0.6);
  });

  it('uses a deterministic 32-tick 0.9m jump arc with controlled air movement and one air kick', () => {
    let state = fighting(4);
    state = stepMatch(state, ['jump', 'idle']);
    state = advance(state, moves.jump.startup + 16);
    expect(state.fighters[0].airTick).toBe(16);
    expect(state.fighters[0].y).toBe(0.9);
    expect(legalActions(state, 0)).toEqual(expect.arrayContaining(['advance', 'retreat']));
    const apexX = state.fighters[0].x;
    state = advance(state, 4, ['advance', 'idle']);
    expect(state.fighters[0].velocityX).toBe(1.2);
    expect(state.fighters[0].x).toBeGreaterThan(apexX);
    state = advance(state, 6, ['retreat', 'idle']);
    expect(state.fighters[0].velocityX).toBeLessThan(0);
    expect(legalActions(state, 0)).toContain('air_kick');
    state = stepMatch(state, ['air_kick', 'idle']);
    expect(state.fighters[0].airAttackUsed).toBe(true);
    expect(state.fighters[0].stamina).toBe(87);
  });

  it('carries running momentum into takeoff without integrating twice on the launch tick', () => {
    let state = advance(fighting(5), 4, ['advance', 'idle']);
    state = stepMatch(state, ['jump', 'idle']);
    state = advance(state, moves.jump.startup);
    const beforeLaunch = state.fighters[0].x;
    state = stepMatch(state, idle);
    expect(state.fighters[0].airTick).toBe(1);
    expect(state.fighters[0].velocityX).toBe(2.1);
    expect(state.fighters[0].x - beforeLaunch).toBeCloseTo(2.1 / 60, 4);
  });
});

describe('policy boundary', () => {
  it('resolves simultaneous inputs in the documented order and neutralizes opposite directions', () => {
    const state = fighting(0.6);
    state.fighters[0].meter = 100;
    expect(resolveActionCandidates(state, 0, ['light', 'parry', 'special_veto'])).toBe('special_veto');
    expect(resolveActionCandidates(state, 0, ['advance', 'retreat'])).toBe('idle');

    const captured = untilEvent(state, 'throw-capture', ['idle', 'throw']);
    expect(resolveActionCandidates(captured, 0, ['throw'])).toBe('throw_break');
  });

  it('serializes only public state with bounded validated history', () => {
    const state = advance(createMatch({ fighters: ['kim', 'milei'] }), READY_TICKS);
    state.fighters[0].x = -0.4;
    state.fighters[1].x = 0.4;
    const observation = getObservation(state, 1, [
      'light', 'body', 'heavy', 'low', 'overhead', 'advance', 'retreat', 'guard_low', 'parry',
    ]);
    const json = JSON.stringify(observation);

    expect(observation.history).toEqual(['body', 'heavy', 'low', 'overhead', 'advance', 'retreat', 'guard_low', 'parry']);
    expect(observation.self.facing).toBe(-1);
    expect(observation.self).toMatchObject({ maxHealth: 850, maxStamina: 95 });
    expect(observation.opponent).toMatchObject({ maxHealth: 1_100, maxStamina: 100 });
    expect(observation.distanceMm).toBe(800);
    expect(json).not.toContain('seed');
    expect(json).not.toContain('buffered');
    expect(json).not.toContain('velocityX');
    expect(json).not.toContain('profileId');
    expect(json).not.toContain('kim');
    expect(json).not.toContain('milei');
    expect(JSON.parse(json)).toEqual(observation);
  });
});
