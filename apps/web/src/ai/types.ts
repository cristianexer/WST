import type { ActionId, Difficulty, MatchObservation } from '../../../../packages/combat-core/src/types';

/** A progress update is monotonic for one load attempt. */
export interface LoadProgress {
  /** Fraction of the current load attempt that has completed, from 0 to 1. */
  progress: number;
  stage: string;
  detail: string;
}

export type ControllerSource = 'laya' | 'baseline';

export interface Decision {
  action: ActionId;
  /** Typed-choice probabilities after the checkpoint's configured choice temperature. */
  scores?: Record<string, number>;
  latencyMs: number;
  source: ControllerSource;
}

export interface Controller {
  readonly source: ControllerSource;
  readonly status: ControllerStatus;
  readonly checkpoint: CheckpointInfo;
  load(onProgress: (progress: LoadProgress) => void, signal?: AbortSignal): Promise<void>;
  decide(observation: unknown, legal: ActionId[]): Promise<Decision>;
  /** Recreate a failed Laya worker and reload the verified model graph. */
  recover?(onProgress?: (progress: LoadProgress) => void): Promise<void>;
  dispose(): void;
}

export type ControllerStatus = 'idle' | 'loading' | 'ready' | 'error' | 'disposed';

export interface CheckpointInfo {
  id: string;
  revision: string;
  runtime: 'onnxruntime-web' | 'baseline';
  ready: boolean;
  detail: string;
  /** Actual execution provider after session creation. */
  provider?: 'webgpu' | 'wasm';
  /** Most recent end-to-end typed-choice inference duration in this tab. */
  lastLatencyMs?: number;
}

/** Public-only shape accepted by the Laya adapter. */
export type PublicObservation = MatchObservation;

export type { ActionId, Difficulty, MatchObservation };
