import type {
  AgentMicroturnDecisionInput,
  ChoicePendingChooseNRequest,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  MoveParamScalar,
} from '../kernel/types.js';
import type { ChooseNStepContext, ChooseOneContext } from '../kernel/microturn/types.js';
import { perfHotPathEnd, perfHotPathStart } from '../kernel/perf-profiler.js';
import {
  previewOptionRefKey,
  runChooseOneInnerPreview,
  type ChooseOneInnerPreviewRun,
  type PreviewOptionRefStatus,
} from './policy-preview-inner.js';
import {
  runChooseNStepInnerPreview,
  type ChooseNStepInnerPreviewRun,
} from './policy-preview-inner-choosenstep.js';
import { runDeepPass, type PreviewDerivedTriggerSignals } from './policy-preview-inner-deepening.js';
import { classifyPreviewUtility } from './preview-utility-classifier.js';
import type { PolicyEvaluationMetadata, PolicyPreviewPhaseCoverage, ReadyRefStats } from './policy-eval.js';
import type { ResolvedPolicyProfile } from './policy-profile-resolution.js';
import type { PreviewOptionProjectedState } from './policy-runtime.js';
import { lookupRefKey } from './policy-evaluation-core.js';
import {
  microturnConsiderationIdsForProfile,
} from './microturn-option-evaluator.js';
import {
  scoreMicroturnOptionWithContributions,
} from './microturn-option-eval.js';

type PolicyAgentInnerPreviewRun = ChooseOneInnerPreviewRun | ChooseNStepInnerPreviewRun;
type PolicyAgentInnerPreviewOption = PolicyAgentInnerPreviewRun['options'][number];
type PreviewStrategy = NonNullable<ResolvedPolicyProfile['profile']['preview']['inner']>['strategy'];
type PreviewCapClass = NonNullable<ResolvedPolicyProfile['profile']['preview']['inner']>['capClass'];

interface PhaseCoverageInput {
  readonly strategy: PreviewStrategy;
  readonly capClass: PreviewCapClass;
  readonly broad?: PolicyPreviewPhaseCoverage;
  readonly deep?: PolicyPreviewPhaseCoverage;
}

interface PreviewDerivedRefs {
  readonly previewOptionRefs: readonly Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>[];
  readonly refIds: readonly string[];
  readonly triggerTerms: PreviewDerivedTriggerSignals['terms'];
}

export interface PolicyAgentInnerPreview {
  readonly run: PolicyAgentInnerPreviewRun;
  readonly refIds: readonly string[];
  readonly usage: PolicyEvaluationMetadata['previewUsage'];
  readonly byOptionKey: ReadonlyMap<string, PolicyAgentInnerPreviewOption>;
  readonly refsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>;
  readonly projectedStateByOptionKey: ReadonlyMap<string, PreviewOptionProjectedState>;
}

const projectedStatesByOptionKey = (
  run: PolicyAgentInnerPreviewRun,
  capClass: PreviewCapClass,
): ReadonlyMap<string, PreviewOptionProjectedState> => new Map(run.options.map((option) => [
  option.stableMoveKey,
  {
    ...(option.outcome === 'ready' ? { state: option.state } : {}),
    outcome: option.outcome,
    driveDepth: option.driveDepth,
    completionPolicy: option.previewDrive.completionPolicy,
    capClass,
  },
]));

const walkPolicyExpr = (
  expr: CompiledPolicyExpr,
  visitRef: (ref: CompiledAgentPolicyRef) => void,
): void => {
  if (expr.kind === 'ref') {
    visitRef(expr.ref);
    return;
  }
  if (expr.kind === 'seatAgg') {
    walkPolicyExpr(expr.expr, visitRef);
    return;
  }
  if (expr.kind === 'op') {
    for (const arg of expr.args) {
      walkPolicyExpr(arg, visitRef);
    }
    return;
  }
  if ((expr.kind === 'zoneProp' || expr.kind === 'zoneTokenAgg') && typeof expr.zone !== 'string') {
    walkPolicyExpr(expr.zone, visitRef);
  }
};

const previewDerivedRefKey = (ref: CompiledAgentPolicyRef): string | undefined => {
  if (ref.kind === 'previewOptionRef') {
    return previewOptionRefKey(ref);
  }
  if (ref.kind === 'lookup' && ref.surface === 'previewOptionState') {
    return lookupRefKey(ref);
  }
  return undefined;
};

const collectMicroturnPreviewDerivedRefs = (
  resolvedProfile: ResolvedPolicyProfile,
): PreviewDerivedRefs => {
  const previewOptionRefs = new Map<string, Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>>();
  const refIds = new Set<string>();
  const triggerTerms: PreviewDerivedTriggerSignals['terms'][number][] = [];
  const considerations = resolvedProfile.catalog.compiled.considerations;
  for (const considerationId of resolvedProfile.profile.use.considerations ?? []) {
    const consideration = considerations[considerationId];
    if (consideration === undefined || consideration.scopes?.includes('microturn') !== true) {
      continue;
    }
    const termRefIds = new Set<string>();
    const visitRef = (ref: CompiledAgentPolicyRef): void => {
      if (ref.kind === 'previewOptionRef') {
        previewOptionRefs.set(previewOptionRefKey(ref), ref);
      }
      const refId = previewDerivedRefKey(ref);
      if (refId !== undefined) {
        refIds.add(refId);
        termRefIds.add(refId);
      }
    };
    if (consideration.when !== undefined) {
      walkPolicyExpr(consideration.when, visitRef);
    }
    walkPolicyExpr(consideration.weight, visitRef);
    walkPolicyExpr(consideration.value, visitRef);
    if (termRefIds.size > 0) {
      triggerTerms.push({ id: considerationId, refIds: [...termRefIds].sort() });
    }
  }
  return {
    previewOptionRefs: [...previewOptionRefs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, ref]) => ref),
    refIds: [...refIds].sort(),
    triggerTerms: triggerTerms.sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const createChooseNRequest = (
  context: ChooseNStepContext,
): ChoicePendingChooseNRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: context.decisionKey,
  name: String(context.decisionKey),
  options: context.options,
  targetKinds: [],
  type: 'chooseN',
  min: context.cardinality.min,
  max: context.cardinality.max,
  selected: context.selectedSoFar,
  canConfirm: context.stepCommands.includes('confirm'),
});

const triggerSignalsForRun = (
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile,
  run: Extract<PolicyAgentInnerPreviewRun, { readonly evaluatedCandidateCount: number }>,
  refIds: readonly string[],
  terms: PreviewDerivedTriggerSignals['terms'],
  capClass: PreviewCapClass,
): PreviewDerivedTriggerSignals => {
  if (input.microturn.kind !== 'chooseNStep') {
    return { refIds, terms, options: [] };
  }
  const context = input.microturn.decisionContext as ChooseNStepContext;
  const request = createChooseNRequest(context);
  const considerationIds = microturnConsiderationIdsForProfile(resolvedProfile.catalog, resolvedProfile.profile);
  const options = run.options.map((option) => {
    const optionIndex = context.options.findIndex((entry) => Object.is(entry.value, option.decision.value));
    const scored = scoreMicroturnOptionWithContributions(
      input.state,
      input.def,
      resolvedProfile.catalog,
      input.state.activePlayer,
      resolvedProfile.seatId,
      resolvedProfile.profile.params,
      request,
      option.decision.value as MoveParamScalar,
      optionIndex,
      considerationIds,
      input.runtime,
      option.resolvedRefs,
      projectedStateForOption(option, capClass),
    );
    return {
      stableMoveKey: option.stableMoveKey,
      unavailableRefs: scored.unknownPreviewRefs,
      contributionByTermId: new Map(scored.scoreContributions.map((entry) => [entry.termId, entry.contribution])),
    };
  });
  return { refIds, terms, options };
};

const projectedStateForOption = (
  option: PolicyAgentInnerPreviewOption,
  capClass: PreviewCapClass,
): PreviewOptionProjectedState => ({
  ...(option.outcome === 'ready' ? { state: option.state } : {}),
  outcome: option.outcome,
  driveDepth: option.driveDepth,
  completionPolicy: option.previewDrive.completionPolicy,
  capClass,
});

const optionSignalsFor = (
  signals: PreviewDerivedTriggerSignals | undefined,
  stableMoveKey: string,
): PreviewDerivedTriggerSignals['options'][number] | undefined =>
  signals?.options.find((option) => option.stableMoveKey === stableMoveKey);

const contributionValueForRef = (
  signals: PreviewDerivedTriggerSignals | undefined,
  stableMoveKey: string,
  refId: string,
): number | undefined => {
  const optionSignals = optionSignalsFor(signals, stableMoveKey);
  const term = signals?.terms.find((candidate) => candidate.refIds.length === 1 && candidate.refIds[0] === refId);
  return optionSignals === undefined || term === undefined
    ? undefined
    : optionSignals.contributionByTermId.get(term.id) ?? 0;
};

const isUnavailableRef = (
  option: PolicyAgentInnerPreviewOption,
  refId: string,
  signals?: PreviewDerivedTriggerSignals,
): boolean => {
  const status = option.resolvedRefs.get(refId);
  if (status?.kind === 'unavailable') {
    return true;
  }
  return optionSignalsFor(signals, option.stableMoveKey)?.unavailableRefs.has(refId) === true;
};

const isReadyRef = (
  option: PolicyAgentInnerPreviewOption,
  refId: string,
  signals?: PreviewDerivedTriggerSignals,
): boolean => {
  const status = option.resolvedRefs.get(refId);
  if (status?.kind === 'ready') {
    return true;
  }
  return contributionValueForRef(signals, option.stableMoveKey, refId) !== undefined
    && !isUnavailableRef(option, refId, signals);
};

const refNumericValue = (
  option: PolicyAgentInnerPreviewOption,
  refId: string,
  signals?: PreviewDerivedTriggerSignals,
): number | undefined => {
  const status = option.resolvedRefs.get(refId);
  if (status?.kind === 'ready' && typeof status.value === 'number') {
    return status.value;
  }
  return contributionValueForRef(signals, option.stableMoveKey, refId);
};

const summarizeReadyRefStats = (
  run: PolicyAgentInnerPreviewRun,
  refIds: readonly string[],
  signals?: PreviewDerivedTriggerSignals,
): Readonly<Record<string, ReadyRefStats>> => {
  const stats: Record<string, ReadyRefStats> = {};
  for (const refId of refIds) {
    const values: number[] = [];
    for (const option of run.options) {
      if (option.outcome !== 'ready') {
        continue;
      }
      const value = refNumericValue(option, refId, signals);
      if (typeof value === 'number') {
        values.push(value);
      }
    }
    if (values.length === 0) {
      stats[refId] = {
        readyCount: 0,
        distinctValueCount: 0,
        min: null,
        max: null,
        range: null,
        allReadyValuesEqual: true,
      };
      continue;
    }
    let min = values[0]!;
    let max = values[0]!;
    const distinct = new Set<number>();
    for (const value of values) {
      distinct.add(value);
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }
    stats[refId] = {
      readyCount: values.length,
      distinctValueCount: distinct.size,
      min,
      max,
      range: max - min,
      allReadyValuesEqual: distinct.size <= 1,
    };
  }
  return stats;
};

const summarizeCoverage = (
  run: PolicyAgentInnerPreviewRun,
  refIds: readonly string[],
  readyRefStats: Readonly<Record<string, ReadyRefStats>>,
  phaseCoverage?: PhaseCoverageInput,
  signals?: PreviewDerivedTriggerSignals,
): PolicyEvaluationMetadata['previewUsage']['coverage'] => {
  let readyRootOptionCount = 0;
  let unavailableRootOptionCount = 0;

  for (const option of run.options) {
    const hasReadyRef = refIds.some((refId) => isReadyRef(option, refId, signals));
    if (hasReadyRef) {
      readyRootOptionCount += 1;
    } else if (refIds.length > 0 && refIds.some((refId) => isUnavailableRef(option, refId, signals))) {
      unavailableRootOptionCount += 1;
    }
  }

  const allRootsUnavailable = refIds.length > 0
    && run.options.length > 0
    && readyRootOptionCount === 0
    && unavailableRootOptionCount === run.options.length;
  const allReadyValuesUniform = refIds.length > 0
    && run.options.length > 0
    && Object.values(readyRefStats).some((stats) => stats.readyCount > 0)
    && Object.values(readyRefStats).every((stats) => stats.readyCount === 0 || stats.allReadyValuesEqual);

  return {
    requestedRefCount: refIds.length,
    evaluatedRootOptionCount: run.options.length,
    readyRootOptionCount,
    unavailableRootOptionCount,
    allRootsUnavailable,
    selectedByTieBreakerBecausePreviewUnavailable: allRootsUnavailable || allReadyValuesUniform,
    strategy: phaseCoverage?.strategy ?? 'singlePass',
    capClass: phaseCoverage?.capClass ?? 'standard256',
    ...(phaseCoverage?.broad === undefined ? {} : { broad: phaseCoverage.broad }),
    ...(phaseCoverage?.deep === undefined ? {} : { deep: phaseCoverage.deep }),
  };
};

const summarizePhaseCoverage = (
  run: PolicyAgentInnerPreviewRun,
  refIds: readonly string[],
  triggerFired?: PolicyPreviewPhaseCoverage['triggerFired'],
  signals?: PreviewDerivedTriggerSignals,
): PolicyPreviewPhaseCoverage => {
  let readyRootOptionCount = 0;
  let unavailableRootOptionCount = 0;
  for (const option of run.options) {
    const hasReadyRef = refIds.some((refId) => isReadyRef(option, refId, signals));
    if (hasReadyRef) {
      readyRootOptionCount += 1;
    } else if (refIds.length > 0 && refIds.some((refId) => isUnavailableRef(option, refId, signals))) {
      unavailableRootOptionCount += 1;
    }
  }
  return {
    evaluatedRootOptionCount: run.options.length,
    readyRootOptionCount,
    unavailableRootOptionCount,
    ...(triggerFired === undefined ? {} : { triggerFired }),
  };
};

const summarizeUsage = (
  mode: ResolvedPolicyProfile['profile']['preview']['mode'],
  run: PolicyAgentInnerPreviewRun,
  refIds: readonly string[],
  phaseCoverage?: PhaseCoverageInput,
  signals?: PreviewDerivedTriggerSignals,
): PolicyEvaluationMetadata['previewUsage'] => {
  const readyRefStats = summarizeReadyRefStats(run, refIds, signals);
  return {
    mode,
    evaluatedCandidateCount: 'evaluatedCandidateCount' in run ? run.evaluatedCandidateCount : run.options.length,
    completionPolicyFallbackCount: run.options.reduce(
      (total, option) => total + option.completionPolicyFallbackCount,
      0,
    ),
    refIds,
    unknownRefs: [],
    readyRefStats,
    utility: classifyPreviewUtility(readyRefStats),
    widenedBecauseUniform: false,
    outcomeBreakdown: run.outcomeBreakdown,
    coverage: summarizeCoverage(run, refIds, readyRefStats, phaseCoverage, signals),
  };
};

export function createPolicyAgentChooseOneInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentInnerPreview | undefined {
  if (
    resolvedProfile === null
    || input.microturn.kind !== 'chooseOne'
    || resolvedProfile.profile.preview.inner?.chooseOne !== true
  ) {
    return undefined;
  }
  const previewDerived = collectMicroturnPreviewDerivedRefs(resolvedProfile);
  const refs = previewDerived.previewOptionRefs;
  const refIds = refs.map((ref) => previewOptionRefKey(ref));
  const capClass = resolvedProfile.profile.preview.inner?.capClass ?? 'standard256';
  const runStartedAt = perfHotPathStart();
  const run = runChooseOneInnerPreview({
    def: input.def,
    state: input.state,
    microturn: input.microturn as AgentMicroturnDecisionInput['microturn'] & {
      readonly kind: 'chooseOne';
      readonly decisionContext: ChooseOneContext;
    },
    playerId: input.state.activePlayer,
    seatId: resolvedProfile.seatId,
    catalog: resolvedProfile.catalog,
    profile: resolvedProfile.profile,
    refs,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  perfHotPathEnd('policyInnerPreview:chooseOneRun', runStartedAt);
  const summarizeStartedAt = perfHotPathStart();
  const usage = summarizeUsage(resolvedProfile.profile.preview.mode, run, refIds, {
    strategy: resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass',
    capClass,
  });
  perfHotPathEnd('policyInnerPreview:summarizeUsage', summarizeStartedAt);
  return {
    run,
    refIds,
    usage,
    byOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
    projectedStateByOptionKey: projectedStatesByOptionKey(run, capClass),
  };
}

export function createPolicyAgentChooseNStepInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentInnerPreview | undefined {
  if (
    resolvedProfile === null
    || input.microturn.kind !== 'chooseNStep'
    || resolvedProfile.profile.preview.inner?.chooseNStep !== true
  ) {
    return undefined;
  }
  const previewDerived = collectMicroturnPreviewDerivedRefs(resolvedProfile);
  const refs = previewDerived.previewOptionRefs;
  const refIds = previewDerived.refIds;
  const runStartedAt = perfHotPathStart();
  const run = runChooseNStepInnerPreview({
    def: input.def,
    state: input.state,
    microturn: input.microturn as AgentMicroturnDecisionInput['microturn'] & {
      readonly kind: 'chooseNStep';
      readonly decisionContext: ChooseNStepContext;
    },
    playerId: input.state.activePlayer,
    seatId: resolvedProfile.seatId,
    catalog: resolvedProfile.catalog,
    profile: resolvedProfile.profile,
    refs,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  perfHotPathEnd('policyInnerPreview:chooseNStepBroadRun', runStartedAt);
  const strategy = resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass';
  const capClass = resolvedProfile.profile.preview.inner?.capClass ?? 'standard256';
  const broadSignalsStartedAt = perfHotPathStart();
  const broadSignals = triggerSignalsForRun(input, resolvedProfile, run, refIds, previewDerived.triggerTerms, capClass);
  perfHotPathEnd('policyInnerPreview:chooseNStepBroadSignals', broadSignalsStartedAt);
  const deepStartedAt = perfHotPathStart();
  const deepening = strategy === 'continuedDeepening'
    ? runDeepPass({
        def: input.def,
        state: input.state,
        microturn: input.microturn as AgentMicroturnDecisionInput['microturn'] & {
          readonly kind: 'chooseNStep';
          readonly decisionContext: ChooseNStepContext;
        },
        playerId: input.state.activePlayer,
        seatId: resolvedProfile.seatId,
        catalog: resolvedProfile.catalog,
        profile: resolvedProfile.profile,
        refs,
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      }, run, broadSignals)
    : { run };
  perfHotPathEnd('policyInnerPreview:chooseNStepDeepPass', deepStartedAt);
  const finalRun = deepening.run;
  const finalSignalsStartedAt = perfHotPathStart();
  const finalSignals = triggerSignalsForRun(input, resolvedProfile, finalRun, refIds, previewDerived.triggerTerms, capClass);
  perfHotPathEnd('policyInnerPreview:chooseNStepFinalSignals', finalSignalsStartedAt);
  const phaseCoverage = {
    strategy,
    capClass,
    ...(strategy === 'continuedDeepening' ? { broad: summarizePhaseCoverage(run, refIds, undefined, broadSignals) } : {}),
    ...(deepening.triggerFired === undefined
      ? {}
      : { deep: summarizePhaseCoverage(finalRun, refIds, deepening.triggerFired, finalSignals) }),
  };
  const summarizeStartedAt = perfHotPathStart();
  const usage = summarizeUsage(resolvedProfile.profile.preview.mode, finalRun, refIds, phaseCoverage, finalSignals);
  perfHotPathEnd('policyInnerPreview:summarizeUsage', summarizeStartedAt);
  return {
    run: finalRun,
    refIds,
    usage,
    byOptionKey: new Map(finalRun.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(finalRun.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
    projectedStateByOptionKey: projectedStatesByOptionKey(finalRun, capClass),
  };
}
