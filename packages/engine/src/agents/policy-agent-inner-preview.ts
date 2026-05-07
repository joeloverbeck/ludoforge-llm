import type {
  AgentMicroturnDecisionInput,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
} from '../kernel/types.js';
import type { ChooseOneContext } from '../kernel/microturn/types.js';
import type { PolicyValue } from './policy-surface.js';
import {
  previewOptionRefKey,
  runChooseOneInnerPreview,
  type ChooseOneInnerPreviewRun,
} from './policy-preview-inner.js';
import { classifyPreviewUtility } from './preview-utility-classifier.js';
import type { PolicyEvaluationMetadata, ReadyRefStats } from './policy-eval.js';
import type { ResolvedPolicyProfile } from './policy-profile-resolution.js';

export interface PolicyAgentChooseOneInnerPreview {
  readonly run: ChooseOneInnerPreviewRun;
  readonly refIds: readonly string[];
  readonly usage: PolicyEvaluationMetadata['previewUsage'];
  readonly byOptionKey: ReadonlyMap<string, ChooseOneInnerPreviewRun['options'][number]>;
  readonly refsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PolicyValue>>;
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
  run: ChooseOneInnerPreviewRun,
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

const summarizeUsage = (
  mode: ResolvedPolicyProfile['profile']['preview']['mode'],
  run: ChooseOneInnerPreviewRun,
  refIds: readonly string[],
): PolicyEvaluationMetadata['previewUsage'] => {
  const readyRefStats = summarizeReadyRefStats(run, refIds);
  return {
    mode,
    evaluatedCandidateCount: run.options.length,
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
  };
};

export function createPolicyAgentChooseOneInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentChooseOneInnerPreview | undefined {
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
    usage: summarizeUsage(resolvedProfile.profile.preview.mode, run, refIds),
    byOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
  };
}
