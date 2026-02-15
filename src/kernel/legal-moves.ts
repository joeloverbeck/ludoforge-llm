import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { isMoveDecisionSequenceSatisfiable, resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { resolveActionPipelineDispatch } from './apply-move-pipeline.js';
import { applyPendingFreeOperationVariants, applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { pipelinePredicateEvaluationError } from './runtime-error.js';
import { isActiveFactionEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { createCollector } from './execution-collector.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import type { ActionDef, GameDef, GameState, Move, MoveParamValue } from './types.js';

function makeEvalContext(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
): EvalContext {
  return {
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings,
    collector: createCollector(),
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  };
}

function withinActionLimits(action: ActionDef, state: GameState): boolean {
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
  if (paramIndex >= action.params.length) {
    const ctx = makeEvalContext(def, adjacencyGraph, state, bindings);
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

  const ctx = makeEvalContext(def, adjacencyGraph, state, bindings);
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
    if (action.phase !== state.currentPhase) {
      continue;
    }

    const actorCtx = makeEvalContext(def, adjacencyGraph, state, {});
    const resolvedActors = resolvePlayerSel(action.actor, actorCtx);
    if (!resolvedActors.includes(state.activePlayer)) {
      continue;
    }

    if (!withinActionLimits(action, state)) {
      continue;
    }

    const eventMoves = enumerateCurrentEventMoves(action, def, state);
    if (eventMoves.length > 0) {
      moves.push(...eventMoves);
      continue;
    }

    const pipelineDispatch = resolveActionPipelineDispatch(def, action, actorCtx);
    if (pipelineDispatch.kind === 'matched') {
      const pipeline = pipelineDispatch.profile;
      if (pipeline.legality !== null) {
        try {
          if (!evalCondition(pipeline.legality, actorCtx)) {
            continue;
          }
        } catch (error) {
          throw pipelinePredicateEvaluationError(action, pipeline.id, 'legality', error);
        }
      }

      if (
        pipeline.costValidation !== null &&
        pipeline.atomicity === 'atomic'
      ) {
        try {
          if (!evalCondition(pipeline.costValidation, actorCtx)) {
            continue;
          }
        } catch (error) {
          throw pipelinePredicateEvaluationError(action, pipeline.id, 'costValidation', error);
        }
      }

      if (!isMoveDecisionSequenceSatisfiable(def, state, { actionId: action.id, params: {} })) {
        continue;
      }

      moves.push({ actionId: action.id, params: {} });
      continue;
    }
    if (pipelineDispatch.kind === 'configuredNoMatch') {
      continue;
    }

    enumerateParams(action, def, adjacencyGraph, state, 0, {}, moves);
  }

  const windowFilteredMoves = applyTurnFlowWindowFilters(def, state, moves);
  return applyPendingFreeOperationVariants(def, state, windowFilteredMoves);
};
