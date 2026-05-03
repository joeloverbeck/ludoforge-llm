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
import {
  buildPolicyVictorySurface,
  resolvePolicyRoleSelector,
  type PolicyValue,
} from './policy-surface.js';
import {
  evaluateProductionPreviewDriveBatchWithWasm,
  type PolicyWasmProductionPreviewDriveCandidate,
} from './policy-wasm-production-preview-drive.js';
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

const previewTraceOutcomeFromWasm = (
  outcome: 'completed' | 'stochastic' | 'depthCap' | 'failed',
): PolicyPreviewTraceOutcome => {
  switch (outcome) {
    case 'completed':
      return 'ready';
    case 'stochastic':
      return 'stochastic';
    case 'depthCap':
      return 'depthCap';
    case 'failed':
      return 'failed';
  }
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

const previewGlobalSlotsForRef = (
  catalog: AgentPolicyCatalog,
  def: GameDef,
  ref: CompiledAgentPolicyRef,
): readonly string[] | undefined => {
  if (ref.kind === 'previewSurface') {
    if (ref.family === 'globalVar' && ref.selector === undefined) {
      return [`global.${ref.id}`];
    }
    if (ref.family === 'victoryCurrentMargin' || ref.family === 'victoryCurrentRank') {
      return def.globalVars.map((variable) => `global.${variable.name}`);
    }
    return undefined;
  }
  if (ref.kind !== 'library' || ref.refKind !== 'previewStateFeature') {
    return undefined;
  }
  const feature = catalog.compiled.stateFeatures[ref.id];
  const exprRef = feature?.expr.kind === 'ref' ? feature.expr.ref : undefined;
  if (exprRef?.kind === 'currentSurface' && exprRef.family === 'globalVar' && exprRef.selector === undefined) {
    return [`global.${exprRef.id}`];
  }
  return feature === undefined
    ? undefined
    : [`feature.${ref.id}`, ...def.globalVars.map((variable) => `global.${variable.name}`)];
};

const groupPreviewCandidatesByAction = (
  candidates: readonly PolicyWasmScoreRoutingCandidate[],
): readonly (readonly PolicyWasmProductionPreviewDriveCandidate[])[] => {
  return candidates.flatMap((candidate) => (
    candidate.previewOutcome === 'gated'
      ? []
      : [[{
      move: candidate.move,
      stableMoveKey: candidate.stableMoveKey,
      actionId: candidate.actionId,
    }]]
  ));
};

const materializePreviewDynamicRowsWithWasm = (
  input: {
    readonly runtime: PolicyWasmRuntime;
    readonly def: GameDef;
    readonly state: GameState;
    readonly evaluation: PolicyEvaluationContext;
    readonly catalog: AgentPolicyCatalog;
    readonly profileId: string;
    readonly profile: NonNullable<AgentPolicyCatalog['profiles'][string]>;
    readonly seatId: string;
    readonly candidates: readonly PolicyWasmScoreRoutingCandidate[];
  },
  refs: readonly CompiledAgentPolicyRef[],
): readonly PolicyWasmPrecomputedDynamicCandidateFeature[] => {
  if (refs.length === 0) {
    return [];
  }
  const slotsByCode = new Map<number, readonly string[]>();
  for (const ref of refs) {
    const slots = previewGlobalSlotsForRef(input.catalog, input.def, ref);
    if (slots === undefined || slots.length === 0) {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Policy WASM production preview-drive route failed closed for profile "${input.profileId}": unsupported preview ref.`,
        detail: {
          route: 'wasmProductionPreviewDriveRows',
          profileId: input.profileId,
          seatId: input.seatId,
          candidateCount: input.candidates.length,
          unsupportedRowClass: 'unsupported preview-drive ref',
          unsupportedRef: ref,
        },
      });
    }
    slotsByCode.set(previewDynamicRefCode(ref), slots);
  }

  const previewStateSlots = [...new Set([...slotsByCode.values()].flat())].sort((left, right) => left.localeCompare(right));
  const rowsByKey = new Map<string, {
    readonly outcome: PolicyPreviewTraceOutcome;
    readonly depth: number;
    readonly previewStateValues?: Readonly<Record<string, number>>;
  }>();
  for (const group of groupPreviewCandidatesByAction(input.candidates)) {
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: input.runtime,
      def: input.def,
      state: input.state,
      profileId: input.profileId,
      originSeatId: input.seatId,
      originTurnId: input.state.turnCount,
      depthCap: input.profile.preview.completionDepthCap ?? 6,
      previewStateSlots,
      candidates: group,
    });
    if (result.kind !== 'supported') {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Policy WASM production preview-drive route failed closed for profile "${input.profileId}": ${result.reason}.`,
        detail: {
          route: 'wasmProductionPreviewDriveRows',
          profileId: input.profileId,
          seatId: input.seatId,
          candidateCount: group.length,
          unsupportedDriveClass: result.unsupportedDriveClass,
          unsupportedOwner: result.unsupportedOwner,
          unsupportedRowClass: result.reason,
        },
      });
    }
    for (const row of result.rows) {
      rowsByKey.set(row.stableMoveKey, {
        outcome: previewTraceOutcomeFromWasm(row.outcome),
        depth: row.depth,
        ...(row.previewStateValues === undefined ? {} : { previewStateValues: row.previewStateValues }),
      });
    }
  }

  return refs.map((ref) => {
    const code = previewDynamicRefCode(ref);
    const slots = slotsByCode.get(code)!;
    return {
      code,
      values: input.candidates.map((candidate) => {
        const refId = ref.kind === 'previewSurface'
          ? `preview.${ref.family}.${ref.id}`
          : ref.kind === 'library' && ref.refKind === 'previewStateFeature'
            ? `feature.${ref.id}`
            : `preview.${code}`;
        candidate.previewRefIds.add(refId);
        if (candidate.previewOutcome === 'gated') {
          candidate.unknownPreviewRefs.set(refId, 'gated');
          return undefined;
        }
        const row = rowsByKey.get(candidate.stableMoveKey);
        if (row === undefined) {
          candidate.previewOutcome = 'failed';
          candidate.previewFailureReason = 'wasmProductionPreviewDriveMissingRow';
          candidate.unknownPreviewRefs.set(refId, 'failed');
          return undefined;
        }
        candidate.previewOutcome = row.outcome;
        candidate.previewDriveDepth = row.depth;
        candidate.previewCompletionPolicy = input.profile.preview.completion ?? 'greedy';
        if (row.outcome !== 'ready' && row.outcome !== 'stochastic') {
          candidate.previewFailureReason = row.outcome === 'failed' ? 'wasmProductionPreviewDriveFailed' : row.outcome;
          candidate.unknownPreviewRefs.set(refId, row.outcome);
          return undefined;
        }
        return previewValueFromWasmRow(input, ref, row.previewStateValues, slots);
      }),
    };
  });
};

const previewValueFromWasmRow = (
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly seatId: string;
  },
  ref: CompiledAgentPolicyRef,
  previewStateValues: Readonly<Record<string, number>> | undefined,
  slots: readonly string[],
): PolicyValue => {
  if (previewStateValues === undefined) {
    return undefined;
  }
  if (ref.kind === 'previewSurface' && ref.family === 'globalVar') {
    return previewStateValues[slots[0]!];
  }
  if (ref.kind === 'library' && ref.refKind === 'previewStateFeature') {
    return previewStateValues[slots[0]!];
  }
  if (ref.kind !== 'previewSurface' || (ref.family !== 'victoryCurrentMargin' && ref.family !== 'victoryCurrentRank')) {
    return undefined;
  }
  if (ref.selector?.kind !== 'role') {
    return undefined;
  }
  const previewGlobalVars = { ...input.state.globalVars };
  for (const slot of slots) {
    const id = slot.startsWith('global.') ? slot.slice('global.'.length) : undefined;
    const value = previewStateValues[slot];
    if (id !== undefined && value !== undefined) {
      previewGlobalVars[id] = value;
    }
  }
  const previewState = { ...input.state, globalVars: previewGlobalVars };
  const resolvedSeatId = resolvePolicyRoleSelector(input.def, previewState, ref.selector, input.seatId, undefined);
  if (resolvedSeatId === undefined) {
    return undefined;
  }
  const victorySurface = buildPolicyVictorySurface(input.def, previewState);
  return ref.family === 'victoryCurrentMargin'
    ? victorySurface.marginBySeat.get(resolvedSeatId)
    : victorySurface.rankBySeat.get(resolvedSeatId);
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
      precomputedDynamicCandidateFeatures: materializePreviewDynamicRowsWithWasm(
        input,
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
      if (candidate.previewOutcome === undefined) {
        input.evaluation.finalizePreviewOutcome(candidate);
      }
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
