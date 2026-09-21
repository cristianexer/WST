import {
  TICKS_PER_SECOND,
  actionIds,
  createMatch,
  moves,
  stepMatch,
  type ActionId,
  type MatchState,
  type SpecialId,
} from '../../../../packages/combat-core/src';

export type CombatInputs = [ActionId, ActionId];

export interface CombatFrame {
  /** State after applying inputs for exactly one simulation tick. */
  state: MatchState;
  inputs: CombatInputs;
}

export interface CombatWorkerStats {
  simulatedTicks: number;
  emittedBatches: number;
}

export interface CombatWorkerStartOptions {
  epoch: number;
  seed?: number;
  fighters?: [string, string];
  specials?: [SpecialId, SpecialId];
  training?: boolean;
  /** Exact recorded inputs disable live semantic input for this run. */
  replayInputs?: readonly CombatInputs[];
  /** Full ordered frames per postMessage. Defaults to two (about 33 ms). */
  snapshotBatchTicks?: number;
}

export type CombatWorkerRequest =
  | { type: 'start' | 'reset'; requestId: number; options: CombatWorkerStartOptions }
  | { type: 'submit'; epoch: number; inputs: CombatInputs; heldInputs?: CombatInputs }
  | { type: 'pause' | 'resume'; requestId: number; epoch: number }
  | { type: 'dispose' };

export type CombatWorkerResponse =
  | { type: 'ready'; requestId: number; epoch: number; state: MatchState }
  | {
    type: 'frames';
    epoch: number;
    frames: CombatFrame[];
    replayEnded: boolean;
    terminal: boolean;
    stats: CombatWorkerStats;
  }
  | { type: 'barrier'; requestId: number; epoch: number; paused: boolean; state: MatchState }
  | { type: 'error'; requestId?: number; epoch: number; message: string };

const TICK_MS = 1_000 / TICKS_PER_SECOND;
const MAX_ACCUMULATED_MS = 250;
const MAX_TICKS_PER_PUMP = 8;
const MAX_PENDING_PRESSES = 8;
const supportedActions = new Set<ActionId>(actionIds);

class FighterInput {
  held: ActionId = 'idle';
  readonly presses: ActionId[] = [];

  submit(action: ActionId, held?: ActionId): void {
    if (held !== undefined && moves[held].held) this.held = held;
    if (moves[action].held) {
      this.held = action;
      return;
    }
    if (this.presses.length < MAX_PENDING_PRESSES) this.presses.push(action);
  }

  next(): ActionId {
    return this.presses.shift() ?? this.held;
  }

  clear(): void {
    this.held = 'idle';
    this.presses.length = 0;
  }
}

/**
 * The pure worker-side state machine. Tests can advance it synchronously;
 * the DedicatedWorkerGlobalScope below supplies the real-time 60 Hz clock.
 */
export class CombatWorkerRuntime {
  private readonly emit: (message: CombatWorkerResponse) => void;
  private readonly controls = [new FighterInput(), new FighterInput()] as const;
  private state: MatchState | null = null;
  private epoch = 0;
  private paused = true;
  private pendingFrames: CombatFrame[] = [];
  private batchTicks = 2;
  private replayInputs: readonly CombatInputs[] | null = null;
  private replayCursor = 0;
  private replayEnded = false;
  private accumulator = 0;
  private lastPumpTime: number | null = null;
  private simulatedTicks = 0;
  private emittedBatches = 0;

  constructor(emit: (message: CombatWorkerResponse) => void) {
    this.emit = emit;
  }

  get currentState(): MatchState | null {
    return this.state;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  handle(message: CombatWorkerRequest): void {
    try {
      switch (message.type) {
        case 'start':
          this.start(message.requestId, message.options, false);
          break;
        case 'reset':
          this.start(message.requestId, message.options, true);
          break;
        case 'submit':
          this.submit(message.epoch, message.inputs, message.heldInputs);
          break;
        case 'pause':
          this.barrier(message.requestId, message.epoch, true);
          break;
        case 'resume':
          this.barrier(message.requestId, message.epoch, false);
          break;
        case 'dispose':
          this.flush();
          this.paused = true;
          this.clearInputs();
          break;
      }
    } catch (error) {
      this.emit({
        type: 'error',
        requestId: 'requestId' in message ? message.requestId : undefined,
        epoch: this.epoch,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Advances exact fixed ticks. Used by tests and by the real-time pump. */
  advanceTicks(count: number): CombatFrame[] {
    const frames: CombatFrame[] = [];
    if (this.paused || !this.state) return frames;
    const wholeTicks = Math.max(0, Math.trunc(count));
    for (let index = 0; index < wholeTicks; index += 1) {
      if (this.paused) break;
      const frame = this.advanceOne();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  /** Accumulator clock: render cadence never changes the 60 Hz simulation. */
  pump(now: number): void {
    if (!Number.isFinite(now)) return;
    if (this.paused || !this.state) {
      this.lastPumpTime = now;
      this.accumulator = 0;
      return;
    }
    if (this.lastPumpTime === null) {
      this.lastPumpTime = now;
      return;
    }
    const elapsed = Math.max(0, now - this.lastPumpTime);
    this.lastPumpTime = now;
    this.accumulator = Math.min(this.accumulator + elapsed, MAX_ACCUMULATED_MS);
    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_TICKS_PER_PUMP && !this.paused) {
      this.advanceTicks(1);
      this.accumulator -= TICK_MS;
      ticks += 1;
    }
  }

  private start(requestId: number, options: CombatWorkerStartOptions, flushPrevious: boolean): void {
    if (flushPrevious) this.flush();
    this.epoch = Math.max(1, Math.trunc(options.epoch));
    this.state = createMatch({ seed: options.seed, fighters: options.fighters, specials: options.specials, training: options.training });
    this.batchTicks = Math.max(1, Math.min(8, Math.trunc(options.snapshotBatchTicks ?? 2)));
    this.replayInputs = options.replayInputs ?? null;
    this.replayCursor = 0;
    this.replayEnded = false;
    this.pendingFrames = [];
    this.paused = false;
    this.accumulator = 0;
    this.lastPumpTime = null;
    this.simulatedTicks = 0;
    this.emittedBatches = 0;
    this.clearInputs();
    this.emit({ type: 'ready', requestId, epoch: this.epoch, state: this.state });
    if (this.replayInputs?.length === 0) {
      this.replayEnded = true;
      this.paused = true;
      this.flush(true);
    }
  }

  private submit(epoch: number, inputs: CombatInputs, heldInputs?: CombatInputs): void {
    if (this.paused || this.replayInputs || epoch !== this.epoch) return;
    inputs.forEach((action, rawIndex) => {
      if (supportedActions.has(action)) this.controls[rawIndex as 0 | 1].submit(action, heldInputs?.[rawIndex as 0 | 1]);
    });
  }

  private barrier(requestId: number, nextEpoch: number, pause: boolean): void {
    if (!this.state) throw new Error('Combat worker has not started.');
    if (nextEpoch <= this.epoch) throw new Error('Barrier epoch must increase monotonically.');
    // postMessage preserves order: every old-epoch frame reaches the client
    // before the acknowledgement switches the accepted epoch.
    this.flush();
    this.clearInputs();
    this.epoch = nextEpoch;
    this.paused = pause;
    this.accumulator = 0;
    this.lastPumpTime = null;
    this.emit({ type: 'barrier', requestId, epoch: this.epoch, paused: pause, state: this.state });
  }

  private advanceOne(): CombatFrame | null {
    if (!this.state) return null;
    let inputs: CombatInputs;
    if (this.replayInputs) {
      const recorded = this.replayInputs[this.replayCursor];
      if (!recorded) {
        this.replayEnded = true;
        this.paused = true;
        this.flush(true);
        return null;
      }
      inputs = [...recorded] as CombatInputs;
      this.replayCursor += 1;
    } else {
      inputs = [this.controls[0].next(), this.controls[1].next()];
    }

    this.state = stepMatch(this.state, inputs);
    const frame: CombatFrame = { state: this.state, inputs };
    this.pendingFrames.push(frame);
    this.simulatedTicks += 1;

    const terminal = this.state.phase === 'match-end';
    const replayFinished = Boolean(this.replayInputs && this.replayCursor >= this.replayInputs.length);
    const playbackEnded = replayFinished || Boolean(this.replayInputs && terminal);
    if (this.pendingFrames.length >= this.batchTicks || playbackEnded || terminal) {
      if (playbackEnded) this.replayEnded = true;
      this.flush(playbackEnded, terminal);
    }
    if (playbackEnded || terminal) {
      this.paused = true;
      this.clearInputs();
    }
    return frame;
  }

  private flush(replayEnded = this.replayEnded, terminal = this.state?.phase === 'match-end'): void {
    if (this.pendingFrames.length === 0 && !replayEnded) return;
    this.emittedBatches += 1;
    this.emit({
      type: 'frames',
      epoch: this.epoch,
      frames: this.pendingFrames,
      replayEnded,
      terminal: Boolean(terminal),
      stats: { simulatedTicks: this.simulatedTicks, emittedBatches: this.emittedBatches },
    });
    this.pendingFrames = [];
  }

  private clearInputs(): void {
    this.controls[0].clear();
    this.controls[1].clear();
  }
}

function installWorkerRuntime(): void {
  if (typeof WorkerGlobalScope === 'undefined' || !(globalThis instanceof WorkerGlobalScope)) return;
  const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
  const runtime = new CombatWorkerRuntime((message) => scope.postMessage(message));
  const interval = scope.setInterval(() => runtime.pump(performance.now()), 4);
  scope.addEventListener('message', (event: MessageEvent<CombatWorkerRequest>) => {
    runtime.handle(event.data);
    if (event.data.type === 'dispose') scope.clearInterval(interval);
  });
}

installWorkerRuntime();
