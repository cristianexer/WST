import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signatureProfiles } from '../packages/combat-core/src';
import { GameAudio } from '../apps/web/src/audio';
import { ArenaEffects } from '../apps/web/src/game/effects';

class FakeParam {
  value: number;
  readonly history: number[] = [];
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value: number): void { this.value = value; this.history.push(value); }
  exponentialRampToValueAtTime(value: number): void { this.value = value; this.history.push(value); }
  setTargetAtTime(value: number): void { this.value = value; this.history.push(value); }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  connect<T extends FakeNode>(destination: T): T { this.connections.push(destination); return destination; }
  disconnect(): void { this.connections.length = 0; }
  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type: string): void { this.listeners.get(type)?.forEach(listener => listener()); }
}

class FakeScheduledSource extends FakeNode {
  readonly kind: string;
  startTime: number | undefined;
  stopTime: number | undefined;
  constructor(kind: string) { super(); this.kind = kind; }
  start(time: number): void { this.startTime = time; }
  stop(time?: number): void { this.stopTime = time; }
  descriptor(): string { return `${this.kind}:${this.startTime ?? 0}:${this.stopTime ?? 0}`; }
}

class FakeBufferSource extends FakeScheduledSource {
  buffer: FakeAudioBuffer | null = null;
  readonly playbackRate = new FakeParam(1);
  constructor() { super('noise'); }
  override descriptor(): string { return `${super.descriptor()}:${this.playbackRate.value}`; }
}

class FakeOscillator extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  constructor() { super('tone'); }
  override descriptor(): string { return `${super.descriptor()}:${this.type}:${this.frequency.history.join(',')}:${this.detune.value}`; }
}

class FakeAudioBuffer {
  readonly duration = 1.05;
  constructor(readonly length: number) {}
  getChannelData(): Float32Array { return new Float32Array(this.length); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  readonly destination = new FakeNode();
  readonly sampleRate = 48_000;
  readonly createdSources: FakeScheduledSource[] = [];
  readonly capture = { stream: { kind: 'capture' } };
  captureNode!: FakeNode & { stream: { kind: string } };
  state: AudioContextState = 'suspended';
  compressor!: FakeNode & { threshold: FakeParam; knee: FakeParam; ratio: FakeParam; attack: FakeParam; release: FakeParam };
  master!: FakeNode;
  constructor() { FakeAudioContext.instances.push(this); }
  get currentTime(): number { return 0; }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
  createGain(): FakeNode & { gain: FakeParam } {
    const node = Object.assign(new FakeNode(), { gain: new FakeParam(1) });
    if (!this.master) this.master = node;
    return node;
  }
  createDynamicsCompressor(): FakeNode & { threshold: FakeParam; knee: FakeParam; ratio: FakeParam; attack: FakeParam; release: FakeParam } {
    this.compressor = Object.assign(new FakeNode(), {
      threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(),
    });
    return this.compressor;
  }
  createMediaStreamDestination(): FakeNode & { stream: { kind: string } } {
    this.captureNode = Object.assign(new FakeNode(), this.capture);
    return this.captureNode;
  }
  createBuffer(_channels: number, length: number): FakeAudioBuffer { return new FakeAudioBuffer(length); }
  decodeAudioData(_data: ArrayBuffer): Promise<FakeAudioBuffer> { return Promise.resolve(new FakeAudioBuffer(24_000)); }
  createBufferSource(): FakeBufferSource { const source = new FakeBufferSource(); this.createdSources.push(source); return source; }
  createOscillator(): FakeOscillator { const source = new FakeOscillator(); this.createdSources.push(source); return source; }
  createBiquadFilter(): FakeNode & { type: BiquadFilterType; frequency: FakeParam; Q: FakeParam } {
    return Object.assign(new FakeNode(), { type: 'bandpass' as BiquadFilterType, frequency: new FakeParam(), Q: new FakeParam() });
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } { return Object.assign(new FakeNode(), { pan: new FakeParam() }); }
}

const globalScope = globalThis as typeof globalThis & { window?: Window; MediaStream?: typeof MediaStream };
let previousWindow: Window | undefined;
let previousMediaStream: typeof MediaStream | undefined;
let previousFetch: typeof fetch | undefined;

beforeEach(() => {
  vi.stubGlobal('document', { baseURI: 'https://example.com/WST/' });
  vi.stubEnv('BASE_URL', './');
  previousWindow = globalScope.window;
  previousMediaStream = globalScope.MediaStream;
  previousFetch = globalScope.fetch;
  globalScope.window = { AudioContext: FakeAudioContext } as unknown as Window & typeof globalThis;
  globalScope.MediaStream = class FakeMediaStream {} as typeof MediaStream;
  globalScope.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
  FakeAudioContext.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (previousWindow) globalScope.window = previousWindow as Window & typeof globalThis;
  else Reflect.deleteProperty(globalScope, 'window');
  if (previousMediaStream) globalScope.MediaStream = previousMediaStream;
  else Reflect.deleteProperty(globalScope, 'MediaStream');
  if (previousFetch) globalScope.fetch = previousFetch;
  else Reflect.deleteProperty(globalScope, 'fetch');
});

const characterIds = Object.keys(signatureProfiles);

describe('GameAudio', () => {
  it('keeps the user-gesture gate, prewarms one noise bed, and exposes the post-limiter capture bus', async () => {
    const audio = new GameAudio();
    audio.playSignature('trump');
    expect(FakeAudioContext.instances).toHaveLength(0);

    await audio.unlock();
    const context = FakeAudioContext.instances[0];
    const capture = audio.getCaptureStream();
    expect(capture).toBe(context.capture.stream);
    expect(context.compressor.threshold.value).toBe(-9);
    expect(context.compressor.ratio.value).toBe(12);
    expect(context.compressor.connections).toContain(context.master);
    expect(context.master.connections).toContain(context.captureNode);
    audio.playSignature('trump');
    expect(context.createdSources.length).toBeGreaterThan(0);
    audio.dispose();
  });

  it('decodes local recorded cues after unlock and routes them through bounded voices', async () => {
    let fetchCount = 0;
    globalScope.fetch = (async (url: string) => {
      expect(url).toMatch(/^https:\/\/example\.com\/WST\/audio\//);
      fetchCount += 1;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) };
    }) as unknown as typeof fetch;
    const audio = new GameAudio();
    await audio.unlock();
    expect(fetchCount).toBe(12);
    const context = FakeAudioContext.instances[0];
    audio.play('step');
    const decodedSource = context.createdSources.find((source) => (source as FakeBufferSource).buffer?.length === 24_000);
    expect(decodedSource).toBeDefined();
    audio.dispose();
  });

  it('emits a distinct scheduled recipe for every supplied leader signature', async () => {
    const fingerprints = new Set<string>();
    for (const id of characterIds) {
      const audio = new GameAudio();
      await audio.unlock();
      const context = FakeAudioContext.instances.at(-1) as FakeAudioContext;
      audio.playSignature(id);
      const fingerprint = context.createdSources.map(source => source.descriptor()).join('|');
      expect(context.createdSources.length, id).toBeGreaterThan(0);
      fingerprints.add(fingerprint);
      audio.dispose();
    }
    expect(characterIds).toHaveLength(21);
    expect(fingerprints).toHaveLength(21);
  });

  it('bounds overlapping voices and clears them on dispose', async () => {
    const audio = new GameAudio();
    await audio.unlock();
    for (let index = 0; index < 40; index += 1) audio.playSignature(characterIds[index % characterIds.length]);
    audio.play('heavy-hit');
    const activeVoices = (audio as unknown as { activeVoices: Set<unknown> }).activeVoices;
    expect(activeVoices.size).toBeLessThanOrEqual(64);
    audio.dispose();
    expect(activeVoices.size).toBe(0);
  });
});

describe('ArenaEffects signature release routing', () => {
  it('resolves each combat signature action once and ignores charge events', () => {
    const effects = new ArenaEffects();
    const positions = [-2, 2];
    characterIds.forEach((characterId, index) => {
      const profile = signatureProfiles[characterId as keyof typeof signatureProfiles];
      const release = { type: 'signature-release', tick: index + 1, actor: 0 as const, target: 1 as const, action: profile.id };
      effects.sync([release], positions);
      const once = effects.group.children.length;
      effects.sync([release], positions);
      expect(effects.group.children.length).toBe(once);
      effects.sync([{ ...release, type: 'signature-charge', tick: index + 100 }], positions);
      expect(effects.group.children.length).toBe(once);
    });
    expect(effects.group.children).toHaveLength(21);
    effects.reset();
    expect(effects.group.children).toHaveLength(0);
    effects.dispose();
  });

  it('keeps the effect pool bounded and reduces particle fan-out', () => {
    const full = new ArenaEffects();
    const reduced = new ArenaEffects(true);
    const events = characterIds.map((characterId, index) => ({
      type: 'signature-release', tick: index + 1, actor: 0 as const, target: 1 as const,
      action: signatureProfiles[characterId as keyof typeof signatureProfiles].id,
    }));
    full.sync(events, [-2, 2]);
    reduced.sync(events, [-2, 2]);
    expect(full.group.children.length).toBeLessThanOrEqual(36);
    expect(reduced.group.children.length).toBe(full.group.children.length);
    const fullGeometryCount = full.group.children.reduce((total, group) => total + group.children.length, 0);
    const reducedGeometryCount = reduced.group.children.reduce((total, group) => total + group.children.length, 0);
    expect(reducedGeometryCount).toBeLessThan(fullGeometryCount);
    full.dispose();
    reduced.dispose();
  });

  it('fades and disposes transient meshes after their lifetime', () => {
    const effects = new ArenaEffects();
    const profile = signatureProfiles.trump;
    effects.sync([{ type: 'signature-release', tick: 1, actor: 0, target: 1, action: profile.id }], [-2, 2]);
    expect(effects.group.children).toHaveLength(1);
    effects.update(1.1);
    expect(effects.group.children).toHaveLength(0);
    effects.dispose();
  });
});
