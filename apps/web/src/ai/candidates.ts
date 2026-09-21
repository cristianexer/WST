import type { ActionId, MatchObservation } from './types';
import { isSignatureAction, signatureMechanicsForAction } from '../../../../packages/combat-core/src/signatures';
import { moves } from '../../../../packages/combat-core/src/moves';

export const MAX_LAYA_CANDIDATES = 16;
export const LAYA_CHOICE_INSTRUCTIONS =
  // The upstream typed-choice header and all option text share a fixed 192-token
  // budget. Keep this intentionally short so a full sixteen-action legal set fits
  // without truncating a candidate or silently changing the decision problem.
  'Choose the best legal action from the delayed public combat state.';

/**
 * This order is a versioned presentation order, never a tactical ranking. An upstream
 * scheduler may rotate the trailing entries if it needs to prune a larger legal set.
 */
export const CANDIDATE_ORDER: readonly ActionId[] = [
  'idle', 'guard_high', 'guard_low', 'advance', 'retreat', 'crouch',
  'dash_forward', 'dash_back', 'jump', 'light', 'body', 'heavy', 'low',
  'overhead', 'anti_air', 'air_kick', 'throw', 'throw_break', 'parry',
  'special_veto', 'special_papers',
];

/**
 * Descriptions for the non-signature move register. Signature moves are generated
 * from their public mechanics below, so neither a leader nor a signature title can
 * enter the policy prompt.
 */
export const ACTION_CRITERIA: Readonly<Partial<Record<ActionId, string>>> = {
  light: 'quick high punch',
  body: 'mid punch follow-up',
  heavy: 'slow strong mid punch',
  low: 'low kick',
  overhead: 'slow overhead strike',
  anti_air: 'rising anti-air strike',
  air_kick: 'airborne overhead kick',
  throw: 'close guard-breaking throw',
  throw_break: 'break active throw',
  parry: 'brief stamina parry',
  special_veto: 'full-meter defensive shield',
  special_papers: 'full-meter long special',
  dash_forward: 'stamina forward dash',
  dash_back: 'stamina back dash',
  jump: 'stamina jump',
  guard_high: 'high and mid guard',
  guard_low: 'low and mid guard',
  advance: 'walk forward',
  retreat: 'walk back',
  crouch: 'crouch below highs',
  idle: 'neutral spacing',
};

export interface CandidateSet {
  actions: ActionId[];
  criteria: Readonly<Partial<Record<ActionId, string>>>;
  pruned: ActionId[];
}

/**
 * Select at most sixteen actions deterministically. It retains neutral, applicable
 * guards, and basic spacing before traversing the stable V1 order. It does not choose
 * a counter to the opponent; legality is supplied by the combat engine.
 */
export function selectCandidates(legal: readonly ActionId[], rotation = 0): CandidateSet {
  const uniqueLegal = [...new Set(legal)];
  const legalSet = new Set(uniqueLegal);
  const required = ['idle', 'guard_high', 'guard_low', 'advance', 'retreat']
    .filter((action): action is ActionId => legalSet.has(action as ActionId));
  // A real match exposes exactly one selected-fighter signature. Put any such
  // legal action ahead of the rotating residual set so the 16-choice cap cannot
  // silently erase its distinct, public mechanics.
  const signatures = uniqueLegal.filter(isSignatureAction);
  const remainingOrder = rotate(CANDIDATE_ORDER.filter((action) => !required.includes(action)), rotation);
  const actions = [...required, ...signatures, ...remainingOrder.filter((action) => legalSet.has(action) && !isSignatureAction(action))]
    .slice(0, MAX_LAYA_CANDIDATES);
  const selected = new Set(actions);

  return {
    actions,
    criteria: Object.fromEntries(actions.map((action) => [action, candidateCriterion(action)])) as Partial<Record<ActionId, string>>,
    pruned: uniqueLegal.filter((action) => !selected.has(action)),
  };
}

export interface LayaChoiceOption {
  /** Opaque, stable by request order; this keeps internal ActionId strings out of the prompt. */
  id: `option_${number}`;
  action: ActionId;
  criterion: string;
}

export interface LayaChoiceRequest {
  state: string;
  question: {
    type: 'choice';
    instructions: string;
    criteria: Record<`option_${number}`, string>;
  };
  /** Exact action order used to map model logits back to legal engine actions. */
  candidates: ActionId[];
  /** Opaque serialized options in the same exact order as candidates. */
  options: LayaChoiceOption[];
}

/**
 * Serialises exactly the public, delayed observation fields. It intentionally has no
 * general JSON fallback: identity, keyboard queues, and future state cannot enter the
 * Laya prompt by accident.
 */
export function serializeObservation(observation: MatchObservation): string {
  assertPublicObservation(observation);
  const history = observation.history.slice(-8).map(normalizeActionForPolicy).join(',') || 'none';
  const self = observation.self;
  const opponent = observation.opponent;
  return [
    `SELF hp=${normalizedPercent(self.health, maxPublicValue(self, 'maxHealth'))} st=${normalizedPercent(self.stamina, maxPublicValue(self, 'maxStamina'))} m=${self.meter}`,
    `alt=${self.yMm} phase=${self.actionPhase} action=${normalizeActionForPolicy(self.action)} age=${self.actionTick} can=${self.canAct ? 1 : 0}`,
    `sig=${serializeSpecialMechanics(self.special)}`,
    `OTHER hp=${normalizedPercent(opponent.health, maxPublicValue(opponent, 'maxHealth'))} st=${normalizedPercent(opponent.stamina, maxPublicValue(opponent, 'maxStamina'))} m=${opponent.meter}`,
    `alt=${opponent.yMm} phase=${opponent.actionPhase} action=${normalizeActionForPolicy(opponent.action)} age=${opponent.actionTick} can=${opponent.canAct ? 1 : 0}`,
    `dist=${observation.distanceMm} sig=${serializeSpecialMechanics(opponent.special)}`,
    `wall=${self.distanceToWallMm}/${opponent.distanceToWallMm} round=${observation.round} timer=${observation.timer} hist=${history}`,
  ].join(' ');
}

/**
 * The observation has no profile identity. Combat-core now provides only these
 * public maxima so a varied fighter's current health and stamina can be stated
 * comparably in the fixed Laya context. The optional read keeps this adapter
 * compatible with historical replay observations.
 */
function maxPublicValue(fighter: object, key: 'maxHealth' | 'maxStamina'): number | undefined {
  const value = (fighter as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizedPercent(value: number, maximum: number | undefined): number {
  return maximum === undefined ? value : Math.round((value / maximum) * 100);
}

export function buildLayaChoiceRequest(
  observation: MatchObservation,
  legal: readonly ActionId[],
  rotation = 0,
): LayaChoiceRequest {
  const candidateSet = selectCandidates(legal, rotation);
  if (candidateSet.actions.length < 2) {
    throw new Error('Laya typed-choice requires at least two legal actions.');
  }
  const options = candidateSet.actions.map((action, index) => ({
    id: `option_${index + 1}` as `option_${number}`,
    action,
    criterion: candidateCriterion(action),
  }));

  return {
    state: serializeObservation(observation),
    question: {
      type: 'choice',
      instructions: LAYA_CHOICE_INSTRUCTIONS,
      criteria: Object.fromEntries(options.map((option) => [option.id, option.criterion])) as Record<`option_${number}`, string>,
    },
    candidates: candidateSet.actions,
    options,
  };
}

/** A signature action contains a character-specific internal ID, never policy text. */
export function normalizeActionForPolicy(action: ActionId): string {
  return isSignatureAction(action) ? 'signature' : action;
}

/** Public mechanics allow a policy to account for signatures without character IDs or names. */
function serializeSpecialMechanics(action: ActionId): string {
  const signature = signatureMechanicsForAction(action);
  const move = moves[action];
  const kind = signature?.kind
    ?? (move.hitLevel === 'defence' || move.damage === 0 ? 'defence' : 'strike');
  return [
    `k=${kind}`,
    `r=${Math.round(move.reach * 1_000)}`,
  ].join(' ');
}

/**
 * Compact neutral mechanics stay well inside Laya's 48-token option bound. The
 * real action remains only in the ordered in-memory mapping, never in the text.
 */
export function candidateCriterion(action: ActionId): string {
  const signature = signatureMechanicsForAction(action);
  if (signature) {
    const effects = [
      signature.travel > 0 ? `travel ${signature.travel}` : '',
      signature.staminaDamage > 0 ? `stamina_drain ${signature.staminaDamage}` : '',
      signature.meterDrain > 0 ? `meter_drain ${signature.meterDrain}` : '',
      signature.knockdown > 0 ? `knockdown ${signature.knockdown}` : '',
      signature.counterStun > 0 ? `counter_stun ${signature.counterStun}` : '',
    ].filter(Boolean).join(' ');
    return [
      `signature ${signature.kind} ${signature.hitLevel}`,
      `start ${signature.startup} active ${signature.active} recover ${signature.recovery}`,
      `damage ${signature.damage} reach ${signature.reach}`,
      `stamina ${signature.staminaCost} meter ${signature.meterCost}`,
      effects,
    ].filter(Boolean).join('; ');
  }
  const criterion = ACTION_CRITERIA[action];
  if (!criterion) throw new Error(`Laya has no neutral criterion for legal action ${action}.`);
  return criterion;
}

/** Maps raw Laya choice logits to the ordered legal candidate set. */
export function mapChoiceLogits(
  logits: ArrayLike<number>,
  candidates: readonly ActionId[],
  temperature: number,
): { action: ActionId; scores: Record<string, number> } {
  if (candidates.length < 2 || candidates.length > MAX_LAYA_CANDIDATES) {
    throw new Error(`Expected 2-${MAX_LAYA_CANDIDATES} candidates; received ${candidates.length}.`);
  }
  if (logits.length < candidates.length) {
    throw new Error(`Laya returned ${logits.length} logits for ${candidates.length} candidates.`);
  }
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new Error('Laya choice temperature must be a finite number above zero.');
  }

  const first = logits.length - candidates.length;
  const values = candidates.map((_, index) => logits[first + index] / temperature);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Laya returned a non-finite choice logit.');
  }
  const maximum = Math.max(...values);
  const exponents = values.map((value) => Math.exp(value - maximum));
  const denominator = exponents.reduce((sum, value) => sum + value, 0);
  const scores: Record<string, number> = {};
  let winnerIndex = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    scores[candidates[index]] = exponents[index] / denominator;
    if (values[index] > values[winnerIndex]) winnerIndex = index;
  }
  return { action: candidates[winnerIndex], scores };
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (values.length === 0) return [];
  const start = ((Math.trunc(offset) % values.length) + values.length) % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function assertPublicObservation(value: MatchObservation): void {
  const isFiniteNumber = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate);
  if (!value || typeof value !== 'object' || !value.self || !value.opponent || !Array.isArray(value.history)) {
    throw new Error('Laya requires a public MatchObservation.');
  }
  const numericValues = [
    value.tick, value.round, value.timer, value.distanceMm,
    value.self.health, value.self.stamina, value.self.meter, value.self.distanceToWallMm,
    value.opponent.health, value.opponent.stamina, value.opponent.meter, value.opponent.distanceToWallMm,
  ];
  if (!numericValues.every(isFiniteNumber)) {
    throw new Error('Laya observation contains a non-finite public numeric value.');
  }
}
