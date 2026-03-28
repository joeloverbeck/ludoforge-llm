import { hasActionPipeline } from './action-pipeline-lookup.js';
import { resolveActionActorCore } from './action-actor.js';
import { resolveActionExecutorCore } from './action-executor.js';
import { resolveActionPipelineDispatch, type ActionPipelineDispatch } from './apply-move-pipeline.js';
import {
  evaluateActionSelectorContracts,
  type ActionSelectorContractViolation,
} from '../contracts/index.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { ActionApplicabilityNotApplicableReason } from './legality-reasons.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type { ActionDef, GameDef, GameState } from './types.js';

export type ActionApplicabilityPreflightResult =
  | {
      readonly kind: 'applicable';
      readonly executionPlayer: GameState['activePlayer'];
      readonly evalCtx: ReadContext;
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
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
  readonly maxQueryResults?: number;
  readonly evalRuntimeResources?: EvalRuntimeResources;
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
  freeOperationOverlay,
  maxQueryResults,
  evalRuntimeResources: providedEvalRuntimeResources,
}: ActionApplicabilityPreflightInput): ActionApplicabilityPreflightResult => {
  const runtimeTableIndex = providedRuntimeTableIndex ?? buildRuntimeTableIndex(def);
  if (providedEvalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(
      providedEvalRuntimeResources,
      'resolveActionApplicabilityPreflight evalRuntimeResources',
    );
  }
  const evalRuntimeResources = providedEvalRuntimeResources ?? createEvalRuntimeResources();
  const selectorContractViolations = evaluateActionSelectorContracts({
    selectors: {
      actor: action.actor,
      executor: action.executor,
    },
    declaredBindings: action.params.map((param) => param.name),
    hasPipeline: hasActionPipeline(def, action.id),
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

  const actorResolution = resolveActionActorCore({
    def,
    state,
    adjacencyGraph,
    action,
    decisionPlayer,
    bindings,
    runtimeTableIndex,
    evalRuntimeResources,
  });
  if (actorResolution.kind === 'notApplicable') {
    return { kind: 'notApplicable', reason: 'actorNotApplicable' };
  }
  if (actorResolution.kind === 'invalidSpec') {
    return { kind: 'invalidSpec', selector: 'actor', error: actorResolution.error };
  }

  let executionPlayer = executionPlayerOverride;
  if (executionPlayer === undefined && !skipExecutorCheck) {
    const executorResolution = resolveActionExecutorCore({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer,
      bindings,
      runtimeTableIndex,
      evalRuntimeResources,
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

  const evalCtx = createEvalContext({
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    runtimeTableIndex,
    resources: evalRuntimeResources,
    ...(freeOperationOverlay === undefined ? {} : { freeOperationOverlay }),
    ...(maxQueryResults === undefined ? {} : { maxQueryResults }),
  });

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
