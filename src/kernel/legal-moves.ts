import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
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
    moves.push({
      actionId: action.id,
      params,
    });
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

export const legalMoves = (def: GameDef, state: GameState): readonly Move[] => {
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

    enumerateParams(action, def, adjacencyGraph, state, 0, {}, moves);
  }

  return moves;
};
