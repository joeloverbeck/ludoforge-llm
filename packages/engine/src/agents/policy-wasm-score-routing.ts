import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  GameDef,
  GameState,
  Move,
} from '../kernel/types.js';
import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import type { PolicyPreviewTraceOutcome } from './policy-preview.js';
import { type PolicyValue } from './policy-surface.js';
import {
  evaluateWasmMoveConsiderationScoreRows,
  recordProductionPolicyWasmScoreRows,
  type PolicyWasmPreviewOutcome,
  type PolicyWasmRuntime,
} from './policy-wasm-runtime.js';

interface EncodedPolicyView {
  readonly layout: EncodedStateLayout;
  readonly encoded: EncodedState;
}

export interface PolicyWasmScoreRoutingCandidate extends PolicyEvaluationCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  previewOutcome?: PolicyPreviewTraceOutcome;
  score: number;
}

const encodeWasmPrecomputedPolicyValue = (value: PolicyValue): number | boolean | undefined => {
  if (value === undefined || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  throw new PolicyRuntimeError({
    code: 'RUNTIME_EVALUATION_ERROR',
    message: `Policy WASM score rows require scalar integer precomputed values; got ${String(value)}.`,
    detail: { value },
  });
};

const encodeWasmPreviewOutcome = (candidate: PolicyWasmScoreRoutingCandidate): PolicyWasmPreviewOutcome => {
  switch (candidate.previewOutcome) {
    case 'ready':
    case 'stochastic':
    case 'gated':
    case 'failed':
      return candidate.previewOutcome;
    default:
      return 'unresolved';
  }
};

export function tryScoreMoveConsiderationsWithWasm(input: {
  readonly runtime: PolicyWasmRuntime;
  readonly def: GameDef;
  readonly state: GameState;
  readonly encodedView: EncodedPolicyView | undefined;
  readonly evaluation: PolicyEvaluationContext;
  readonly catalog: AgentPolicyCatalog;
  readonly profileId: string;
  readonly profile: NonNullable<AgentPolicyCatalog['profiles'][string]>;
  readonly seatId: string;
  readonly playerId: PlayerId;
  readonly candidates: readonly PolicyWasmScoreRoutingCandidate[];
  readonly considerationIds: readonly string[];
}): boolean {
  if (input.encodedView === undefined || input.considerationIds.length === 0) {
    return false;
  }
  const considerations = input.considerationIds.map((id) => {
    const consideration = input.catalog.compiled.considerations[id];
    if (consideration === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unknown consideration "${id}".`,
        detail: { considerationId: id },
      });
    }
    return { id, consideration };
  });
  const candidateFeatureRows = input.profile.plan.candidateFeatures.map((id) => {
    const feature = input.catalog.compiled.candidateFeatures[id];
    if (feature === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unknown candidate feature "${id}".`,
        detail: { featureId: id },
      });
    }
    const values = input.candidates.map((candidate) => {
      const value = encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateCandidateFeature(candidate, id));
      if (feature.costClass === 'preview') {
        input.evaluation.finalizePreviewOutcome(candidate);
      }
      return value;
    });
    return { id, costClass: feature.costClass, values };
  });

  const result = evaluateWasmMoveConsiderationScoreRows(input.runtime, {
    def: input.def,
    encoded: input.encodedView.encoded,
    context: {
      def: input.def,
      layout: input.encodedView.layout,
      state: input.state,
      playerId: Number(input.playerId),
    },
    parameterValues: input.profile.params,
    considerations,
    candidates: input.candidates.map((candidate) => ({
      actionId: candidate.actionId,
      stableMoveKey: candidate.stableMoveKey,
      params: candidate.move.params,
      tags: input.def.actionTagIndex?.byAction[candidate.actionId] ?? [],
    })),
    precomputedStateFeatures: input.profile.plan.stateFeatures.map((id) => ({
      id,
      value: encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateStateFeature(id)),
    })),
    precomputedCandidateFeatures: candidateFeatureRows
      .filter((row) => row.costClass !== 'preview')
      .map(({ id, values }) => ({ id, values })),
    precomputedPreviewCandidateFeatures: candidateFeatureRows
      .filter((row) => row.costClass === 'preview')
      .map(({ id, values }) => ({
        id,
        outcomes: input.candidates.map(encodeWasmPreviewOutcome),
        values,
      })),
    precomputedAggregates: input.profile.plan.candidateAggregates.map((id) => ({
      id,
      value: encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateAggregate(id)),
    })),
  });

  if (result.kind !== 'supported') {
    recordProductionPolicyWasmScoreRows('unsupported');
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: `Policy WASM score-row route failed closed for profile "${input.profileId}": ${result.reason}.`,
      detail: {
        route: 'wasmScoreRows',
        profileId: input.profileId,
        seatId: input.seatId,
        candidateCount: input.candidates.length,
        considerationCount: considerations.length,
        unsupportedRowClass: result.reason,
      },
    });
  }
  recordProductionPolicyWasmScoreRows('supported');

  const scoresByKey = new Map(result.rows.map((row) => [row.stableMoveKey, row.score]));
  for (const candidate of input.candidates) {
    const score = scoresByKey.get(candidate.stableMoveKey);
    if (score === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Policy WASM score-row route omitted candidate "${candidate.stableMoveKey}".`,
        detail: {
          route: 'wasmScoreRows',
          profileId: input.profileId,
          seatId: input.seatId,
          candidateCount: input.candidates.length,
          missingStableMoveKey: candidate.stableMoveKey,
        },
      });
    }
    candidate.score = score;
  }
  return true;
}
