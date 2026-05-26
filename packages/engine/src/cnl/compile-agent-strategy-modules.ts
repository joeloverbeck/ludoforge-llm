import { analyzePolicyExpr, type AnalyzePolicyExprContext, type PolicyExprAnalysis } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import { MAX_MODULE_PRIORITY_TIER } from '../kernel/types.js';
import type {
  AgentPolicyCostClass,
  AgentPolicyExpr,
  AgentPolicyValueType,
  CompiledAgentPolicyRef,
  CompiledAgentDependencyRefs,
  ModuleCostClass,
  PlanTemplateId,
  StrategyModuleDef,
} from '../kernel/types.js';
import type { GameSpecStrategyModuleDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { normalizeSelectorScopes, selectorCostToPolicyCostClass } from './compile-agent-selectors.js';

export type AgentStrategyModuleWithExpr = StrategyModuleDef & {
  readonly when: AgentPolicyExpr;
  readonly priority: Omit<StrategyModuleDef['priority'], 'value'> & { readonly value?: AgentPolicyExpr };
  readonly scoreGroups: readonly (Omit<StrategyModuleDef['scoreGroups'][number], 'terms'> & {
    readonly terms: readonly (Omit<StrategyModuleDef['scoreGroups'][number]['terms'][number], 'value'> & {
      readonly value: AgentPolicyExpr;
    })[];
  })[];
};

export interface StrategyModuleCompileOptions {
  readonly moduleId: string;
  readonly def: GameSpecStrategyModuleDef;
  readonly context: AnalyzePolicyExprContext;
  readonly diagnostics: Diagnostic[];
  readonly compileSelector: (selectorId: string) => { readonly costClass: ModuleCostClass } | null;
  readonly compileGuardrail: (guardrailId: string) => { readonly costClass: ModuleCostClass } | null;
  readonly planTemplateIds: readonly string[];
  readonly reportModuleRefUnknown: (refPath: string, path: string) => void;
}

export function compileStrategyModuleDefinition(
  options: StrategyModuleCompileOptions,
): AgentStrategyModuleWithExpr | null {
  const {
    moduleId,
    def,
    context,
    diagnostics,
    compileSelector,
    compileGuardrail,
    planTemplateIds,
    reportModuleRefUnknown,
  } = options;
  const basePath = `doc.agents.library.strategyModules.${moduleId}`;
  const when = analyzePolicyExpr(def.when ?? true, context, diagnostics, `${basePath}.when`);
  const applies = lowerModuleApplies(def.applies, `${basePath}.applies`, diagnostics, reportModuleRefUnknown);
  const priority = lowerModulePriority(def.priority, `${basePath}.priority`, context, diagnostics);
  const selectors = lowerModuleSelectorBindings(def.selectors, `${basePath}.selectors`, compileSelector, diagnostics, reportModuleRefUnknown);
  const scoreGroups = lowerModuleScoreGroups(def.scoreGroups, `${basePath}.scoreGroups`, context, diagnostics, reportModuleRefUnknown);
  const guardrailIds = lowerModuleGuardrailIds(def.guardrailIds, `${basePath}.guardrailIds`, compileGuardrail, diagnostics, reportModuleRefUnknown);
  const fallback = lowerModuleFallback(def.fallback, `${basePath}.fallback`, diagnostics, reportModuleRefUnknown);
  const planTemplateGating = lowerModulePlanTemplateGating(
    def,
    moduleId,
    `${basePath}`,
    planTemplateIds,
    diagnostics,
    reportModuleRefUnknown,
  );

  if (
    when === null
    || when.valueType !== 'boolean'
    || applies === null
    || priority === null
    || selectors === null
    || scoreGroups === null
    || guardrailIds === null
    || fallback === null
    || planTemplateGating === null
  ) {
    if (when !== null && when.valueType !== 'boolean') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${basePath}.when`,
        severity: 'error',
        message: `Strategy module "${moduleId}" when must compile to boolean.`,
        suggestion: 'Use a boolean policy expression in strategyModules.<id>.when.',
      });
    }
    return null;
  }

  const dependencies = mergeModuleDependencies([
    when.dependencies,
    ...(priority.valueAnalysis === null ? [] : [priority.valueAnalysis.dependencies]),
    ...scoreGroups.flatMap((group) => group.terms.map((term) => term.analysis.dependencies)),
    ...selectors.map((binding) => ({ ...emptyDependencies(), selectors: [binding.selectorId] })),
    ...guardrailIds.map((guardrailId) => ({ ...emptyDependencies(), guardrails: [guardrailId] })),
    {
      ...emptyDependencies(),
      planTemplates: uniqueSorted([
        ...planTemplateGating.enablesPlanTemplates,
        ...planTemplateGating.suppressesPlanTemplates,
      ]),
    },
  ]);
  const costClass = deriveModuleCostClass([
    when.costClass,
    ...(priority.valueAnalysis === null ? [] : [priority.valueAnalysis.costClass]),
    ...scoreGroups.flatMap((group) => group.terms.map((term) => term.analysis.costClass)),
    ...selectors.map((binding) => compileSelector(binding.selectorId)?.costClass ?? 'state'),
    ...guardrailIds.map((guardrailId) => compileGuardrail(guardrailId)?.costClass ?? 'state'),
  ]);

  return {
    id: moduleId as AgentStrategyModuleWithExpr['id'],
    traceLabel: def.traceLabel ?? moduleId,
    when: when.expr,
    applies,
    priority: {
      tier: priority.tier,
      ...(priority.valueAnalysis === null ? {} : { value: priority.valueAnalysis.expr }),
    },
    selectors: selectors.map((binding) => ({
      role: binding.role as AgentStrategyModuleWithExpr['selectors'][number]['role'],
      selectorId: binding.selectorId as AgentStrategyModuleWithExpr['selectors'][number]['selectorId'],
    })),
    scoreGroups: scoreGroups.map((group) => ({
      id: group.id as AgentStrategyModuleWithExpr['scoreGroups'][number]['id'],
      summary: group.summary,
      terms: group.terms.map((term) => ({
        ...(term.id === undefined ? {} : { id: term.id }),
        value: term.analysis.expr,
        weight: term.weight,
      })),
    })),
    guardrailIds: guardrailIds.map((id) => id as AgentStrategyModuleWithExpr['guardrailIds'][number]),
    fallback,
    costClass,
    dependencies,
    enablesPlanTemplates: planTemplateGating.enablesPlanTemplates.map((id) => id as PlanTemplateId),
    suppressesPlanTemplates: planTemplateGating.suppressesPlanTemplates.map((id) => id as PlanTemplateId),
  };
}

export function parseModuleRef(refPath: string): {
  readonly moduleId: string;
  readonly field: Extract<CompiledAgentPolicyRef, { readonly kind: 'strategyModule' }>['field'];
  readonly type: AgentPolicyValueType;
} | null {
  const rest = refPath.slice('module.'.length);
  const scoreGroup = rest.match(/^([^.]+)\.scoreGroup\.([^.]+)\.value$/);
  if (scoreGroup !== null) {
    return {
      moduleId: scoreGroup[1]!,
      field: { kind: 'scoreGroup.value', scoreGroupId: scoreGroup[2]! },
      type: 'number',
    };
  }
  const selectorId = rest.match(/^([^.]+)\.selector\.([^.]+)\.id$/);
  if (selectorId !== null) {
    return {
      moduleId: selectorId[1]!,
      field: { kind: 'selector.id', role: selectorId[2]! },
      type: 'id',
    };
  }
  const dotIndex = rest.indexOf('.');
  if (dotIndex <= 0) return null;
  const moduleId = rest.slice(0, dotIndex);
  const field = rest.slice(dotIndex + 1);
  switch (field) {
    case 'active':
      return { moduleId, field, type: 'boolean' };
    case 'priority.value':
    case 'contribution':
      return { moduleId, field, type: 'number' };
    default:
      return null;
  }
}

function lowerModuleApplies(
  applies: GameSpecStrategyModuleDef['applies'] | undefined,
  path: string,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): StrategyModuleDef['applies'] | null {
  const scopes = normalizeSelectorScopes(applies?.scopes, `${path}.scopes`, diagnostics);
  if (scopes === null) return null;
  if (applies?.actionTags !== undefined && !isStringArray(applies.actionTags)) {
    reportModuleRefUnknown('applies.actionTags', `${path}.actionTags`);
    return null;
  }
  if (applies?.decisionKinds !== undefined && !isStringArray(applies.decisionKinds)) {
    reportModuleRefUnknown('applies.decisionKinds', `${path}.decisionKinds`);
    return null;
  }
  return {
    scopes,
    ...(applies?.actionTags === undefined ? {} : { actionTags: applies.actionTags }),
    ...(applies?.decisionKinds === undefined ? {} : { decisionKinds: applies.decisionKinds }),
  };
}

function lowerModulePriority(
  priority: GameSpecStrategyModuleDef['priority'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
): { readonly tier: number; readonly valueAnalysis: PolicyExprAnalysis | null } | null {
  const tier = priority?.tier;
  if (typeof tier !== 'number' || !Number.isSafeInteger(tier) || tier < 0 || tier > MAX_MODULE_PRIORITY_TIER) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_PRIORITY_TIER_OUT_OF_RANGE,
      path: `${path}.tier`,
      severity: 'error',
      message: `Strategy module priority.tier must be an integer from 0 to ${MAX_MODULE_PRIORITY_TIER}.`,
      suggestion: `Set priority.tier between 0 and ${MAX_MODULE_PRIORITY_TIER}.`,
    });
    return null;
  }
  const valueAnalysis = priority?.value === undefined
    ? null
    : analyzePolicyExpr(priority.value, context, diagnostics, `${path}.value`);
  if (priority?.value !== undefined && valueAnalysis === null) return null;
  if (valueAnalysis !== null && valueAnalysis.valueType !== 'number' && valueAnalysis.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: 'Strategy module priority.value must compile to number.',
      suggestion: 'Use a numeric policy expression for priority.value.',
    });
    return null;
  }
  return { tier, valueAnalysis };
}

function lowerModuleSelectorBindings(
  selectors: GameSpecStrategyModuleDef['selectors'] | undefined,
  path: string,
  compileSelector: (selectorId: string) => { readonly costClass: ModuleCostClass } | null,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): readonly { readonly role: string; readonly selectorId: string }[] | null {
  const entries = selectors ?? [];
  if (!Array.isArray(entries)) {
    reportModuleRefUnknown('selectors', path);
    return null;
  }
  const seenRoles = new Set<string>();
  const lowered: { role: string; selectorId: string }[] = [];
  for (const [index, binding] of entries.entries()) {
    const role = binding?.role;
    const selectorId = binding?.selectorId;
    if (typeof role !== 'string' || role.length === 0 || typeof selectorId !== 'string' || selectorId.length === 0) {
      reportModuleRefUnknown('selector binding', `${path}.${index}`);
      return null;
    }
    if (seenRoles.has(role)) {
      return duplicateSelectorRole(role, `${path}.${index}.role`, diagnostics);
    }
    seenRoles.add(role);
    if (compileSelector(selectorId) === null) {
      reportModuleRefUnknown(`selector.${selectorId}`, `${path}.${index}.selectorId`);
      return null;
    }
    lowered.push({ role, selectorId });
  }
  return lowered;
}

function lowerModuleScoreGroups(
  scoreGroups: GameSpecStrategyModuleDef['scoreGroups'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): readonly {
  readonly id: string;
  readonly summary: StrategyModuleDef['scoreGroups'][number]['summary'];
  readonly terms: readonly { readonly id?: string; readonly analysis: PolicyExprAnalysis; readonly weight: number }[];
}[] | null {
  const groups = scoreGroups ?? [];
  if (!Array.isArray(groups)) {
    reportModuleRefUnknown('scoreGroups', path);
    return null;
  }
  const seen = new Set<string>();
  const lowered = [];
  for (const [groupIndex, group] of groups.entries()) {
    const id = group?.id;
    const groupPath = `${path}.${groupIndex}`;
    if (typeof id !== 'string' || id.length === 0) {
      reportModuleRefUnknown('scoreGroup.id', `${groupPath}.id`);
      return null;
    }
    if (seen.has(id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_SCORE_GROUP_DUPLICATE_ID,
        path: `${groupPath}.id`,
        severity: 'error',
        message: `Strategy module score group id "${id}" is declared more than once.`,
        suggestion: 'Use unique score group ids within a strategy module.',
      });
      return null;
    }
    seen.add(id);
    const summary = group.summary ?? 'sum';
    if (summary !== 'sum' && summary !== 'product' && summary !== 'max') {
      reportModuleRefUnknown('scoreGroup.summary', `${groupPath}.summary`);
      return null;
    }
    const terms = lowerModuleScoreTerms(group.terms, `${groupPath}.terms`, context, diagnostics, reportModuleRefUnknown);
    if (terms === null) return null;
    lowered.push({ id, summary, terms });
  }
  return lowered;
}

function lowerModuleScoreTerms(
  terms: NonNullable<NonNullable<GameSpecStrategyModuleDef['scoreGroups']>[number]['terms']> | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): readonly { readonly id?: string; readonly analysis: PolicyExprAnalysis; readonly weight: number }[] | null {
  const entries = terms ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    reportModuleRefUnknown('scoreGroup.terms', path);
    return null;
  }
  const lowered = [];
  for (const [termIndex, term] of entries.entries()) {
    const termPath = `${path}.${termIndex}`;
    if (!Number.isSafeInteger(term.weight)) {
      reportModuleRefUnknown('scoreTerm.weight', `${termPath}.weight`);
      return null;
    }
    if (term.value === undefined) {
      reportModuleRefUnknown('scoreTerm.value', `${termPath}.value`);
      return null;
    }
    const analysis = analyzePolicyExpr(term.value, context, diagnostics, `${termPath}.value`);
    if (analysis === null) return null;
    if (analysis.valueType !== 'number' && analysis.valueType !== 'unknown') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${termPath}.value`,
        severity: 'error',
        message: 'Strategy module score term value must compile to number.',
        suggestion: 'Use a numeric policy expression for score term value.',
      });
      return null;
    }
    lowered.push({
      ...(typeof term.id === 'string' && term.id.length > 0 ? { id: term.id } : {}),
      analysis,
      weight: term.weight,
    });
  }
  return lowered;
}

function lowerModuleGuardrailIds(
  guardrailIds: readonly string[] | undefined,
  path: string,
  compileGuardrail: (guardrailId: string) => { readonly costClass: ModuleCostClass } | null,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): readonly string[] | null {
  if (guardrailIds === undefined) return [];
  if (!isStringArray(guardrailIds)) {
    reportModuleRefUnknown('guardrailIds', path);
    return null;
  }
  for (const [index, guardrailId] of guardrailIds.entries()) {
    if (compileGuardrail(guardrailId) === null) {
      reportModuleRefUnknown(`guardrail.${guardrailId}`, `${path}.${index}`);
      return null;
    }
  }
  return guardrailIds;
}

function lowerModuleFallback(
  fallback: GameSpecStrategyModuleDef['fallback'] | undefined,
  path: string,
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): StrategyModuleDef['fallback'] | null {
  const ifInactive = fallback?.ifInactive ?? 'noContribution';
  const ifSelectorEmpty = fallback?.ifSelectorEmpty ?? 'noContribution';
  if (ifInactive !== 'noContribution' && ifInactive !== 'traceOnly') {
    reportModuleRefUnknown('fallback.ifInactive', `${path}.ifInactive`);
    return null;
  }
  if (ifSelectorEmpty !== 'noContribution' && ifSelectorEmpty !== 'demoteAndTrace') {
    reportModuleRefUnknown('fallback.ifSelectorEmpty', `${path}.ifSelectorEmpty`);
    return null;
  }
  if (ifSelectorEmpty === 'demoteAndTrace' && !Number.isSafeInteger(fallback?.selectorEmptyPenalty)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_FALLBACK_DEMOTE_REQUIRES_PENALTY,
      path: `${path}.selectorEmptyPenalty`,
      severity: 'error',
      message: 'Strategy module fallback ifSelectorEmpty: demoteAndTrace requires selectorEmptyPenalty.',
      suggestion: 'Set fallback.selectorEmptyPenalty to an exact integer penalty.',
    });
    return null;
  }
  return {
    ifInactive,
    ifSelectorEmpty,
    ...(fallback?.selectorEmptyPenalty === undefined ? {} : { selectorEmptyPenalty: fallback.selectorEmptyPenalty }),
  };
}

function lowerModulePlanTemplateGating(
  def: GameSpecStrategyModuleDef,
  moduleId: string,
  path: string,
  planTemplateIds: readonly string[],
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): {
  readonly enablesPlanTemplates: readonly string[];
  readonly suppressesPlanTemplates: readonly string[];
} | null {
  const enables = lowerModulePlanTemplateIdList(
    def.enablesPlanTemplates,
    moduleId,
    'enablesPlanTemplates',
    `${path}.enablesPlanTemplates`,
    planTemplateIds,
    diagnostics,
    reportModuleRefUnknown,
  );
  const suppresses = lowerModulePlanTemplateIdList(
    def.suppressesPlanTemplates,
    moduleId,
    'suppressesPlanTemplates',
    `${path}.suppressesPlanTemplates`,
    planTemplateIds,
    diagnostics,
    reportModuleRefUnknown,
  );
  if (enables === null || suppresses === null) return null;

  let valid = true;
  const suppressed = new Set(suppresses);
  const contradicted = enables.filter((templateId) => suppressed.has(templateId));
  if (contradicted.length > 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Strategy module "${moduleId}" declares plan template "${contradicted[0]}" in both enablesPlanTemplates and suppressesPlanTemplates.`,
      suggestion: 'Remove the template id from one of the strategy module gating lists.',
    });
    valid = false;
  }
  if (enables.length > 0 && contradicted.length === enables.length) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Strategy module "${moduleId}" plan-template gating has a degenerate empty effect: every enabled template is also suppressed.`,
      suggestion: 'Leave at least one enabled template unsuppressed or remove the contradictory gating fields.',
    });
    valid = false;
  }

  return valid ? { enablesPlanTemplates: enables, suppressesPlanTemplates: suppresses } : null;
}

function lowerModulePlanTemplateIdList(
  value: readonly string[] | undefined,
  moduleId: string,
  fieldName: 'enablesPlanTemplates' | 'suppressesPlanTemplates',
  path: string,
  planTemplateIds: readonly string[],
  diagnostics: Diagnostic[],
  reportModuleRefUnknown: (refPath: string, path: string) => void,
): readonly string[] | null {
  if (value === undefined) return [];
  if (!isStringArray(value)) {
    reportModuleRefUnknown('planTemplate', path);
    return null;
  }
  const knownTemplates = new Set(planTemplateIds);
  for (const [index, templateId] of value.entries()) {
    if (!knownTemplates.has(templateId)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Strategy module "${moduleId}" ${fieldName} references unknown plan template "${templateId}".`,
        suggestion: 'List only plan-template ids declared in agents.library.planTemplates.',
      });
      return null;
    }
  }
  return value;
}

function duplicateSelectorRole(
  role: string,
  path: string,
  diagnostics: Diagnostic[],
): null {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_SELECTOR_ROLE_DUPLICATE,
    path,
    severity: 'error',
    message: `Strategy module selector role "${role}" is declared more than once.`,
    suggestion: 'Use each module selector role once.',
  });
  return null;
}

function deriveModuleCostClass(costClasses: readonly (AgentPolicyCostClass | ModuleCostClass)[]): ModuleCostClass {
  if (costClasses.includes('auditOnly')) return 'auditOnly';
  if (costClasses.includes('preview')) return 'preview';
  if (costClasses.includes('microturn')) return 'microturn';
  if (costClasses.includes('candidate')) return 'candidate';
  return 'state';
}

function mergeModuleDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  const strategyModules = uniqueSorted(dependencies.flatMap((entry) => entry.strategyModules ?? []));
  const guardrails = uniqueSorted(dependencies.flatMap((entry) => entry.guardrails ?? []));
  const turnShapeEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.turnShapeEvaluators ?? []));
  const postureEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.postureEvaluators ?? []));
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
    ...(selectors.length === 0 ? {} : { selectors }),
    ...(strategyModules.length === 0 ? {} : { strategyModules }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    ...(turnShapeEvaluators.length === 0 ? {} : { turnShapeEvaluators }),
    ...(postureEvaluators.length === 0 ? {} : { postureEvaluators }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function emptyDependencies(): CompiledAgentDependencyRefs {
  return {
    parameters: [],
    stateFeatures: [],
    candidateFeatures: [],
    aggregates: [],
    strategicConditions: [],
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

export function moduleCostToPolicyCostClass(costClass: ModuleCostClass): AgentPolicyCostClass {
  return selectorCostToPolicyCostClass(costClass);
}
