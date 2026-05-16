import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import type { DeepTrigger } from '../kernel/types.js';
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
  type ChooseNStepInnerPreviewResult,
  type ChooseNStepInnerPreviewRun,
  type RunChooseNStepInnerPreviewInput,
} from './policy-preview-inner-choosenstep.js';
import { recordProductionPolicyWasmPreviewDrive } from './policy-wasm-runtime.js';

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
    recordProductionPolicyWasmPreviewDrive('unsupported');
    const deepDrive = continueChooseNStepInnerPreviewDrive(
      {
        ...input,
        state: option.state,
        depthCap: config.deep.depthCap,
      },
      option.state,
      option.driveDepth,
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
