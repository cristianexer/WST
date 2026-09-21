import { describe, expect, it } from 'vitest';
import { READY_TICKS, createMatch, stepMatch, type ActionId } from '../packages/combat-core/src';
import {
  CombatWorkerRuntime,
  type CombatWorkerResponse,
  type CombatWorkerStartOptions,
} from '../apps/web/src/game/combat-worker';
import { CombatWorkerClient } from '../apps/web/src/game/combat-worker-client';

const startOptions = (overrides: Partial<CombatWorkerStartOptions> = {}): CombatWorkerStartOptions => ({
  epoch: 1,
  seed: 17,
  snapshotBatchTicks: 2,
  ...overrides,
});

function runtime(options: Partial<CombatWorkerStartOptions> = {}) {
  const messages: CombatWorkerResponse[] = [];
  const result = new CombatWorkerRuntime((message) => messages.push(message));
  result.handle({ type: 'start', requestId: 1, options: startOptions(options) });
  return { runtime: result, messages };
}

describe('combat worker runtime', () => {
  it('applies both fighters inputs on the same deterministic simulation tick', () => {
    const { runtime: simulation } = runtime();
    simulation.advanceTicks(READY_TICKS);
    const before = simulation.currentState!;

    simulation.handle({ type: 'submit', epoch: 1, inputs: ['advance', 'advance'] });
    const frames = simulation.advanceTicks(2);
    const frame = frames.at(-1)!;

    expect(frame.inputs).toEqual(['advance', 'advance']);
    expect(frame.state.fighters[0].x).toBeGreaterThan(before.fighters[0].x);
    expect(frame.state.fighters[1].x).toBeLessThan(before.fighters[1].x);
  });

  it('holds movement independently and lets the core buffer resume it after an attack', () => {
    const { runtime: simulation } = runtime();
    simulation.advanceTicks(READY_TICKS);
    simulation.handle({ type: 'submit', epoch: 1, inputs: ['light', 'idle'] });
    simulation.advanceTicks(1);
    const attackX = simulation.currentState!.fighters[0].x;

    simulation.handle({ type: 'submit', epoch: 1, inputs: ['advance', 'idle'] });
    simulation.advanceTicks(30);

    expect(simulation.currentState!.fighters[0].x).toBeGreaterThan(attackX);
  });

  it('preserves exact replay inputs and reports replay completion', () => {
    const replayInputs: [ActionId, ActionId][] = Array.from({ length: READY_TICKS + 4 }, (_, tick) => (
      tick >= READY_TICKS ? ['advance', 'retreat'] : ['idle', 'idle']
    ));
    const { runtime: simulation, messages } = runtime({ replayInputs, snapshotBatchTicks: 3 });
    simulation.advanceTicks(replayInputs.length + 5);

    let expected = createMatch({ seed: 17 });
    replayInputs.forEach((inputs) => { expected = stepMatch(expected, inputs); });
    expect(simulation.currentState).toEqual(expected);
    expect(messages.some((message) => message.type === 'frames' && message.replayEnded)).toBe(true);
  });

  it('uses pause/resume as ordered barriers and rejects stale commands', () => {
    const { runtime: simulation, messages } = runtime({ snapshotBatchTicks: 8 });
    simulation.advanceTicks(READY_TICKS + 1);
    const beforePause = simulation.currentState!;

    simulation.handle({ type: 'pause', requestId: 2, epoch: 2 });
    expect(messages.at(-1)).toMatchObject({ type: 'barrier', requestId: 2, epoch: 2, paused: true });
    expect(messages.at(-2)).toMatchObject({ type: 'frames', epoch: 1 });
    expect(simulation.advanceTicks(4)).toEqual([]);

    simulation.handle({ type: 'submit', epoch: 1, inputs: ['advance', 'advance'] });
    simulation.handle({ type: 'resume', requestId: 3, epoch: 3 });
    simulation.advanceTicks(1);
    expect(simulation.currentState!.fighters[0].x).toBe(beforePause.fighters[0].x);
  });

  it('produces identical state and ordered frame batches for the same seed and commands', () => {
    const a = runtime({ snapshotBatchTicks: 4 });
    const b = runtime({ snapshotBatchTicks: 4 });
    for (const item of [a.runtime, b.runtime]) {
      item.advanceTicks(READY_TICKS);
      item.handle({ type: 'submit', epoch: 1, inputs: ['light', 'heavy'] });
      item.advanceTicks(18);
      item.handle({ type: 'submit', epoch: 1, inputs: ['advance', 'guard_high'] });
      item.advanceTicks(20);
    }
    expect(a.runtime.currentState).toEqual(b.runtime.currentState);
    expect(a.messages).toEqual(b.messages);
  });
});

class FakeWorker {
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  postMessage(message: unknown) { this.sent.push(message); }
  terminate() {}
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }
  receive(message: CombatWorkerResponse) {
    const event = { data: message } as MessageEvent<CombatWorkerResponse>;
    this.listeners.get('message')?.forEach((listener) => {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    });
  }
}

describe('combat worker client barriers', () => {
  it('delivers pre-pause frames before switching epochs and drops frames after the barrier', async () => {
    const worker = new FakeWorker();
    const batches: number[][] = [];
    const client = new CombatWorkerClient({
      worker: worker as unknown as Worker,
      onFrames: (batch) => batches.push(batch.frames.map((frame) => frame.state.tick)),
    });
    const initial = createMatch({ seed: 4 });
    const started = client.start({ seed: 4 });
    worker.receive({ type: 'ready', requestId: 1, epoch: 1, state: initial });
    await started;

    const paused = client.pause();
    const frameState = stepMatch(initial, ['idle', 'idle']);
    const stats = { simulatedTicks: 1, emittedBatches: 1 };
    worker.receive({
      type: 'frames',
      epoch: 1,
      frames: [{ state: frameState, inputs: ['idle', 'idle'] }],
      replayEnded: false,
      terminal: false,
      stats,
    });
    worker.receive({ type: 'barrier', requestId: 2, epoch: 2, paused: true, state: frameState });
    await paused;
    worker.receive({
      type: 'frames',
      epoch: 1,
      frames: [{ state: frameState, inputs: ['idle', 'idle'] }],
      replayEnded: false,
      terminal: false,
      stats,
    });

    expect(batches).toEqual([[1]]);
    expect(client.latestState?.tick).toBe(1);
    client.dispose();
  });
});
