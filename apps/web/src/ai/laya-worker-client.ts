import {
  DEFAULT_LAYA_MANIFEST_URL,
  LayaBrowserError,
  PINNED_LAYA_CHECKPOINT,
  type LayaBrowserErrorCode,
} from './laya-browser';
import type {
  ActionId,
  CheckpointInfo,
  Controller,
  ControllerStatus,
  Decision,
  LoadProgress,
} from './types';
import type { LayaWorkerRequest, LayaWorkerResponse } from './laya-worker';

export interface LayaWorkerControllerOptions {
  manifestUrl?: string;
  warmupTimeoutMs?: number;
  /** Test seam. Production creates a dedicated module worker. */
  worker?: Worker;
  /** Explicit base used only when document.baseURI is unavailable or unsuitable. */
  baseUrl?: string;
  /** Test seam for proving worker replacement without constructing a browser worker. */
  workerFactory?: () => Worker;
}

interface PendingLoad {
  epoch: number;
  requestId: number;
  onProgress: (progress: LoadProgress) => void;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  removeAbort: () => void;
}

interface PendingDecision {
  epoch: number;
  requestId: number;
  resolve: (decision: Decision) => void;
  reject: (error: unknown) => void;
}

export function resolveLayaManifestUrl(manifestUrl = DEFAULT_LAYA_MANIFEST_URL, baseUrl?: string): string {
  const base = baseUrl
    ?? (typeof document !== 'undefined' ? document.baseURI : undefined)
    ?? (typeof location !== 'undefined' ? location.href : undefined)
    ?? import.meta.url;
  return new URL(manifestUrl, base).href;
}

/** Main-thread Controller facade for a dedicated Laya model/inference worker. */
export class LayaWorkerController implements Controller {
  readonly source = 'laya' as const;
  status: ControllerStatus = 'idle';
  checkpoint: CheckpointInfo = {
    id: PINNED_LAYA_CHECKPOINT.repository,
    revision: PINNED_LAYA_CHECKPOINT.revision,
    runtime: 'onnxruntime-web',
    ready: false,
    detail: 'Dedicated Laya inference worker has not loaded.',
  };

  private worker: Worker | null;
  private readonly canRecreateWorker: boolean;
  private readonly manifestUrl: string;
  private readonly warmupTimeoutMs?: number;
  private readonly workerFactory?: () => Worker;
  private epoch = 0;
  private requestId = 0;
  private activeLoad: PendingLoad | null = null;
  private activeDecision: PendingDecision | null = null;

  constructor(options: LayaWorkerControllerOptions = {}) {
    this.manifestUrl = resolveLayaManifestUrl(options.manifestUrl, options.baseUrl);
    this.warmupTimeoutMs = options.warmupTimeoutMs;
    this.workerFactory = options.workerFactory;
    this.canRecreateWorker = options.worker === undefined;
    this.worker = options.worker ?? this.createWorker();
    this.attachWorker(this.worker);
  }

  load(onProgress: (progress: LoadProgress) => void, signal?: AbortSignal): Promise<void> {
    if (this.status === 'disposed') {
      return Promise.reject(new LayaBrowserError('disposed', 'The Laya worker controller has been disposed.'));
    }
    if (this.status === 'ready') {
      onProgress({ progress: 1, stage: 'Ready', detail: this.checkpoint.detail });
      return Promise.resolve();
    }
    if (this.activeLoad) return this.activeLoad.promise;
    if (signal?.aborted) {
      const error = signal.reason ?? new DOMException('Laya loading was cancelled.', 'AbortError');
      this.failWorker(error, 'error');
      return Promise.reject(error);
    }

    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }
    const epoch = ++this.epoch;
    const requestId = ++this.requestId;
    this.status = 'loading';
    this.checkpoint = { ...this.checkpoint, ready: false, detail: 'Loading Laya in a dedicated WebGPU worker.' };

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
    const onAbort = () => this.failWorker(
      signal?.reason ?? new DOMException('Laya loading was cancelled.', 'AbortError'),
      'error',
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    this.activeLoad = {
      epoch,
      requestId,
      onProgress,
      promise,
      resolve,
      reject,
      removeAbort: () => signal?.removeEventListener('abort', onAbort),
    };
    try {
      worker.postMessage({
        type: 'load',
        epoch,
        requestId,
        options: { manifestUrl: this.manifestUrl, warmupTimeoutMs: this.warmupTimeoutMs },
      } satisfies LayaWorkerRequest);
    } catch (error) {
      this.failWorker(error, 'error');
    }
    return promise;
  }

  decide(observation: unknown, legal: ActionId[]): Promise<Decision> {
    if (this.status === 'disposed') {
      return Promise.reject(new LayaBrowserError('disposed', 'The Laya worker controller has been disposed.'));
    }
    if (this.status !== 'ready' || !this.worker || !this.checkpoint.ready) {
      return Promise.reject(new LayaBrowserError('not-ready', 'Laya has not completed loading; no action was selected.'));
    }
    if (this.activeDecision) {
      return Promise.reject(new LayaBrowserError(
        'decision-in-flight',
        'A prior Laya decision is still running; this request was not queued.',
      ));
    }
    const epoch = this.epoch;
    const requestId = ++this.requestId;
    let resolve!: (decision: Decision) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Decision>((accept, fail) => { resolve = accept; reject = fail; });
    this.activeDecision = { epoch, requestId, resolve, reject };
    try {
      this.worker.postMessage({ type: 'decide', epoch, requestId, observation, legal: [...legal] } satisfies LayaWorkerRequest);
    } catch (error) {
      const decision = this.activeDecision;
      this.activeDecision = null;
      decision?.reject(error);
    }
    return promise;
  }

  /**
   * Recreate the dedicated worker and reload the same verified manifest. The
   * epoch is advanced before teardown, so every late message from the old
   * worker is ignored even if termination races with a response callback.
   */
  recover(onProgress: (progress: LoadProgress) => void = () => undefined): Promise<void> {
    // App-level cleanup can dispose the controller during a Fast Refresh while
    // the mounted match is still alive. A production controller owns no
    // caller-supplied worker, so an explicit recovery can recreate it. A
    // caller-supplied worker remains terminal because we cannot safely replace
    // that resource behind its owner's back.
    if (this.status === 'disposed' && !this.canRecreateWorker) {
      return Promise.reject(new LayaBrowserError('disposed', 'The Laya worker controller has been disposed.'));
    }
    if (!this.canRecreateWorker) {
      return Promise.reject(new LayaBrowserError('runtime-failed', 'This injected Laya worker cannot be recreated.'));
    }
    const error = new LayaBrowserError('runtime-failed', 'Replacing the failed Laya inference worker.');
    this.epoch += 1;
    this.rejectPending(error);
    this.detachAndTerminateWorker();
    this.status = 'idle';
    this.checkpoint = {
      ...this.checkpoint,
      ready: false,
      detail: 'Recreating the Laya worker and warming the cached model graph.',
    };
    return this.load(onProgress);
  }

  dispose(): void {
    if (this.status === 'disposed') return;
    const error = new LayaBrowserError('disposed', 'The Laya worker controller has been disposed.');
    const worker = this.worker;
    this.epoch += 1;
    try {
      worker?.postMessage({ type: 'dispose', epoch: this.epoch } satisfies LayaWorkerRequest);
    } catch {
      // Termination below is authoritative even when posting the courtesy disposal fails.
    }
    this.rejectPending(error);
    this.detachAndTerminateWorker();
    this.status = 'disposed';
    this.checkpoint = { ...this.checkpoint, ready: false, detail: 'Laya inference worker disposed.' };
  }

  private readonly handleMessage = (event: MessageEvent<LayaWorkerResponse>): void => {
    const message = event.data;
    if (message.epoch !== this.epoch || this.status === 'disposed') return;
    if (message.type === 'progress') {
      const load = this.activeLoad;
      if (!load || load.requestId !== message.requestId || load.epoch !== message.epoch) return;
      this.status = message.status;
      this.checkpoint = message.checkpoint;
      load.onProgress(message.progress);
      return;
    }
    if (message.type === 'loaded') {
      const load = this.activeLoad;
      if (!load || load.requestId !== message.requestId || load.epoch !== message.epoch) return;
      load.removeAbort();
      this.activeLoad = null;
      this.status = message.status;
      this.checkpoint = message.checkpoint;
      load.resolve();
      return;
    }
    if (message.type === 'decision') {
      const decision = this.activeDecision;
      if (!decision || decision.requestId !== message.requestId || decision.epoch !== message.epoch) return;
      this.activeDecision = null;
      this.status = message.status;
      this.checkpoint = message.checkpoint;
      decision.resolve(message.decision);
      return;
    }

    const error = workerResponseError(message);
    const load = this.activeLoad;
    if (load?.requestId === message.requestId && load.epoch === message.epoch) {
      load.removeAbort();
      this.activeLoad = null;
      this.status = message.status;
      this.checkpoint = message.checkpoint;
      load.reject(error);
      return;
    }
    const decision = this.activeDecision;
    if (decision?.requestId === message.requestId && decision.epoch === message.epoch) {
      this.activeDecision = null;
      this.status = message.status;
      this.checkpoint = message.checkpoint;
      decision.reject(error);
    }
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.failWorker(new Error(event.message || 'Laya inference worker failed.'), 'error');
  };

  private createWorker(): Worker {
    return this.workerFactory?.() ?? new Worker(new URL('./laya-worker.ts', import.meta.url), { type: 'module', name: 'wst-laya-inference' });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.canRecreateWorker) {
      throw new LayaBrowserError('runtime-failed', 'The injected Laya worker was terminated and cannot be reused.');
    }
    this.worker = this.createWorker();
    this.attachWorker(this.worker);
    return this.worker;
  }

  private attachWorker(worker: Worker): void {
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', this.handleWorkerError);
  }

  private detachAndTerminateWorker(): void {
    const worker = this.worker;
    if (!worker) return;
    worker.removeEventListener('message', this.handleMessage);
    worker.removeEventListener('error', this.handleWorkerError);
    worker.terminate();
    this.worker = null;
  }

  private failWorker(error: unknown, status: 'error' | 'disposed'): void {
    this.epoch += 1;
    this.rejectPending(error);
    this.detachAndTerminateWorker();
    this.status = status;
    this.checkpoint = {
      ...this.checkpoint,
      ready: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  private rejectPending(error: unknown): void {
    const load = this.activeLoad;
    this.activeLoad = null;
    load?.removeAbort();
    load?.reject(error);
    const decision = this.activeDecision;
    this.activeDecision = null;
    decision?.reject(error);
  }
}

function workerResponseError(message: Extract<LayaWorkerResponse, { type: 'error' }>): Error {
  const knownCodes = new Set<LayaBrowserErrorCode>([
    'no-browser-artifact', 'incompatible-artifact', 'download-failed', 'integrity-failed',
    'runtime-failed', 'not-ready', 'decision-in-flight', 'disposed',
  ]);
  return message.code && knownCodes.has(message.code as LayaBrowserErrorCode)
    ? new LayaBrowserError(message.code as LayaBrowserErrorCode, message.message)
    : new Error(message.message);
}

export const createLayaWorkerController = (options?: LayaWorkerControllerOptions): LayaWorkerController =>
  new LayaWorkerController(options);
