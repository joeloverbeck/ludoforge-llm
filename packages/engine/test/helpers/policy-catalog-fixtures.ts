import { lowerAgentPolicyExpr } from '../../src/cnl/lower-agent-considerations.js';
import type {
  AgentPolicyCatalog,
  AgentPolicyExpr,
  CompiledAgentAggregate,
  CompiledAgentCandidateFeature,
  CompiledAgentConsideration,
  CompiledAgentLibraryIndex,
  CompiledAgentPruningRule,
  CompiledAgentStateFeature,
  CompiledAgentTieBreaker,
  CompiledStrategicCondition,
  CompiledPolicyCatalog,
  CompiledPolicyExpr,
} from '../../src/kernel/index.js';

export type AgentPolicyCatalogFixtureLibrary = Omit<
  CompiledAgentLibraryIndex,
  'stateFeatures' | 'candidateFeatures' | 'candidateAggregates' | 'pruningRules' | 'considerations' | 'tieBreakers' | 'strategicConditions'
> & {
  readonly stateFeatures: Readonly<Record<string, CompiledAgentStateFeature & { readonly expr?: AgentPolicyExpr }>>;
  readonly candidateFeatures: Readonly<Record<string, CompiledAgentCandidateFeature & { readonly expr?: AgentPolicyExpr }>>;
  readonly candidateAggregates: Readonly<Record<string, CompiledAgentAggregate & {
    readonly of?: AgentPolicyExpr;
    readonly where?: AgentPolicyExpr;
  }>>;
  readonly pruningRules: Readonly<Record<string, CompiledAgentPruningRule & { readonly when?: AgentPolicyExpr }>>;
  readonly considerations: Readonly<Record<string, CompiledAgentConsideration & {
    readonly when?: AgentPolicyExpr;
    readonly weight?: AgentPolicyExpr;
    readonly value?: AgentPolicyExpr;
  }>>;
  readonly tieBreakers: Readonly<Record<string, CompiledAgentTieBreaker & { readonly value?: AgentPolicyExpr }>>;
  readonly strategicConditions: Readonly<Record<string, Omit<CompiledStrategicCondition, 'proximity'> & {
    readonly target?: AgentPolicyExpr;
    readonly proximity?: {
      readonly current?: AgentPolicyExpr;
      readonly threshold: number;
    };
  }>>;
};

export type AgentPolicyCatalogFixture = Omit<AgentPolicyCatalog, 'compiled' | 'library'> & {
  readonly compiled?: CompiledPolicyCatalog;
  readonly library: AgentPolicyCatalogFixtureLibrary;
};

export function withCompiledPolicyCatalog(catalog: AgentPolicyCatalogFixture): AgentPolicyCatalog {
  return {
    ...catalog,
    compiled: compilePolicyCatalogExpressions(catalog),
  };
}

function compilePolicyCatalogExpressions(catalog: AgentPolicyCatalogFixture): CompiledPolicyCatalog {
  const compiled: {
    stateFeatures: CompiledPolicyCatalog['stateFeatures'];
    candidateFeatures: CompiledPolicyCatalog['candidateFeatures'];
    candidateAggregates: CompiledPolicyCatalog['candidateAggregates'];
    pruningRules: CompiledPolicyCatalog['pruningRules'];
    considerations: CompiledPolicyCatalog['considerations'];
    tieBreakers: CompiledPolicyCatalog['tieBreakers'];
    strategicConditions: CompiledPolicyCatalog['strategicConditions'];
  } = {
    stateFeatures: {},
    candidateFeatures: {},
    candidateAggregates: {},
    pruningRules: {},
    considerations: {},
    tieBreakers: {},
    strategicConditions: {},
  };

  for (const [id, feature] of Object.entries(catalog.library.stateFeatures)) {
    const expr = lowerExpr(feature.expr);
    if (expr !== undefined) {
      compiled.stateFeatures = {
        ...compiled.stateFeatures,
        [id]: { ...feature, expr },
      };
    }
  }
  for (const [id, feature] of Object.entries(catalog.library.candidateFeatures)) {
    const expr = lowerExpr(feature.expr);
    if (expr !== undefined) {
      compiled.candidateFeatures = {
        ...compiled.candidateFeatures,
        [id]: { ...feature, expr },
      };
    }
  }
  for (const [id, aggregate] of Object.entries(catalog.library.candidateAggregates)) {
    const of = lowerExpr(aggregate.of);
    const where = lowerExpr(aggregate.where);
    if (of !== undefined) {
      compiled.candidateAggregates = {
        ...compiled.candidateAggregates,
        [id]: {
          ...aggregate,
          of,
          ...(where === undefined ? {} : { where }),
        },
      };
    }
  }
  for (const [id, rule] of Object.entries(catalog.library.pruningRules)) {
    const when = lowerExpr(rule.when);
    if (when !== undefined) {
      compiled.pruningRules = {
        ...compiled.pruningRules,
        [id]: { ...rule, when },
      };
    }
  }
  for (const [id, consideration] of Object.entries(catalog.library.considerations)) {
    const when = lowerExpr(consideration.when);
    const weight = lowerExpr(consideration.weight);
    const value = lowerExpr(consideration.value);
    if (weight !== undefined && value !== undefined) {
      compiled.considerations = {
        ...compiled.considerations,
        [id]: {
          ...consideration,
          ...(when === undefined ? {} : { when }),
          weight,
          value,
        },
      };
    }
  }
  for (const [id, tieBreaker] of Object.entries(catalog.library.tieBreakers)) {
    const value = lowerExpr(tieBreaker.value);
    compiled.tieBreakers = {
      ...compiled.tieBreakers,
      [id]: {
        ...tieBreaker,
        ...(value === undefined ? {} : { value }),
      },
    };
  }
  for (const [id, condition] of Object.entries(catalog.library.strategicConditions)) {
    const target = lowerExpr(condition.target);
    const current = lowerExpr(condition.proximity?.current);
    if (target !== undefined) {
      compiled.strategicConditions = {
        ...compiled.strategicConditions,
        [id]: {
          target,
          ...(condition.proximity === undefined || current === undefined
            ? {}
            : {
                proximity: {
                  current,
                  threshold: condition.proximity.threshold,
                },
              }),
        },
      };
    }
  }

  return compiled;
}

function lowerExpr(expr: Parameters<typeof lowerAgentPolicyExpr>[0] | undefined): CompiledPolicyExpr | undefined {
  return expr === undefined ? undefined : lowerAgentPolicyExpr(expr) ?? undefined;
}
