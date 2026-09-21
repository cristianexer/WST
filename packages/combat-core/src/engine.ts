import { actionIds, moves } from './moves';
import {
  fighterProfileForCharacter,
  neutralFighterProfile,
  type FighterProfile,
} from './fighter-profiles';
import {
  signatureActionIds,
  signatureProfileForAction,
  type SignatureProfile,
} from './signatures';
import type {
  ActionId,
  CombatEvent,
  FighterState,
  MatchObservation,
  MatchState,
  Move,
  PublicFighterObservation,
  SpecialId,
} from './types';

export const TICKS_PER_SECOND = 60;
export const ROUND_TICKS = 60 * TICKS_PER_SECOND;
export const READY_TICKS = 90;
export const ROUND_END_TICKS = 120;
export const ARENA_HALF_WIDTH = 7;

const BASE_HEALTH = 1_000;
const BASE_STAMINA = 100;
const MAX_METER = 100;
const FIGHTER_HALF_WIDTH = 0.3;
const MIN_SEPARATION = FIGHTER_HALF_WIDTH * 2;
const INPUT_BUFFER_TICKS = 8;
const STAMINA_REGEN_DELAY = 30;
const THROW_BREAK_TICKS = 12;
const GUARD_BREAK_STUN = 36;
const DAMAGE_SCALE = [1, 0.85, 0.7] as const;
const HIT_METER_GAIN = 14;
const RECEIVED_METER_GAIN = 3;
const BLOCK_METER_GAIN = 5;
const WALK_FORWARD_SPEED = 2.4;
const WALK_BACK_SPEED = 2;
const GROUND_ACCELERATION_PER_TICK = 0.75;
const GROUND_REVERSAL_PER_TICK = 1.2;
const GROUND_BRAKING_PER_TICK = 1;
const AIR_SPEED = 2.1;
const AIR_ACCELERATION_PER_TICK = 0.3;
const AIR_DRAG_PER_TICK = 0.12;

const ORDINARY_ATTACKS = new Set<ActionId>([
  'light',
  'body',
  'heavy',
  'low',
  'overhead',
  'anti_air',
  'air_kick',
]);

const STRIKES = new Set<ActionId>([
  ...ORDINARY_ATTACKS,
  'special_papers',
  ...signatureActionIds.filter((action) => {
    const kind = signatureProfileForAction(action)?.kind;
    return kind !== 'shield' && kind !== 'counter';
  }),
]);
const ATTACKS = new Set<ActionId>([...STRIKES, ...signatureActionIds, 'throw']);
const HELD = new Set<ActionId>(['idle', 'advance', 'retreat', 'crouch', 'guard_high', 'guard_low']);

/** Input-adapter priority: break, special, parry, attacks, defence, movement. */
export const ACTION_PRIORITY: readonly ActionId[] = Object.freeze([
  'throw_break',
  'special_veto',
  'special_papers',
  ...signatureActionIds,
  'parry',
  'throw',
  'air_kick',
  'overhead',
  'anti_air',
  'low',
  'heavy',
  'body',
  'light',
  'guard_low',
  'guard_high',
  'dash_forward',
  'dash_back',
  'jump',
  'crouch',
  'advance',
  'retreat',
  'idle',
]);

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseSeed(seed: number | undefined): number {
  if (seed === undefined || !Number.isFinite(seed)) return 0x51_7a_2026;
  return Math.trunc(seed) >>> 0;
}

function fighter(
  x: number,
  facing: 1 | -1,
  special: SpecialId,
  profile: FighterProfile = neutralFighterProfile,
): FighterState {
  const maxHealth = Math.round(BASE_HEALTH * profile.stats.vitality / 100);
  const maxStamina = Math.round(BASE_STAMINA * profile.stats.stamina / 100);
  return {
    x,
    y: 0,
    velocityX: 0,
    profileId: profile.id,
    maxHealth,
    maxStamina,
    facing,
    health: maxHealth,
    stamina: maxStamina,
    meter: 0,
    action: 'idle',
    actionTick: 0,
    stun: 0,
    knockdown: 0,
    combo: 0,
    special,
    staminaRegenDelay: 0,
    recoveryLock: 0,
    guardBroken: false,
    hitConnected: false,
    hitResolved: false,
    comboContinuation: false,
    specialAbsorbed: false,
    buffered: null,
    airTick: 0,
    airTicksTotal: 0,
    airDirection: 0,
    airAttackUsed: false,
    capturedBy: null,
    captureTicks: 0,
    throwTarget: null,
  };
}

export function createMatch(options: {
  seed?: number;
  specials?: [SpecialId, SpecialId];
  fighters?: [string, string];
  training?: boolean;
} = {}): MatchState {
  const seed = normaliseSeed(options.seed);
  const specials = options.specials ?? ['special_veto', 'special_papers'];
  const profiles: [FighterProfile, FighterProfile] = [
    fighterProfileForCharacter(options.fighters?.[0]),
    fighterProfileForCharacter(options.fighters?.[1]),
  ];
  return {
    tick: 0,
    round: 1,
    phase: 'ready',
    phaseTicks: 0,
    timer: ROUND_TICKS,
    fighters: [fighter(-2, 1, specials[0], profiles[0]), fighter(2, -1, specials[1], profiles[1])],
    wins: [0, 0],
    winner: null,
    events: [],
    seed,
    rngState: seed,
    hitstop: 0,
    training: options.training ?? false,
  };
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    fighters: state.fighters.map((item) => ({
      ...item,
      buffered: item.buffered ? { ...item.buffered } : null,
    })) as [FighterState, FighterState],
    wins: [...state.wins] as [number, number],
    events: [],
  };
}

function addEvent(state: MatchState, event: Omit<CombatEvent, 'tick'>): void {
  state.events.push({ ...event, tick: state.tick });
}

function isActive(fighterState: FighterState, moveData = moves[fighterState.action]): boolean {
  return fighterState.actionTick > moveData.startup
    && (moveData.held || fighterState.actionTick <= moveData.startup + moveData.active);
}

function isStartup(fighterState: FighterState): boolean {
  const moveData = moves[fighterState.action];
  return fighterState.actionTick <= moveData.startup && moveData.startup > 0;
}

function isCrouching(fighterState: FighterState): boolean {
  return fighterState.action === 'crouch' && isActive(fighterState);
}

function isGuarding(fighterState: FighterState, level: 'guard_high' | 'guard_low'): boolean {
  return fighterState.action === level && isActive(fighterState);
}

function isParrying(fighterState: FighterState): boolean {
  return fighterState.action === 'parry' && isActive(fighterState);
}

function hasVetoShield(fighterState: FighterState): boolean {
  const signature = signatureProfileForAction(fighterState.action);
  return (fighterState.action === 'special_veto' || signature?.kind === 'shield')
    && isActive(fighterState)
    && !fighterState.specialAbsorbed;
}

function activeCounter(fighterState: FighterState): SignatureProfile | undefined {
  const signature = signatureProfileForAction(fighterState.action);
  return signature?.kind === 'counter' && isActive(fighterState) && !fighterState.hitResolved
    ? signature
    : undefined;
}

function canPay(fighterState: FighterState, action: ActionId): boolean {
  const moveData = moves[action];
  return fighterState.stamina >= moveData.staminaCost && fighterState.meter >= moveData.meterCost;
}

function scaledDamage(attacker: FighterState, baseDamage: number, modifier = 1): number {
  const power = fighterProfileForCharacter(attacker.profileId).stats.power;
  return Math.round(baseDamage * (power / 100) * modifier);
}

function grounded(fighterState: FighterState): boolean {
  return fighterState.y === 0 && fighterState.airTicksTotal === 0;
}

function neutralActions(state: MatchState, index: 0 | 1): ActionId[] {
  const self = state.fighters[index];
  const other = state.fighters[index === 0 ? 1 : 0];
  const result: ActionId[] = [
    'idle',
    'advance',
    'retreat',
    'crouch',
    'jump',
    'guard_high',
    'guard_low',
    'light',
    'body',
    'heavy',
    'low',
    'overhead',
    'anti_air',
    'parry',
    'dash_forward',
    'dash_back',
  ];
  if (Math.abs(other.x - self.x) <= moves.throw.reach
    && grounded(other)
    && other.stun === 0
    && other.knockdown === 0
    && other.capturedBy === null) result.push('throw');
  result.push(self.special);
  return result.filter((action) => canPay(self, action));
}

/**
 * Returns actions accepted at the current simulation boundary. During a committed
 * action it returns only continuations/cancels, so controllers cannot bypass recovery.
 */
export function legalActions(state: MatchState, index: 0 | 1): ActionId[] {
  if (state.phase !== 'fight' || state.hitstop > 0) return ['idle'];
  const self = state.fighters[index];
  // Idle is a meaningful capture decision: decline the break and let the
  // escape window advance. Policies must be able to choose either outcome.
  if (self.capturedBy !== null) return ['idle', 'throw_break'];
  if (self.stun > 0 || self.recoveryLock > 0) return ['idle'];
  if (!grounded(self)) {
    const actions: ActionId[] = ['idle', 'advance', 'retreat'];
    if (!self.airAttackUsed && canPay(self, 'air_kick')) actions.push('air_kick');
    return actions;
  }
  const moveData = moves[self.action];
  if (ORDINARY_ATTACKS.has(self.action)
    && self.hitConnected
    && moveData.cancelInto
    && self.actionTick >= (moveData.cancelOpen ?? Number.POSITIVE_INFINITY)
    && self.actionTick <= (moveData.cancelClose ?? Number.NEGATIVE_INFINITY)
    && self.combo < 3
    && canPay(self, moveData.cancelInto)) {
    return ['idle', moveData.cancelInto];
  }
  if (!HELD.has(self.action)) return [self.action];
  return neutralActions(state, index);
}

/**
 * Resolves simultaneous semantic inputs before stepMatch. Opposing directions
 * cancel to neutral; otherwise the first legal action in ACTION_PRIORITY wins.
 */
export function resolveActionCandidates(
  state: MatchState,
  index: 0 | 1,
  candidates: readonly ActionId[],
): ActionId {
  const requested = new Set(candidates);
  if (requested.has('advance') && requested.has('retreat')) {
    requested.delete('advance');
    requested.delete('retreat');
  }
  if (requested.has('dash_forward') && requested.has('dash_back')) {
    requested.delete('dash_forward');
    requested.delete('dash_back');
  }
  if (state.fighters[index].capturedBy !== null && requested.has('throw')) requested.add('throw_break');
  const legal = new Set(legalActions(state, index));
  return ACTION_PRIORITY.find((action) => requested.has(action) && legal.has(action)) ?? 'idle';
}

function canStart(state: MatchState, index: 0 | 1, action: ActionId): boolean {
  if (action === 'idle') return true;
  return neutralActions(state, index).includes(action);
}

function spend(fighterState: FighterState, action: ActionId): void {
  const moveData = moves[action];
  fighterState.stamina = clamp(fighterState.stamina - moveData.staminaCost, 0, fighterState.maxStamina);
  fighterState.meter = clamp(fighterState.meter - moveData.meterCost, 0, MAX_METER);
  if (moveData.staminaCost > 0) fighterState.staminaRegenDelay = STAMINA_REGEN_DELAY;
}

function startAction(
  state: MatchState,
  index: 0 | 1,
  action: ActionId,
  previousAction: ActionId = state.fighters[index].action,
  comboContinuation = false,
): void {
  const self = state.fighters[index];
  spend(self, action);
  self.action = action;
  self.actionTick = 0;
  self.hitConnected = false;
  self.hitResolved = false;
  self.comboContinuation = comboContinuation;
  self.specialAbsorbed = false;
  self.buffered = null;
  if (action === 'jump') {
    self.airDirection = previousAction === 'advance'
      ? self.facing
      : previousAction === 'retreat'
        ? (self.facing === 1 ? -1 : 1)
        : 0;
    self.airAttackUsed = false;
  }
  if (action === 'air_kick') self.airAttackUsed = true;
  if (action !== 'idle') addEvent(state, { type: 'action-start', actor: index, action });
}

function releaseHeld(self: FighterState): void {
  const moveData = moves[self.action];
  if (self.action === 'guard_high' || self.action === 'guard_low' || self.action === 'crouch') {
    self.recoveryLock = Math.max(self.recoveryLock, moveData.recovery);
  }
  self.action = 'idle';
  self.actionTick = 0;
  self.hitConnected = false;
  self.hitResolved = false;
  self.comboContinuation = false;
}

function bufferAction(self: FighterState, input: ActionId): void {
  // Held controls are sampled continuously. Buffering one after the player lets
  // go can restart stale movement or guard as recovery ends.
  if (HELD.has(input) || input === 'throw_break') return;
  if (input === self.action) {
    const moveData = moves[self.action];
    if (moveData.held || self.actionTick <= moveData.startup + moveData.active) return;
  }
  if (!canPay(self, input)) return;
  // +1 makes the current sampling tick plus eight future simulation ticks.
  self.buffered = { action: input, ticks: INPUT_BUFFER_TICKS + 1 };
}

function processAction(state: MatchState, index: 0 | 1, input: ActionId): void {
  const self = state.fighters[index];
  if (self.capturedBy !== null) return;
  let usedBufferedInput = false;
  if (self.action === 'idle' && input === 'idle' && self.buffered) {
    input = self.buffered.action;
    self.buffered = null;
    usedBufferedInput = true;
  }

  if (self.stun > 0 || self.recoveryLock > 0) {
    bufferAction(self, input);
    return;
  }

  if (!grounded(self)) {
    if (input === 'advance') {
      self.airDirection = self.facing;
      input = 'idle';
    } else if (input === 'retreat') {
      self.airDirection = self.facing === 1 ? -1 : 1;
      input = 'idle';
    } else if (input === 'idle') {
      self.airDirection = 0;
    }
    if (input === 'air_kick' && !self.airAttackUsed && canPay(self, 'air_kick')) {
      startAction(state, index, 'air_kick');
      return;
    }
  }

  const current = moves[self.action];
  const desired = input !== 'idle' ? input : self.buffered?.action ?? 'idle';
  const canCancel = self.hitConnected
    && self.combo < 3
    && current.cancelInto === desired
    && self.actionTick >= (current.cancelOpen ?? Number.POSITIVE_INFINITY)
    && self.actionTick <= (current.cancelClose ?? Number.NEGATIVE_INFINITY)
    && canPay(self, desired);
  if (canCancel) {
    startAction(state, index, desired, self.action, true);
    addEvent(state, { type: 'cancel', actor: index, action: desired });
    return;
  }

  if (HELD.has(self.action)) {
    if (input !== self.action) {
      const previous = self.action;
      releaseHeld(self);
      if (input !== 'idle' && self.recoveryLock === 0 && canStart(state, index, input)) {
        startAction(state, index, input, previous);
      } else if (input !== 'idle' && !usedBufferedInput) {
        bufferAction(self, input);
      }
      return;
    }
    self.actionTick = Math.min(self.actionTick + 1, current.startup + 1);
    return;
  }

  const duration = current.startup + current.active + current.recovery;
  if (self.actionTick < duration) {
    bufferAction(self, input);
    self.actionTick += 1;
    return;
  }

  self.action = 'idle';
  self.actionTick = 0;
  self.hitConnected = false;
  self.hitResolved = false;
  self.comboContinuation = false;
  const requested = input !== 'idle' ? input : self.buffered?.action ?? 'idle';
  if (requested !== 'idle' && canStart(state, index, requested)) {
    // A move begun after nominal recovery is a new exchange, not a late cancel.
    self.combo = 0;
    startAction(state, index, requested);
  }
}

function tickLocks(state: MatchState): void {
  state.fighters.forEach((self, rawIndex) => {
    const index = rawIndex as 0 | 1;
    if (self.staminaRegenDelay > 0) self.staminaRegenDelay -= 1;
    if (self.buffered) {
      self.buffered.ticks -= 1;
      if (self.buffered.ticks <= 0) self.buffered = null;
    }
    if (self.stun > 0) {
      self.stun -= 1;
      if (self.stun === 0 && self.guardBroken) {
        self.guardBroken = false;
        self.stamina = Math.max(self.stamina, Math.round(self.maxStamina * 0.25));
        addEvent(state, { type: 'guard-recovered', actor: index });
      }
    }
    if (self.knockdown > 0) self.knockdown -= 1;
    if (self.recoveryLock > 0) self.recoveryLock -= 1;
  });
}

function approach(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) return target;
  return round(value + Math.sign(target - value) * maxDelta);
}

function integrateHorizontal(self: FighterState): void {
  const nextX = self.x + self.velocityX / TICKS_PER_SECOND;
  const clampedX = clamp(
    nextX,
    -ARENA_HALF_WIDTH + FIGHTER_HALF_WIDTH,
    ARENA_HALF_WIDTH - FIGHTER_HALF_WIDTH,
  );
  self.x = round(clampedX);
  if (clampedX !== nextX) self.velocityX = 0;
}

function groundMovementTarget(self: FighterState): number {
  const speedScale = fighterProfileForCharacter(self.profileId).stats.speed / 100;
  if (self.stun > 0 || self.knockdown > 0 || self.capturedBy !== null) return 0;
  if (self.action === 'advance') return self.facing * WALK_FORWARD_SPEED * speedScale;
  if (self.action === 'retreat') return -self.facing * WALK_BACK_SPEED * speedScale;
  if (self.action === 'jump' && self.airTicksTotal === 0) {
    if (self.airDirection === self.facing) return self.facing * WALK_FORWARD_SPEED * speedScale;
    if (self.airDirection !== 0) return -self.facing * WALK_BACK_SPEED * speedScale;
  }
  return 0;
}

function applyGroundMovement(state: MatchState): void {
  state.fighters.forEach((self) => {
    const localTick = self.actionTick;
    if (self.action === 'jump' && localTick === moves.jump.startup + 1 && self.airTicksTotal === 0) {
      self.airTicksTotal = 32;
      self.airTick = 0;
    }
    if (self.airTicksTotal > 0) return;
    if (self.action === 'dash_forward' || self.action === 'dash_back') {
      const speedScale = fighterProfileForCharacter(self.profileId).stats.speed / 100;
      self.velocityX = 0;
      if (self.action === 'dash_forward' && localTick >= 1 && localTick <= 10) {
        self.x += self.facing * 0.08 * speedScale;
      }
      if (self.action === 'dash_back' && localTick >= 1 && localTick <= 10) {
        self.x -= self.facing * 0.075 * speedScale;
      }
    } else {
      const target = groundMovementTarget(self);
      const reversing = target !== 0 && self.velocityX !== 0 && Math.sign(target) !== Math.sign(self.velocityX);
      const acceleration = target === 0
        ? GROUND_BRAKING_PER_TICK
        : reversing
          ? GROUND_REVERSAL_PER_TICK
          : GROUND_ACCELERATION_PER_TICK;
      self.velocityX = approach(self.velocityX, target, acceleration);
      integrateHorizontal(self);
    }
    const signature = signatureProfileForAction(self.action);
    if (signature?.kind === 'rush' && isActive(self)) {
      self.x += self.facing * (signature.travel / signature.active);
    }
    self.x = round(clamp(self.x, -ARENA_HALF_WIDTH + FIGHTER_HALF_WIDTH, ARENA_HALF_WIDTH - FIGHTER_HALF_WIDTH));
  });
}

function releaseSignatures(state: MatchState): void {
  ([0, 1] as const).forEach((actor) => {
    const self = state.fighters[actor];
    const signature = signatureProfileForAction(self.action);
    if (!signature || self.actionTick !== signature.startup + 1) return;
    addEvent(state, {
      type: 'signature-release',
      actor,
      target: actor === 0 ? 1 : 0,
      action: signature.id,
    });
  });
}

function applyAirMovement(state: MatchState): void {
  state.fighters.forEach((self) => {
    if (self.airTicksTotal === 0) return;
    const speedScale = fighterProfileForCharacter(self.profileId).stats.speed / 100;
    const target = self.airDirection * AIR_SPEED * speedScale;
    self.velocityX = approach(
      self.velocityX,
      target,
      self.airDirection === 0 ? AIR_DRAG_PER_TICK : AIR_ACCELERATION_PER_TICK,
    );
    self.airTick += 1;
    const progress = clamp(self.airTick / self.airTicksTotal, 0, 1);
    self.y = round(4 * 0.9 * progress * (1 - progress));
    integrateHorizontal(self);
    if (self.airTick >= self.airTicksTotal) {
      self.y = 0;
      self.airTick = 0;
      self.airTicksTotal = 0;
      self.airDirection = 0;
      if (self.action === 'air_kick') {
        const remaining = Math.max(0, moves.air_kick.startup + moves.air_kick.active + moves.air_kick.recovery - self.actionTick);
        self.recoveryLock = Math.max(self.recoveryLock, remaining, 6);
        self.action = 'idle';
        self.actionTick = 0;
      }
    }
  });
}

function preventCrossing(state: MatchState, oldX: [number, number]): void {
  const leftIndex: 0 | 1 = oldX[0] <= oldX[1] ? 0 : 1;
  const rightIndex: 0 | 1 = leftIndex === 0 ? 1 : 0;
  const left = state.fighters[leftIndex];
  const right = state.fighters[rightIndex];
  const overlap = MIN_SEPARATION - (right.x - left.x);
  if (overlap <= 0) return;

  const leftInward = Math.max(0, left.x - oldX[leftIndex]);
  const rightInward = Math.max(0, oldX[rightIndex] - right.x);
  const totalInward = leftInward + rightInward;
  if (totalInward > 0) {
    left.x -= overlap * (leftInward / totalInward);
    right.x += overlap * (rightInward / totalInward);
  } else {
    const midpoint = (left.x + right.x) / 2;
    left.x = midpoint - MIN_SEPARATION / 2;
    right.x = midpoint + MIN_SEPARATION / 2;
  }

  left.x = round(clamp(left.x, -6.7, 6.7));
  right.x = round(clamp(right.x, -6.7, 6.7));
  if (right.x - left.x < MIN_SEPARATION) {
    if (leftInward > 0 && rightInward === 0) left.x = round(right.x - MIN_SEPARATION);
    else if (rightInward > 0 && leftInward === 0) right.x = round(left.x + MIN_SEPARATION);
    else {
      const midpoint = clamp((left.x + right.x) / 2, -6.7 + MIN_SEPARATION / 2, 6.7 - MIN_SEPARATION / 2);
      left.x = round(midpoint - MIN_SEPARATION / 2);
      right.x = round(midpoint + MIN_SEPARATION / 2);
    }
  }
  if (leftInward > 0 && left.velocityX > 0) left.velocityX = 0;
  if (rightInward > 0 && right.velocityX < 0) right.velocityX = 0;
}

function updateFacing(state: MatchState): void {
  const [a, b] = state.fighters;
  if (a.x < b.x) {
    a.facing = 1;
    b.facing = -1;
  } else if (a.x > b.x) {
    a.facing = -1;
    b.facing = 1;
  }
}

function regenerateStamina(state: MatchState): void {
  state.fighters.forEach((self) => {
    if (self.staminaRegenDelay > 0 || self.stun > 0 || ATTACKS.has(self.action)) return;
    const recoveryScale = fighterProfileForCharacter(self.profileId).stats.recovery / 100;
    const baseRate = self.action === 'guard_high' || self.action === 'guard_low' ? 8 : 12;
    const rate = baseRate * recoveryScale;
    self.stamina = round(clamp(self.stamina + rate / TICKS_PER_SECOND, 0, self.maxStamina));
  });
}

function clearCapture(state: MatchState, attackerIndex: 0 | 1, defenderIndex: 0 | 1): void {
  const attacker = state.fighters[attackerIndex];
  const defender = state.fighters[defenderIndex];
  attacker.throwTarget = null;
  defender.capturedBy = null;
  defender.captureTicks = 0;
}

function separatePair(state: MatchState, attackerIndex: 0 | 1, defenderIndex: 0 | 1, distance: number): void {
  const attacker = state.fighters[attackerIndex];
  const defender = state.fighters[defenderIndex];
  const direction = attacker.x <= defender.x ? 1 : -1;
  const midpoint = (attacker.x + defender.x) / 2;
  attacker.x = round(clamp(midpoint - direction * distance / 2, -6.7, 6.7));
  defender.x = round(clamp(midpoint + direction * distance / 2, -6.7, 6.7));
}

function processCaptures(state: MatchState, inputs: [ActionId, ActionId]): void {
  ([0, 1] as const).forEach((defenderIndex) => {
    const defender = state.fighters[defenderIndex];
    if (defender.capturedBy === null) return;
    const attackerIndex = defender.capturedBy;
    const attacker = state.fighters[attackerIndex];
    if (inputs[defenderIndex] === 'throw_break' || inputs[defenderIndex] === 'throw') {
      clearCapture(state, attackerIndex, defenderIndex);
      separatePair(state, attackerIndex, defenderIndex, 0.9);
      attacker.action = 'throw_break';
      defender.action = 'throw_break';
      attacker.velocityX = 0;
      defender.velocityX = 0;
      attacker.actionTick = 0;
      defender.actionTick = 0;
      attacker.recoveryLock = 0;
      defender.recoveryLock = 0;
      attacker.combo = 0;
      defender.combo = 0;
      attacker.comboContinuation = false;
      defender.comboContinuation = false;
      addEvent(state, { type: 'throw-break', actor: defenderIndex, target: attackerIndex, action: 'throw_break' });
      state.hitstop = Math.max(state.hitstop, 4);
      return;
    }
    defender.captureTicks -= 1;
    if (defender.captureTicks > 0) return;
    clearCapture(state, attackerIndex, defenderIndex);
    const damage = scaledDamage(attacker, moves.throw.damage);
    defender.health = Math.max(0, defender.health - damage);
    defender.stun = moves.throw.hitstun;
    defender.knockdown = moves.throw.hitstun;
    defender.y = 0;
    defender.velocityX = 0;
    defender.airTick = 0;
    defender.airTicksTotal = 0;
    defender.airDirection = 0;
    defender.action = 'idle';
    defender.actionTick = 0;
    attacker.meter = clamp(attacker.meter + HIT_METER_GAIN, 0, MAX_METER);
    defender.meter = clamp(defender.meter + RECEIVED_METER_GAIN, 0, MAX_METER);
    attacker.combo = 0;
    attacker.comboContinuation = false;
    defender.combo = 0;
    defender.comboContinuation = false;
    separatePair(state, attackerIndex, defenderIndex, 1.1);
    addEvent(state, { type: 'throw-hit', actor: attackerIndex, target: defenderIndex, action: 'throw', damage });
    addEvent(state, { type: 'knockdown', actor: attackerIndex, target: defenderIndex, action: 'throw' });
    state.hitstop = Math.max(state.hitstop, 8);
  });
}

interface HitProposal {
  attacker: 0 | 1;
  defender: 0 | 1;
  action: ActionId;
  move: Move;
  counter: boolean;
  comboBefore: number;
  comboContinuation: boolean;
}

function canContact(attacker: FighterState, defender: FighterState, moveData: Move): boolean {
  if (Math.abs(defender.x - attacker.x) > moveData.reach) return false;
  if (defender.knockdown > 0) return false;
  if (moveData.hitLevel === 'high' && isCrouching(defender)) return false;
  if (attacker.action === 'air_kick' && grounded(attacker)) return false;
  const relativeFeetHeight = defender.y - attacker.y;
  const verticalReach: Partial<Record<ActionId, number>> = {
    light: 0.25,
    body: 0.55,
    heavy: 0.55,
    low: 0.15,
    overhead: 0.8,
    anti_air: 1.2,
    air_kick: 1.2,
    special_papers: 0.6,
  };
  if (relativeFeetHeight > (verticalReach[attacker.action] ?? 0.6)) return false;
  return true;
}

function beginThrows(state: MatchState): void {
  ([0, 1] as const).forEach((attackerIndex) => {
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    const attacker = state.fighters[attackerIndex];
    const defender = state.fighters[defenderIndex];
    if (attacker.action !== 'throw' || !isActive(attacker) || attacker.hitResolved) return;
    if (!grounded(attacker)
      || !grounded(defender)
      || defender.stun > 0
      || defender.knockdown > 0
      || defender.capturedBy !== null) return;
    if (!canContact(attacker, defender, moves.throw)) return;
    attacker.hitConnected = true;
    attacker.hitResolved = true;
    attacker.throwTarget = defenderIndex;
    attacker.velocityX = 0;
    defender.capturedBy = attackerIndex;
    defender.velocityX = 0;
    defender.captureTicks = THROW_BREAK_TICKS;
    defender.action = 'idle';
    defender.actionTick = 0;
    defender.buffered = null;
    separatePair(state, attackerIndex, defenderIndex, 0.55);
    addEvent(state, { type: 'throw-capture', actor: attackerIndex, target: defenderIndex, action: 'throw' });
  });
}

function guardBlocks(defender: FighterState, moveData: Move): boolean {
  if (isGuarding(defender, 'guard_high')) {
    return moveData.hitLevel === 'high' || moveData.hitLevel === 'mid' || moveData.hitLevel === 'overhead';
  }
  if (isGuarding(defender, 'guard_low')) return moveData.hitLevel === 'low' || moveData.hitLevel === 'mid';
  return false;
}

function collectHits(state: MatchState): HitProposal[] {
  const proposals: HitProposal[] = [];
  ([0, 1] as const).forEach((attackerIndex) => {
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    const attacker = state.fighters[attackerIndex];
    const defender = state.fighters[defenderIndex];
    const moveData = moves[attacker.action];
    if (!STRIKES.has(attacker.action) || !isActive(attacker) || attacker.hitResolved) return;
    if (defender.capturedBy !== null || !canContact(attacker, defender, moveData)) return;
    proposals.push({
      attacker: attackerIndex,
      defender: defenderIndex,
      action: attacker.action,
      move: moveData,
      counter: ORDINARY_ATTACKS.has(attacker.action)
        && ORDINARY_ATTACKS.has(defender.action)
        && isStartup(defender),
      comboBefore: attacker.combo,
      comboContinuation: attacker.comboContinuation,
    });
  });
  return proposals;
}

function resolveHit(state: MatchState, proposal: HitProposal): void {
  const attacker = state.fighters[proposal.attacker];
  const defender = state.fighters[proposal.defender];
  // A counter proposal already consumed while catching this strike must not
  // also resolve as a second ordinary contact from the pre-collected list.
  if (signatureProfileForAction(proposal.action)?.kind === 'counter' && attacker.hitResolved) return;
  attacker.hitResolved = true;

  const counter = activeCounter(defender);
  if (counter) {
    const damage = scaledDamage(defender, counter.damage);
    defender.hitResolved = true;
    attacker.health = Math.max(0, attacker.health - damage);
    attacker.stun = Math.max(attacker.stun, counter.counterStun);
    attacker.velocityX = 0;
    attacker.action = 'idle';
    attacker.actionTick = 0;
    attacker.combo = 0;
    attacker.comboContinuation = false;
    pushDefender(state, proposal.defender, proposal.attacker, counter.pushback);
    addEvent(state, {
      type: 'counter-hit',
      actor: proposal.defender,
      target: proposal.attacker,
      action: counter.id,
      damage,
      counter: true,
    });
    state.hitstop = Math.max(state.hitstop, counter.hitstop);
    return;
  }

  if (isParrying(defender) && proposal.move.hitLevel !== 'low') {
    attacker.stun = Math.max(attacker.stun, 24);
    attacker.velocityX = 0;
    attacker.action = 'idle';
    attacker.actionTick = 0;
    attacker.combo = 0;
    attacker.comboContinuation = false;
    defender.recoveryLock = Math.max(defender.recoveryLock, 8);
    defender.action = 'idle';
    defender.actionTick = 0;
    addEvent(state, { type: 'parry', actor: proposal.defender, target: proposal.attacker, action: 'parry' });
    state.hitstop = Math.max(state.hitstop, 6);
    return;
  }

  if (hasVetoShield(defender)) {
    const shield = signatureProfileForAction(defender.action);
    defender.specialAbsorbed = true;
    defender.recoveryLock = Math.max(defender.recoveryLock, 12);
    attacker.recoveryLock = Math.max(attacker.recoveryLock, 12);
    defender.action = 'idle';
    attacker.action = 'idle';
    defender.velocityX = 0;
    attacker.velocityX = 0;
    defender.actionTick = 0;
    attacker.actionTick = 0;
    attacker.combo = 0;
    defender.combo = 0;
    attacker.comboContinuation = false;
    defender.comboContinuation = false;
    addEvent(state, {
      type: 'shield-absorb',
      actor: proposal.defender,
      target: proposal.attacker,
      action: shield?.id ?? 'special_veto',
    });
    state.hitstop = Math.max(state.hitstop, shield?.hitstop ?? 6);
    return;
  }

  if (guardBlocks(defender, proposal.move)) {
    defender.stamina = Math.max(0, defender.stamina - proposal.move.guardDamage);
    defender.staminaRegenDelay = STAMINA_REGEN_DELAY;
    attacker.meter = clamp(attacker.meter + BLOCK_METER_GAIN, 0, MAX_METER);
    addEvent(state, {
      type: 'block',
      actor: proposal.attacker,
      target: proposal.defender,
      action: proposal.action,
      blocked: true,
    });
    if (defender.stamina === 0) {
      defender.action = 'idle';
      defender.actionTick = 0;
      defender.stun = GUARD_BREAK_STUN;
      defender.guardBroken = true;
      defender.combo = 0;
      defender.comboContinuation = false;
      addEvent(state, { type: 'guard-break', actor: proposal.attacker, target: proposal.defender, action: proposal.action });
    } else {
      defender.recoveryLock = Math.max(defender.recoveryLock, proposal.move.blockstun);
    }
    pushDefender(state, proposal.attacker, proposal.defender, 0.12);
    state.hitstop = Math.max(state.hitstop, 4);
    return;
  }

  const airborneAntiAir = proposal.action === 'anti_air' && !grounded(defender);
  // Only an action started through cancelInto can continue an existing chain.
  const continuesCombo = ORDINARY_ATTACKS.has(proposal.action)
    && proposal.comboBefore > 0
    && proposal.comboContinuation;
  const combo = ORDINARY_ATTACKS.has(proposal.action)
    ? Math.min(continuesCombo ? proposal.comboBefore + 1 : 1, 3)
    : 0;
  const scale = combo > 0 ? DAMAGE_SCALE[combo - 1] : 1;
  const counterScale = proposal.counter ? 1.15 : 1;
  const damage = scaledDamage(attacker, proposal.move.damage, scale * counterScale);
  defender.health = Math.max(0, defender.health - damage);
  defender.stun = proposal.move.hitstun;
  defender.velocityX = 0;
  defender.action = 'idle';
  defender.actionTick = 0;
  defender.buffered = null;
  defender.combo = 0;
  defender.comboContinuation = false;
  defender.staminaRegenDelay = STAMINA_REGEN_DELAY;
  attacker.meter = clamp(attacker.meter + HIT_METER_GAIN, 0, MAX_METER);
  defender.meter = clamp(defender.meter + RECEIVED_METER_GAIN, 0, MAX_METER);
  attacker.hitConnected = true;
  attacker.combo = combo;
  addEvent(state, {
    type: proposal.counter ? 'counter-hit' : 'hit',
    actor: proposal.attacker,
    target: proposal.defender,
    action: proposal.action,
    damage,
    counter: proposal.counter,
    combo: combo || undefined,
  });
  const signature = signatureProfileForAction(proposal.action);
  if (signature) {
    defender.stamina = clamp(defender.stamina - signature.staminaDamage, 0, defender.maxStamina);
    defender.meter = clamp(defender.meter - signature.meterDrain, 0, MAX_METER);
    if (signature.knockdown > 0) {
      defender.knockdown = Math.max(defender.knockdown, signature.knockdown);
      defender.y = 0;
      defender.airTick = 0;
      defender.airTicksTotal = 0;
      defender.airDirection = 0;
      addEvent(state, {
        type: 'knockdown',
        actor: proposal.attacker,
        target: proposal.defender,
        action: proposal.action,
      });
    }
  }
  if (airborneAntiAir) {
    defender.knockdown = Math.max(defender.knockdown, proposal.move.hitstun);
    defender.y = 0;
    defender.airTick = 0;
    defender.airTicksTotal = 0;
    defender.airDirection = 0;
    addEvent(state, {
      type: 'knockdown',
      actor: proposal.attacker,
      target: proposal.defender,
      action: proposal.action,
    });
  }
  if (combo === 3) {
    attacker.recoveryLock = Math.max(attacker.recoveryLock, 8);
    pushDefender(state, proposal.attacker, proposal.defender, 0.6);
  } else {
    // The exported light -> body route must remain in range. Separation happens
    // on the capped third strike rather than silently invalidating the second.
    pushDefender(
      state,
      proposal.attacker,
      proposal.defender,
      signature?.pushback ?? (proposal.action === 'special_papers' ? 0.5 : 0.1),
    );
  }
  state.hitstop = Math.max(state.hitstop, signature?.hitstop ?? (proposal.move.damage >= 100 ? 8 : 6));
}

function pushDefender(state: MatchState, attackerIndex: 0 | 1, defenderIndex: 0 | 1, distance: number): void {
  const attacker = state.fighters[attackerIndex];
  const defender = state.fighters[defenderIndex];
  const direction = attacker.x <= defender.x ? 1 : -1;
  defender.x = round(clamp(defender.x + direction * distance, -6.7, 6.7));
  preventCrossing(state, [attackerIndex === 0 ? attacker.x : defender.x, attackerIndex === 0 ? defender.x : attacker.x]);
}

function resetCombos(state: MatchState): void {
  ([0, 1] as const).forEach((index) => {
    const self = state.fighters[index];
    const opponent = state.fighters[index === 0 ? 1 : 0];
    const committedChain = self.combo > 0 && self.comboContinuation && ORDINARY_ATTACKS.has(self.action);
    if (opponent.stun === 0 && opponent.capturedBy === null && !committedChain) self.combo = 0;
  });
}

function finishCompletedActions(state: MatchState): void {
  state.fighters.forEach((self) => {
    if (HELD.has(self.action) || self.capturedBy !== null || self.recoveryLock > 0) return;
    const moveData = moves[self.action];
    if (self.actionTick < moveData.startup + moveData.active + moveData.recovery) return;
    self.action = 'idle';
    self.actionTick = 0;
    self.hitConnected = false;
    self.hitResolved = false;
    self.comboContinuation = false;
  });
}

function roundOutcome(state: MatchState): 0 | 1 | 'draw' | null {
  const [a, b] = state.fighters;
  if (a.health <= 0 && b.health <= 0) return 'draw';
  if (a.health <= 0) return 1;
  if (b.health <= 0) return 0;
  if (state.timer > 0) return null;
  const aNormalized = a.health * b.maxHealth;
  const bNormalized = b.health * a.maxHealth;
  if (aNormalized === bNormalized) return 'draw';
  return aNormalized > bNormalized ? 0 : 1;
}

function endRound(state: MatchState, outcome: 0 | 1 | 'draw'): void {
  if (outcome !== 'draw') state.wins[outcome] += 1;
  state.phase = 'round-end';
  state.phaseTicks = 0;
  state.hitstop = 0;
  addEvent(state, { type: 'round-end', actor: outcome === 'draw' ? 0 : outcome, outcome });
}

function matchShouldEnd(state: MatchState): boolean {
  return state.wins[0] >= 2 || state.wins[1] >= 2 || state.round >= 4;
}

function finishMatch(state: MatchState): void {
  state.phase = 'match-end';
  state.phaseTicks = 0;
  state.winner = state.wins[0] === state.wins[1] ? 'draw' : state.wins[0] > state.wins[1] ? 0 : 1;
  addEvent(state, { type: 'match-end', actor: state.winner === 'draw' ? 0 : state.winner, outcome: state.winner });
}

function resetRound(state: MatchState): void {
  state.round += 1;
  state.phase = 'ready';
  state.phaseTicks = 0;
  state.timer = ROUND_TICKS;
  const specials: [SpecialId, SpecialId] = [state.fighters[0].special, state.fighters[1].special];
  const profiles: [FighterProfile, FighterProfile] = [
    fighterProfileForCharacter(state.fighters[0].profileId),
    fighterProfileForCharacter(state.fighters[1].profileId),
  ];
  state.fighters = [
    fighter(-2, 1, specials[0], profiles[0]),
    fighter(2, -1, specials[1], profiles[1]),
  ];
  addEvent(state, { type: 'round-ready', actor: 0 });
}

/**
 * Advances exactly one 1/60-second simulation tick and returns a new state.
 * The input tuple contains already-resolved semantic actions, not raw key events.
 */
export function stepMatch(state: MatchState, inputs: [ActionId, ActionId]): MatchState {
  const next = cloneState(state);
  next.tick += 1;

  if (next.phase === 'match-end') return next;
  if (next.phase === 'ready') {
    next.phaseTicks += 1;
    if (next.phaseTicks >= READY_TICKS) {
      next.phase = 'fight';
      next.phaseTicks = 0;
      addEvent(next, { type: 'fight', actor: 0 });
    }
    return next;
  }
  if (next.phase === 'round-end') {
    next.phaseTicks += 1;
    if (next.phaseTicks >= ROUND_END_TICKS) {
      if (matchShouldEnd(next)) finishMatch(next);
      else resetRound(next);
    }
    return next;
  }
  if (next.hitstop > 0) {
    // A tap during hitstop is retained for the ordinary five simulation-tick
    // buffer; hitstop itself does not consume buffer time.
    bufferAction(next.fighters[0], inputs[0]);
    bufferAction(next.fighters[1], inputs[1]);
    next.hitstop -= 1;
    return next;
  }

  next.phaseTicks += 1;
  if (!next.training) next.timer = Math.max(0, next.timer - 1);
  tickLocks(next);
  processCaptures(next, inputs);
  const oldX: [number, number] = [next.fighters[0].x, next.fighters[1].x];
  processAction(next, 0, inputs[0]);
  processAction(next, 1, inputs[1]);
  applyGroundMovement(next);
  applyAirMovement(next);
  preventCrossing(next, oldX);
  updateFacing(next);
  releaseSignatures(next);
  beginThrows(next);
  const proposals = collectHits(next);
  proposals.forEach((proposal) => resolveHit(next, proposal));
  regenerateStamina(next);
  finishCompletedActions(next);
  resetCombos(next);

  const outcome = roundOutcome(next);
  if (outcome !== null) endRound(next, outcome);
  return next;
}

function actionPhase(self: FighterState): PublicFighterObservation['actionPhase'] {
  if (self.capturedBy !== null) return 'captured';
  if (self.stun > 0 || self.recoveryLock > 0) return 'stun';
  if (self.action === 'idle') return 'neutral';
  const moveData = moves[self.action];
  if (self.actionTick <= moveData.startup) return 'startup';
  if (isActive(self)) return 'active';
  return 'recovery';
}

function publicFighter(state: MatchState, index: 0 | 1): PublicFighterObservation {
  const self = state.fighters[index];
  return {
    health: self.health,
    maxHealth: self.maxHealth,
    stamina: self.stamina,
    maxStamina: self.maxStamina,
    meter: self.meter,
    xMm: Math.round(self.x * 1_000),
    yMm: Math.round(self.y * 1_000),
    facing: self.facing,
    grounded: grounded(self),
    knockedDown: self.knockdown > 0,
    action: self.action,
    actionPhase: actionPhase(self),
    actionTick: self.actionTick,
    canAct: state.phase === 'fight' && legalActions(state, index).length > 1,
    distanceToWallMm: Math.round((ARENA_HALF_WIDTH - FIGHTER_HALF_WIDTH - Math.abs(self.x)) * 1_000),
    special: self.special,
  };
}

/** Creates a stable, JSON-serializable policy view without seed, buffers or future state. */
export function getObservation(
  state: MatchState,
  index: 0 | 1,
  history: readonly ActionId[] = [],
): MatchObservation {
  const opponentIndex = index === 0 ? 1 : 0;
  return {
    version: 1,
    tick: state.tick,
    round: state.round,
    phase: state.phase,
    timer: state.timer,
    self: publicFighter(state, index),
    opponent: publicFighter(state, opponentIndex),
    distanceMm: Math.round(Math.abs(state.fighters[1].x - state.fighters[0].x) * 1_000),
    history: history.filter((action): action is ActionId => actionIds.includes(action)).slice(-8),
  };
}
