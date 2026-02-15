import type { EvalContext } from './eval-context.js';
import { createCollector } from './execution-collector.js';
import { resolveSinglePlayerSel } from './resolve-selectors.js';
import type { ActionDef, GameDef, GameState } from './types.js';
import type { AdjacencyGraph } from './spatial.js';

interface ResolveActionExecutorPlayerInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly action: ActionDef;
  readonly decisionPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
}

export const resolveActionExecutorPlayer = ({
  def,
  state,
  adjacencyGraph,
  action,
  decisionPlayer,
  bindings,
}: ResolveActionExecutorPlayerInput): GameState['activePlayer'] => {
  const selectorContext: EvalContext = {
    def,
    adjacencyGraph,
    state,
    activePlayer: decisionPlayer,
    actorPlayer: decisionPlayer,
    bindings,
    collector: createCollector(),
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  };
  return resolveSinglePlayerSel(action.executor, selectorContext);
};
