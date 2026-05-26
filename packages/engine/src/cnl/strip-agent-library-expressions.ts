import type {
  CompiledAgentAggregate,
  CompiledAgentCandidateFeature,
  CompiledAgentConsideration,
  CompiledAgentGuardrail,
  CompiledAgentLibraryIndex,
  CompiledAgentPostureEvaluator,
  CompiledAgentRelationship,
  CompiledAgentSelector,
  CompiledAgentStateFeature,
  CompiledAgentStrategyModule,
  CompiledAgentTieBreaker,
  CompiledAgentTurnShapeEvaluator,
  CompiledPlanTemplate,
  CompiledStrategicCondition,
} from '../kernel/types.js';
import type { AgentPolicyLibraryWithExpr } from './lower-agent-considerations.js';

export function stripAgentLibraryExpressions(library: AgentPolicyLibraryWithExpr): CompiledAgentLibraryIndex {
  const stateFeatures: Record<string, CompiledAgentStateFeature> = {};
  const candidateFeatures: Record<string, CompiledAgentCandidateFeature> = {};
  const candidateAggregates: Record<string, CompiledAgentAggregate> = {};
  const selectors: Record<string, CompiledAgentSelector> = {};
  const strategyModules: Record<string, CompiledAgentStrategyModule> = {};
  const planTemplates: Record<string, CompiledPlanTemplate> = {};
  const guardrails: Record<string, CompiledAgentGuardrail> = {};
  const turnShapeEvaluators: Record<string, CompiledAgentTurnShapeEvaluator> = {};
  const postureEvaluators: Record<string, CompiledAgentPostureEvaluator> = {};
  const relationships: Record<string, CompiledAgentRelationship> = {};
  const considerations: Record<string, CompiledAgentConsideration> = {};
  const tieBreakers: Record<string, CompiledAgentTieBreaker> = {};
  const strategicConditions: Record<string, CompiledStrategicCondition> = {};

  for (const [id, feature] of Object.entries(library.stateFeatures)) {
    stateFeatures[id] = {
      type: feature.type,
      costClass: feature.costClass,
      dependencies: feature.dependencies,
    };
  }
  for (const [id, feature] of Object.entries(library.candidateFeatures)) {
    candidateFeatures[id] = {
      type: feature.type,
      costClass: feature.costClass,
      dependencies: feature.dependencies,
    };
  }
  for (const [id, aggregate] of Object.entries(library.candidateAggregates)) {
    candidateAggregates[id] = {
      type: aggregate.type,
      costClass: aggregate.costClass,
      op: aggregate.op,
      dependencies: aggregate.dependencies,
    };
  }
  for (const [id, selector] of Object.entries(library.selectors ?? {})) {
    selectors[id] = {
      scopes: selector.scopes,
      source: selector.source,
      result: selector.result,
      costClass: selector.costClass,
      dependencies: selector.dependencies,
    };
  }
  for (const [id, module] of Object.entries(library.strategyModules ?? {})) {
    strategyModules[id] = {
      traceLabel: module.traceLabel,
      applies: module.applies,
      selectors: module.selectors,
      scoreGroups: module.scoreGroups.map((group) => ({
        id: group.id,
        summary: group.summary,
      })),
      guardrailIds: module.guardrailIds,
      fallback: module.fallback,
      costClass: module.costClass,
      dependencies: module.dependencies,
      enablesPlanTemplates: module.enablesPlanTemplates,
      suppressesPlanTemplates: module.suppressesPlanTemplates,
    };
  }
  for (const [id, template] of Object.entries(library.planTemplates ?? {})) {
    planTemplates[id] = template;
  }
  for (const [id, guardrail] of Object.entries(library.guardrails ?? {})) {
    guardrails[id] = {
      traceLabel: guardrail.traceLabel,
      scopes: guardrail.scopes,
      severity: guardrail.severity,
      costClass: guardrail.costClass,
      dependencies: guardrail.dependencies,
      ...(guardrail.safe === undefined ? {} : { safe: guardrail.safe }),
      onUnavailable: guardrail.onUnavailable,
      ...(guardrail.onAllPruned === undefined ? {} : { onAllPruned: guardrail.onAllPruned }),
    };
  }
  for (const [id, evaluator] of Object.entries(library.turnShapeEvaluators ?? {})) {
    turnShapeEvaluators[id] = {
      traceLabel: evaluator.traceLabel,
      source: evaluator.source,
      bounds: evaluator.bounds,
      objectives: evaluator.objectives.map((objective) => ({
        id: objective.id,
        hasValue: objective.value !== undefined,
        hasDelta: objective.delta !== undefined,
      })),
      fallback: {
        onPreviewUnavailable: evaluator.fallback.onPreviewUnavailable,
        hasDemotePenalty: evaluator.fallback.demotePenalty !== undefined,
      },
      costClass: evaluator.costClass,
      dependencies: evaluator.dependencies,
    };
  }
  for (const [id, evaluator] of Object.entries(library.postureEvaluators ?? {})) {
    postureEvaluators[id] = {
      traceLabel: evaluator.traceLabel,
      must: evaluator.must.map((entry) => ({
        id: entry.id,
        onViolation: entry.onViolation,
        hasDemotePenalty: entry.demotePenalty !== undefined,
      })),
      prefer: evaluator.prefer.map((entry) => ({
        id: entry.id,
        hasWhen: entry.when !== undefined,
        hasFallbackContribution: true,
      })),
      costClass: evaluator.costClass,
      dependencies: evaluator.dependencies,
    };
  }
  for (const [id, relationship] of Object.entries(library.relationships ?? {})) {
    relationships[id] = {
      role: relationship.role,
      ...(relationship.seat === undefined ? {} : { seat: relationship.seat }),
      ...(relationship.standingRole === undefined ? {} : { standingRole: relationship.standingRole }),
      ...(relationship.condition === undefined ? {} : { condition: relationship.condition }),
      priority: relationship.priority,
      hasGainValue: relationship.gainValue !== undefined,
    };
  }
  for (const [id, consideration] of Object.entries(library.considerations)) {
    considerations[id] = {
      ...(consideration.scopes === undefined ? {} : { scopes: consideration.scopes }),
      costClass: consideration.costClass,
      ...(consideration.unknownAs === undefined ? {} : { unknownAs: consideration.unknownAs }),
      ...(consideration.previewFallback === undefined ? {} : { previewFallback: consideration.previewFallback }),
      ...(consideration.lookupFallback === undefined ? {} : { lookupFallback: consideration.lookupFallback }),
      ...(consideration.candidateParamFallback === undefined ? {} : { candidateParamFallback: consideration.candidateParamFallback }),
      ...(consideration.clamp === undefined ? {} : { clamp: consideration.clamp }),
      dependencies: consideration.dependencies,
    };
  }
  for (const [id, tieBreaker] of Object.entries(library.tieBreakers)) {
    tieBreakers[id] = {
      kind: tieBreaker.kind,
      costClass: tieBreaker.costClass,
      ...(tieBreaker.order === undefined ? {} : { order: tieBreaker.order }),
      dependencies: tieBreaker.dependencies,
    };
  }
  for (const [id, condition] of Object.entries(library.strategicConditions)) {
    strategicConditions[id] = {
      ...(condition.proximity === undefined
        ? {}
        : { proximity: { threshold: condition.proximity.threshold } }),
    };
  }

  return {
    stateFeatures,
    candidateFeatures,
    candidateAggregates,
    ...(Object.keys(selectors).length === 0 ? {} : { selectors }),
    ...(Object.keys(strategyModules).length === 0 ? {} : { strategyModules }),
    ...(Object.keys(planTemplates).length === 0 ? {} : { planTemplates }),
    ...(Object.keys(guardrails).length === 0 ? {} : { guardrails }),
    ...(Object.keys(turnShapeEvaluators).length === 0 ? {} : { turnShapeEvaluators }),
    ...(Object.keys(postureEvaluators).length === 0 ? {} : { postureEvaluators }),
    ...(Object.keys(relationships).length === 0 ? {} : { relationships }),
    considerations,
    tieBreakers,
    strategicConditions,
  };
}
