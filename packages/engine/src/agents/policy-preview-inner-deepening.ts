import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import type { DeepTrigger, SyntheticDecisionTraceEntry } from '../kernel/types.js';
import {
  publishMicroturn,
} from '../kernel/microturn/publish.js';
import {
  buildPolicyVictorySurface,
  type SurfaceResolutionContext,
} from './policy-surface.js';
import {
  emptyOutcomeBreakdown,
  incrementOutcome,
  previewOptionRefKey,
  resolveRefs,
  type DriveResult,
} from './policy-preview-inner.js';
import {
  continueChooseNStepInnerPreviewDrive,
  syntheticDecisionTraceEntry,
  type ChooseNStepInnerPreviewResult,
  type ChooseNStepInnerPreviewRun,
  type RunChooseNStepInnerPreviewInput,
} from './policy-preview-inner-choosenstep.js';
import {
  pickInnerDecision,
} from './policy-preview.js';
import { lowerPolicyWasmDeepContinuationDecision } from './policy-wasm-preview-choosenstep-continuation.js';
import { tryMaterializePolicyWasmPreviewStatePatch } from './policy-wasm-preview-drive-state-patch.js';
import {
  getInitializedPolicyWasmRuntime,
  recordProductionPolicyWasmPreviewDrive,
  type PolicyWasmPreviewDriveUnsupportedDetail,
} from './policy-wasm-runtime.js';

/*
 * Spec 175 WASM/TS fallback contract:
 *
 * This file is the production preview-drive entry point that calls into the
 * WASM routing layer. WASM-side unsupported-detection branches return null, or
 * an equivalent typed unsupported sentinel, and callers here must treat that as
 * a signal to invoke the TypeScript fallback evaluator. The TypeScript fallback
 * is the correctness oracle for unsupported shapes; null is not a fatal
 * condition when the fallback is available.
 *
 * See policy-wasm-score-routing.ts for the full source-level contract and the
 * marker convention enforced by
 * packages/engine/test/architecture/policy-wasm-throw-contract.test.ts.
 *
 * Reference: archive/specs/175-wasm-ts-fallback-contract-enforcement.md.
 */

export interface DeepeningRunResult {
  readonly run: ChooseNStepInnerPreviewRun;
  readonly triggerFired?: DeepTrigger;
}

export interface PreviewDerivedTriggerTerm {
  readonly id: string;
  readonly refIds: readonly string[];
}

export interface PreviewDerivedTriggerOption {
  readonly stableMoveKey: string;
  readonly unavailableRefs: ReadonlyMap<string, string>;
  readonly contributionByTermId: ReadonlyMap<string, number>;
}

export interface PreviewDerivedTriggerSignals {
  readonly refIds: readonly string[];
  readonly terms: readonly PreviewDerivedTriggerTerm[];
  readonly options: readonly PreviewDerivedTriggerOption[];
}

const optionSignalsFor = (
  signals: PreviewDerivedTriggerSignals,
  stableMoveKey: string,
): PreviewDerivedTriggerOption | undefined =>
  signals.options.find((option) => option.stableMoveKey === stableMoveKey);

const refStatus = (
  option: ChooseNStepInnerPreviewResult,
  signals: PreviewDerivedTriggerSignals,
  refId: string,
): { readonly kind: 'ready' } | { readonly kind: 'unavailable'; readonly reason: string } | undefined => {
  const status = option.resolvedRefs.get(refId);
  if (status !== undefined) {
    return status.kind === 'ready' ? { kind: 'ready' } : status;
  }
  const reason = optionSignalsFor(signals, option.stableMoveKey)?.unavailableRefs.get(refId);
  return reason === undefined ? undefined : { kind: 'unavailable', reason };
};

const allRequestedRefsDepthCapped = (
  run: ChooseNStepInnerPreviewRun,
  signals: PreviewDerivedTriggerSignals,
): boolean => signals.refIds.length > 0
  && run.options.length > 0
  && run.options.every((option) => signals.refIds.every((refId) => {
    const status = refStatus(option, signals, refId);
    return status?.kind === 'unavailable' && status.reason === 'depthCap';
  }));

// Spec 164/165 define uniformity over post-expression numeric contribution,
// not over raw preview-derived ref identity.
const allReadyValuesUniform = (
  run: ChooseNStepInnerPreviewRun,
  signals: PreviewDerivedTriggerSignals,
): boolean => {
  if (signals.terms.length === 0 || run.options.length === 0) {
    return false;
  }
  for (const term of signals.terms) {
    let contribution: number | undefined;
    for (const option of run.options) {
      const optionSignals = optionSignalsFor(signals, option.stableMoveKey);
      if (
        optionSignals === undefined
        || term.refIds.some((refId) => refStatus(option, signals, refId)?.kind === 'unavailable')
      ) {
        return false;
      }
      const nextContribution = optionSignals.contributionByTermId.get(term.id) ?? 0;
      if (contribution !== undefined && contribution !== nextContribution) {
        return false;
      }
      contribution = nextContribution;
    }
  }
  return true;
};

const firedTrigger = (
  run: ChooseNStepInnerPreviewRun,
  signals: PreviewDerivedTriggerSignals,
  triggers: readonly DeepTrigger[],
): DeepTrigger | undefined => {
  for (const trigger of triggers) {
    if (trigger === 'allRequestedRefsDepthCapped' && allRequestedRefsDepthCapped(run, signals)) {
      return trigger;
    }
    if (trigger === 'allReadyValuesUniform' && allReadyValuesUniform(run, signals)) {
      return trigger;
    }
  }
  return undefined;
};

const offsetSyntheticDecisions = (
  broad: ChooseNStepInnerPreviewResult,
  deep: DriveResult,
): DriveResult => ({
  ...deep,
  syntheticDecisions: [
    ...broad.previewDrive.syntheticDecisions,
    ...deep.syntheticDecisions.map((entry, index) => ({
      ...entry,
      depth: broad.previewDrive.syntheticDecisions.length + index + 1,
    })),
  ],
  completionPolicyFallbackCount: broad.completionPolicyFallbackCount + deep.completionPolicyFallbackCount,
});

const resolveDeepOption = (
  input: RunChooseNStepInnerPreviewInput,
  broad: ChooseNStepInnerPreviewResult,
  drive: DriveResult,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): ChooseNStepInnerPreviewResult => {
  const resolved = resolveRefs(input, drive, surfaceContext, seatResolutionIndex);
  const outcome = resolved.hidden ? 'hidden' : drive.outcome;
  const withOutcome = new Map(resolved.refs);
  for (const ref of input.refs) {
    if (ref.refKind === 'outcome') {
      withOutcome.set(previewOptionRefKey(ref), { kind: 'ready', value: outcome });
    }
  }
  return {
    decision: broad.decision,
    stableMoveKey: broad.stableMoveKey,
    state: drive.state,
    resolvedRefs: withOutcome,
    driveDepth: drive.depth,
    outcome,
    previewDrive: {
      depth: drive.depth,
      completionPolicy: drive.completionPolicy,
      syntheticDecisions: drive.syntheticDecisions,
    },
    completionPolicyFallbackCount: drive.completionPolicyFallbackCount,
    continuationBeam: broad.continuationBeam,
  };
};

const continueChooseNStepInnerPreviewDriveWithWasm = (
  input: RunChooseNStepInnerPreviewInput,
  stateAfterRoot: ChooseNStepInnerPreviewResult['state'],
  initialDepth: number,
): { readonly kind: 'supported'; readonly drive: DriveResult } | { readonly kind: 'unsupported'; readonly detail: PolicyWasmPreviewDriveUnsupportedDetail } => {
  const runtime = getInitializedPolicyWasmRuntime();
  if (runtime === null) {
    return unsupportedWasmDeepDrive(
      'unknown',
      'production-deep-choosenstep-continuation.runtime',
      'no initialized policy WASM runtime',
    );
  }
  const depthCap = input.depthCap ?? input.profile.preview.inner?.depthCap ?? input.profile.preview.completionDepthCap ?? 1;
  const completionPolicy = input.completionPolicy ?? input.profile.preview.completion ?? 'policyGuided';
  const fallbackCompletionPolicy = input.fallbackCompletionPolicy ?? input.profile.preview.fallbackCompletionPolicy ?? 'greedy';
  const syntheticDecisions: SyntheticDecisionTraceEntry[] = [];
  let completionPolicyFallbackCount = 0;
  let producedProjectedState = false;
  const finish = (
    state: ChooseNStepInnerPreviewResult['state'],
    depth: number,
    outcome: DriveResult['outcome'],
    boundaryKind: string,
  ): { readonly kind: 'supported'; readonly drive: DriveResult } | { readonly kind: 'unsupported'; readonly detail: PolicyWasmPreviewDriveUnsupportedDetail } => producedProjectedState
    ? {
        kind: 'supported',
        drive: {
          state,
          depth,
          outcome,
          completionPolicy,
          syntheticDecisions: [...syntheticDecisions],
          completionPolicyFallbackCount,
        },
      }
    // Reaching a terminal/seat boundary before projected-state materialization is
    // an expected deep-continuation boundary, not a missing mutation handler.
    : unsupportedWasmDeepDrive(
        'unknown',
        'production-deep-choosenstep-continuation.projectedState',
        'deep preview-drive reached a terminal boundary before materializing a WASM projected state',
        {
          projectedStateBoundaryKind: boundaryKind,
          projectedStateClassification: 'expected-terminal-boundary',
        },
      );
  let state = stateAfterRoot;
  let depth = initialDepth;

  while (true) {
    const microturn = publishMicroturn(input.def, state, input.runtime);
    if (
      microturn.kind === 'actionSelection'
      || microturn.kind === 'outcomeGrantResolve'
      || microturn.kind === 'turnRetirement'
      || microturn.seatId !== input.microturn.seatId
      || microturn.turnId !== input.microturn.turnId
    ) {
      const boundaryKind = microturn.seatId !== input.microturn.seatId || microturn.turnId !== input.microturn.turnId
        ? 'seat-or-turn-boundary'
        : microturn.kind;
      return finish(state, depth, 'ready', boundaryKind);
    }
    if (microturn.kind === 'stochasticResolve') {
      return finish(state, depth, 'stochastic', 'stochasticResolve');
    }
    if (depth >= depthCap) {
      return finish(state, depth, 'depthCap', 'depthCap');
    }

    const nextDecisionResult = pickInnerDecision(
      state,
      input.def,
      microturn,
      completionPolicy,
      fallbackCompletionPolicy,
      {
        def: input.def,
        state: input.state,
        playerId: input.playerId,
        seatId: input.seatId,
        trustedMoveIndex: new Map(),
        previewMode: input.profile.preview.mode,
        completionPolicy,
        fallbackCompletionPolicy,
        completionDepthCap: depthCap,
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
        policyGuidedDeps: {
          catalog: input.catalog,
          profile: input.profile,
        },
      },
    );
    const nextDecision = nextDecisionResult.decision;
    if (nextDecisionResult.usedFallback) {
      completionPolicyFallbackCount += 1;
    }
    if (nextDecision === undefined) {
      return unsupportedWasmDeepDrive(
        'agent-guided-completion',
        'production-deep-choosenstep-continuation.pickInnerDecision',
        'deep preview-drive completion policy did not select a materializable continuation decision',
      );
    }
    if (
      (microturn.kind !== 'chooseOne' && microturn.kind !== 'chooseNStep')
      || (nextDecision.kind !== 'chooseOne' && nextDecision.kind !== 'chooseNStep')
    ) {
      return unsupportedWasmDeepDrive(
        'agent-guided-completion',
        'production-deep-choosenstep-continuation.pickInnerDecision',
        'deep preview-drive selected an unsupported continuation decision kind',
      );
    }
    const lowered = lowerPolicyWasmDeepContinuationDecision({
      state,
      microturn: microturn as Parameters<typeof lowerPolicyWasmDeepContinuationDecision>[0]['microturn'],
      decision: nextDecision,
      initialValue: 0,
    });
    if (lowered.kind !== 'supported') {
      return unsupportedWasmDeepDrive(lowered.unsupportedClass, lowered.owner, lowered.reason);
    }
    const result = runtime.evaluatePreviewDriveBatch({
      profileId: 'production-deep-choosenstep-continuation',
      serializationAxisLabel: 'production-deep-choosenstep-continuation|continuedDeepening',
      originSeatId: microturn.seatId,
      originTurnId: microturn.turnId,
      depthCap,
      candidates: [lowered.candidate],
      steps: [],
      materializeStatePatch: true,
    });
    if (result.kind !== 'supported') {
      return unsupportedWasmDeepDrive(result.unsupportedDriveClass, result.unsupportedOwner, result.reason);
    }
    const patch = result.rows[0]?.statePatch;
    if (patch === undefined) {
      return unsupportedWasmDeepDrive(
        'unsupported-effect',
        'production-deep-choosenstep-continuation.statePatch',
        'WASM chooseNStep continuation did not return a materialized state patch',
      );
    }
    const traceEntry = syntheticDecisionTraceEntry(
      nextDecision,
      syntheticDecisions.length + 1,
      nextDecisionResult.usedFallback ? 'greedy' : completionPolicy,
    );
    if (traceEntry !== undefined) {
      syntheticDecisions.push(traceEntry);
    }
    const materialized = tryMaterializePolicyWasmPreviewStatePatch({
      def: input.def,
      state,
      patch,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    });
    if (materialized === null) {
      return unsupportedWasmDeepDrive(
        'unsupported-effect',
        'production-deep-choosenstep-continuation.statePatch',
        'WASM chooseNStep continuation state patch reached a non-constructible preview continuation',
      );
    }
    state = materialized.state;
    producedProjectedState = true;
    depth += 1;
  }
};

const unsupportedWasmDeepDrive = (
  unsupportedDriveClass: NonNullable<PolicyWasmPreviewDriveUnsupportedDetail['unsupportedDriveClass']>,
  unsupportedOwner: string | undefined,
  reason: string,
  detail: Partial<PolicyWasmPreviewDriveUnsupportedDetail> = {},
): { readonly kind: 'unsupported'; readonly detail: PolicyWasmPreviewDriveUnsupportedDetail } => ({
  kind: 'unsupported',
  detail: {
    unsupportedDriveClass,
    ...(unsupportedOwner === undefined ? {} : { unsupportedOwner }),
    reason,
    ...detail,
  },
});

export const runDeepPass = (
  input: RunChooseNStepInnerPreviewInput,
  broadRun: ChooseNStepInnerPreviewRun,
  triggerSignals: PreviewDerivedTriggerSignals,
): DeepeningRunResult => {
  const config = input.profile.preview.inner?.continuedDeepening;
  if (config === undefined) {
    return { run: broadRun };
  }
  const triggerFired = firedTrigger(broadRun, triggerSignals, config.deep.trigger);
  if (triggerFired === undefined) {
    return { run: broadRun };
  }

  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
  const surfaceContext: SurfaceResolutionContext = {
    def: input.def,
    seatResolutionIndex,
    resolveDerivedMetric(state, metricId) {
      return computeDerivedMetricValue(input.def, state, metricId);
    },
    resolveVictorySurface(state) {
      return buildPolicyVictorySurface(input.def, state, input.runtime);
    },
  };
  const options = broadRun.options.map((option) => {
    const wasmDrive = continueChooseNStepInnerPreviewDriveWithWasm(
      {
        ...input,
        state: option.state,
        depthCap: config.deep.depthCap,
      },
      option.state,
      option.driveDepth,
    );
    const deepDrive = wasmDrive.kind === 'supported' ? wasmDrive.drive : continueChooseNStepInnerPreviewDrive(
      {
        ...input,
        state: option.state,
        depthCap: config.deep.depthCap,
      },
      option.state,
      option.driveDepth,
    );
    recordProductionPolicyWasmPreviewDrive(
      wasmDrive.kind === 'supported' ? 'supported' : 'unsupported',
      wasmDrive.kind === 'supported' ? {} : wasmDrive.detail,
    );
    return resolveDeepOption(
      input,
      option,
      offsetSyntheticDecisions(option, deepDrive),
      surfaceContext,
      seatResolutionIndex,
    );
  });
  const outcomeBreakdown = emptyOutcomeBreakdown();
  for (const option of options) {
    incrementOutcome(outcomeBreakdown, option.outcome);
  }
  return {
    run: {
      options,
      outcomeBreakdown,
      evaluatedCandidateCount: broadRun.evaluatedCandidateCount + options.reduce(
        (total, option, index) => total + Math.max(0, option.driveDepth - (broadRun.options[index]?.driveDepth ?? 0)),
        0,
      ),
    },
    triggerFired,
  };
};
