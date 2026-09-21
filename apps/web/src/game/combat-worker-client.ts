import type { MatchState } from '../../../../packages/combat-core/src';
import type {
  CombatInputs,
  CombatWorkerRequest,
  CombatWorkerResponse,
  CombatWorkerStartOptions,
} from './combat-worker';

export type CombatClientStartOptions = Omit<CombatWorkerStartOptions, 'epoch'>;
export type CombatFrameBatch = Extract<CombatWorkerResponse, { type: 'frames' }>;

export interface CombatWorkerClientOptions {
  onFrames: (batch: CombatFrameBatch) => void;
  onError?: (error: Error) => void;
  /** Test seam; production creates the module worker automatically. */
  worker?: Worker;
}

interface PendingRequest {
  epoch: number;
  resolve: (value: MatchState) => void;
  reject: (reason: Error) => void;
}

/** Main-thread facade. One worker owns both fighters and resolves each tick atomically. */
export class CombatWorkerClient {
  private readonly worker: Worker;
  private readonly onFrames: CombatWorkerClientOptions['onFrames'];
  private readonly onError?: CombatWorkerClientOptions['onError'];
  private readonly pending = new Map<number, PendingRequest>();
  private requestId = 0;
  private nextEpoch = 0;
  private activeEpoch = 0;
  private transitioning = false;
  private disposed = false;
  private paused = true;
  latestState: MatchState | null = null;

  constructor(options: CombatWorkerClientOptions) {
    this.worker = options.worker ?? new Worker(new URL('./combat-worker.ts', import.meta.url), { type: 'module' });
    this.onFrames = options.onFrames;
    this.onError = options.onError;
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleWorkerError);
  }

  start(options: CombatClientStartOptions = {}): Promise<MatchState> {
    return this.begin('start', options);
  }

  reset(options: CombatClientStartOptions = {}): Promise<MatchState> {
    return this.begin('reset', options);
  }

  /** Held actions replace the fighter's held command; taps queue for the next fixed tick. */
  submit(inputs: CombatInputs, heldInputs?: CombatInputs): void {
    if (this.disposed || this.paused || this.transitioning || this.activeEpoch === 0) return;
    this.post({ type: 'submit', epoch: this.activeEpoch, inputs, heldInputs });
  }

  /** Flushes all prior frames, clears pending input, then acknowledges the pause epoch. */
  pause(): Promise<MatchState> {
    if (this.paused && !this.transitioning && this.latestState) return Promise.resolve(this.latestState);
    return this.requestBarrier('pause');
  }

  /** Clears pending input again and starts a fresh clock only after acknowledgement. */
  resume(): Promise<MatchState> {
    if (!this.paused && !this.transitioning && this.latestState) return Promise.resolve(this.latestState);
    return this.requestBarrier('resume');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.post({ type: 'dispose' });
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleWorkerError);
    this.worker.terminate();
    const error = new Error('Combat worker client disposed.');
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }

  private begin(type: 'start' | 'reset', options: CombatClientStartOptions): Promise<MatchState> {
    if (this.disposed) return Promise.reject(new Error('Combat worker client disposed.'));
    if (this.transitioning) return Promise.reject(new Error('A combat worker transition is already pending.'));
    const epoch = ++this.nextEpoch;
    const requestId = ++this.requestId;
    this.transitioning = true;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { epoch, resolve, reject });
      this.post({ type, requestId, options: { ...options, epoch } });
    });
  }

  private requestBarrier(type: 'pause' | 'resume'): Promise<MatchState> {
    if (this.disposed) return Promise.reject(new Error('Combat worker client disposed.'));
    if (this.activeEpoch === 0) return Promise.reject(new Error('Combat worker has not started.'));
    if (this.transitioning) return Promise.reject(new Error('A combat worker transition is already pending.'));
    const epoch = ++this.nextEpoch;
    const requestId = ++this.requestId;
    this.transitioning = true;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { epoch, resolve, reject });
      this.post({ type, requestId, epoch });
    });
  }

  private readonly handleMessage = (event: MessageEvent<CombatWorkerResponse>): void => {
    const message = event.data;
    if (message.type === 'frames') {
      // The active epoch changes only on an ordered ready/barrier acknowledgement,
      // so pre-pause batches are never dropped while the barrier is in flight.
      if (message.epoch !== this.activeEpoch) return;
      const latest = message.frames.at(-1)?.state;
      if (latest) this.latestState = latest;
      this.onFrames(message);
      return;
    }
    if (message.type === 'error') {
      const error = new Error(message.message);
      if (message.requestId !== undefined) {
        this.pending.get(message.requestId)?.reject(error);
        this.pending.delete(message.requestId);
        this.transitioning = false;
      }
      this.onError?.(error);
      return;
    }

    const request = this.pending.get(message.requestId);
    if (!request || request.epoch !== message.epoch) return;
    this.pending.delete(message.requestId);
    this.activeEpoch = message.epoch;
    this.latestState = message.state;
    this.paused = message.type === 'barrier' ? message.paused : false;
    this.transitioning = false;
    request.resolve(message.state);
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(event.message || 'Combat worker failed.');
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.transitioning = false;
    this.onError?.(error);
  };

  private post(message: CombatWorkerRequest): void {
    this.worker.postMessage(message);
  }
}
