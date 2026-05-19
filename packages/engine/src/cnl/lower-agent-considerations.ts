import type {
  AgentPolicyExpr,
  AgentPolicyCostClass,
  AgentPolicyValueType,
  AgentCandidateParamFallback,
  AgentLookupFallback,
  AgentPreviewFallback,
  AgentScheduleFallback,
  CompiledAgentDependencyRefs,
  CompiledPolicyCatalog,
  CompiledPolicyAggregate,
  CompiledPolicyCandidateFeature,
  CompiledPolicyConsideration,
  CompiledPolicyExpr,
  CompiledPolicySelector,
  CompiledPolicyStateFeature,
  CompiledPolicyStrategicCondition,
  CompiledPolicyTieBreaker,
  CompiledPolicyZoneSource,
  GuardrailDef,
  StrategyModuleDef,
  TurnShapeEvaluatorDef,
} from '../kernel/types.js';
import {
  computeDependenciesReadFootprint,
  computePolicyExprReadFootprint,
  unionFootprints,
} from './compile-effect-footprint.js';

export interface AgentPolicyLibraryWithExpr {
  readonly stateFeatures: Readonly<Record<string, {
    readonly type: AgentPolicyValueType;
    readonly costClass: AgentPolicyCostClass;
    readonly expr: AgentPolicyExpr;
    readonly dependencies: CompiledAgentDependencyRefs;
  }>>;
  readonly candidateFeatures: Readonly<Record<string, {
    readonly type: AgentPolicyValueType;
    readonly costClass: AgentPolicyCostClass;
    readonly expr: AgentPolicyExpr;
    readonly dependencies: CompiledAgentDependencyRefs;
  }>>;
  readonly candidateAggregates: Readonly<Record<string, {
    readonly type: AgentPolicyValueType;
    readonly costClass: AgentPolicyCostClass;
    readonly op: string;
    readonly of: AgentPolicyExpr;
    readonly where?: AgentPolicyExpr;
    readonly dependencies: CompiledAgentDependencyRefs;
  }>>;
  readonly selectors: Readonly<Record<string, CompiledPolicySelector>>;
  readonly strategyModules: Readonly<Record<string, StrategyModuleDef>>;
  readonly guardrails: Readonly<Record<string, GuardrailDef>>;
  readonly turnShapeEvaluators: Readonly<Record<string, TurnShapeEvaluatorDef>>;
  readonly considerations: Readonly<Record<string, {
    readonly scopes?: readonly ('move' | 'microturn')[];
    readonly costClass: AgentPolicyCostClass;
    readonly when?: AgentPolicyExpr;
    readonly weight: AgentPolicyExpr;
    readonly value: AgentPolicyExpr;
    readonly hasPreviewRef?: boolean;
    readonly hasLookupRef?: boolean;
    readonly unknownAs?: number;
    readonly previewFallback?: AgentPreviewFallback;
    readonly lookupFallback?: AgentLookupFallback;
    readonly candidateParamFallback?: AgentCandidateParamFallback;
    readonly scheduleFallback?: AgentScheduleFallback;
    readonly clamp?: {
      readonly min?: number;
      readonly max?: number;
    };
    readonly dependencies: CompiledAgentDependencyRefs;
  }>>;
  readonly tieBreakers: Readonly<Record<string, {
    readonly kind: string;
    readonly costClass: AgentPolicyCostClass;
    readonly value?: AgentPolicyExpr;
    readonly order?: readonly string[];
    readonly dependencies: CompiledAgentDependencyRefs;
  }>>;
  readonly strategicConditions: Readonly<Record<string, {
    readonly target: AgentPolicyExpr;
    readonly proximity?: {
      readonly current: AgentPolicyExpr;
      readonly threshold: number;
    };
  }>>;
}

export function lowerAgentConsiderations(
  library: AgentPolicyLibraryWithExpr,
): CompiledPolicyCatalog {
  const stateFeatures: Record<string, CompiledPolicyStateFeature> = {};
  const candidateFeatures: Record<string, CompiledPolicyCandidateFeature> = {};
  const candidateAggregates: Record<string, CompiledPolicyAggregate> = {};
  const selectors: Record<string, CompiledPolicySelector> = {};
  const strategyModules: Record<string, StrategyModuleDef> = {};
  const guardrails: Record<string, GuardrailDef> = {};
  const turnShapeEvaluators: Record<string, TurnShapeEvaluatorDef> = {};
  const considerations: Record<string, CompiledPolicyConsideration> = {};
  const tieBreakers: Record<string, CompiledPolicyTieBreaker> = {};
  const strategicConditions: Record<string, CompiledPolicyStrategicCondition> = {};

  for (const [featureId, feature] of Object.entries(library.stateFeatures)) {
    const expr = lowerAgentPolicyExpr(feature.expr);
    if (expr === null) continue;
    stateFeatures[featureId] = { ...feature, expr };
  }

  for (const [featureId, feature] of Object.entries(library.candidateFeatures)) {
    const expr = lowerAgentPolicyExpr(feature.expr);
    if (expr === null) continue;
    candidateFeatures[featureId] = { ...feature, expr };
  }

  for (const [aggregateId, aggregate] of Object.entries(library.candidateAggregates)) {
    const of = lowerAgentPolicyExpr(aggregate.of);
    const where = aggregate.where === undefined ? null : lowerAgentPolicyExpr(aggregate.where);
    if (of === null || (aggregate.where !== undefined && where === null)) continue;
    candidateAggregates[aggregateId] = {
      ...aggregate,
      of,
      ...(where === null ? {} : { where }),
    };
  }

  for (const [selectorId, selector] of Object.entries(library.selectors)) {
    const where = selector.where === undefined ? null : lowerAgentPolicyExpr(selector.where);
    const minImpact = selector.minImpact === undefined ? null : lowerAgentPolicyExpr(selector.minImpact);
    const components = selector.quality?.components.map((component) => {
      const value = lowerAgentPolicyExpr(component.value);
      return value === null ? null : { ...component, value };
    });
    if (
      (selector.where !== undefined && where === null)
      || (selector.minImpact !== undefined && minImpact === null)
      || components?.some((component) => component === null) === true
    ) {
      continue;
    }
    selectors[selectorId] = {
      ...selector,
      ...(where === null ? {} : { where }),
      ...(selector.quality === undefined ? {} : {
        quality: {
          ...selector.quality,
          components: components as NonNullable<CompiledPolicySelector['quality']>['components'],
        },
      }),
      ...(minImpact === null ? {} : { minImpact }),
    };
  }

  for (const [moduleId, module] of Object.entries(library.strategyModules)) {
    const when = lowerAgentPolicyExpr(module.when);
    const priorityValue = module.priority.value === undefined ? null : lowerAgentPolicyExpr(module.priority.value);
    const scoreGroups = module.scoreGroups.map((group) => {
      const terms = group.terms.map((term) => {
        const value = lowerAgentPolicyExpr(term.value);
        return value === null ? null : { ...term, value };
      });
      return terms.some((term) => term === null) ? null : { ...group, terms };
    });
    if (
      when === null
      || (module.priority.value !== undefined && priorityValue === null)
      || scoreGroups.some((group) => group === null)
    ) {
      continue;
    }
    strategyModules[moduleId] = {
      ...module,
      when,
      priority: {
        ...module.priority,
        ...(priorityValue === null ? {} : { value: priorityValue }),
      },
      scoreGroups: scoreGroups as StrategyModuleDef['scoreGroups'],
    };
  }

  for (const [guardrailId, guardrail] of Object.entries(library.guardrails)) {
    const when = lowerAgentPolicyExpr(guardrail.when);
    const penalty = guardrail.penalty === undefined ? null : lowerAgentPolicyExpr(guardrail.penalty);
    if (when === null || (guardrail.penalty !== undefined && penalty === null)) {
      continue;
    }
    guardrails[guardrailId] = {
      ...guardrail,
      when,
      ...(penalty === null ? {} : { penalty }),
    };
  }

  for (const [evaluatorId, evaluator] of Object.entries(library.turnShapeEvaluators)) {
    const objectives = evaluator.objectives.map((objective) => {
      const value = objective.value === undefined ? null : lowerAgentPolicyExpr(objective.value);
      const delta = objective.delta === undefined ? null : lowerAgentPolicyExpr(objective.delta);
      return (objective.value !== undefined && value === null) || (objective.delta !== undefined && delta === null)
        ? null
        : {
          ...objective,
          ...(value === null ? {} : { value }),
          ...(delta === null ? {} : { delta }),
        };
    });
    const minimumImpact = lowerAgentPolicyExpr(evaluator.minimumImpact);
    const demotePenalty = evaluator.fallback.demotePenalty === undefined
      ? null
      : lowerAgentPolicyExpr(evaluator.fallback.demotePenalty);
    if (
      objectives.some((objective) => objective === null)
      || minimumImpact === null
      || (evaluator.fallback.demotePenalty !== undefined && demotePenalty === null)
    ) {
      continue;
    }
    turnShapeEvaluators[evaluatorId] = {
      ...evaluator,
      objectives: objectives as TurnShapeEvaluatorDef['objectives'],
      minimumImpact,
      fallback: {
        ...evaluator.fallback,
        ...(demotePenalty === null ? {} : { demotePenalty }),
      },
    };
  }

  for (const [considerationId, consideration] of Object.entries(library.considerations)) {
    const weight = lowerAgentPolicyExpr(consideration.weight);
    const value = lowerAgentPolicyExpr(consideration.value);
    const when = consideration.when === undefined ? null : lowerAgentPolicyExpr(consideration.when);
    if (weight === null || value === null || (consideration.when !== undefined && when === null)) {
      continue;
    }
    considerations[considerationId] = {
      ...(consideration.scopes === undefined ? {} : { scopes: consideration.scopes }),
      costClass: consideration.costClass,
      ...(when === null ? {} : { when }),
      weight,
      value,
      hasPreviewRef: consideration.hasPreviewRef === true,
      hasLookupRef: consideration.hasLookupRef === true,
      ...(consideration.unknownAs === undefined ? {} : { unknownAs: consideration.unknownAs }),
      ...(consideration.previewFallback === undefined ? {} : { previewFallback: consideration.previewFallback }),
      ...(consideration.lookupFallback === undefined ? {} : { lookupFallback: consideration.lookupFallback }),
      ...(consideration.candidateParamFallback === undefined ? {} : { candidateParamFallback: consideration.candidateParamFallback }),
      ...(consideration.scheduleFallback === undefined ? {} : { scheduleFallback: consideration.scheduleFallback }),
      ...(consideration.clamp === undefined ? {} : { clamp: consideration.clamp }),
      dependencies: consideration.dependencies,
      readFootprint: unionFootprints([
        ...(when === null ? [] : [computePolicyExprReadFootprint(when)]),
        computePolicyExprReadFootprint(weight),
        computePolicyExprReadFootprint(value),
        computeDependenciesReadFootprint(consideration.dependencies),
      ]),
    };
  }

  for (const [tieBreakerId, tieBreaker] of Object.entries(library.tieBreakers)) {
    const value = tieBreaker.value === undefined ? null : lowerAgentPolicyExpr(tieBreaker.value);
    if (tieBreaker.value !== undefined && value === null) continue;
    tieBreakers[tieBreakerId] = {
      ...tieBreaker,
      ...(value === null ? {} : { value }),
    };
  }

  for (const [conditionId, condition] of Object.entries(library.strategicConditions)) {
    const target = lowerAgentPolicyExpr(condition.target);
    const current = condition.proximity === undefined
      ? null
      : lowerAgentPolicyExpr(condition.proximity.current);
    if (target === null || (condition.proximity !== undefined && current === null)) continue;
    strategicConditions[conditionId] = {
      target,
      ...(condition.proximity === undefined ? {} : {
        proximity: {
          current: current!,
          threshold: condition.proximity.threshold,
        },
      }),
    };
  }

  return {
    stateFeatures,
    candidateFeatures,
    candidateAggregates,
    ...(Object.keys(selectors).length === 0 ? {} : { selectors }),
    ...(Object.keys(strategyModules).length === 0 ? {} : { strategyModules }),
    ...(Object.keys(guardrails).length === 0 ? {} : { guardrails }),
    ...(Object.keys(turnShapeEvaluators).length === 0 ? {} : { turnShapeEvaluators }),
    considerations,
    tieBreakers,
    strategicConditions,
  };
}

export function lowerAgentPolicyExpr(expr: AgentPolicyExpr): CompiledPolicyExpr | null {
  switch (expr.kind) {
    case 'literal':
      return { kind: 'literal', value: expr.value };
    case 'param':
      return { kind: 'param', id: expr.id };
    case 'ref':
      return { kind: 'ref', ref: expr.ref };
    case 'op': {
      const args: CompiledPolicyExpr[] = [];
      for (const arg of expr.args) {
        const lowered = lowerAgentPolicyExpr(arg);
        if (lowered === null) {
          return null;
        }
        args.push(lowered);
      }
      return { kind: 'op', op: expr.op, args };
    }
    case 'zoneTokenAgg': {
      const zone = lowerAgentPolicyZoneSource(expr.zone);
      if (zone === null) return null;
      return { kind: 'zoneTokenAgg', zone, owner: expr.owner, prop: expr.prop, aggOp: expr.aggOp };
    }
    case 'globalTokenAgg':
      return {
        kind: 'globalTokenAgg',
        ...(expr.tokenFilter === undefined ? {} : { tokenFilter: expr.tokenFilter }),
        aggOp: expr.aggOp,
        ...(expr.prop === undefined ? {} : { prop: expr.prop }),
        ...(expr.zoneFilter === undefined ? {} : { zoneFilter: expr.zoneFilter }),
        zoneScope: expr.zoneScope,
      };
    case 'globalZoneAgg':
      return {
        kind: 'globalZoneAgg',
        source: expr.source,
        field: expr.field,
        aggOp: expr.aggOp,
        ...(expr.zoneFilter === undefined ? {} : { zoneFilter: expr.zoneFilter }),
        zoneScope: expr.zoneScope,
      };
    case 'adjacentTokenAgg': {
      const anchorZone = lowerAgentPolicyZoneSource(expr.anchorZone);
      if (anchorZone === null) return null;
      return {
        kind: 'adjacentTokenAgg',
        anchorZone,
        ...(expr.tokenFilter === undefined ? {} : { tokenFilter: expr.tokenFilter }),
        aggOp: expr.aggOp,
        ...(expr.prop === undefined ? {} : { prop: expr.prop }),
      };
    }
    case 'seatAgg': {
      const inner = lowerAgentPolicyExpr(expr.expr);
      if (inner === null) return null;
      return {
        kind: 'seatAgg',
        over: expr.over,
        expr: inner,
        aggOp: expr.aggOp,
        ...(expr.availability === undefined ? {} : { availability: expr.availability }),
      };
    }
    case 'zoneProp': {
      const zone = lowerAgentPolicyZoneSource(expr.zone);
      if (zone === null) return null;
      return { kind: 'zoneProp', zone, prop: expr.prop };
    }
  }
}

function lowerAgentPolicyZoneSource(source: AgentPolicyExpr | string): CompiledPolicyZoneSource | null {
  if (typeof source === 'string') {
    return source;
  }
  return lowerAgentPolicyExpr(source);
}
