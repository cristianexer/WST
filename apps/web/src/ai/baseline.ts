import type { ActionId, CheckpointInfo, Controller, ControllerStatus, Decision, Difficulty, LoadProgress, MatchObservation } from './types';

/**
 * A visibly labelled local practice opponent. It is intentionally separate from
 * BrowserController so unavailable Laya never turns into an unlabelled heuristic.
 */
export class BaselineController implements Controller {
  readonly source = 'baseline' as const;
  status: ControllerStatus = 'idle';
  checkpoint: CheckpointInfo = {
    id: 'wst/baseline-practice-v1',
    revision: '1',
    runtime: 'baseline',
    ready: false,
    detail: 'Explicit local baseline practice controller.',
  };

  private randomState: number;

  constructor(readonly difficulty: Difficulty, seed = 0x57425431) {
    this.randomState = seed >>> 0;
  }

  async load(onProgress: (progress: LoadProgress) => void, signal?: AbortSignal): Promise<void> {
    if (this.status === 'disposed') throw new Error('The baseline controller has been disposed.');
    if (signal?.aborted) throw signal.reason ?? new DOMException('Baseline loading was cancelled.', 'AbortError');
    this.status = 'loading';
    onProgress({ progress: 0, stage: 'Preparing baseline', detail: `${this.difficulty} local practice opponent.` });
    await Promise.resolve();
    if (signal?.aborted) throw signal.reason ?? new DOMException('Baseline loading was cancelled.', 'AbortError');
    this.status = 'ready';
    this.checkpoint = { ...this.checkpoint, ready: true, detail: `${this.difficulty} local baseline practice controller ready.` };
    onProgress({ progress: 1, stage: 'Ready', detail: this.checkpoint.detail });
  }

  async decide(observation: unknown, legal: ActionId[]): Promise<Decision> {
    if (this.status !== 'ready') throw new Error('The baseline controller has not completed loading.');
    if (legal.length === 0) throw new Error('The combat engine supplied no legal baseline action.');
    const startedAt = performance.now();
    const action = chooseBaselineAction(readPublicObservation(observation), legal, this.difficulty, () => this.nextRandom());
    return { action, latencyMs: performance.now() - startedAt, source: 'baseline' };
  }

  dispose(): void {
    this.status = 'disposed';
    this.checkpoint = { ...this.checkpoint, ready: false, detail: 'Baseline controller disposed.' };
  }

  private nextRandom(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}

export const createBaselineController = (difficulty: Difficulty): BaselineController => new BaselineController(difficulty);

function chooseBaselineAction(
  observation: MatchObservation | null,
  legal: readonly ActionId[],
  difficulty: Difficulty,
  random: () => number,
): ActionId {
  const available = (choices: readonly ActionId[]): ActionId | undefined => choices.find((choice) => legal.includes(choice));
  if (!observation) return available(['idle', 'advance', 'retreat']) ?? legal[0];

  const opponentAction = observation.opponent.action;
  const opponentThreatening = observation.opponent.actionPhase === 'startup' || observation.opponent.actionPhase === 'active';
  const close = observation.distanceMm <= 720;
  const far = observation.distanceMm >= 1250;
  const defensive = observation.self.health + 120 < observation.opponent.health || observation.self.stamina < 18;

  // The visible move determines only a legal block height, never a hidden input or future action.
  if (opponentThreatening && close) {
    const guard = opponentAction === 'low' ? 'guard_low' : 'guard_high';
    return available([guard, 'retreat', 'idle']) ?? legal[0];
  }
  if (observation.opponent.yMm > 120 || opponentAction === 'jump') {
    return available(['anti_air', 'guard_high', 'retreat', 'idle']) ?? legal[0];
  }
  if (defensive) {
    return available(['retreat', 'guard_high', 'guard_low', 'idle']) ?? legal[0];
  }
  if (observation.self.meter >= 100 && close && difficulty !== 'beginner' && random() > 0.62) {
    // The selected fighter's signature is part of the delayed public observation.
    // Keep it first so the visible local baseline can actually exercise the 21
    // distinct character mechanics; legacy specials remain valid fallbacks.
    return available([observation.self.special, 'special_papers', 'special_veto', 'light']) ?? legal[0];
  }
  if (far) {
    const approach: readonly ActionId[] = difficulty === 'expert' && observation.self.stamina >= 8 && random() > 0.55
      ? ['dash_forward', 'advance', 'idle']
      : ['advance', 'jump', 'idle'];
    return available(approach) ?? legal[0];
  }

  const closeSequences: Record<Difficulty, readonly ActionId[]> = {
    beginner: ['light', 'guard_high', 'retreat', 'idle'],
    standard: ['light', 'body', 'low', 'throw', 'guard_high', 'retreat', 'idle'],
    expert: ['light', 'body', 'low', 'overhead', 'throw', 'parry', 'guard_low', 'retreat', 'idle'],
  };
  const choices = closeSequences[difficulty];
  const offset = Math.floor(random() * choices.length);
  return available([...choices.slice(offset), ...choices.slice(0, offset)]) ?? legal[0];
}

function readPublicObservation(value: unknown): MatchObservation | null {
  if (!value || typeof value !== 'object') return null;
  const observation = value as Partial<MatchObservation>;
  if (!observation.self || !observation.opponent || !Number.isFinite(observation.distanceMm)) return null;
  if (!Number.isFinite(observation.self.health) || !Number.isFinite(observation.self.stamina) || !Number.isFinite(observation.self.meter)) return null;
  if (!Number.isFinite(observation.opponent.health) || !Number.isFinite(observation.opponent.yMm)) return null;
  return observation as MatchObservation;
}
