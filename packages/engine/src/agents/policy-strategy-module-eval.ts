import type {
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  GameDef,
  StrategyModuleDef,
} from '../kernel/types.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';
import type { PolicyValue } from './policy-surface.js';
import type { PolicyEvaluationCandidate } from './policy-evaluation-core.js';
import type { SelectedSelectorView } from './policy-selector-eval.js';

export interface StrategyModuleActivationView {
  readonly active: boolean;
  readonly priorityValue: number | undefined;
}

export interface StrategyModuleEvaluationView extends StrategyModuleActivationView {
  readonly contribution: number;
  readonly scoreGroups: ReadonlyMap<string, number>;
}

export interface StrategyModuleEvaluationInput {
  readonly moduleId: string;
  readonly module: StrategyModuleDef;
  readonly candidate: PolicyEvaluationCandidate | undefined;
  readonly stateHash: bigint;
  readonly completionRequestType?: 'chooseOne' | 'chooseN';
  readonly actionTagIndex: GameDef['actionTagIndex'];
  readonly previewResolvedRefs?: ReadonlyMap<string, PreviewOptionRefStatus>;
  readonly activationCache: Map<string, StrategyModuleActivationView>;
  readonly evaluationCache: Map<string, StrategyModuleEvaluationView>;
  readonly evaluateExpr: (expr: CompiledPolicyExpr, candidate: PolicyEvaluationCandidate | undefined) => PolicyValue;
  readonly evaluateSelector: (selectorId: string, candidate: PolicyEvaluationCandidate | undefined) => SelectedSelectorView;
}

export function resolveStrategyModuleRef(
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'strategyModule' }>,
  view: StrategyModuleEvaluationView,
  module: StrategyModuleDef,
): PolicyValue {
  const { field } = ref;
  if (field === 'active') return view.active;
  if (field === 'priority.value') return view.priorityValue;
  if (field === 'contribution') return view.contribution;
  if (typeof field === 'object' && field.kind === 'scoreGroup.value') {
    return view.scoreGroups.get(field.scoreGroupId) ?? 0;
  }
  if (typeof field === 'object' && field.kind === 'selector.id') {
    return module.selectors.find((binding) => binding.role === field.role)?.selectorId;
  }
  return undefined;
}

export function evaluateStrategyModule(input: StrategyModuleEvaluationInput): StrategyModuleEvaluationView {
  const cacheKey = strategyModuleEvaluationCacheKey(input);
  const cached = input.evaluationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const activation = evaluateStrategyModuleActivation(input);
  if (!activation.active || !strategyModuleApplies(input)) {
    const inactiveView: StrategyModuleEvaluationView = {
      ...activation,
      contribution: 0,
      scoreGroups: new Map(),
    };
    input.evaluationCache.set(cacheKey, inactiveView);
    return inactiveView;
  }

  let contribution = 0;
  if (input.module.fallback.ifSelectorEmpty === 'demoteAndTrace' && strategyModuleHasEmptySelector(input)) {
    contribution += input.module.fallback.selectorEmptyPenalty ?? 0;
  }

  const scoreGroups = new Map<string, number>();
  for (const group of input.module.scoreGroups) {
    const groupValue = evaluateStrategyModuleScoreGroup(input, group);
    scoreGroups.set(group.id, groupValue);
    contribution += groupValue;
  }

  const view: StrategyModuleEvaluationView = {
    ...activation,
    contribution,
    scoreGroups,
  };
  input.evaluationCache.set(cacheKey, view);
  return view;
}

function evaluateStrategyModuleActivation(input: StrategyModuleEvaluationInput): StrategyModuleActivationView {
  const cacheKey = input.module.costClass === 'state'
    ? strategyModuleActivationCacheKey(input, undefined)
    : strategyModuleActivationCacheKey(input, input.candidate);
  const cached = input.activationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const activationCandidate = input.module.costClass === 'state' ? undefined : input.candidate;
  const active = input.evaluateExpr(input.module.when, activationCandidate) === true;
  const priorityValue = input.module.priority.value === undefined
    ? undefined
    : numericPolicyValue(input.evaluateExpr(input.module.priority.value, activationCandidate));
  const view = { active, priorityValue };
  input.activationCache.set(cacheKey, view);
  return view;
}

function strategyModuleApplies(input: StrategyModuleEvaluationInput): boolean {
  const contextScope = input.completionRequestType === undefined ? 'move' : 'microturn';
  if (!input.module.applies.scopes.includes(contextScope)) {
    return false;
  }
  if (input.module.applies.actionTags !== undefined) {
    if (input.candidate === undefined) {
      return false;
    }
    const actionTags = input.actionTagIndex?.byAction[input.candidate.actionId] ?? [];
    if (!input.module.applies.actionTags.some((tag) => actionTags.includes(tag))) {
      return false;
    }
  }
  if (input.module.applies.decisionKinds !== undefined) {
    const decisionKind = input.completionRequestType ?? 'move';
    if (!input.module.applies.decisionKinds.includes(decisionKind)) {
      return false;
    }
  }
  return true;
}

function strategyModuleHasEmptySelector(input: StrategyModuleEvaluationInput): boolean {
  return input.module.selectors.some((binding) => input.evaluateSelector(binding.selectorId, input.candidate).selected.length === 0);
}

function evaluateStrategyModuleScoreGroup(
  input: StrategyModuleEvaluationInput,
  group: StrategyModuleDef['scoreGroups'][number],
): number {
  const termValues = group.terms.map((term) => numericPolicyValue(input.evaluateExpr(term.value, input.candidate)) * term.weight);
  if (termValues.length === 0) {
    return 0;
  }
  switch (group.summary) {
    case 'product':
      return termValues.reduce((product, value) => product * value, 1);
    case 'max':
      return termValues.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
    case 'sum':
      return termValues.reduce((sum, value) => sum + value, 0);
  }
}

function numericPolicyValue(value: PolicyValue): number {
  return typeof value === 'number' ? value : 0;
}

function strategyModuleEvaluationCacheKey(input: StrategyModuleEvaluationInput): string {
  return [
    input.moduleId,
    input.candidate?.stableMoveKey ?? '__state__',
    input.previewResolvedRefs === undefined ? 'current' : 'preview',
    previewRefStatusSnapshotKey(input.previewResolvedRefs),
  ].join(':');
}

function strategyModuleActivationCacheKey(
  input: StrategyModuleEvaluationInput,
  candidate: PolicyEvaluationCandidate | undefined,
): string {
  return [
    input.moduleId,
    input.stateHash.toString(),
    candidate?.stableMoveKey ?? '__state__',
    input.previewResolvedRefs === undefined ? 'current' : 'preview',
    previewRefStatusSnapshotKey(input.previewResolvedRefs),
  ].join(':');
}

function previewRefStatusSnapshotKey(resolvedRefs: ReadonlyMap<string, PreviewOptionRefStatus> | undefined): string {
  if (resolvedRefs === undefined) {
    return 'no-preview';
  }
  return [...resolvedRefs.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([refId, status]) => `${refId}=${status.kind}`)
    .join(',');
}
