import { describe, expect, it, vi } from 'vitest';
import type { ActionId, MatchObservation } from '../packages/combat-core/src';
import type { CheckpointInfo, Controller, ControllerStatus, Decision, LoadProgress } from '../apps/web/src/ai/types';
import {
  LayaInferenceWorkerRuntime,
  type LayaWorkerRequest,
  type LayaWorkerResponse,
} from '../apps/web/src/ai/laya-worker';
import { LayaWorkerController } from '../apps/web/src/ai/laya-worker-client';

const checkpoint = (overrides: Partial<CheckpointInfo> = {}): CheckpointInfo => ({
  id: 'convaiinnovations/laya',
  revision: 'test-revision',
  runtime: 'onnxruntime-web',
  ready: false,
  detail: 'Not loaded.',
  ...overrides,
});

const observation: MatchObservation = {
  version: 1,
  tick: 100,
  round: 1,
  phase: 'fight',
  timer: 3_000,
  distanceMm: 800,
  history: ['light'],
  self: {
    health: 900, maxHealth: 1000, stamina: 80, maxStamina: 100, meter: 30, xMm: -400, yMm: 0, facing: 1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6_300, special: 'signature_executive_order',
  },
  opponent: {
    health: 850, maxHealth: 1000, stamina: 75, maxStamina: 100, meter: 20, xMm: 400, yMm: 0, facing: -1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6_300, special: 'signature_five_year_plan',
  },
};

class FakeWorker {
  readonly sent: LayaWorkerRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  postMessage(message: LayaWorkerRequest) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }
  receive(message: LayaWorkerResponse) {
    const event = { data: message } as MessageEvent<LayaWorkerResponse>;
    this.listeners.get('message')?.forEach((listener) => {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    });
  }
  fail(message = 'worker exploded') {
    const event = { message, preventDefault: vi.fn() } as unknown as ErrorEvent;
    this.listeners.get('error')?.forEach((listener) => {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    });
  }
}

function loadClient(worker = new FakeWorker()) {
  const controller = new LayaWorkerController({
    worker: worker as unknown as Worker,
    manifestUrl: './models/laya-320/manifest.json',
    baseUrl: 'https://example.test/WST/',
  });
  const progress: LoadProgress[] = [];
  const loaded = controller.load((item) => progress.push(item));
  const request = worker.sent[0];
  if (request?.type !== 'load') throw new Error('Expected load request.');
  return { controller, worker, progress, loaded, request };
}

describe('Laya worker client', () => {
  it('recreates a failed worker, rejects the old decision, and ignores its late reply', async () => {
    const workers: FakeWorker[] = [];
    const controller = new LayaWorkerController({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; },
      manifestUrl: './models/laya-320/manifest.json',
      baseUrl: 'https://example.test/WST/',
    });
    const first = workers[0];
    const loading = controller.load(() => undefined);
    const firstLoad = first.sent[0];
    if (firstLoad?.type !== 'load') throw new Error('Expected initial load request.');
    first.receive({ type: 'loaded', epoch: firstLoad.epoch, requestId: firstLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true, provider: 'webgpu' }) });
    await loading;

    const pending = controller.decide(observation, ['idle', 'light']);
    const firstDecision = first.sent.at(-1);
    if (firstDecision?.type !== 'decide') throw new Error('Expected initial decision request.');
    const recovery = controller.recover();
    await expect(pending).rejects.toThrow('Replacing the failed Laya inference worker.');
    expect(first.terminated).toBe(true);
    const second = workers[1];
    const secondLoad = second.sent[0];
    if (secondLoad?.type !== 'load') throw new Error('Expected replacement load request.');

    first.receive({ type: 'decision', epoch: firstDecision.epoch, requestId: firstDecision.requestId, decision: { action: 'light', latencyMs: 1, source: 'laya' }, status: 'ready', checkpoint: checkpoint({ ready: true }) });
    expect(controller.status).toBe('loading');
    second.receive({ type: 'loaded', epoch: secondLoad.epoch, requestId: secondLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true, provider: 'webgpu', detail: 'Recovered.' }) });
    await recovery;
    expect(controller.status).toBe('ready');
    expect(controller.checkpoint.detail).toBe('Recovered.');
  });

  it('can explicitly recover a production-style controller after app cleanup disposed it', async () => {
    const workers: FakeWorker[] = [];
    const controller = new LayaWorkerController({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; },
      manifestUrl: './models/laya-320/manifest.json',
      baseUrl: 'https://example.test/WST/',
    });
    const first = workers[0];
    const loading = controller.load(() => undefined);
    const firstLoad = first.sent[0];
    if (firstLoad?.type !== 'load') throw new Error('Expected initial load request.');
    first.receive({ type: 'loaded', epoch: firstLoad.epoch, requestId: firstLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true }) });
    await loading;

    controller.dispose();
    expect(controller.status).toBe('disposed');
    const recovery = controller.recover();
    const second = workers[1];
    const secondLoad = second.sent[0];
    if (secondLoad?.type !== 'load') throw new Error('Expected replacement load request.');
    second.receive({ type: 'loaded', epoch: secondLoad.epoch, requestId: secondLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true, detail: 'Recovered after cleanup.' }) });
    await recovery;
    expect(controller.status).toBe('ready');
    expect(controller.checkpoint.detail).toBe('Recovered after cleanup.');
  });

  it('lets terminal disposal win over a recovery already in progress', async () => {
    const workers: FakeWorker[] = [];
    const controller = new LayaWorkerController({
      workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; },
      manifestUrl: './models/laya-320/manifest.json',
      baseUrl: 'https://example.test/WST/',
    });
    const first = workers[0];
    const loading = controller.load(() => undefined);
    const firstLoad = first.sent[0];
    if (firstLoad?.type !== 'load') throw new Error('Expected initial load request.');
    first.receive({ type: 'loaded', epoch: firstLoad.epoch, requestId: firstLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true }) });
    await loading;

    const recovery = controller.recover();
    controller.dispose();
    await expect(recovery).rejects.toMatchObject({ code: 'disposed' });
    expect(controller.status).toBe('disposed');
    const replacement = workers[1];
    const replacementLoad = replacement.sent[0];
    if (replacementLoad?.type !== 'load') throw new Error('Expected replacement load request.');
    replacement.receive({ type: 'loaded', epoch: replacementLoad.epoch, requestId: replacementLoad.requestId, status: 'ready', checkpoint: checkpoint({ ready: true }) });
    expect(controller.status).toBe('disposed');
  });

  it('resolves the manifest on the main side and adopts actual worker checkpoint updates', async () => {
    const { controller, worker, progress, loaded, request } = loadClient();
    expect(request.options.manifestUrl).toBe('https://example.test/WST/models/laya-320/manifest.json');

    worker.receive({
      type: 'progress', epoch: request.epoch, requestId: request.requestId,
      progress: { progress: 0.5, stage: 'Loading', detail: 'Halfway.' },
      status: 'loading', checkpoint: checkpoint({ detail: 'Creating WebGPU.' }),
    });
    const ready = checkpoint({ ready: true, provider: 'webgpu', lastLatencyMs: 17, detail: 'Ready with WebGPU.' });
    worker.receive({ type: 'loaded', epoch: request.epoch, requestId: request.requestId, status: 'ready', checkpoint: ready });
    await loaded;

    expect(progress).toEqual([{ progress: 0.5, stage: 'Loading', detail: 'Halfway.' }]);
    expect(controller.status).toBe('ready');
    expect(controller.checkpoint).toEqual(ready);

    // Same-epoch progress arriving after completion cannot regress readiness.
    worker.receive({
      type: 'progress', epoch: request.epoch, requestId: request.requestId,
      progress: { progress: 0.2, stage: 'Late', detail: 'Ignore me.' },
      status: 'loading', checkpoint: checkpoint(),
    });
    expect(progress).toHaveLength(1);
    expect(controller.status).toBe('ready');
  });

  it('preserves the exact public observation/legal actions and permits only one decision in flight', async () => {
    const { controller, worker, loaded, request } = loadClient();
    const ready = checkpoint({ ready: true, provider: 'webgpu' });
    worker.receive({ type: 'loaded', epoch: request.epoch, requestId: request.requestId, status: 'ready', checkpoint: ready });
    await loaded;

    const pending = controller.decide(observation, ['idle', 'light', 'signature_executive_order']);
    await expect(controller.decide(observation, ['idle', 'advance'])).rejects.toMatchObject({ code: 'decision-in-flight' });
    const decisionRequest = worker.sent.at(-1);
    expect(decisionRequest).toMatchObject({
      type: 'decide',
      observation,
      legal: ['idle', 'light', 'signature_executive_order'],
    });
    if (decisionRequest?.type !== 'decide') throw new Error('Expected decision request.');
    const decision: Decision = { action: 'signature_executive_order', latencyMs: 21, source: 'laya', scores: { signature_executive_order: 0.8 } };
    const decidedCheckpoint = checkpoint({ ready: true, provider: 'webgpu', lastLatencyMs: 21 });
    worker.receive({
      type: 'decision', epoch: decisionRequest.epoch, requestId: decisionRequest.requestId,
      decision, status: 'ready', checkpoint: decidedCheckpoint,
    });

    await expect(pending).resolves.toEqual(decision);
    expect(controller.checkpoint).toEqual(decidedCheckpoint);
  });

  it('terminates on cancellation and ignores late progress/readiness', async () => {
    const worker = new FakeWorker();
    const controller = new LayaWorkerController({
      worker: worker as unknown as Worker,
      manifestUrl: 'https://cdn.example.test/laya/manifest.json',
    });
    const abort = new AbortController();
    const updates: LoadProgress[] = [];
    const pending = controller.load((item) => updates.push(item), abort.signal);
    const request = worker.sent[0];
    if (request?.type !== 'load') throw new Error('Expected load request.');
    abort.abort(new DOMException('Cancelled by test.', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
    expect(controller.status).toBe('error');
    expect(controller.checkpoint.ready).toBe(false);
    worker.receive({
      type: 'loaded', epoch: request.epoch, requestId: request.requestId,
      status: 'ready', checkpoint: checkpoint({ ready: true, provider: 'webgpu' }),
    });
    expect(controller.status).toBe('error');
    expect(updates).toEqual([]);
  });

  it('rejects pending work and terminates when the worker itself fails', async () => {
    const { controller, worker, loaded } = loadClient();
    worker.fail('WebGPU worker crashed');
    await expect(loaded).rejects.toThrow('WebGPU worker crashed');
    expect(worker.terminated).toBe(true);
    expect(controller.status).toBe('error');
    expect(controller.checkpoint.ready).toBe(false);
  });

  it('terminates and rejects pending loading when disposed', async () => {
    const { controller, worker, loaded } = loadClient();
    controller.dispose();
    await expect(loaded).rejects.toMatchObject({ code: 'disposed' });
    expect(worker.terminated).toBe(true);
    expect(controller.status).toBe('disposed');
    expect(controller.checkpoint.ready).toBe(false);
  });

  it('ignores response epochs from an earlier worker session', async () => {
    const { controller, worker, progress, loaded, request } = loadClient();
    worker.receive({
      type: 'progress', epoch: request.epoch - 1, requestId: request.requestId,
      progress: { progress: 0.9, stage: 'Stale', detail: 'Wrong epoch.' },
      status: 'loading', checkpoint: checkpoint(),
    });
    expect(progress).toEqual([]);
    worker.receive({
      type: 'loaded', epoch: request.epoch, requestId: request.requestId,
      status: 'ready', checkpoint: checkpoint({ ready: true, provider: 'webgpu' }),
    });
    await loaded;
    expect(controller.status).toBe('ready');
  });
});

class FakeUnderlyingController implements Controller {
  readonly source = 'laya' as const;
  status: ControllerStatus = 'idle';
  checkpoint = checkpoint();
  decideResult: Decision = { action: 'light', latencyMs: 9, source: 'laya' };

  async load(onProgress: (progress: LoadProgress) => void): Promise<void> {
    this.status = 'loading';
    onProgress({ progress: 0.4, stage: 'Loading', detail: 'Worker progress.' });
    this.status = 'ready';
    this.checkpoint = checkpoint({ ready: true, provider: 'webgpu', detail: 'Worker ready.' });
  }
  async decide(_observation: unknown, _legal: ActionId[]): Promise<Decision> {
    this.checkpoint = { ...this.checkpoint, lastLatencyMs: this.decideResult.latencyMs };
    return this.decideResult;
  }
  dispose(): void { this.status = 'disposed'; }
}

describe('Laya inference worker runtime', () => {
  it('constructs the existing controller with the verified worker WebGPU route', async () => {
    const emitted: LayaWorkerResponse[] = [];
    let constructed: Record<string, unknown> | undefined;
    const underlying = new FakeUnderlyingController();
    const runtime = new LayaInferenceWorkerRuntime(
      (message) => emitted.push(message),
      (options) => { constructed = options as unknown as Record<string, unknown>; return underlying; },
    );
    await runtime.handle({
      type: 'load', epoch: 4, requestId: 7,
      options: { manifestUrl: 'https://example.test/WST/models/laya-320/manifest.json', warmupTimeoutMs: 30_000 },
    });

    expect(constructed).toMatchObject({
      manifestUrl: 'https://example.test/WST/models/laya-320/manifest.json',
      warmupTimeoutMs: 30_000,
      executionProvider: 'webgpu',
      wasmProxy: false,
      allowWasmFallback: false,
    });
    expect(emitted.map((message) => message.type)).toEqual(['progress', 'loaded']);
    expect(emitted.at(-1)).toMatchObject({ status: 'ready', checkpoint: { provider: 'webgpu', ready: true } });
  });
});
