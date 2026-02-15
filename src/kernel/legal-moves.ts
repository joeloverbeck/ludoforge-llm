import { evalCondition } from './eval-condition.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { isMoveDecisionSequenceSatisfiable, resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { applyPendingFreeOperationVariants, applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { shouldEnumerateLegalMoveForOutcome } from './legality-outcome.js';
import { decideLegalMovesPipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { isEvalErrorCode } from './eval-error.js';
import { isActiveFactionEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { createCollector } from './execution-collector.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import type { ActionDef, GameDef, GameState, Move, MoveParamValue } from './types.js';

function makeEvalContext(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  state: GameState,
  executionPlayer: GameState['activePlayer'],
  bindings: Readonly<Record<string, unknown>>,
): EvalContext {
  return {
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    collector: createCollector(),
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  };
}

function enumerateParams(
  action: ActionDef,
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  state: GameState,
  paramIndex: number,
  bindings: Readonly<Record<string, unknown>>,
  moves: Move[],
): void {
  const resolveExecutionPlayerForBindings = (allowPendingBinding: boolean): GameState['activePlayer'] | null => {
    const resolution = resolveActionExecutor({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer: state.activePlayer,
      bindings,
    });
    if (resolution.kind === 'notApplicable') {
      return null;
    }
    if (resolution.kind === 'invalidSpec') {
      if (allowPendingBinding && isEvalErrorCode(resolution.error, 'MISSING_BINDING')) {
        return state.activePlayer;
      }
      throw selectorInvalidSpecError('legalMoves', 'executor', action, resolution.error);
    }
    return resolution.executionPlayer;
  };

  if (paramIndex >= action.params.length) {
    const executionPlayer = resolveExecutionPlayerForBindings(false);
    if (executionPlayer === null) {
      return;
    }
    const ctx = makeEvalContext(def, adjacencyGraph, state, executionPlayer, bindings);
    if (action.pre !== null && !evalCondition(action.pre, ctx)) {
      return;
    }

    const params = Object.fromEntries(
      action.params.map((param) => [param.name, bindings[param.name] as MoveParamValue]),
    );
    const move: Move = {
      actionId: action.id,
      params,
    };
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      return;
    }
    moves.push(move);
    return;
  }

  const param = action.params[paramIndex];
  if (param === undefined) {
    return;
  }

  const executionPlayer = resolveExecutionPlayerForBindings(true);
  if (executionPlayer === null) {
    return;
  }
  const ctx = makeEvalContext(def, adjacencyGraph, state, executionPlayer, bindings);
  const domainValues = evalQuery(param.domain, ctx);
  for (const value of domainValues) {
    enumerateParams(action, def, adjacencyGraph, state, paramIndex + 1, { ...bindings, [param.name]: value }, moves);
  }
}

function enumerateCurrentEventMoves(
  action: ActionDef,
  def: GameDef,
  state: GameState,
): readonly Move[] {
  if (String(action.id) !== 'event') {
    return [];
  }

  const current = resolveCurrentEventCardState(def, state);
  if (current === null) {
    return [];
  }

  const sides: Array<{ readonly side: 'unshaded' | 'shaded'; readonly branches: readonly { readonly id: string }[] | undefined }> = [];
  if (current.card.unshaded !== undefined) {
    sides.push({ side: 'unshaded', branches: current.card.unshaded.branches });
  }
  if (current.card.shaded !== undefined) {
    sides.push({ side: 'shaded', branches: current.card.shaded.branches });
  }

  const baseMoves: Move[] = [];
  for (const side of sides) {
    if (side.branches === undefined || side.branches.length === 0) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
        },
      });
      continue;
    }
    for (const branch of side.branches) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
          branch: branch.id,
        },
      });
    }
  }

  const resolved: Move[] = [];
  for (const move of baseMoves) {
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      continue;
    }
    const completion = resolveMoveDecisionSequence(def, state, move);
    if (!completion.complete) {
      continue;
    }
    resolved.push(completion.move);
  }
  return resolved;
}

export const legalMoves = (def: GameDef, state: GameState): readonly Move[] => {
  if (!isActiveFactionEligibleForTurnFlow(state)) {
    return [];
  }

  const moves: Move[] = [];
  const adjacencyGraph = buildAdjacencyGraph(def.zones);

  for (const action of def.actions) {
    const hasActionPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);
    const preflight = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph,
      decisionPlayer: state.activePlayer,
      bindings: {},
      skipExecutorCheck: !hasActionPipeline,
      skipPipelineDispatch: !hasActionPipeline,
    });
    if (preflight.kind === 'notApplicable') {
      void shouldEnumerateLegalMoveForOutcome(preflight.reason);
      continue;
    }
    if (preflight.kind === 'invalidSpec') {
      throw selectorInvalidSpecError(
        'legalMoves',
        preflight.selector,
        action,
        preflight.error,
        preflight.selectorContractViolations,
      );
    }

    const eventMoves = enumerateCurrentEventMoves(action, def, state);
    if (eventMoves.length > 0) {
      moves.push(...eventMoves);
      continue;
    }

    if (!hasActionPipeline) {
      enumerateParams(action, def, adjacencyGraph, state, 0, {}, moves);
      continue;
    }

    if (preflight.pipelineDispatch.kind === 'matched') {
      const pipeline = preflight.pipelineDispatch.profile;
      const status = evaluatePipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
        includeCostValidation: pipeline.atomicity === 'atomic',
      });
      const viabilityDecision = decideLegalMovesPipelineViability(status);
      if (viabilityDecision.kind === 'excludeTemplate') {
        if (viabilityDecision.outcome === 'pipelineLegalityFailed') {
          if (!shouldEnumerateLegalMoveForOutcome(viabilityDecision.outcome)) {
            continue;
          }
        } else {
          continue;
        }
      }

      if (!isMoveDecisionSequenceSatisfiable(def, state, { actionId: action.id, params: {} })) {
        continue;
      }

      moves.push({ actionId: action.id, params: {} });
      continue;
    }
  }

  const windowFilteredMoves = applyTurnFlowWindowFilters(def, state, moves);
  return applyPendingFreeOperationVariants(def, state, windowFilteredMoves);
};
