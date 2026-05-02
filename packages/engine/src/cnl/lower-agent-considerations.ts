import type {
  AgentPolicyExpr,
  AgentPolicyCostClass,
  AgentPolicyValueType,
  CompiledAgentDependencyRefs,
  CompiledPolicyCatalog,
  CompiledPolicyAggregate,
  CompiledPolicyCandidateFeature,
  CompiledPolicyConsideration,
  CompiledPolicyExpr,
  CompiledPolicyPruningRule,
  CompiledPolicyStateFeature,
  CompiledPolicyStrategicCondition,
  CompiledPolicyTieBreaker,
  CompiledPolicyZoneSource,
} from '../kernel/types.js';

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
  readonly pruningRules: Readonly<Record<string, {
    readonly costClass: AgentPolicyCostClass;
    readonly when: AgentPolicyExpr;
    readonly dependencies: CompiledAgentDependencyRefs;
    readonly onEmpty: 'skipRule' | 'error';
  }>>;
  readonly considerations: Readonly<Record<string, {
    readonly scopes?: readonly ('move' | 'completion')[];
    readonly costClass: AgentPolicyCostClass;
    readonly when?: AgentPolicyExpr;
    readonly weight: AgentPolicyExpr;
    readonly value: AgentPolicyExpr;
    readonly unknownAs?: number;
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
  const pruningRules: Record<string, CompiledPolicyPruningRule> = {};
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

  for (const [ruleId, rule] of Object.entries(library.pruningRules)) {
    const when = lowerAgentPolicyExpr(rule.when);
    if (when === null) continue;
    pruningRules[ruleId] = { ...rule, when };
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
      ...(consideration.unknownAs === undefined ? {} : { unknownAs: consideration.unknownAs }),
      ...(consideration.clamp === undefined ? {} : { clamp: consideration.clamp }),
      dependencies: consideration.dependencies,
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
    pruningRules,
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
      return { kind: 'seatAgg', over: expr.over, expr: inner, aggOp: expr.aggOp };
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
