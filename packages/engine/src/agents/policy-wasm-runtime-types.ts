import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import type { CompiledPolicyConsideration, EncodedState, EncodedStateLayout, GameDef, GameState } from '../kernel/index.js';
import type { PolicyWasmBytecodeInputCache, PolicyWasmBytecodeStateWordsCache } from '../kernel/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type { PolicyScheduleFallbackFired } from './policy-evaluation-core.js';
import type { PolicyValue } from './policy-surface.js';
import type { PolicyWasmPreviewDriveBatchInput, PolicyWasmPreviewDriveResult } from './policy-wasm-preview-drive.js';
import type { PolicyWasmTimingRouteClass } from './policy-wasm-timing-profile.js';

export interface PolicyWasmRuntimeOptions {
  readonly wasmPath?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
}

export interface PolicyWasmBytecodeContext {
  readonly def: GameDef;
  readonly layout: EncodedStateLayout;
  readonly state: GameState;
  readonly playerId?: number;
  readonly expectedLayoutId?: number;
  readonly bytecodeInputCache?: PolicyWasmBytecodeInputCache;
  readonly bytecodeStateWordsCache?: PolicyWasmBytecodeStateWordsCache;
  readonly gameDefRuntime?: GameDefRuntime;
  readonly timingRouteClass?: PolicyWasmTimingRouteClass;
  readonly bytecodeCacheAxisLabel?: string;
}

export interface PolicyWasmBatchCandidate {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly tags?: readonly string[];
}

export interface PolicyWasmScoreRow {
  readonly stableMoveKey: string;
  readonly score: number;
  readonly scheduleFallbackFired?: PolicyScheduleFallbackFired;
}

export interface PolicyWasmMoveConsideration {
  readonly id: string;
  readonly consideration: CompiledPolicyConsideration;
}

export interface PolicyWasmPrecomputedCandidateFeature {
  readonly id: string;
  readonly values: readonly PolicyValue[];
}

export type PolicyWasmPreviewOutcome = 'ready' | 'stochastic' | 'gated' | 'failed' | 'unresolved';

export interface PolicyWasmPrecomputedPreviewCandidateFeature {
  readonly id: string;
  readonly outcomes: readonly PolicyWasmPreviewOutcome[];
  readonly values: readonly PolicyValue[];
}

export interface PolicyWasmPrecomputedDynamicCandidateFeature {
  readonly code: number;
  readonly values: readonly PolicyValue[];
  readonly seatContextValues?: Readonly<Record<string, readonly PolicyValue[]>>;
}

export interface PolicyWasmPrecomputedAggregate {
  readonly id: string;
  readonly value: PolicyValue;
}

export interface PolicyWasmPrecomputedStateFeature {
  readonly id: string;
  readonly value: PolicyValue;
}

export type PolicyWasmScoreRowsResult =
  | {
      readonly kind: 'supported';
      readonly rows: readonly PolicyWasmScoreRow[];
    }
  | {
      readonly kind: 'unsupported';
      readonly reason: string;
    };

export interface PolicyWasmRuntime {
  readonly wasmPath?: string;
  evaluateSmokeAdd(left: number, right: number, layoutId?: number): number;
  evaluatePolicyBytecode(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
  ): PolicyValue;
  evaluatePolicyBytecodeBatch(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
    candidates: readonly PolicyWasmBatchCandidate[],
    precomputed?: {
      readonly stateFeatures?: readonly PolicyWasmPrecomputedStateFeature[];
      readonly candidateFeatures?: readonly PolicyWasmPrecomputedCandidateFeature[];
      readonly previewCandidateFeatures?: readonly PolicyWasmPrecomputedPreviewCandidateFeature[];
      readonly dynamicCandidateFeatures?: readonly PolicyWasmPrecomputedDynamicCandidateFeature[];
      readonly aggregates?: readonly PolicyWasmPrecomputedAggregate[];
    },
  ): readonly PolicyValue[];
  evaluatePreviewDriveBatch(input: PolicyWasmPreviewDriveBatchInput): PolicyWasmPreviewDriveResult;
}

export type PolicyWasmBatchPrecomputedInput = {
  readonly stateFeatures?: readonly PolicyWasmPrecomputedStateFeature[];
  readonly candidateFeatures?: readonly PolicyWasmPrecomputedCandidateFeature[];
  readonly previewCandidateFeatures?: readonly PolicyWasmPrecomputedPreviewCandidateFeature[];
  readonly dynamicCandidateFeatures?: readonly PolicyWasmPrecomputedDynamicCandidateFeature[];
  readonly aggregates?: readonly PolicyWasmPrecomputedAggregate[];
};
