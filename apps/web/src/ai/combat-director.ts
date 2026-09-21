import { moves, signatureProfileForAction } from '../../../../packages/combat-core/src';
import type { ActionId, Decision, Difficulty, MatchObservation } from './types';

const MODEL_HINT_TTL_TICKS = 120;
const CLOSE_THREAT_BUFFER_MM = 180;
const AIRBORNE_HEIGHT_MM = 120;
const LOW_STAMINA = 12;

export type CombatChoiceOrigin = 'model' | 'combat';

export interface CombatChoice {
  action: ActionId;
  /** Distinguishes an accepted Laya hint from a local public-observation reflex. */
  origin: CombatChoiceOrigin;
  /** Presentation-safe explanation for AI Cam. */
  reason: string;
}

interface ModelProposal {
  action: ActionId;
  observationTick: number;
  round: number;
}

/**
 * A deterministic public-observation layer around experimental Laya advice.
 * Its combat reflexes are labelled instead of being represented as model output.
 */
export class CombatDirector {
  private randomState: number;
  private modelProposal: ModelProposal | null = null;

  constructor(readonly difficulty: Difficulty, seed = 0x57435444) {
    this.randomState = Math.trunc(seed) >>> 0;
  }

  /**
   * Retains one real Laya reply until a fresh delayed public observation can
   * check it. Later replies replace prior replies.
   */
  acceptModel(decision: Decision, observationTick: number, round: number): void {
    if (decision.source !== 'laya' || !Number.isFinite(observationTick) || !Number.isFinite(round)) {
      this.modelProposal = null;
      return;
    }
    this.modelProposal = {
      action: decision.action,
      observationTick: Math.trunc(observationTick),
      round: Math.trunc(round),
    };
  }

  /**
   * Chooses only from the supplied engine legal set. A reviewed proposal is
   * consumed after one use so a delayed answer cannot repeat across exchanges.
   */
  choose(observation: MatchObservation, legal: readonly ActionId[]): CombatChoice {
    const legalSet = new Set(legal);
    if (legalSet.size === 0) throw new Error('CombatDirector requires at least one legal action.');
    if (legalSet.size === 1) {
      // A forced recovery or hit-stop action is still a decision boundary. Do
      // not carry a one-shot model reply into a later, unrelated exchange.
      this.takeCurrentProposal(observation);
      return this.result(legal[0], 'combat', 'Combat commitment: the engine permits only the current action.');
    }

    const proposal = this.takeCurrentProposal(observation);
    if (proposal) {
      const review = this.reviewModelProposal(proposal.action, observation, legalSet);
      if (review.accepted) return this.result(proposal.action, 'model', review.reason);
    }
    return this.chooseCombatAction(observation, legalSet);
  }

  reset(): void {
    this.modelProposal = null;
  }

  private takeCurrentProposal(observation: MatchObservation): ModelProposal | null {
    const proposal = this.modelProposal;
    this.modelProposal = null;
    if (!proposal) return null;
    const age = observation.tick - proposal.observationTick;
    if (proposal.round !== observation.round || age < 0 || age > MODEL_HINT_TTL_TICKS) return null;
    return proposal;
  }

  private reviewModelProposal(
    action: ActionId,
    observation: MatchObservation,
    legal: ReadonlySet<ActionId>,
  ): { accepted: boolean; reason: string } {
    if (!legal.has(action)) return { accepted: false, reason: 'The Laya action is no longer legal.' };
    if (action === 'idle') return { accepted: false, reason: 'The idle Laya hint cannot replace active combat spacing.' };
    if (action === 'throw_break') {
      return observation.self.actionPhase === 'captured'
        ? { accepted: true, reason: 'Laya accepts the live throw-break window.' }
        : { accepted: false, reason: 'Throw break is not active in the fresh public state.' };
    }
    if (action === 'advance') {
      return observation.distanceMm > 720
        ? { accepted: true, reason: 'Laya advances while the opponent is outside close range.' }
        : { accepted: false, reason: 'Laya advance would crowd an already close opponent.' };
    }
    if (action === 'dash_forward') {
      return observation.distanceMm > 900
        ? { accepted: true, reason: 'Laya uses a legal forward dash to close distance.' }
        : { accepted: false, reason: 'Laya forward dash is unnecessary at this range.' };
    }
    if (action === 'retreat' || action === 'dash_back') {
      return this.visibleThreat(observation) && observation.self.distanceToWallMm > 700
        ? { accepted: true, reason: 'Laya retreats from a visible threat with wall room available.' }
        : { accepted: false, reason: 'Laya retreat would concede space without a safe reason.' };
    }
    if (action === 'guard_high' || action === 'guard_low') {
      const expected = this.guardForThreat(observation);
      return expected === action
        ? { accepted: true, reason: 'Laya selected the visible ' + (action === 'guard_low' ? 'low' : 'high') + ' block.' }
        : { accepted: false, reason: 'Laya guard does not match a current close visible threat.' };
    }
    if (action === 'parry') {
      return this.visibleThreat(observation) && this.threatLevel(observation) !== 'low'
        ? { accepted: true, reason: 'Laya selected a legal parry against a visible strike.' }
        : { accepted: false, reason: 'Laya parry has no visible non-low strike to answer.' };
    }
    if (action === 'anti_air') {
      return this.opponentAirborne(observation) && this.withinReach(action, observation)
        ? { accepted: true, reason: 'Laya selected anti-air against a reachable airborne opponent.' }
        : { accepted: false, reason: 'Laya anti-air target is not airborne and reachable.' };
    }
    if (action === 'jump' || action === 'crouch') {
      return this.visibleThreat(observation)
        ? { accepted: true, reason: 'Laya selected a legal evasive ' + action + ' against a visible threat.' }
        : { accepted: false, reason: 'Laya ' + action + ' has no current visible threat to answer.' };
    }

    const signature = signatureProfileForAction(action);
    if (signature?.kind === 'shield' || signature?.kind === 'counter' || action === 'special_veto') {
      return this.visibleThreat(observation)
        ? { accepted: true, reason: 'Laya selected a legal defensive signature against a visible threat.' }
        : { accepted: false, reason: 'Laya defensive signature has no visible threat to answer.' };
    }
    if (moves[action].damage > 0 || action === 'throw') {
      return this.withinReach(action, observation)
        ? { accepted: true, reason: 'Laya selected reachable ' + (action === 'throw' ? 'throw pressure.' : 'attack pressure.') }
        : { accepted: false, reason: 'Laya attack is outside its public reach.' };
    }
    return { accepted: false, reason: 'Laya action has no current public combat justification.' };
  }

  private chooseCombatAction(observation: MatchObservation, legal: ReadonlySet<ActionId>): CombatChoice {
    const take = (choices: readonly ActionId[]): ActionId | undefined => choices.find((action) => legal.has(action));
    const threat = this.visibleThreat(observation);
    const wallPinned = observation.self.distanceToWallMm <= 700;

    if (observation.self.actionPhase === 'captured') {
      return this.result(take(['throw_break', 'idle'])!, 'combat', 'Combat reflex: break the active throw.');
    }
    if (!observation.self.grounded) {
      const action = this.withinReach('air_kick', observation)
        ? take(['air_kick', 'idle'])!
        : take(['idle'])!;
      return this.result(action, 'combat', action === 'air_kick'
        ? 'Combat pressure: use the available reachable air kick.'
        : 'Combat spacing: land before attacking from outside air-kick range.');
    }
    if (this.opponentAirborne(observation) && this.withinReach('anti_air', observation)) {
      const action = take(['anti_air', 'guard_high', 'advance', 'idle'])!;
      return this.result(action, 'combat', action === 'anti_air'
        ? 'Combat reflex: anti-air a reachable airborne opponent.'
        : 'Combat reflex: protect against the airborne approach.');
    }
    if (threat) {
      const defensiveSpecial = observation.self.special;
      const defensiveProfile = signatureProfileForAction(defensiveSpecial);
      if (
        legal.has(defensiveSpecial)
        && observation.self.meter >= moves[defensiveSpecial].meterCost
        && (defensiveSpecial === 'special_veto' || defensiveProfile?.kind === 'shield' || defensiveProfile?.kind === 'counter')
      ) {
        return this.result(defensiveSpecial, 'combat', 'Combat reflex: spend meter on a visible-threat defensive signature.');
      }
      const guard = this.guardForThreat(observation);
      const action = take([guard, wallPinned ? 'parry' : 'retreat', 'guard_high', 'guard_low', 'idle'])!;
      return this.result(action, 'combat', action === guard
        ? 'Combat reflex: block the visible ' + (guard === 'guard_low' ? 'low' : 'high') + ' threat.'
        : 'Combat reflex: defend the visible threat.');
    }

    const spacingTarget = this.bestAttackReach(legal);
    if (observation.distanceMm > spacingTarget) {
      const canDash = observation.self.stamina >= moves.dash_forward.staminaCost
        && observation.distanceMm > spacingTarget + 900
        && this.difficulty === 'expert';
      const action = take(canDash ? ['dash_forward', 'advance', 'idle'] : ['advance', 'dash_forward', 'idle'])!;
      return this.result(action, 'combat', action === 'dash_forward'
        ? 'Combat spacing: spend stamina to close a long distance.'
        : 'Combat spacing: advance into reachable range.');
    }

    if (observation.self.stamina < LOW_STAMINA) {
      const action = take(['crouch', 'idle', 'advance'])!;
      return this.result(action, 'combat', action === 'crouch'
        ? 'Combat resource: recover stamina without retreating into the wall.'
        : 'Combat resource: hold position while stamina recovers.');
    }

    if (observation.opponent.action === 'guard_high') {
      const action = take(this.reachable(['low', 'throw', 'body'], observation)) ?? take(['advance', 'idle'])!;
      return this.result(action, 'combat', 'Combat reflex: answer a standing guard with low or throw pressure.');
    }
    if (observation.opponent.action === 'guard_low') {
      const action = take(this.reachable(['overhead', 'throw', 'body'], observation)) ?? take(['advance', 'idle'])!;
      return this.result(action, 'combat', 'Combat reflex: answer a low guard with overhead or throw pressure.');
    }

    const special = observation.self.special;
    const specialProfile = signatureProfileForAction(special);
    if (
      observation.self.meter >= moves[special].meterCost
      && moves[special].damage > 0
      && specialProfile?.kind !== 'counter'
      && this.withinReach(special, observation)
      && this.nextRandom() > (this.difficulty === 'beginner' ? 0.9 : 0.55)
      && legal.has(special)
    ) {
      return this.result(special, 'combat', 'Combat pressure: spend full meter on a reachable signature.');
    }

    const pressure = this.reachable(this.attackCycle(), observation);
    const action = take(this.rotate(pressure)) ?? take(['advance', 'guard_high', 'idle'])!;
    return this.result(action, 'combat', moves[action].damage > 0 || action === 'throw'
      ? 'Combat pressure: use a varied reachable attack.'
      : 'Combat spacing: maintain a safe forward position.');
  }

  private result(action: ActionId, origin: CombatChoiceOrigin, reason: string): CombatChoice {
    return { action, origin, reason };
  }

  private attackCycle(): readonly ActionId[] {
    if (this.difficulty === 'beginner') return ['light', 'low', 'body', 'throw'];
    if (this.difficulty === 'expert') return ['low', 'body', 'heavy', 'throw', 'light', 'overhead'];
    return ['low', 'light', 'body', 'throw', 'heavy', 'overhead'];
  }

  private rotate(actions: readonly ActionId[]): ActionId[] {
    if (actions.length < 2) return [...actions];
    const start = Math.floor(this.nextRandom() * actions.length);
    return [...actions.slice(start), ...actions.slice(0, start)];
  }

  private reachable(actions: readonly ActionId[], observation: MatchObservation): ActionId[] {
    return actions.filter((action) => this.withinReach(action, observation));
  }

  private bestAttackReach(legal: ReadonlySet<ActionId>): number {
    const ranges = [...legal]
      .filter((action) => moves[action].damage > 0 || action === 'throw')
      .map((action) => this.attackReach(action));
    const preferred = ranges.length > 0 ? Math.max(...ranges) : moves.low.reach;
    return Math.max(550, Math.round((preferred - 0.08) * 1_000));
  }

  private withinReach(action: ActionId, observation: MatchObservation): boolean {
    if (action === 'anti_air' && !this.opponentAirborne(observation)) return false;
    return observation.distanceMm <= Math.round(this.attackReach(action) * 1_000);
  }

  private attackReach(action: ActionId): number {
    const signature = signatureProfileForAction(action);
    return moves[action].reach + (signature?.travel ?? 0);
  }

  private opponentAirborne(observation: MatchObservation): boolean {
    return !observation.opponent.grounded
      || observation.opponent.yMm > AIRBORNE_HEIGHT_MM
      || observation.opponent.action === 'jump'
      || observation.opponent.action === 'air_kick';
  }

  private visibleThreat(observation: MatchObservation): boolean {
    if (observation.opponent.actionPhase !== 'startup' && observation.opponent.actionPhase !== 'active') return false;
    const signature = signatureProfileForAction(observation.opponent.action);
    if (
      moves[observation.opponent.action].damage <= 0
      || signature?.kind === 'shield'
      || signature?.kind === 'counter'
    ) return false;
    const threatReach = this.attackReach(observation.opponent.action) * 1_000 + CLOSE_THREAT_BUFFER_MM;
    return observation.distanceMm <= Math.max(720, Math.round(threatReach));
  }

  private guardForThreat(observation: MatchObservation): 'guard_high' | 'guard_low' {
    return this.threatLevel(observation) === 'low' ? 'guard_low' : 'guard_high';
  }

  private threatLevel(observation: MatchObservation): string {
    return moves[observation.opponent.action].hitLevel;
  }

  private nextRandom(): number {
    this.randomState = (Math.imul(this.randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}

export const createCombatDirector = (difficulty: Difficulty, seed?: number): CombatDirector =>
  new CombatDirector(difficulty, seed);
