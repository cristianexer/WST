import { buildLayaChoiceRequest, mapChoiceLogits, MAX_LAYA_CANDIDATES, type LayaChoiceOption } from './candidates';
import type { ActionId, CheckpointInfo, Controller, ControllerStatus, Decision, LoadProgress, MatchObservation } from './types';
import ortWasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
// The `onnxruntime-web/webgpu` entry point is built with the asyncify module.
// `*.jsep` is a different package variant; forcing it here produces a module
// without the `webgpuInit` binding expected by the WebGPU runtime.
import ortWebGpuModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWebGpuUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';

/**
 * The upstream checkpoint selected for the browser experiment. This is the Hub
 * commit returned by the Laya model API on 21 September 2026, not a moving branch.
 */
export const PINNED_LAYA_CHECKPOINT = {
  repository: 'convaiinnovations/laya',
  revision: '1c5edc17a7acd8701df6fc341c0d179f1c62c982',
  sourceRevision: '42626c348753fbb17572a813127df2278a1ec527',
  tokenizerSubfolder: 'tokenizer',
  parameterCount: 421_293_830,
  upstreamSafetensorsBytes: 842_609_210,
  maxLength: 512,
  headMaxLength: 192,
  choiceTemperatures: {
    'choice:2': 1.9063563346862793,
    'choice:3-5': 1.7601518630981445,
    'choice:6-10': 1.0000158548355103,
    'choice:11+': 0.10058280825614929,
  },
} as const;

/** Fixed ONNX exports that preserve the bounded WST typed-choice request whole. */
export const SUPPORTED_LAYA_STATIC_LENGTHS = [320, PINNED_LAYA_CHECKPOINT.maxLength] as const;

export type LayaBrowserErrorCode =
  | 'no-browser-artifact'
  | 'incompatible-artifact'
  | 'download-failed'
  | 'integrity-failed'
  | 'runtime-failed'
  | 'not-ready'
  | 'decision-in-flight'
  | 'disposed';

export class LayaBrowserError extends Error {
  constructor(readonly code: LayaBrowserErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LayaBrowserError';
  }
}

/**
 * The exported graph contains the complete upstream `DecisionModel`, including
 * ModernBERT and the typed choice head. An encoder-only ONNX graph is insufficient.
 */
export interface LayaBrowserArtifact {
  format: 'wst-laya-decision-onnx-v1';
  checkpointRepository: typeof PINNED_LAYA_CHECKPOINT.repository;
  checkpointRevision: typeof PINNED_LAYA_CHECKPOINT.revision;
  /** Exact source revision used by tools/laya/export_to_onnx.py. */
  sourceRevision: typeof PINNED_LAYA_CHECKPOINT.sourceRevision;
  /** The full graph is split below Git's 100 MiB per-file limit for static hosting. */
  model: {
    bytes: number;
    sha256: string;
    chunks: Array<{ url: string; bytes: number; sha256: string }>;
  };
  /** Directory containing the upstream tokenizer/tokenizer.json and tokenizer_config.json. */
  tokenizerId: string;
  tokenizerRevision: typeof PINNED_LAYA_CHECKPOINT.revision;
  maxLength: (typeof SUPPORTED_LAYA_STATIC_LENGTHS)[number];
  headMaxLength: typeof PINNED_LAYA_CHECKPOINT.headMaxLength;
  choiceTemperatures: typeof PINNED_LAYA_CHECKPOINT.choiceTemperatures;
  /** Numeric representation of the complete, verified graph. */
  precision?: 'int4' | 'int8' | 'fp16' | 'fp32';
  inputs: {
    inputIds: string;
    attentionMask: string;
    markerPositions: string;
    markerMask: string;
    questionType: string;
  };
  logitsOutput: string;
}

/**
 * Compatibility value for callers that deliberately opt out of the manifest.
 * Normal app construction leaves `artifact` undefined and loads the verified
 * static manifest at DEFAULT_LAYA_MANIFEST_URL.
 */
export const VERIFIED_LAYA_BROWSER_ARTIFACT: LayaBrowserArtifact | null = null;
/**
 * The verified browser artifact keeps WST's complete bounded request in 320
 * tokens and uses WebGPU-native MatMulNBits kernels. It is not an encoder or
 * heuristic substitute for the pinned Laya DecisionModel.
 */
export const DEFAULT_LAYA_MANIFEST_URL = './models/laya/manifest.json';

interface TokenizerLike {
  mask_token: string;
  mask_token_id: number;
  pad_token_id: number;
  sep_token_id: number;
  /** Transformers.js exposes this even for tokenizer classes without `cls_token_id`. */
  convert_tokens_to_ids(token: string): number;
  (text: string, options: { add_special_tokens: false }): { input_ids: { data: ArrayLike<number> } };
}

interface TensorResult {
  data: ArrayLike<number>;
}

interface SessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorResult>>;
  release?(): Promise<void> | void;
}

interface RuntimeFactory {
  createTokenizer(
    artifact: LayaBrowserArtifact,
    onProgress: (detail: string, fraction?: number) => void,
  ): Promise<TokenizerLike>;
  createSession(
    model: Uint8Array,
    preferWebGpu: boolean,
    wasmProxy: boolean,
    allowWasmFallback: boolean,
  ): Promise<{ session: SessionLike; provider: 'webgpu' | 'wasm' }>;
  tensor(type: 'int64' | 'bool', data: BigInt64Array | Uint8Array, dimensions: number[]): Promise<unknown>;
}

export interface LayaBrowserControllerOptions {
  artifact?: LayaBrowserArtifact | null;
  /** Defaults to the chunk manifest served from Vite's public/models/laya directory. */
  manifestUrl?: string;
  /** WebGPU is required for the verified INT4 graph. */
  executionProvider?: 'wasm' | 'webgpu';
  /** Load-time real-inference bound. Product callers use 30 seconds by default. */
  warmupTimeoutMs?: number;
  /** ORT proxy worker mode; exposed for browser-runtime compatibility diagnostics. */
  wasmProxy?: boolean;
  /** There is no validated WASM fallback for the verified INT4 graph. */
  allowWasmFallback?: boolean;
  /** Injectable only for deterministic tests; app code should use the browser runtime. */
  runtime?: RuntimeFactory;
}

const LAYA_WARMUP_TIMEOUT_MS = 30_000;
const LAYA_WARMUP_LEGAL: readonly ActionId[] = ['idle', 'guard_high', 'guard_low', 'advance', 'retreat', 'light'];
const LAYA_WARMUP_OBSERVATION: MatchObservation = {
  version: 1,
  tick: 120,
  round: 1,
  phase: 'fight',
  timer: 3_300,
  distanceMm: 900,
  history: ['light', 'retreat'],
  self: {
    health: 800, maxHealth: 1000, stamina: 70, maxStamina: 100, meter: 20, xMm: -450, yMm: 0, facing: 1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6_550, special: 'special_veto',
  },
  opponent: {
    health: 760, maxHealth: 1000, stamina: 56, maxStamina: 100, meter: 30, xMm: 450, yMm: 0, facing: -1,
    grounded: true, action: 'idle', actionPhase: 'neutral', actionTick: 0,
    canAct: true, distanceToWallMm: 6_550, special: 'special_papers',
  },
};

/**
 * A client-only ONNX Runtime controller for an exported full Laya decision graph.
 * It never falls back inside `decide`: callers must explicitly construct baseline mode.
 */
export class BrowserController implements Controller {
  readonly source = 'laya' as const;
  status: ControllerStatus = 'idle';
  checkpoint: CheckpointInfo;

  private artifact: LayaBrowserArtifact | null | undefined;
  private readonly manifestUrl: string;
  private readonly executionProvider: 'wasm' | 'webgpu';
  private readonly warmupTimeoutMs: number;
  private readonly wasmProxy: boolean;
  private readonly allowWasmFallback: boolean;
  private readonly runtime: RuntimeFactory;
  private tokenizer: TokenizerLike | null = null;
  private session: SessionLike | null = null;
  private activeLoad: Promise<void> | null = null;
  private activeDecision: Promise<Decision> | null = null;
  /** Invalidates late async load work after disposal or a retry. */
  private loadEpoch = 0;

  constructor(options: LayaBrowserControllerOptions = {}) {
    this.artifact = options.artifact;
    this.manifestUrl = options.manifestUrl ?? DEFAULT_LAYA_MANIFEST_URL;
    this.executionProvider = options.executionProvider ?? 'webgpu';
    this.warmupTimeoutMs = Math.min(90_000, Math.max(1_000, Math.trunc(options.warmupTimeoutMs ?? LAYA_WARMUP_TIMEOUT_MS)));
    this.wasmProxy = options.wasmProxy ?? true;
    this.allowWasmFallback = options.allowWasmFallback ?? false;
    this.runtime = options.runtime ?? browserRuntime;
    this.checkpoint = {
      id: PINNED_LAYA_CHECKPOINT.repository,
      revision: PINNED_LAYA_CHECKPOINT.revision,
      runtime: 'onnxruntime-web',
      ready: false,
      detail: this.artifact === null
        ? 'No verified browser-compatible Laya ONNX artifact is configured.'
        : 'Pinned Laya browser manifest has not loaded.',
    };
  }

  load(onProgress: (progress: LoadProgress) => void, signal?: AbortSignal): Promise<void> {
    if (this.status === 'disposed') {
      return Promise.reject(new LayaBrowserError('disposed', 'The Laya controller has been disposed.'));
    }
    if (this.status === 'ready') {
      onProgress({ progress: 1, stage: 'Ready', detail: this.checkpoint.detail });
      return Promise.resolve();
    }
    if (this.activeLoad) return this.activeLoad;

    this.status = 'loading';
    const epoch = ++this.loadEpoch;
    this.activeLoad = this.loadInternal(onProgress, signal, epoch)
      .then(() => {
        if (!this.isActiveLoad(epoch)) return;
        this.status = 'ready';
        const provider = this.checkpoint.provider?.toUpperCase() ?? 'BROWSER';
        const latency = this.checkpoint.lastLatencyMs === undefined ? '' : `; warm-up ${Math.round(this.checkpoint.lastLatencyMs)} ms`;
        this.checkpoint = {
          ...this.checkpoint,
          ready: true,
          detail: `Pinned Laya ONNX decision graph is ready with ${provider}${latency}.`,
        };
      })
      .catch((error: unknown) => {
        if (!this.isActiveLoad(epoch)) throw error;
        const session = this.session;
        this.session = null;
        this.tokenizer = null;
        releaseSession(session);
        this.status = 'error';
        this.checkpoint = {
          ...this.checkpoint,
          ready: false,
          detail: error instanceof Error ? error.message : 'Laya failed to load.',
        };
        throw error;
      })
      .finally(() => {
        if (this.loadEpoch === epoch) this.activeLoad = null;
      });
    return this.activeLoad;
  }

  async decide(observation: unknown, legal: ActionId[]): Promise<Decision> {
    if (this.status === 'disposed') throw new LayaBrowserError('disposed', 'The Laya controller has been disposed.');
    if (this.status !== 'ready' || !this.artifact || !this.tokenizer || !this.session) {
      throw new LayaBrowserError('not-ready', 'Laya has not completed loading; no action was selected.');
    }

    if (this.activeDecision) {
      throw new LayaBrowserError('decision-in-flight', 'A prior Laya decision is still running; this request was not queued.');
    }
    const decision = this.runDecision(assertObservation(observation), legal);
    this.activeDecision = decision;
    void decision.then(
      () => { if (this.activeDecision === decision) this.activeDecision = null; },
      () => { if (this.activeDecision === decision) this.activeDecision = null; },
    );
    return decision;
  }

  private async runDecision(observation: MatchObservation, legal: ActionId[]): Promise<Decision> {
    const artifact = this.artifact;
    const tokenizer = this.tokenizer;
    const session = this.session;
    if (!artifact || !tokenizer || !session) {
      throw new LayaBrowserError('not-ready', 'Laya has not completed loading; no action was selected.');
    }
    const startedAt = performance.now();
    const request = buildLayaChoiceRequest(observation, legal);
    const sequence = buildSequence(tokenizer, request.state, request.question.instructions, request.options, artifact);
    const [inputIds, attentionMask, markerPositions, markerMask, questionType] = await Promise.all([
      this.runtime.tensor('int64', toInt64(sequence.ids), [1, sequence.ids.length]),
      this.runtime.tensor('int64', toInt64(sequence.attention), [1, sequence.attention.length]),
      this.runtime.tensor('int64', toInt64(sequence.markers), [1, sequence.markers.length]),
      this.runtime.tensor('bool', new Uint8Array(sequence.markerMask), [1, sequence.markerMask.length]),
      this.runtime.tensor('int64', new BigInt64Array([0n]), [1]),
    ]);
    const response = await session.run({
      [artifact.inputs.inputIds]: inputIds,
      [artifact.inputs.attentionMask]: attentionMask,
      [artifact.inputs.markerPositions]: markerPositions,
      [artifact.inputs.markerMask]: markerMask,
      [artifact.inputs.questionType]: questionType,
    });
    if (this.status === 'disposed') throw new LayaBrowserError('disposed', 'The Laya controller was disposed before its decision completed.');
    const logits = response[artifact.logitsOutput];
    if (!logits) {
      throw new LayaBrowserError('runtime-failed', `Laya ONNX graph did not return ${artifact.logitsOutput}.`);
    }
    // The static browser graph emits sixteen slots. Marker masking makes trailing
    // slots unusable; only the leading positions correspond to this request.
    const mapped = mapChoiceLogits(
      Array.from(logits.data).slice(0, request.candidates.length),
      request.candidates,
      choiceTemperatureFor(request.candidates.length, artifact),
    );
    const latencyMs = performance.now() - startedAt;
    this.checkpoint = { ...this.checkpoint, lastLatencyMs: latencyMs };
    return {
      ...mapped,
      latencyMs,
      source: 'laya',
    };
  }

  dispose(): void {
    if (this.status === 'disposed') return;
    this.loadEpoch += 1;
    this.status = 'disposed';
    this.tokenizer = null;
    const session = this.session;
    this.session = null;
    releaseSession(session);
    this.checkpoint = { ...this.checkpoint, ready: false, detail: 'Laya browser runtime disposed.' };
  }

  private async resolveArtifact(signal?: AbortSignal): Promise<LayaBrowserArtifact> {
    if (this.artifact !== undefined) {
      if (!this.artifact) {
        throw new LayaBrowserError(
          'no-browser-artifact',
          'Laya is unavailable: no verified full ONNX decision graph has been configured.',
        );
      }
      return this.artifact;
    }
    let response: Response;
    try {
      response = await fetch(this.manifestUrl, { signal, cache: 'no-cache' });
    } catch (error) {
      throw new LayaBrowserError('no-browser-artifact', 'Laya is unavailable: its browser artifact manifest could not be loaded.', { cause: error });
    }
    if (!response.ok) {
      throw new LayaBrowserError('no-browser-artifact', `Laya is unavailable: artifact manifest request failed (${response.status}).`);
    }
    let manifest: unknown;
    try {
      manifest = await response.json();
    } catch (error) {
      throw new LayaBrowserError('incompatible-artifact', 'Laya artifact manifest is not valid JSON.', { cause: error });
    }
    const artifact = resolveManifestUrls(manifest, response.url || this.manifestUrl);
    assertArtifact(artifact);
    return artifact;
  }

  private isActiveLoad(epoch: number): boolean {
    return this.status !== 'disposed' && this.loadEpoch === epoch;
  }

  private async loadInternal(onProgress: (progress: LoadProgress) => void, signal: AbortSignal | undefined, epoch: number): Promise<void> {
    this.assertActiveLoad(epoch, signal);
    const artifact = await this.resolveArtifact(signal);
    this.assertActiveLoad(epoch, signal);
    this.artifact = artifact;
    if (!artifact) {
      const error = new LayaBrowserError(
        'no-browser-artifact',
        'Laya is unavailable: the pinned upstream release has no verified full ONNX decision graph for browser execution.',
      );
      onProgress({ progress: 0, stage: 'Unavailable', detail: error.message });
      throw error;
    }
    assertArtifact(artifact);
    this.assertActiveLoad(epoch, signal);
    onProgress({ progress: 0.02, stage: 'Preparing runtime', detail: 'Checking WebAssembly/WebGPU support.' });

    const preferWebGpu = this.executionProvider === 'webgpu';
    const tokenizerPromise = this.runtime.createTokenizer(artifact, (detail, fraction) => {
      const progress = fraction === undefined ? 0.08 : 0.03 + Math.min(1, Math.max(0, fraction)) * 0.12;
      onProgress({ progress, stage: 'Loading tokenizer', detail });
    });
    // The model transfer can be aborted before this independent, small request
    // settles. Observe a late rejection even when the active load is gone.
    void tokenizerPromise.catch(() => undefined);
    const model = await downloadModel(artifact, onProgress, signal);
    this.assertActiveLoad(epoch, signal);
    onProgress({ progress: 0.9, stage: 'Verifying model', detail: 'Checking the downloaded ONNX graph.' });
    await verifySha256(model, artifact.model.sha256);
    this.assertActiveLoad(epoch, signal);
    onProgress({ progress: 0.94, stage: 'Creating inference session', detail: preferWebGpu ? 'Initializing WebGPU.' : 'Initializing WebAssembly worker.' });

    try {
      const created = await this.runtime.createSession(model, preferWebGpu, this.wasmProxy, this.allowWasmFallback);
      if (!this.isActiveLoad(epoch)) {
        releaseSession(created.session);
        this.assertActiveLoad(epoch, signal);
      }
      this.session = created.session;
      this.checkpoint = { ...this.checkpoint, provider: created.provider };
    } catch (error) {
      if (error instanceof LayaBrowserError) throw error;
      throw new LayaBrowserError('runtime-failed', 'The Laya ONNX graph could not initialize in this browser.', { cause: error });
    }
    this.tokenizer = await tokenizerPromise;
    this.assertActiveLoad(epoch, signal);
    onProgress({ progress: 0.97, stage: 'Warming Laya', detail: 'Running a real typed-choice decision on this device.' });
    try {
      await settleWithin(this.runDecision(LAYA_WARMUP_OBSERVATION, [...LAYA_WARMUP_LEGAL]), this.warmupTimeoutMs, signal);
    } catch (error) {
      if (error instanceof LayaBrowserError) throw error;
      if (signal?.aborted) throw error;
      throw new LayaBrowserError(
        'runtime-failed',
        `Laya warm-up failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    this.assertActiveLoad(epoch, signal);
    const provider = this.checkpoint.provider?.toUpperCase() ?? 'BROWSER';
    onProgress({ progress: 1, stage: 'Ready', detail: `Pinned Laya ONNX graph warmed locally with ${provider}.` });
  }

  private assertActiveLoad(epoch: number, signal?: AbortSignal): void {
    throwIfAborted(signal);
    if (!this.isActiveLoad(epoch)) {
      throw new LayaBrowserError('disposed', 'The Laya controller was disposed while loading.');
    }
  }
}

export const createLayaBrowserController = (options?: LayaBrowserControllerOptions): BrowserController =>
  new BrowserController(options);

async function downloadModel(
  artifact: LayaBrowserArtifact,
  onProgress: (progress: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  onProgress({ progress: 0.15, stage: 'Downloading Laya', detail: `Downloading ${formatBytes(artifact.model.bytes)} ONNX graph.` });
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (const [index, chunk] of artifact.model.chunks.entries()) {
    const bytes = await downloadChunk(chunk, artifact.model.bytes, received, index, artifact.model.chunks.length, onProgress, signal);
    await verifySha256(bytes, chunk.sha256);
    chunks.push(bytes);
    received += bytes.byteLength;
  }
  if (received !== artifact.model.bytes) {
    throw new LayaBrowserError('integrity-failed', `Downloaded ${formatBytes(received)}; expected ${formatBytes(artifact.model.bytes)}.`);
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await verifySha256(result, artifact.model.sha256);
  return result;
}

function assertArtifact(artifact: LayaBrowserArtifact): void {
  if (
    artifact.format !== 'wst-laya-decision-onnx-v1' ||
    artifact.checkpointRepository !== PINNED_LAYA_CHECKPOINT.repository ||
    artifact.checkpointRevision !== PINNED_LAYA_CHECKPOINT.revision ||
    artifact.sourceRevision !== PINNED_LAYA_CHECKPOINT.sourceRevision ||
    artifact.tokenizerRevision !== PINNED_LAYA_CHECKPOINT.revision ||
    !SUPPORTED_LAYA_STATIC_LENGTHS.includes(artifact.maxLength) ||
    artifact.headMaxLength !== PINNED_LAYA_CHECKPOINT.headMaxLength ||
    !sameChoiceTemperatures(artifact.choiceTemperatures) ||
    !Number.isSafeInteger(artifact.model.bytes) || artifact.model.bytes <= 0 ||
    !/^[a-f0-9]{64}$/i.test(artifact.model.sha256) ||
    artifact.model.chunks.length === 0 ||
    artifact.model.chunks.some((chunk) => !Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(chunk.sha256))
  ) {
    throw new LayaBrowserError('incompatible-artifact', 'The supplied artifact is not the pinned full Laya browser export.');
  }
}

function choiceTemperatureFor(candidateCount: number, artifact: LayaBrowserArtifact): number {
  const bucket = candidateCount === 2 ? 'choice:2'
    : candidateCount <= 5 ? 'choice:3-5'
      : candidateCount <= 10 ? 'choice:6-10'
        : 'choice:11+';
  return artifact.choiceTemperatures[bucket];
}

function sameChoiceTemperatures(value: unknown): value is typeof PINNED_LAYA_CHECKPOINT.choiceTemperatures {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(PINNED_LAYA_CHECKPOINT.choiceTemperatures)
    .every(([bucket, expected]) => (value as Record<string, unknown>)[bucket] === expected);
}

function resolveManifestUrls(value: unknown, manifestUrl: string): LayaBrowserArtifact {
  if (!value || typeof value !== 'object') {
    throw new LayaBrowserError('incompatible-artifact', 'Laya artifact manifest must be an object.');
  }
  const raw = value as Partial<LayaBrowserArtifact>;
  const rawModel = raw.model;
  if (!rawModel || !Array.isArray(rawModel.chunks) || typeof raw.tokenizerId !== 'string') {
    throw new LayaBrowserError('incompatible-artifact', 'Laya artifact manifest has no chunked model or tokenizer location.');
  }
  try {
    return {
      ...raw,
      tokenizerId: new URL(raw.tokenizerId.endsWith('/') ? raw.tokenizerId : `${raw.tokenizerId}/`, manifestUrl).toString(),
      model: {
        ...rawModel,
        chunks: rawModel.chunks.map((chunk) => {
          // A deployment can replace a part at the same static pathname. Bind
          // the browser cache key to the manifest's content digest so an older
          // Laya revision cannot be accidentally assembled with the new one.
          const url = new URL(chunk.url, manifestUrl);
          url.searchParams.set('sha256', chunk.sha256);
          return { ...chunk, url: url.toString() };
        }),
      },
    } as LayaBrowserArtifact;
  } catch (error) {
    throw new LayaBrowserError('incompatible-artifact', 'Laya artifact manifest contains an invalid static URL.', { cause: error });
  }
}

async function downloadChunk(
  chunk: LayaBrowserArtifact['model']['chunks'][number],
  totalBytes: number,
  receivedBefore: number,
  index: number,
  count: number,
  onProgress: (progress: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(chunk.url, { signal, cache: 'force-cache' });
  } catch (error) {
    throw new LayaBrowserError('download-failed', `Laya model part ${index + 1} of ${count} could not be downloaded.`, { cause: error });
  }
  if (!response.ok || !response.body) {
    throw new LayaBrowserError('download-failed', `Laya model part ${index + 1} of ${count} failed (${response.status}).`);
  }
  // Content-Length describes the compressed transfer when a CDN uses gzip/br.
  // Fetch exposes decoded bytes, so integrity must use the actual body length
  // and the manifest checksum, not transport metadata (which may be hidden).
  const reader = response.body.getReader();
  const assembled = new Uint8Array(chunk.bytes);
  let received = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      if (received + next.value.byteLength > chunk.bytes) {
        throw new LayaBrowserError('integrity-failed', `Laya model part ${index + 1} exceeds its expected ${formatBytes(chunk.bytes)} decoded size.`);
      }
      assembled.set(next.value, received);
      received += next.value.byteLength;
      const totalReceived = receivedBefore + received;
      onProgress({
        progress: 0.15 + 0.75 * Math.min(1, totalReceived / totalBytes),
        stage: 'Downloading Laya',
        detail: `Part ${index + 1}/${count}: ${formatBytes(totalReceived)} of ${formatBytes(totalBytes)} downloaded.`,
      });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (received !== chunk.bytes) {
    throw new LayaBrowserError('integrity-failed', `Laya model part ${index + 1} received ${formatBytes(received)}; expected ${formatBytes(chunk.bytes)}.`);
  }
  return assembled;
}

function buildSequence(
  tokenizer: TokenizerLike,
  state: string,
  instructions: string,
  options: readonly LayaChoiceOption[],
  artifact: LayaBrowserArtifact,
): { ids: number[]; attention: number[]; markers: number[]; markerMask: number[] } {
  const encode = (text: string) => Array.from(tokenizer(text, { add_special_tokens: false }).input_ids.data, Number);
  const specialId = (token: string, label: string): number => {
    const id = tokenizer.convert_tokens_to_ids(token);
    if (!Number.isSafeInteger(id) || id < 0) {
      throw new LayaBrowserError('incompatible-artifact', `The pinned Laya tokenizer has no usable ${label} token.`);
    }
    return id;
  };
  // `PreTrainedTokenizer` in Transformers.js 4.3 intentionally omits a
  // `cls_token_id` convenience property for this PreTrainedTokenizerFast file.
  // Resolve it from the verified tokenizer vocabulary, never invent an ID.
  const clsTokenId = specialId('[CLS]', 'CLS');
  const sepTokenId = specialId('[SEP]', 'SEP');
  const padTokenId = specialId('[PAD]', 'PAD');
  const maskTokenId = specialId('[MASK]', 'MASK');
  const sanitize = (text: string) => text.replaceAll(tokenizer.mask_token, ' ');
  const optionTokens = options.map((option) => {
    const encoded = encode(` ${option.id}: ${option.criterion}`.replaceAll(tokenizer.mask_token, ' '));
    if (encoded.length > 48) throw new LayaBrowserError('incompatible-artifact', `Candidate ${option.id} exceeds Laya's 48-token option limit.`);
    return [maskTokenId, ...encoded];
  });
  const headTokens = encode(`choice question: ${sanitize(instructions)}`);
  const optionLength = optionTokens.reduce((count, option) => count + option.length, 0);
  const headBudget = artifact.headMaxLength - optionLength;
  if (headBudget < 8 || headTokens.length > headBudget) {
    throw new LayaBrowserError('incompatible-artifact', 'The typed-choice header exceeds the pinned Laya token budget.');
  }
  const ids = [clsTokenId, ...headTokens, sepTokenId];
  const markers: number[] = [];
  for (const option of optionTokens) {
    markers.push(ids.length);
    ids.push(...option);
  }
  ids.push(sepTokenId);
  const remainingStateTokens = artifact.maxLength - ids.length - 1;
  const stateTokens = encode(sanitize(state));
  if (remainingStateTokens < 0 || stateTokens.length > remainingStateTokens) {
    throw new LayaBrowserError('incompatible-artifact', 'The public observation exceeds the pinned Laya token budget.');
  }
  ids.push(...stateTokens, sepTokenId);
  const attention = ids.map(() => 1);
  while (ids.length < artifact.maxLength) {
    ids.push(padTokenId);
    attention.push(0);
  }
  const markerMask = markers.map(() => 1);
  while (markers.length < MAX_LAYA_CANDIDATES) markers.push(0);
  while (markerMask.length < MAX_LAYA_CANDIDATES) markerMask.push(0);
  return { ids, attention, markers, markerMask };
}

function assertObservation(observation: unknown): import('./types').MatchObservation {
  if (!observation || typeof observation !== 'object') throw new Error('Laya requires a public MatchObservation.');
  return observation as import('./types').MatchObservation;
}

function toInt64(values: readonly number[]): BigInt64Array {
  return new BigInt64Array(values.map((value) => BigInt(Math.trunc(value))));
}

async function verifySha256(bytes: Uint8Array, expected: string): Promise<void> {
  if (!globalThis.crypto?.subtle) {
    throw new LayaBrowserError('integrity-failed', 'This browser cannot verify the Laya model checksum.');
  }
  // Copy to a plain ArrayBuffer-backed view: TypeScript correctly treats a generic
  // Uint8Array as potentially SharedArrayBuffer-backed, while Web Crypto does not.
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput);
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected.toLowerCase()) {
    throw new LayaBrowserError(
      'integrity-failed',
      `The Laya ONNX graph checksum does not match its pinned manifest (expected ${expected}, received ${actual}).`,
    );
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Laya loading was cancelled.', 'AbortError');
}

/** ORT has no cancellation API for an already-running proxy request. Release is best effort. */
function releaseSession(session: SessionLike | null): void {
  try {
    const result = session?.release?.();
    if (result && typeof (result as Promise<void>).then === 'function') {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // A failed teardown must not create an unhandled rejection or revive a controller.
  }
}

/** Bounds an unresponsive execution provider without changing the decision result. */
function settleWithin<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const complete = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => complete(() => reject(signal?.reason ?? new DOMException('Laya loading was cancelled.', 'AbortError')));
    const timer = setTimeout(() => complete(() => reject(new LayaBrowserError(
      'runtime-failed',
      `Laya warm-up exceeded ${Math.round(timeoutMs / 1_000)} seconds in this browser.`,
    ))), timeoutMs);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => complete(() => resolve(value)),
      (error: unknown) => complete(() => reject(error)),
    );
  });
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MiB`;
}

const browserRuntime: RuntimeFactory = {
  async createTokenizer(artifact, onProgress) {
    const { PreTrainedTokenizer } = await import('@huggingface/transformers');
    const [tokenizerJson, tokenizerConfig] = await Promise.all([
      downloadJson(new URL('tokenizer.json', artifact.tokenizerId).toString(), 'tokenizer.json', onProgress),
      downloadJson(new URL('tokenizer_config.json', artifact.tokenizerId).toString(), 'tokenizer_config.json', onProgress),
    ]);
    return new PreTrainedTokenizer(tokenizerJson, tokenizerConfig) as unknown as TokenizerLike;
  },
  async createSession(model, preferWebGpu, wasmProxy, allowWasmFallback) {
    // ORT only registers its experimental WebGPU EP through this explicit entry
    // point. Importing the generic package and merely requesting `webgpu` silently
    // leaves no provider to create, which made prior probes fall back to WASM.
    const ort = preferWebGpu
      ? await import('onnxruntime-web/webgpu')
      : await import('onnxruntime-web');
    activeOrtModule = ort;
    // ORT's provider-placement diagnostics are warning severity. Keep errors and
    // fatals visible, while avoiding those expected messages in a verified mixed
    // WebGPU/CPU graph; this is ORT's supported severity setting, not a console filter.
    ort.env.logLevel = 'error';
    ort.env.wasm.wasmPaths = preferWebGpu
      ? { mjs: ortWebGpuModuleUrl, wasm: ortWebGpuUrl }
      : { mjs: ortWasmModuleUrl, wasm: ortWasmUrl };
    // The WASM provider moves its compute off the UI thread. One thread is deliberate:
    // a 421M-parameter model already has a substantial memory footprint.
    // ORT's proxy protocol moves the complete WASM module into a worker. That
    // worker does not expose the JSEP WebGPU bindings, so a WebGPU session
    // created through it fails with `webgpuInit is not a function`. Keep proxy
    // execution for the CPU/WASM route, but initialize the JSEP runtime on the
    // window that owns `navigator.gpu`.
    ort.env.wasm.proxy = preferWebGpu ? false : wasmProxy;
    ort.env.wasm.numThreads = 1;
    if (preferWebGpu) {
      try {
        return {
          session: await ort.InferenceSession.create(model, {
            executionProviders: ['webgpu'],
            // Session options default to warning even when env.logLevel is error.
            // Keep actual ORT errors/fatals visible while suppressing expected
            // mixed-provider placement warnings for this graph.
            logSeverityLevel: 3,
          }) as unknown as SessionLike,
          provider: 'webgpu',
        };
      } catch (error) {
        if (!allowWasmFallback) {
          throw new LayaBrowserError(
            'runtime-failed',
            `WebGPU could not initialize this Laya graph: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        // WASM is still local browser inference, and runs in ORT's proxy worker.
      }
    }
    return {
      session: await ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
        logSeverityLevel: 3,
      }) as unknown as SessionLike,
      provider: 'wasm',
    };
  },
  async tensor(type, data, dimensions) {
    const ort = activeOrtModule ?? await import('onnxruntime-web');
    return new ort.Tensor(type, data, dimensions);
  },
};

/** Tensor objects must come from the same ORT module that owns the live session. */
let activeOrtModule: typeof import('onnxruntime-web') | null = null;

async function downloadJson(
  url: string,
  file: string,
  onProgress: (detail: string, fraction?: number) => void,
): Promise<unknown> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new LayaBrowserError('download-failed', `Laya ${file} request failed (${response.status}).`);
  const total = Number(response.headers.get('content-length'));
  if (!response.body || !Number.isFinite(total) || total <= 0) {
    onProgress(`${file} downloaded.`);
    return response.json();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    received += next.value.byteLength;
    onProgress(`${file}: ${formatBytes(received)} of ${formatBytes(total)}.`, received / total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
