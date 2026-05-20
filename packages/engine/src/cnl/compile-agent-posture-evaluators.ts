import { analyzePolicyExpr, type AnalyzePolicyExprContext, type PolicyExprAnalysis } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyExpr,
  CompiledAgentDependencyRefs,
  CompiledPostureEvaluator,
} from '../kernel/types.js';
import type { GameSpecPostureEvaluatorDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export type AgentPostureEvaluatorWithExpr = Omit<CompiledPostureEvaluator, 'must' | 'prefer'> & {
  readonly must: readonly (Omit<CompiledPostureEvaluator['must'][number], 'condition' | 'demotePenalty'> & {
    readonly condition: AgentPolicyExpr;
    readonly demotePenalty?: AgentPolicyExpr;
  })[];
  readonly prefer: readonly (Omit<CompiledPostureEvaluator['prefer'][number], 'when' | 'value' | 'weight' | 'fallback'> & {
    readonly when?: AgentPolicyExpr;
    readonly value: AgentPolicyExpr;
    readonly weight: AgentPolicyExpr;
    readonly fallback: {
      readonly contribution: AgentPolicyExpr;
    };
  })[];
};

export interface PostureCompileOptions {
  readonly evaluatorId: string;
  readonly def: GameSpecPostureEvaluatorDef;
  readonly context: AnalyzePolicyExprContext;
  readonly diagnostics: Diagnostic[];
  readonly reportPostureRefUnknown: (refPath: string, path: string) => void;
}

export function compilePostureEvaluatorDefinition(
  options: PostureCompileOptions,
): AgentPostureEvaluatorWithExpr | null {
  const { evaluatorId, def, context, diagnostics, reportPostureRefUnknown } = options;
  const basePath = `doc.agents.library.postureEvaluators.${evaluatorId}`;
  const must = lowerMust(def.must, `${basePath}.must`, context, diagnostics);
  const prefer = lowerPrefer(def.prefer, `${basePath}.prefer`, context, diagnostics, reportPostureRefUnknown);

  if (must === null || prefer === null) {
    return null;
  }
  if (must.length === 0 && prefer.length === 0) {
    reportPostureRefUnknown('must/prefer', basePath);
    return null;
  }

  const dependencies = mergeDependencies([
    ...must.flatMap((entry) => [
      entry.conditionAnalysis.dependencies,
      ...(entry.demotePenaltyAnalysis === undefined ? [] : [entry.demotePenaltyAnalysis.dependencies]),
    ]),
    ...prefer.flatMap((entry) => [
      ...(entry.whenAnalysis === undefined ? [] : [entry.whenAnalysis.dependencies]),
      entry.valueAnalysis.dependencies,
      entry.weightAnalysis.dependencies,
      entry.fallbackContributionAnalysis.dependencies,
    ]),
  ]);

  return {
    id: evaluatorId,
    traceLabel: def.traceLabel ?? evaluatorId,
    must: must.map((entry) => ({
      id: entry.id,
      condition: entry.conditionAnalysis.expr,
      onViolation: entry.onViolation,
      ...(entry.demotePenaltyAnalysis === undefined ? {} : { demotePenalty: entry.demotePenaltyAnalysis.expr }),
    })),
    prefer: prefer.map((entry) => ({
      id: entry.id,
      ...(entry.whenAnalysis === undefined ? {} : { when: entry.whenAnalysis.expr }),
      value: entry.valueAnalysis.expr,
      weight: entry.weightAnalysis.expr,
      fallback: {
        contribution: entry.fallbackContributionAnalysis.expr,
      },
    })),
    costClass: 'preview',
    dependencies,
  };
}

function lowerMust(
  entries: GameSpecPostureEvaluatorDef['must'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
): readonly {
  readonly id: string;
  readonly conditionAnalysis: PolicyExprAnalysis;
  readonly onViolation: 'demote' | 'veto';
  readonly demotePenaltyAnalysis?: PolicyExprAnalysis;
}[] | null {
  const lowered = [];
  for (const [index, entry] of (entries ?? []).entries()) {
    const entryPath = `${path}.${index}`;
    const id = entry.id ?? `must-${index + 1}`;
    const condition = analyzePolicyExpr(entry.condition ?? true, context, diagnostics, `${entryPath}.condition`);
    const demotePenalty = entry.demotePenalty === undefined
      ? undefined
      : analyzePolicyExpr(entry.demotePenalty, context, diagnostics, `${entryPath}.demotePenalty`);
    if (condition === null || demotePenalty === null) return null;
    if (condition.valueType !== 'boolean' && condition.valueType !== 'unknown') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${entryPath}.condition`,
        severity: 'error',
        message: `Posture must term "${id}" condition must compile to boolean.`,
        suggestion: 'Use a boolean policy expression for postureEvaluators.<id>.must[].condition.',
      });
      return null;
    }
    if (
      demotePenalty !== undefined
      && demotePenalty.valueType !== 'number'
      && demotePenalty.valueType !== 'unknown'
    ) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${entryPath}.demotePenalty`,
        severity: 'error',
        message: `Posture must term "${id}" demotePenalty must compile to number.`,
        suggestion: 'Use a numeric policy expression for demotePenalty.',
      });
      return null;
    }
    lowered.push({
      id,
      conditionAnalysis: condition,
      onViolation: entry.onViolation ?? 'demote',
      ...(demotePenalty === undefined ? {} : { demotePenaltyAnalysis: demotePenalty }),
    });
  }
  return lowered;
}

function lowerPrefer(
  entries: GameSpecPostureEvaluatorDef['prefer'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  reportPostureRefUnknown: (refPath: string, path: string) => void,
): readonly {
  readonly id: string;
  readonly whenAnalysis?: PolicyExprAnalysis;
  readonly valueAnalysis: PolicyExprAnalysis;
  readonly weightAnalysis: PolicyExprAnalysis;
  readonly fallbackContributionAnalysis: PolicyExprAnalysis;
}[] | null {
  const lowered = [];
  for (const [index, entry] of (entries ?? []).entries()) {
    const entryPath = `${path}.${index}`;
    const id = entry.id ?? `prefer-${index + 1}`;
    if (entry.fallback?.contribution === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_PREFER_REQUIRES_FALLBACK,
        path: `${entryPath}.fallback`,
        severity: 'error',
        message: `Posture prefer term "${id}" must declare fallback.contribution for non-ready preview.`,
        suggestion: 'Add fallback.contribution so non-ready preview never silently coerces to a numeric contribution.',
      });
      return null;
    }
    if (entry.value === undefined) {
      reportPostureRefUnknown('prefer.value', `${entryPath}.value`);
      return null;
    }
    const when = entry.when === undefined ? undefined : analyzePolicyExpr(entry.when, context, diagnostics, `${entryPath}.when`);
    const value = analyzePolicyExpr(entry.value, context, diagnostics, `${entryPath}.value`);
    const weight = analyzePolicyExpr(entry.weight ?? 1, context, diagnostics, `${entryPath}.weight`);
    const fallbackContribution = analyzePolicyExpr(
      entry.fallback.contribution,
      context,
      diagnostics,
      `${entryPath}.fallback.contribution`,
    );
    if (when === null || value === null || weight === null || fallbackContribution === null) return null;
    if (when !== undefined && when.valueType !== 'boolean' && when.valueType !== 'unknown') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${entryPath}.when`,
        severity: 'error',
        message: `Posture prefer term "${id}" when must compile to boolean.`,
        suggestion: 'Use a boolean policy expression for posture prefer when.',
      });
      return null;
    }
    for (const [label, analysis] of [
      ['value', value],
      ['weight', weight],
      ['fallback.contribution', fallbackContribution],
    ] as const) {
      if (analysis.valueType !== 'number' && analysis.valueType !== 'unknown') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
          path: `${entryPath}.${label}`,
          severity: 'error',
          message: `Posture prefer term "${id}" ${label} must compile to number.`,
          suggestion: 'Use a numeric policy expression for posture prefer scoring.',
        });
        return null;
      }
    }
    lowered.push({
      id,
      ...(when === undefined ? {} : { whenAnalysis: when }),
      valueAnalysis: value,
      weightAnalysis: weight,
      fallbackContributionAnalysis: fallbackContribution,
    });
  }
  return lowered;
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  const strategyModules = uniqueSorted(dependencies.flatMap((entry) => entry.strategyModules ?? []));
  const planTemplates = uniqueSorted(dependencies.flatMap((entry) => entry.planTemplates ?? []));
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
    ...(planTemplates.length === 0 ? {} : { planTemplates }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    ...(turnShapeEvaluators.length === 0 ? {} : { turnShapeEvaluators }),
    ...(postureEvaluators.length === 0 ? {} : { postureEvaluators }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
