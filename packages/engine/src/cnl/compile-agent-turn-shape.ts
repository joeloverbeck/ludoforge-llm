import { analyzePolicyExpr, type AnalyzePolicyExprContext, type PolicyExprAnalysis } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyExpr,
  AgentPolicyValueType,
  CompiledAgentDependencyRefs,
  CompiledAgentPolicyRef,
  TurnShapeEvaluatorDef,
} from '../kernel/types.js';
import type { GameSpecTurnShapeEvaluatorDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

const TURN_SHAPE_SOURCE = 'currentPreviewDrive';
const TURN_SHAPE_DEPTH_CAP_REF = 'profile.preview.inner.depthCap';
const TURN_SHAPE_FALLBACKS = new Set(['traceOnly', 'demote']);
const UNREGISTERED_PREVIEW_REF_PREFIX = '__unregistered__:';

export type AgentTurnShapeEvaluatorWithExpr = TurnShapeEvaluatorDef & {
  readonly objectives: readonly (Omit<TurnShapeEvaluatorDef['objectives'][number], 'value' | 'delta'> & {
    readonly value?: AgentPolicyExpr;
    readonly delta?: AgentPolicyExpr;
  })[];
  readonly minimumImpact: AgentPolicyExpr;
  readonly fallback: Omit<TurnShapeEvaluatorDef['fallback'], 'demotePenalty'> & {
    readonly demotePenalty?: AgentPolicyExpr;
  };
};

export interface TurnShapeCompileOptions {
  readonly evaluatorId: string;
  readonly def: GameSpecTurnShapeEvaluatorDef;
  readonly context: AnalyzePolicyExprContext;
  readonly diagnostics: Diagnostic[];
  readonly reportTurnShapeRefUnknown: (refPath: string, path: string) => void;
  readonly reportTurnShapeUnregisteredPreviewRef: (refPath: string, path: string) => void;
}

export function compileTurnShapeEvaluatorDefinition(
  options: TurnShapeCompileOptions,
): AgentTurnShapeEvaluatorWithExpr | null {
  const {
    evaluatorId,
    def,
    context,
    diagnostics,
    reportTurnShapeRefUnknown,
    reportTurnShapeUnregisteredPreviewRef,
  } = options;
  const basePath = `doc.agents.library.turnShapeEvaluators.${evaluatorId}`;
  const source = lowerSource(def.source, `${basePath}.source`, diagnostics, reportTurnShapeRefUnknown);
  const bounds = lowerBounds(def.bounds, `${basePath}.bounds`, diagnostics, reportTurnShapeRefUnknown);
  const objectives = lowerObjectives(def.objectives, `${basePath}.objectives`, context, diagnostics, reportTurnShapeRefUnknown);
  const minimumImpact = analyzePolicyExpr(def.minimumImpact ?? false, context, diagnostics, `${basePath}.minimumImpact`);
  const fallback = lowerFallback(def.fallback, `${basePath}.fallback`, context, diagnostics, reportTurnShapeRefUnknown);

  if (minimumImpact !== null && minimumImpact.valueType !== 'boolean' && minimumImpact.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${basePath}.minimumImpact`,
      severity: 'error',
      message: `Turn-shape evaluator "${evaluatorId}" minimumImpact must compile to boolean.`,
      suggestion: 'Use a boolean policy expression for turnShapeEvaluators.<id>.minimumImpact.',
    });
    return null;
  }

  if (source === null || bounds === null || objectives === null || minimumImpact === null || fallback === null) {
    return null;
  }

  const unregisteredPreviewRef = [
    ...objectives.flatMap((objective) => [
      ...(objective.valueAnalysis === undefined ? [] : collectUnregisteredPreviewRefs(objective.valueAnalysis.expr)),
      ...(objective.deltaAnalysis === undefined ? [] : collectUnregisteredPreviewRefs(objective.deltaAnalysis.expr)),
    ]),
    ...collectUnregisteredPreviewRefs(minimumImpact.expr),
  ][0];
  if (unregisteredPreviewRef !== undefined) {
    reportTurnShapeUnregisteredPreviewRef(unregisteredPreviewRef, basePath);
    return null;
  }

  const dependencies = mergeDependencies([
    ...objectives.flatMap((objective) => [
      ...(objective.valueAnalysis === undefined ? [] : [objective.valueAnalysis.dependencies]),
      ...(objective.deltaAnalysis === undefined ? [] : [objective.deltaAnalysis.dependencies]),
    ]),
    minimumImpact.dependencies,
    ...(fallback.demotePenaltyAnalysis === null ? [] : [fallback.demotePenaltyAnalysis.dependencies]),
  ]);

  return {
    id: evaluatorId as AgentTurnShapeEvaluatorWithExpr['id'],
    traceLabel: def.traceLabel ?? evaluatorId,
    source,
    bounds,
    objectives: objectives.map((objective) => ({
      id: objective.id as AgentTurnShapeEvaluatorWithExpr['objectives'][number]['id'],
      ...(objective.valueAnalysis === undefined ? {} : { value: objective.valueAnalysis.expr }),
      ...(objective.deltaAnalysis === undefined ? {} : { delta: objective.deltaAnalysis.expr }),
    })),
    minimumImpact: minimumImpact.expr,
    fallback: {
      onPreviewUnavailable: fallback.onPreviewUnavailable,
      ...(fallback.demotePenaltyAnalysis === null ? {} : { demotePenalty: fallback.demotePenaltyAnalysis.expr }),
    },
    costClass: 'preview',
    dependencies,
  };
}

export function parseTurnShapeRef(refPath: string): {
  readonly evaluatorId: string;
  readonly field: Extract<CompiledAgentPolicyRef, { readonly kind: 'turnShape' }>['field'];
  readonly type: AgentPolicyValueType;
} | null {
  const rest = refPath.slice('turnShape.'.length);
  const objective = rest.match(/^([^.]+)\.objective\.([^.]+)\.(value|delta)$/);
  if (objective !== null) {
    return {
      evaluatorId: objective[1]!,
      field: {
        kind: objective[3] === 'value' ? 'objective.value' : 'objective.delta',
        objectiveId: objective[2]!,
      },
      type: 'number',
    };
  }
  const dotIndex = rest.indexOf('.');
  if (dotIndex <= 0) return null;
  const evaluatorId = rest.slice(0, dotIndex);
  const field = rest.slice(dotIndex + 1);
  switch (field) {
    case 'minimumImpactSatisfied':
      return { evaluatorId, field, type: 'boolean' };
    case 'previewStatus':
      return { evaluatorId, field, type: 'id' };
    default:
      return null;
  }
}

function lowerSource(
  source: string | undefined,
  path: string,
  diagnostics: Diagnostic[],
  reportTurnShapeRefUnknown: (refPath: string, path: string) => void,
): TurnShapeEvaluatorDef['source'] | null {
  const value = source ?? TURN_SHAPE_SOURCE;
  if (value !== TURN_SHAPE_SOURCE) {
    reportTurnShapeRefUnknown('source', path);
    return null;
  }
  return value;
}

function lowerBounds(
  bounds: GameSpecTurnShapeEvaluatorDef['bounds'] | undefined,
  path: string,
  diagnostics: Diagnostic[],
  reportTurnShapeRefUnknown: (refPath: string, path: string) => void,
): TurnShapeEvaluatorDef['bounds'] | null {
  const depthCapRef = bounds?.depthCapRef ?? TURN_SHAPE_DEPTH_CAP_REF;
  if (depthCapRef !== TURN_SHAPE_DEPTH_CAP_REF) {
    reportTurnShapeRefUnknown('bounds.depthCapRef', `${path}.depthCapRef`);
    return null;
  }
  const maxSyntheticDecisions = bounds?.maxSyntheticDecisions;
  if (
    typeof maxSyntheticDecisions !== 'number'
    || !Number.isSafeInteger(maxSyntheticDecisions)
    || maxSyntheticDecisions <= 0
  ) {
    reportTurnShapeRefUnknown('bounds.maxSyntheticDecisions', `${path}.maxSyntheticDecisions`);
    return null;
  }
  return { depthCapRef, maxSyntheticDecisions };
}

function lowerObjectives(
  objectives: GameSpecTurnShapeEvaluatorDef['objectives'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  reportTurnShapeRefUnknown: (refPath: string, path: string) => void,
): readonly {
  readonly id: string;
  readonly valueAnalysis?: PolicyExprAnalysis;
  readonly deltaAnalysis?: PolicyExprAnalysis;
}[] | null {
  const entries = objectives ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    reportTurnShapeRefUnknown('objectives', path);
    return null;
  }
  const seen = new Set<string>();
  const lowered = [];
  for (const [index, objective] of entries.entries()) {
    const objectivePath = `${path}.${index}`;
    const id = objective?.id;
    if (typeof id !== 'string' || id.length === 0) {
      reportTurnShapeRefUnknown('objective.id', `${objectivePath}.id`);
      return null;
    }
    if (seen.has(id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_ID_DUPLICATE,
        path: `${objectivePath}.id`,
        severity: 'error',
        message: `Turn-shape objective id "${id}" is declared more than once.`,
        suggestion: 'Use unique objective ids within one turn-shape evaluator.',
      });
      return null;
    }
    seen.add(id);
    const hasValue = objective.value !== undefined;
    const hasDelta = objective.delta !== undefined;
    if (!hasValue && !hasDelta) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_REQUIRES_VALUE_OR_DELTA,
        path: objectivePath,
        severity: 'error',
        message: `Turn-shape objective "${id}" must declare value or delta.`,
        suggestion: 'Set exactly one of objective.value or objective.delta.',
      });
      return null;
    }
    if (hasValue && hasDelta) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_HAS_BOTH_VALUE_AND_DELTA,
        path: objectivePath,
        severity: 'error',
        message: `Turn-shape objective "${id}" declares both value and delta.`,
        suggestion: 'Set exactly one of objective.value or objective.delta.',
      });
      return null;
    }
    const valueAnalysis = hasValue ? analyzeNumericObjective(objective.value, context, diagnostics, `${objectivePath}.value`) : undefined;
    const deltaAnalysis = hasDelta ? analyzeNumericObjective(objective.delta, context, diagnostics, `${objectivePath}.delta`) : undefined;
    if ((hasValue && valueAnalysis === null) || (hasDelta && deltaAnalysis === null)) {
      return null;
    }
    lowered.push({
      id,
      ...(valueAnalysis === undefined || valueAnalysis === null ? {} : { valueAnalysis }),
      ...(deltaAnalysis === undefined || deltaAnalysis === null ? {} : { deltaAnalysis }),
    });
  }
  return lowered;
}

function analyzeNumericObjective(
  expr: NonNullable<GameSpecTurnShapeEvaluatorDef['objectives']>[number]['value'],
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const analysis = analyzePolicyExpr(expr!, context, diagnostics, path);
  if (analysis === null) return null;
  if (analysis.valueType !== 'number' && analysis.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'Turn-shape objective value or delta must compile to number.',
      suggestion: 'Use a numeric policy expression for objective.value or objective.delta.',
    });
    return null;
  }
  return analysis;
}

function lowerFallback(
  fallback: GameSpecTurnShapeEvaluatorDef['fallback'] | undefined,
  path: string,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  reportTurnShapeRefUnknown: (refPath: string, path: string) => void,
): {
  readonly onPreviewUnavailable: TurnShapeEvaluatorDef['fallback']['onPreviewUnavailable'];
  readonly demotePenaltyAnalysis: PolicyExprAnalysis | null;
} | null {
  const onPreviewUnavailable = fallback?.onPreviewUnavailable ?? 'traceOnly';
  if (!TURN_SHAPE_FALLBACKS.has(onPreviewUnavailable)) {
    reportTurnShapeRefUnknown('fallback.onPreviewUnavailable', `${path}.onPreviewUnavailable`);
    return null;
  }
  const demotePenaltyAnalysis = fallback?.demotePenalty === undefined
    ? null
    : analyzePolicyExpr(fallback.demotePenalty, context, diagnostics, `${path}.demotePenalty`);
  if (fallback?.demotePenalty !== undefined && demotePenaltyAnalysis === null) return null;
  if (demotePenaltyAnalysis !== null && demotePenaltyAnalysis.valueType !== 'number' && demotePenaltyAnalysis.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${path}.demotePenalty`,
      severity: 'error',
      message: 'Turn-shape demotePenalty must compile to number.',
      suggestion: 'Use a numeric policy expression for fallback.demotePenalty.',
    });
    return null;
  }
  if (onPreviewUnavailable === 'demote' && demotePenaltyAnalysis === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_FALLBACK_DEMOTE_REQUIRES_PENALTY,
      path: `${path}.demotePenalty`,
      severity: 'error',
      message: 'Turn-shape fallback onPreviewUnavailable: demote requires demotePenalty.',
      suggestion: 'Set fallback.demotePenalty to an exact numeric policy expression.',
    });
    return null;
  }
  return {
    onPreviewUnavailable: onPreviewUnavailable as TurnShapeEvaluatorDef['fallback']['onPreviewUnavailable'],
    demotePenaltyAnalysis,
  };
}

function collectUnregisteredPreviewRefs(expr: AgentPolicyExpr): readonly string[] {
  if (
    expr.kind === 'ref'
    && expr.ref.kind === 'previewOptionRef'
    && expr.ref.id?.startsWith(UNREGISTERED_PREVIEW_REF_PREFIX) === true
  ) {
    return [`preview.option.${previewRefSegment(expr.ref.refKind)}.${expr.ref.id.slice(UNREGISTERED_PREVIEW_REF_PREFIX.length)}`];
  }
  if (expr.kind === 'op') {
    return expr.args.flatMap(collectUnregisteredPreviewRefs);
  }
  return [];
}

export function tagUnregisteredTurnShapePreviewRef(id: string): string {
  return `${UNREGISTERED_PREVIEW_REF_PREFIX}${id}`;
}

function previewRefSegment(refKind: string): string {
  switch (refKind) {
    case 'globalVar':
      return 'var.global';
    case 'perPlayerVarSelf':
      return 'var.player.self';
    case 'derivedMetric':
      return 'metric';
    default:
      return refKind;
  }
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
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

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
