import {
  BrowserController,
  LayaBrowserError,
  type LayaBrowserControllerOptions,
} from './laya-browser';
import type {
  ActionId,
  CheckpointInfo,
  Controller,
  ControllerStatus,
  Decision,
  LoadProgress,
} from './types';

export interface LayaWorkerLoadOptions {
  /** Resolved against document.baseURI on the main thread before transfer. */
  manifestUrl: string;
  warmupTimeoutMs?: number;
}

export type LayaWorkerRequest =
  | { type: 'load'; epoch: number; requestId: number; options: LayaWorkerLoadOptions }
  | { type: 'decide'; epoch: number; requestId: number; observation: unknown; legal: ActionId[] }
  | { type: 'dispose'; epoch: number };

interface WorkerState {
  status: ControllerStatus;
  checkpoint: CheckpointInfo;
}

export type LayaWorkerResponse =
  | ({ type: 'progress'; epoch: number; requestId: number; progress: LoadProgress } & WorkerState)
  | ({ type: 'loaded'; epoch: number; requestId: number } & WorkerState)
  | ({ type: 'decision'; epoch: number; requestId: number; decision: Decision } & WorkerState)
  | ({ type: 'error'; epoch: number; requestId: number; message: string; code?: string } & WorkerState);

type ControllerFactory = (options: LayaBrowserControllerOptions) => Controller;

const defaultFactory: ControllerFactory = (options) => new BrowserController(options);

/** Worker-side protocol adapter around the already validated browser controller. */
export class LayaInferenceWorkerRuntime {
  private readonly emit: (message: LayaWorkerResponse) => void;
  private readonly createController: ControllerFactory;
  private controller: Controller | null = null;
  private epoch = 0;
  private decisionPending = false;

  constructor(emit: (message: LayaWorkerResponse) => void, createController: ControllerFactory = defaultFactory) {
    this.emit = emit;
    this.createController = createController;
  }

  async handle(message: LayaWorkerRequest): Promise<void> {
    if (message.type === 'dispose') {
      if (message.epoch < this.epoch) return;
      this.epoch = message.epoch;
      this.controller?.dispose();
      this.controller = null;
      this.decisionPending = false;
      return;
    }
    if (message.type === 'load') {
      await this.load(message);
      return;
    }
    await this.decide(message);
  }

  private async load(message: Extract<LayaWorkerRequest, { type: 'load' }>): Promise<void> {
    if (message.epoch < this.epoch) return;
    this.controller?.dispose();
    this.epoch = message.epoch;
    this.decisionPending = false;
    const controller = this.createController({
      manifestUrl: message.options.manifestUrl,
      warmupTimeoutMs: message.options.warmupTimeoutMs,
      executionProvider: 'webgpu',
      wasmProxy: false,
      allowWasmFallback: false,
    });
    this.controller = controller;
    try {
      await controller.load((progress) => {
        if (!this.isCurrent(message.epoch, controller)) return;
        this.emit({
          type: 'progress',
          epoch: message.epoch,
          requestId: message.requestId,
          progress,
          status: controller.status,
          checkpoint: controller.checkpoint,
        });
      });
      if (!this.isCurrent(message.epoch, controller)) return;
      this.emit({
        type: 'loaded',
        epoch: message.epoch,
        requestId: message.requestId,
        status: controller.status,
        checkpoint: controller.checkpoint,
      });
    } catch (error) {
      if (!this.isCurrent(message.epoch, controller)) return;
      this.emitError(message.requestId, error, controller);
    }
  }

  private async decide(message: Extract<LayaWorkerRequest, { type: 'decide' }>): Promise<void> {
    if (message.epoch !== this.epoch) return;
    const controller = this.controller;
    if (!controller) return;
    if (this.decisionPending) {
      this.emitError(
        message.requestId,
        new LayaBrowserError('decision-in-flight', 'A prior Laya decision is still running; this request was not queued.'),
        controller,
      );
      return;
    }
    this.decisionPending = true;
    try {
      const decision = await controller.decide(message.observation, message.legal);
      if (!this.isCurrent(message.epoch, controller)) return;
      this.emit({
        type: 'decision',
        epoch: message.epoch,
        requestId: message.requestId,
        decision,
        status: controller.status,
        checkpoint: controller.checkpoint,
      });
    } catch (error) {
      if (!this.isCurrent(message.epoch, controller)) return;
      this.emitError(message.requestId, error, controller);
    } finally {
      if (this.isCurrent(message.epoch, controller)) this.decisionPending = false;
    }
  }

  private emitError(requestId: number, error: unknown, controller: Controller): void {
    this.emit({
      type: 'error',
      epoch: this.epoch,
      requestId,
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof LayaBrowserError ? error.code : undefined,
      status: controller.status,
      checkpoint: controller.checkpoint,
    });
  }

  private isCurrent(epoch: number, controller: Controller): boolean {
    return epoch === this.epoch && controller === this.controller;
  }
}

function installWorkerRuntime(): void {
  if (typeof WorkerGlobalScope === 'undefined' || !(globalThis instanceof WorkerGlobalScope)) return;
  const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
  const runtime = new LayaInferenceWorkerRuntime((message) => scope.postMessage(message));
  scope.addEventListener('message', (event: MessageEvent<LayaWorkerRequest>) => {
    void runtime.handle(event.data);
  });
}

installWorkerRuntime();
