import type { PlayerId } from '../kernel/branded.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type {
  AgentPolicyCatalog,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  GameDef,
  GameState,
  Move,
} from '../kernel/types.js';
import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import type { PolicyPreviewTraceOutcome } from './policy-preview.js';
import type { PolicyValue } from './policy-surface.js';
import {
  evaluateDynamicCandidateFeatureRows,
  previewDynamicRefCode,
  seatContextIdsForPreviewDynamicRefs,
} from './policy-wasm-dynamic-candidate-feature-rows.js';
import {
  definePolicyWasmProductionPreviewStateSlots,
  evaluateProductionPreviewDriveBatchWithWasm,
  type PolicyWasmProductionPreviewDriveCandidate,
} from './policy-wasm-production-preview-drive.js';
import type { PolicyWasmPreviewStatus } from './policy-wasm-preview-drive.js';
import {
  evaluateWasmCandidateFeatureRow,
  evaluateWasmMoveConsiderationScoreRows,
  recordProductionPolicyWasmPreviewCandidateFeatureRowOracleFallback,
  recordProductionPolicyWasmPreviewDrive,
  recordProductionPolicyWasmPreviewCandidateFeatureRows,
  recordProductionPolicyWasmScoreRows,
  type PolicyWasmPrecomputedDynamicCandidateFeature,
  type PolicyWasmPreviewOutcome,
  type PolicyWasmRuntime,
} from './policy-wasm-runtime.js';

/*
 * Spec 175 WASM/TS fallback contract:
 *
 * This file routes policy scoring through the WASM module when supported.
 * WASM-side branches that detect an unsupported preview-drive shape must return
 * null, or this function's typed fallback sentinel, so the caller can run the
 * TypeScript evaluator. That TypeScript fallback is the correctness oracle for
 * unsupported shapes; do not throw from unsupported-detection branches when a
 * fallback is available.
 *
 * Throws are reserved for genuine contract violations such as unknown policy
 * ids, unknown candidate-feature ids, and corrupt codec/ABI output. Those
 * throws carry the contract-violation marker adjacent to the throw, while
 * unsupported fallback branches carry the null-return marker adjacent to the
 * fallback return. The marker convention is enforced by
 * packages/engine/test/architecture/policy-wasm-throw-contract.test.ts.
 *
 * Reference: archive/specs/175-wasm-ts-fallback-contract-enforcement.md.
 */

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
  // @policy-wasm-throw: contract-violation
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

const previewTraceOutcomeFromWasmStatus = (
  status: PolicyWasmPreviewStatus,
): PolicyPreviewTraceOutcome => status === 'ready' ? 'ready' : status;

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
  seatContextIds: readonly string[] = [],
): readonly string[] | undefined => {
  if (ref.kind === 'previewSurface') {
    if (ref.family === 'globalVar' && ref.selector === undefined) {
      return [`global.${ref.id}`];
    }
    if (ref.family === 'victoryCurrentMargin' || ref.family === 'victoryCurrentRank') {
      if (ref.selector?.kind !== 'role') {
        return undefined;
      }
      const seatTokens = ref.selector.seatToken === '$seat'
        ? seatContextIds
        : [ref.selector.seatToken];
      return [
        ...seatTokens.map((seatToken) => `surface.${ref.family}.${seatToken}`),
        ...def.globalVars.map((variable) => `global.${variable.name}`),
      ];
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

const compareOrdinalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const groupPreviewCandidatesByAction = (
  candidates: readonly PolicyWasmScoreRoutingCandidate[],
): readonly (readonly PolicyWasmProductionPreviewDriveCandidate[])[] => {
  const groups = new Map<string, PolicyWasmScoreRoutingCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.previewOutcome === 'gated') {
      continue;
    }
    const group = groups.get(candidate.actionId);
    if (group === undefined) {
      groups.set(candidate.actionId, [candidate]);
    } else {
      group.push(candidate);
    }
  }
  return [...groups.entries()].map(([actionId, group]) =>
    group.map((candidate, ordinalInGroup) => ({
      move: candidate.move,
      stableMoveKey: candidate.stableMoveKey,
      actionId: candidate.actionId,
      candidateGroup: {
        groupId: `action:${actionId}`,
        ordinalInGroup,
        groupSize: group.length,
      },
    })));
};

const policyWasmBytecodeCacheAxisLabel = (
  profile: NonNullable<AgentPolicyCatalog['profiles'][string]>,
  candidates: readonly PolicyWasmScoreRoutingCandidate[],
): string => {
  return policyWasmAxisLabelFromActionIds(profile, candidates.map((candidate) => candidate.actionId));
};

const policyWasmAxisLabelFromActionIds = (
  profile: NonNullable<AgentPolicyCatalog['profiles'][string]>,
  actionIdsRaw: readonly string[],
): string => {
  const actionIds = [...new Set(actionIdsRaw)].sort(compareOrdinalStrings);
  const microturnClass = actionIds.length === 1 ? actionIds[0]! : 'actionSelection';
  const previewBranch = profile.preview.inner?.strategy === 'continuedDeepening'
    ? 'continuedDeepening'
    : 'none';
  return `${microturnClass}|${previewBranch}`;
};

const hasCardEventActionCandidate = (
  def: GameDef,
  candidates: readonly PolicyWasmScoreRoutingCandidate[],
): boolean => {
  const actionById = new Map(def.actions.map((action) => [String(action.id), action]));
  return candidates.some((candidate) =>
    actionById.get(candidate.actionId)?.capabilities?.includes('cardEvent') === true,
  );
};

const materializePreviewDynamicRowsWithWasm = (
  input: {
    readonly runtime: PolicyWasmRuntime;
    readonly gameDefRuntime?: GameDefRuntime;
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
): readonly PolicyWasmPrecomputedDynamicCandidateFeature[] | null => {
  if (refs.length === 0) {
    return [];
  }
  if (hasCardEventActionCandidate(input.def, input.candidates)) {
    // Card-event candidates require event-card runtime context outside the bounded
    // production preview-drive action route, so Spec 175 TS fallback remains the oracle.
    recordProductionPolicyWasmPreviewDrive('unsupported', {
      unsupportedDriveClass: 'unsupported-effect',
      unsupportedOwner: 'production-preview-drive.cardEventAction',
      reason: 'production preview-drive does not route card event action candidates',
    });
    // @policy-wasm-unsupported: null-return
    return null;
  }
  const seatContextIds = seatContextIdsForPreviewDynamicRefs(input.def, refs, compareOrdinalStrings);
  const slotsByCode = new Map<number, readonly string[]>();
  for (const ref of refs) {
    const slots = previewGlobalSlotsForRef(input.catalog, input.def, ref, seatContextIds);
    if (slots === undefined || slots.length === 0) {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      // @policy-wasm-unsupported: null-return
      return null;
    }
    slotsByCode.set(previewDynamicRefCode(ref), slots);
  }

  const previewStateSlots = definePolicyWasmProductionPreviewStateSlots(
    [...new Set([...slotsByCode.values()].flat())].sort(compareOrdinalStrings),
  );
  const rowsByKey = new Map<string, {
    readonly outcome: PolicyPreviewTraceOutcome;
    readonly depth: number;
    readonly previewStateValues?: Readonly<Record<string, number>>;
  }>();
  for (const group of groupPreviewCandidatesByAction(input.candidates)) {
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: input.runtime,
      ...(input.gameDefRuntime === undefined ? {} : { gameDefRuntime: input.gameDefRuntime }),
      def: input.def,
      state: input.state,
      profileId: input.profileId,
      originSeatId: input.seatId,
      originTurnId: input.state.turnCount,
      depthCap: input.profile.preview.completionDepthCap ?? 6,
      previewBranch: input.profile.preview.inner?.strategy === 'continuedDeepening'
        ? 'continuedDeepening'
        : 'greedy',
      ...(input.profile.preview.grantFlowContinuation === undefined
        ? {}
        : { grantFlowContinuation: input.profile.preview.grantFlowContinuation }),
      serializationAxisLabel: policyWasmAxisLabelFromActionIds(input.profile, group.map((candidate) => candidate.actionId ?? String(candidate.move.actionId))),
      previewStateSlots,
      candidates: group,
    });
    if (result.kind !== 'supported') {
      recordProductionPolicyWasmPreviewDrive('unsupported', {
        unsupportedDriveClass: result.unsupportedDriveClass,
        ...(result.unsupportedOwner === undefined ? {} : { unsupportedOwner: result.unsupportedOwner }),
        reason: result.reason,
      });
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      // @policy-wasm-unsupported: null-return
      return null;
    }
    recordProductionPolicyWasmPreviewDrive('supported');
    for (const row of result.rows) {
      rowsByKey.set(row.stableMoveKey, {
        outcome: previewTraceOutcomeFromWasmStatus(row.previewSignalCarrier.previewStatus),
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
        candidate.previewDrive = {
          depth: row.depth,
          completionPolicy: input.profile.preview.completion ?? 'greedy',
          syntheticDecisions: [],
        };
        if (row.outcome !== 'ready' && row.outcome !== 'stochastic') {
          candidate.previewFailureReason = row.outcome === 'failed' ? 'wasmProductionPreviewDriveFailed' : row.outcome;
          candidate.unknownPreviewRefs.set(refId, row.outcome);
          return undefined;
        }
        const value = previewValueFromWasmRow(input, ref, row.previewStateValues, slots);
        input.evaluation.recordResolvedPreviewRefValue(candidate, refId, value);
        return value;
      }),
      ...(seatContextIds.length === 0 ? {} : {
        seatContextValues: Object.fromEntries(seatContextIds.map((seatContext) => [
          seatContext,
          input.candidates.map((candidate) => {
            const row = rowsByKey.get(candidate.stableMoveKey);
            return row === undefined
              ? undefined
              : previewValueFromWasmRow(input, ref, row.previewStateValues, slots, seatContext);
          }),
        ])),
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
  seatContext?: string,
): PolicyValue => {
  if (previewStateValues === undefined) {
    return undefined;
  }
  if (ref.kind === 'previewSurface' && ref.family === 'globalVar') {
    return previewStateValues[slots[0]!];
  }
  if (ref.kind === 'previewSurface' && (ref.family === 'victoryCurrentMargin' || ref.family === 'victoryCurrentRank')) {
    const slot = ref.selector?.kind === 'role' && ref.selector.seatToken === '$seat' && seatContext !== undefined
      ? `surface.${ref.family}.${seatContext}`
      : slots[0]!;
    return previewStateValues[slot];
  }
  if (ref.kind === 'library' && ref.refKind === 'previewStateFeature') {
    return previewStateValues[slots[0]!];
  }
  return undefined;
};

/**
 * Spec 175 fallback contract: the WASM production preview drive can return
 * undefined for preview refs on actions whose state-mutation shape the drive
 * does not yet model. Downstream `coalesce(preview, fallback)` then resolves to
 * the state-feature fallback instead of the projected value, and the
 * WASM-precomputed candidate-feature row diverges from the TS oracle. When that
 * candidate feature is read by an aggregate the profile's considerations
 * consume, the divergence propagates into the WASM score-row stream.
 *
 * Aggregate-fed preview candidate-feature rows must remain byte-equivalent even
 * when the production preview drive reports a non-ready value for one candidate.
 * The row-local oracle fallback below preserves the Spec 175 TS oracle without
 * bypassing supported preview-drive rows for the whole aggregate-fed feature.
 */
const candidateFeatureFeedsPlanAggregate = (
  profile: NonNullable<AgentPolicyCatalog['profiles'][string]>,
  catalog: AgentPolicyCatalog,
  featureId: string,
): boolean => {
  for (const aggregateId of profile.plan.candidateAggregates) {
    const aggregate = catalog.compiled.candidateAggregates[aggregateId];
    if (aggregate === undefined) {
      continue;
    }
    if (aggregate.dependencies.candidateFeatures.includes(featureId)) {
      return true;
    }
  }
  return false;
};

const shouldUseTsOracleForPreviewCandidateFeatureRow = (
  candidate: PolicyWasmScoreRoutingCandidate,
  value: PolicyValue,
): boolean =>
  value === undefined
  || (candidate.previewOutcome !== undefined
    && candidate.previewOutcome !== 'ready'
    && candidate.previewOutcome !== 'stochastic');

const applyAggregatePreviewCandidateFeatureRowOracle = (
  input: {
    readonly evaluation: PolicyEvaluationContext;
    readonly candidates: readonly PolicyWasmScoreRoutingCandidate[];
  },
  featureId: string,
  values: readonly PolicyValue[],
): readonly PolicyValue[] =>
  values.map((value, index) => {
    const candidate = input.candidates[index]!;
    if (!shouldUseTsOracleForPreviewCandidateFeatureRow(candidate, value)) {
      return value;
    }
    recordProductionPolicyWasmPreviewCandidateFeatureRowOracleFallback();
    return input.evaluation.evaluateCandidateFeature(candidate, featureId);
  });

export function tryScoreMoveConsiderationsWithWasm(input: {
  readonly runtime: PolicyWasmRuntime;
  readonly gameDefRuntime?: GameDefRuntime;
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
      // @policy-wasm-throw: contract-violation
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
  const bytecodeCacheAxisLabel = policyWasmBytecodeCacheAxisLabel(input.profile, input.candidates);
  const candidateFeatureRows: {
    readonly id: string;
    readonly costClass: string;
    readonly values: readonly PolicyValue[];
  }[] = [];
  for (const id of input.profile.plan.candidateFeatures) {
    const feature = input.catalog.compiled.candidateFeatures[id];
    if (feature === undefined) {
      // @policy-wasm-throw: contract-violation
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
    const aggregateFedPreviewFeature = candidateFeatureFeedsPlanAggregate(input.profile, input.catalog, id);
    const precomputedDynamicCandidateFeatures = materializePreviewDynamicRowsWithWasm(
      input,
      collectPreviewDynamicRefs(feature.expr),
    );
    if (precomputedDynamicCandidateFeatures === null) {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      const values = input.candidates.map((candidate) => {
        const value = encodeWasmPrecomputedPolicyValue(input.evaluation.evaluateCandidateFeature(candidate, id));
        if (candidate.previewOutcome === undefined) {
          input.evaluation.finalizePreviewOutcome(candidate);
        }
        return value;
      });
      candidateFeatureRows.push({
        id,
        costClass: feature.costClass,
        values,
      });
      continue;
    }
    const rawValues = evaluateDynamicCandidateFeatureRows({
      def: input.def,
      state: input.state,
      seatId: input.seatId,
      candidateCount: input.candidates.length,
    }, feature.expr, precomputedDynamicCandidateFeatures)
      ?? evaluateWasmCandidateFeatureRow(input.runtime, {
      def: input.def,
      encoded: input.encodedView.encoded,
      context: {
        def: input.def,
        layout: input.encodedView.layout,
        state: input.state,
        playerId: Number(input.playerId),
        ...(input.gameDefRuntime === undefined ? {} : {
          gameDefRuntime: input.gameDefRuntime,
          bytecodeInputCache: input.gameDefRuntime.policyWasmBytecodeInputCache,
          bytecodeStateWordsCache: input.gameDefRuntime.policyWasmBytecodeStateWordsCache,
        }),
        timingRouteClass: 'previewCandidateFeatureRows',
        bytecodeCacheAxisLabel,
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
      precomputedDynamicCandidateFeatures,
    });
    if (rawValues === null) {
      recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported');
      // @policy-wasm-unsupported: null-return
      return false;
    }
    const values = aggregateFedPreviewFeature
      ? applyAggregatePreviewCandidateFeatureRowOracle(input, id, rawValues)
      : rawValues;
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
      ...(input.gameDefRuntime === undefined ? {} : {
        gameDefRuntime: input.gameDefRuntime,
        bytecodeInputCache: input.gameDefRuntime.policyWasmBytecodeInputCache,
        bytecodeStateWordsCache: input.gameDefRuntime.policyWasmBytecodeStateWordsCache,
      }),
      timingRouteClass: 'scoreRows',
      bytecodeCacheAxisLabel,
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
    // @policy-wasm-unsupported: null-return
    return false;
  }
  recordProductionPolicyWasmScoreRows('supported');

  const scoresByKey = new Map(result.rows.map((row) => [row.stableMoveKey, row.score]));
  const scheduleFallbackByKey = new Map(result.rows
    .filter((row) => row.scheduleFallbackFired !== undefined)
    .map((row) => [row.stableMoveKey, row.scheduleFallbackFired!]));
  for (const candidate of input.candidates) {
    const score = scoresByKey.get(candidate.stableMoveKey);
    if (score === undefined) {
      // @policy-wasm-throw: contract-violation
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
    const scheduleFallbackFired = scheduleFallbackByKey.get(candidate.stableMoveKey);
    if (scheduleFallbackFired !== undefined) {
      candidate.scheduleFallbackFired = scheduleFallbackFired;
    }
  }
  return true;
}
