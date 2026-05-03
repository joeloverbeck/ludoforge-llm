import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledSurfaceRef,
  GameDef,
  GameState,
  Move,
} from '../kernel/types.js';
import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import type { PolicyPreviewTraceOutcome } from './policy-preview.js';
import { type PolicyValue } from './policy-surface.js';
import {
  evaluateWasmCandidateFeatureRow,
  evaluateWasmMoveConsiderationScoreRows,
  recordProductionPolicyWasmPreviewCandidateFeatureRows,
  recordProductionPolicyWasmScoreRows,
  type PolicyWasmPrecomputedDynamicCandidateFeature,
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

const previewSurfaceCode = (ref: CompiledSurfaceRef): number =>
  stablePayloadCode({ family: ref.family, id: ref.id, selector: ref.selector });

const previewDynamicRefCode = (ref: CompiledAgentPolicyRef): number => {
  if (ref.kind === 'previewSurface') {
    return previewSurfaceCode(ref);
  }
  return stablePayloadCode(ref);
};

const collectPreviewDynamicRefs = (expr: CompiledPolicyExpr): readonly CompiledAgentPolicyRef[] => {
  const refs: CompiledAgentPolicyRef[] = [];
  const visit = (current: CompiledPolicyExpr | undefined): void => {
    if (current === undefined) {
      return;
    }
    switch (current.kind) {
      case 'literal':
      case 'param':
        return;
      case 'ref':
        if (
          current.ref.kind === 'previewSurface'
          || (current.ref.kind === 'library' && current.ref.refKind === 'previewStateFeature')
        ) {
          refs.push(current.ref);
        }
        return;
      case 'op':
        current.args.forEach(visit);
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') visit(current.zone);
        return;
      case 'globalTokenAgg':
      case 'globalZoneAgg':
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') visit(current.anchorZone);
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') visit(current.zone);
        return;
    }
  };
  visit(expr);
  const seen = new Set<number>();
  return refs.filter((ref) => {
    const code = previewDynamicRefCode(ref);
    if (seen.has(code)) {
      return false;
    }
    seen.add(code);
    return true;
  });
};

const materializePreviewDynamicRows = (
  evaluation: PolicyEvaluationContext,
  candidates: readonly PolicyWasmScoreRoutingCandidate[],
  refs: readonly CompiledAgentPolicyRef[],
): readonly PolicyWasmPrecomputedDynamicCandidateFeature[] => refs.map((ref) => ({
  code: previewDynamicRefCode(ref),
  values: candidates.map((candidate) => {
    if (ref.kind === 'previewSurface') {
      return encodeWasmPrecomputedPolicyValue(evaluation.evaluatePreviewSurfaceRef(candidate, ref));
    }
    if (ref.kind === 'library' && ref.refKind === 'previewStateFeature') {
      return encodeWasmPrecomputedPolicyValue(evaluation.evaluatePreviewStateFeatureRef(candidate, ref.id));
    }
    return undefined;
  }),
}));

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
  const wasmCandidates = input.candidates.map((candidate) => ({
    actionId: candidate.actionId,
    stableMoveKey: candidate.stableMoveKey,
    params: candidate.move.params,
    tags: input.def.actionTagIndex?.byAction[candidate.actionId] ?? [],
  }));
  const precomputedStateFeatures = input.profile.plan.stateFeatures.map((id) => ({
    id,
    value: encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateStateFeature(id)),
  }));
  const candidateFeatureRows: {
    readonly id: string;
    readonly costClass: string;
    readonly values: readonly PolicyValue[];
  }[] = [];
  for (const id of input.profile.plan.candidateFeatures) {
    const feature = input.catalog.compiled.candidateFeatures[id];
    if (feature === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unknown candidate feature "${id}".`,
        detail: { featureId: id },
      });
    }
    if (feature.costClass !== 'preview') {
      candidateFeatureRows.push({
        id,
        costClass: feature.costClass,
        values: input.candidates.map((candidate) => encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateCandidateFeature(candidate, id))),
      });
      continue;
    }
    const values = evaluateWasmCandidateFeatureRow(input.runtime, {
      def: input.def,
      encoded: input.encodedView.encoded,
      context: {
        def: input.def,
        layout: input.encodedView.layout,
        state: input.state,
        playerId: Number(input.playerId),
      },
      parameterValues: input.profile.params,
      expr: feature.expr,
      candidates: wasmCandidates,
      precomputedStateFeatures,
      precomputedCandidateFeatures: candidateFeatureRows
        .filter((row) => row.costClass !== 'preview')
        .map(({ id: rowId, values: rowValues }) => ({ id: rowId, values: rowValues })),
      precomputedPreviewCandidateFeatures: candidateFeatureRows
        .filter((row) => row.costClass === 'preview')
        .map(({ id: rowId, values: rowValues }) => ({
          id: rowId,
          outcomes: input.candidates.map(encodeWasmPreviewOutcome),
          values: rowValues,
        })),
      precomputedDynamicCandidateFeatures: materializePreviewDynamicRows(
        input.evaluation,
        input.candidates,
        collectPreviewDynamicRefs(feature.expr),
      ),
    });
    if (values === null) {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Policy WASM preview row route failed closed for profile "${input.profileId}": unsupported candidate feature "${id}".`,
        detail: {
          route: 'wasmPreviewCandidateFeatureRows',
          profileId: input.profileId,
          seatId: input.seatId,
          candidateCount: input.candidates.length,
          featureId: id,
          unsupportedRowClass: 'unsupported preview candidate feature expression',
        },
      });
    }
    for (const [index, candidate] of input.candidates.entries()) {
      input.evaluation.setCandidateFeatureValue(candidate, id, values[index]);
      input.evaluation.finalizePreviewOutcome(candidate);
    }
    recordProductionPolicyWasmPreviewCandidateFeatureRows('supported');
    candidateFeatureRows.push({
      id,
      costClass: feature.costClass,
      values: values.map(encodeWasmPrecomputedPolicyValue),
    });
  }

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
    candidates: wasmCandidates,
    precomputedStateFeatures,
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
