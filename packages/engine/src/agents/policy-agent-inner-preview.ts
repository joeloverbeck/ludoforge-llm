import type {
  AgentMicroturnDecisionInput,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
} from '../kernel/types.js';
import type { ChooseNStepContext, ChooseOneContext } from '../kernel/microturn/types.js';
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
import { runDeepPass } from './policy-preview-inner-deepening.js';
import { classifyPreviewUtility } from './preview-utility-classifier.js';
import type { PolicyEvaluationMetadata, PolicyPreviewPhaseCoverage, ReadyRefStats } from './policy-eval.js';
import type { ResolvedPolicyProfile } from './policy-profile-resolution.js';

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

export interface PolicyAgentInnerPreview {
  readonly run: PolicyAgentInnerPreviewRun;
  readonly refIds: readonly string[];
  readonly usage: PolicyEvaluationMetadata['previewUsage'];
  readonly byOptionKey: ReadonlyMap<string, PolicyAgentInnerPreviewOption>;
  readonly refsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>;
}

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

const collectMicroturnPreviewOptionRefs = (
  resolvedProfile: ResolvedPolicyProfile,
): readonly Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>[] => {
  const refs = new Map<string, Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>>();
  const considerations = resolvedProfile.catalog.compiled.considerations;
  for (const considerationId of resolvedProfile.profile.use.considerations ?? []) {
    const consideration = considerations[considerationId];
    if (consideration === undefined || consideration.scopes?.includes('microturn') !== true) {
      continue;
    }
    const visitRef = (ref: CompiledAgentPolicyRef): void => {
      if (ref.kind === 'previewOptionRef') {
        refs.set(previewOptionRefKey(ref), ref);
      }
    };
    if (consideration.when !== undefined) {
      walkPolicyExpr(consideration.when, visitRef);
    }
    walkPolicyExpr(consideration.weight, visitRef);
    walkPolicyExpr(consideration.value, visitRef);
  }
  return [...refs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
};

const summarizeReadyRefStats = (
  run: PolicyAgentInnerPreviewRun,
  refIds: readonly string[],
): Readonly<Record<string, ReadyRefStats>> => {
  const stats: Record<string, ReadyRefStats> = {};
  for (const refId of refIds) {
    const values: number[] = [];
    for (const option of run.options) {
      if (option.outcome !== 'ready') {
        continue;
      }
      const value = option.resolvedRefs.get(refId);
      if (value?.kind === 'ready' && typeof value.value === 'number') {
        values.push(value.value);
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
  phaseCoverage?: PhaseCoverageInput,
): PolicyEvaluationMetadata['previewUsage']['coverage'] => {
  let readyRootOptionCount = 0;
  let unavailableRootOptionCount = 0;

  for (const option of run.options) {
    const hasReadyRef = refIds.some((refId) => option.resolvedRefs.get(refId)?.kind === 'ready');
    if (hasReadyRef) {
      readyRootOptionCount += 1;
    } else if (refIds.length > 0) {
      unavailableRootOptionCount += 1;
    }
  }

  const allRootsUnavailable = refIds.length > 0
    && run.options.length > 0
    && readyRootOptionCount === 0
    && unavailableRootOptionCount === run.options.length;

  return {
    requestedRefCount: refIds.length,
    evaluatedRootOptionCount: run.options.length,
    readyRootOptionCount,
    unavailableRootOptionCount,
    allRootsUnavailable,
    selectedByTieBreakerBecausePreviewUnavailable: allRootsUnavailable,
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
): PolicyPreviewPhaseCoverage => {
  let readyRootOptionCount = 0;
  let unavailableRootOptionCount = 0;
  for (const option of run.options) {
    const hasReadyRef = refIds.some((refId) => option.resolvedRefs.get(refId)?.kind === 'ready');
    if (hasReadyRef) {
      readyRootOptionCount += 1;
    } else if (refIds.length > 0) {
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
): PolicyEvaluationMetadata['previewUsage'] => {
  const readyRefStats = summarizeReadyRefStats(run, refIds);
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
    coverage: summarizeCoverage(run, refIds, phaseCoverage),
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
  const refs = collectMicroturnPreviewOptionRefs(resolvedProfile);
  const refIds = refs.map((ref) => previewOptionRefKey(ref));
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
  return {
    run,
    refIds,
    usage: summarizeUsage(resolvedProfile.profile.preview.mode, run, refIds, {
      strategy: resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass',
      capClass: resolvedProfile.profile.preview.inner?.capClass ?? 'standard256',
    }),
    byOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
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
  const refs = collectMicroturnPreviewOptionRefs(resolvedProfile);
  const refIds = refs.map((ref) => previewOptionRefKey(ref));
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
  const strategy = resolvedProfile.profile.preview.inner?.strategy ?? 'singlePass';
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
      }, run, refIds)
    : { run };
  const finalRun = deepening.run;
  const phaseCoverage = {
    strategy,
    capClass: resolvedProfile.profile.preview.inner?.capClass ?? 'standard256',
    ...(strategy === 'continuedDeepening' ? { broad: summarizePhaseCoverage(run, refIds) } : {}),
    ...(deepening.triggerFired === undefined
      ? {}
      : { deep: summarizePhaseCoverage(finalRun, refIds, deepening.triggerFired) }),
  };
  return {
    run: finalRun,
    refIds,
    usage: summarizeUsage(resolvedProfile.profile.preview.mode, finalRun, refIds, phaseCoverage),
    byOptionKey: new Map(finalRun.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(finalRun.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
  };
}
