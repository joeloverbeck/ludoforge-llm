import { analyzePolicyExpr, type AnalyzePolicyExprContext } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  ActionDef,
  AgentPolicyValueType,
  AgentPolicyExpr,
  CompiledAgentDependencyRefs,
  CompiledAgentPolicyRef,
  GuardrailCostClass,
  GuardrailDef,
} from '../kernel/types.js';
import type { GameSpecGuardrailDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { normalizeSelectorScopes, selectorCostToPolicyCostClass } from './compile-agent-selectors.js';

const GUARDRAIL_SEVERITIES = new Set(['prune', 'demote', 'warn', 'auditOnly']);
const GUARDRAIL_ON_UNAVAILABLE = new Set(['warnUnknown', 'noFire', 'fire']);

export type AgentGuardrailWithExpr = GuardrailDef & {
  readonly when: AgentPolicyExpr;
  readonly penalty?: AgentPolicyExpr;
};

export interface GuardrailCompileOptions {
  readonly guardrailId: string;
  readonly def: GameSpecGuardrailDef;
  readonly context: AnalyzePolicyExprContext;
  readonly diagnostics: Diagnostic[];
  readonly actionDefs?: readonly ActionDef[];
  readonly reportGuardrailRefUnknown: (refPath: string, path: string) => void;
}

export function compileGuardrailDefinition(options: GuardrailCompileOptions): AgentGuardrailWithExpr | null {
  const { guardrailId, def, context, diagnostics, actionDefs, reportGuardrailRefUnknown } = options;
  const basePath = `doc.agents.library.guardrails.${guardrailId}`;
  const when = analyzePolicyExpr(def.when ?? true, context, diagnostics, `${basePath}.when`);
  if (when === null) {
    reportGuardrailRefUnknown('when', `${basePath}.when`);
    return null;
  }
  if (when.valueType !== 'boolean' && when.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${basePath}.when`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" when must compile to boolean.`,
      suggestion: 'Use a boolean policy expression in guardrails.<id>.when.',
    });
    return null;
  }

  const scopes = normalizeSelectorScopes(def.scopes, `${basePath}.scopes`, diagnostics);
  const severity = lowerGuardrailSeverity(def.severity, `${basePath}.severity`, diagnostics);
  const onUnavailable = lowerOnUnavailable(def.onUnavailable, `${basePath}.onUnavailable`, diagnostics);
  if (scopes === null || severity === null || onUnavailable === null) return null;

  const penalty = def.penalty === undefined
    ? null
    : analyzePolicyExpr(def.penalty, context, diagnostics, `${basePath}.penalty`);
  if (def.penalty !== undefined && penalty === null) return null;
  if (penalty !== null && penalty.valueType !== 'number' && penalty.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${basePath}.penalty`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" penalty must compile to number.`,
      suggestion: 'Use a numeric policy expression for severity: demote penalties.',
    });
    return null;
  }

  const allPruned = lowerAllPrunedFallback(def, `${basePath}.onAllPruned`, actionDefs, diagnostics);
  if (allPruned === null) return null;
  if (severity === 'demote' && penalty === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_DEMOTE_REQUIRES_PENALTY,
      path: `${basePath}.penalty`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" severity: demote requires penalty.`,
      suggestion: 'Set guardrails.<id>.penalty to an exact numeric policy expression.',
    });
    return null;
  }
  if (severity === 'prune' && def.safe !== true) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_SAFE,
      path: `${basePath}.safe`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" severity: prune requires safe: true.`,
      suggestion: 'Use demote or warn unless the prune rule is proven safe and declares safe: true.',
    });
    return null;
  }
  if (severity === 'prune' && allPruned === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_ON_ALL_PRUNED,
      path: `${basePath}.onAllPruned`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" severity: prune requires onAllPruned.`,
      suggestion: 'Declare the pass-tagged fallback action used if the prune rule empties the frontier.',
    });
    return null;
  }
  if (when.costClass === 'preview' && def.onUnavailable === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_PREVIEW_REQUIRES_FALLBACK,
      path: `${basePath}.onUnavailable`,
      severity: 'error',
      message: `Guardrail "${guardrailId}" reads preview refs and must declare onUnavailable.`,
      suggestion: 'Choose warnUnknown, noFire, or fire explicitly for unavailable preview evidence.',
    });
    return null;
  }

  const dependencies = mergeDependencies([
    when.dependencies,
    ...(penalty === null ? [] : [penalty.dependencies]),
  ]);
  return {
    id: guardrailId as AgentGuardrailWithExpr['id'],
    traceLabel: def.traceLabel ?? guardrailId,
    scopes,
    when: when.expr,
    severity,
    ...(penalty === null ? {} : { penalty: penalty.expr }),
    ...(def.safe === true ? { safe: true as const } : {}),
    ...(allPruned === undefined ? {} : { onAllPruned: allPruned }),
    onUnavailable,
    costClass: deriveGuardrailCostClass(when.costClass),
    dependencies,
  };
}

export function parseGuardrailRef(refPath: string): {
  readonly guardrailId: string;
  readonly field: Extract<CompiledAgentPolicyRef, { readonly kind: 'guardrail' }>['field'];
  readonly type: AgentPolicyValueType;
} | null {
  const rest = refPath.slice('guardrail.'.length);
  const dotIndex = rest.indexOf('.');
  if (dotIndex <= 0) return null;
  const guardrailId = rest.slice(0, dotIndex);
  const field = rest.slice(dotIndex + 1);
  switch (field) {
    case 'fired':
      return { guardrailId, field, type: 'boolean' };
    case 'penalty':
      return { guardrailId, field, type: 'number' };
    case 'severity':
    case 'status':
    case 'onUnavailable':
      return { guardrailId, field, type: 'id' };
    default:
      return null;
  }
}

function lowerGuardrailSeverity(
  value: string | undefined,
  path: string,
  diagnostics: Diagnostic[],
): GuardrailDef['severity'] | null {
  if (typeof value !== 'string' || !GUARDRAIL_SEVERITIES.has(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
      path,
      severity: 'error',
      message: 'Guardrail severity must be prune, demote, warn, or auditOnly.',
      suggestion: 'Set guardrails.<id>.severity to a supported severity tier.',
    });
    return null;
  }
  return value as GuardrailDef['severity'];
}

function lowerOnUnavailable(
  value: string | undefined,
  path: string,
  diagnostics: Diagnostic[],
): GuardrailDef['onUnavailable'] | null {
  if (value === undefined) return 'noFire';
  if (!GUARDRAIL_ON_UNAVAILABLE.has(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
      path,
      severity: 'error',
      message: 'Guardrail onUnavailable must be warnUnknown, noFire, or fire.',
      suggestion: 'Choose an explicit unavailable-preview behavior for this guardrail.',
    });
    return null;
  }
  return value as GuardrailDef['onUnavailable'];
}

function lowerAllPrunedFallback(
  def: GameSpecGuardrailDef,
  path: string,
  actionDefs: readonly ActionDef[] | undefined,
  diagnostics: Diagnostic[],
): GuardrailDef['onAllPruned'] | undefined | null {
  if (def.onAllPruned === undefined) return undefined;
  const actionId = def.onAllPruned.actionId;
  if (typeof actionId !== 'string' || actionId.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
      path: `${path}.actionId`,
      severity: 'error',
      message: 'Guardrail onAllPruned.actionId must name an action.',
      suggestion: 'Point onAllPruned.actionId at a pass-tagged authored action.',
    });
    return null;
  }
  const action = actionDefs?.find((entry) => entry.id === actionId);
  if (action === undefined || !(action.tags ?? []).includes('pass')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED,
      path: `${path}.actionId`,
      severity: 'error',
      message: `Guardrail onAllPruned action "${actionId}" must resolve to an action tagged pass.`,
      suggestion: 'Use an authored fallback action with tags: [pass].',
    });
    return null;
  }
  return {
    actionId: action.id,
    traceLabel: def.onAllPruned.traceLabel ?? actionId,
  };
}

function deriveGuardrailCostClass(costClass: 'state' | 'candidate' | 'preview'): GuardrailCostClass {
  return selectorCostToPolicyCostClass(costClass) as GuardrailCostClass;
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  const strategyModules = uniqueSorted(dependencies.flatMap((entry) => entry.strategyModules ?? []));
  const guardrails = uniqueSorted(dependencies.flatMap((entry) => entry.guardrails ?? []));
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
    ...(selectors.length === 0 ? {} : { selectors }),
    ...(strategyModules.length === 0 ? {} : { strategyModules }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
