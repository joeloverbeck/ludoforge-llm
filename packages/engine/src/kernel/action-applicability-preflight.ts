import { resolveActionActor } from './action-actor.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionPipelineDispatch, type ActionPipelineDispatch } from './apply-move-pipeline.js';
import {
  evaluateActionSelectorContracts,
  type ActionSelectorContractViolation,
} from '../contracts/action-selector-contract-registry.js';
import { createCollector } from './execution-collector.js';
import type { EvalContext } from './eval-context.js';
import type { ActionApplicabilityNotApplicableReason } from './legality-reasons.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type { ActionDef, GameDef, GameState } from './types.js';

export type ActionApplicabilityPreflightResult =
  | {
      readonly kind: 'applicable';
      readonly executionPlayer: GameState['activePlayer'];
      readonly evalCtx: EvalContext;
      readonly pipelineDispatch: ActionPipelineDispatch;
    }
  | {
      readonly kind: 'notApplicable';
      readonly reason: ActionApplicabilityNotApplicableReason;
    }
  | {
      readonly kind: 'invalidSpec';
      readonly selector: 'actor' | 'executor';
      readonly error: unknown;
      readonly selectorContractViolations?: readonly ActionSelectorContractViolation[];
    };

interface ActionApplicabilityPreflightInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly action: ActionDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly decisionPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly skipPhaseCheck?: boolean;
  readonly skipExecutorCheck?: boolean;
  readonly skipActionLimitCheck?: boolean;
  readonly skipPipelineDispatch?: boolean;
  readonly executionPlayerOverride?: GameState['activePlayer'];
  readonly freeOperationZoneFilter?: EvalContext['freeOperationZoneFilter'];
  readonly freeOperationZoneFilterDiagnostics?: EvalContext['freeOperationZoneFilterDiagnostics'];
  readonly maxQueryResults?: number;
}

export const isWithinActionLimits = (action: ActionDef, state: GameState): boolean => {
  const usage = state.actionUsage[String(action.id)] ?? { turnCount: 0, phaseCount: 0, gameCount: 0 };
  for (const limit of action.limits) {
    if (limit.scope === 'turn' && usage.turnCount >= limit.max) {
      return false;
    }
    if (limit.scope === 'phase' && usage.phaseCount >= limit.max) {
      return false;
    }
    if (limit.scope === 'game' && usage.gameCount >= limit.max) {
      return false;
    }
  }
  return true;
};

export const resolveActionApplicabilityPreflight = ({
  def,
  state,
  action,
  adjacencyGraph,
  decisionPlayer,
  bindings,
  runtimeTableIndex: providedRuntimeTableIndex,
  skipPhaseCheck = false,
  skipExecutorCheck = false,
  skipActionLimitCheck = false,
  skipPipelineDispatch = false,
  executionPlayerOverride,
  freeOperationZoneFilter,
  freeOperationZoneFilterDiagnostics,
  maxQueryResults,
}: ActionApplicabilityPreflightInput): ActionApplicabilityPreflightResult => {
  const runtimeTableIndex = providedRuntimeTableIndex ?? buildRuntimeTableIndex(def);
  const hasActionPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);
  const selectorContractViolations = evaluateActionSelectorContracts({
    selectors: {
      actor: action.actor,
      executor: action.executor,
    },
    declaredBindings: action.params.map((param) => param.name),
    hasPipeline: hasActionPipeline,
  });
  if (selectorContractViolations.length > 0) {
    const violation = selectorContractViolations[0]!;
    return {
      kind: 'invalidSpec',
      selector: violation.role,
      error: violation,
      selectorContractViolations: selectorContractViolations,
    };
  }

  if (!skipPhaseCheck && !action.phase.includes(state.currentPhase)) {
    return { kind: 'notApplicable', reason: 'phaseMismatch' };
  }

  const actorResolution = resolveActionActor({
    def,
    state,
    adjacencyGraph,
    action,
    decisionPlayer,
    bindings,
    runtimeTableIndex,
  });
  if (actorResolution.kind === 'notApplicable') {
    return { kind: 'notApplicable', reason: 'actorNotApplicable' };
  }
  if (actorResolution.kind === 'invalidSpec') {
    return { kind: 'invalidSpec', selector: 'actor', error: actorResolution.error };
  }

  let executionPlayer = executionPlayerOverride;
  if (executionPlayer === undefined && !skipExecutorCheck) {
    const executorResolution = resolveActionExecutor({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer,
      bindings,
      runtimeTableIndex,
    });
    if (executorResolution.kind === 'notApplicable') {
      return { kind: 'notApplicable', reason: 'executorNotApplicable' };
    }
    if (executorResolution.kind === 'invalidSpec') {
      return { kind: 'invalidSpec', selector: 'executor', error: executorResolution.error };
    }
    executionPlayer = executorResolution.executionPlayer;
  }

  if (executionPlayer === undefined) {
    executionPlayer = decisionPlayer;
  }

  if (!skipActionLimitCheck && !isWithinActionLimits(action, state)) {
    return { kind: 'notApplicable', reason: 'actionLimitExceeded' };
  }

  const evalCtx: EvalContext = {
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    runtimeTableIndex,
    ...(freeOperationZoneFilter === undefined ? {} : { freeOperationZoneFilter }),
    ...(freeOperationZoneFilterDiagnostics === undefined ? {} : { freeOperationZoneFilterDiagnostics }),
    ...(maxQueryResults === undefined ? {} : { maxQueryResults }),
    collector: createCollector(),
  };

  const pipelineDispatch = skipPipelineDispatch
    ? { kind: 'noneConfigured' as const }
    : resolveActionPipelineDispatch(def, action, evalCtx);
  if (pipelineDispatch.kind === 'configuredNoMatch') {
    return { kind: 'notApplicable', reason: 'pipelineNotApplicable' };
  }

  return {
    kind: 'applicable',
    executionPlayer,
    evalCtx,
    pipelineDispatch,
  };
};
