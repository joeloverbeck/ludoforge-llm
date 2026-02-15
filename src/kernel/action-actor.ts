import type { EvalContext } from './eval-context.js';
import { isEvalErrorCode } from './eval-error.js';
import { createCollector } from './execution-collector.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import type { ActionDef, GameDef, GameState } from './types.js';
import type { AdjacencyGraph } from './spatial.js';

interface ResolveActionActorInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly action: ActionDef;
  readonly decisionPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
}

export type ActionActorResolution =
  | {
      readonly kind: 'applicable';
    }
  | {
      readonly kind: 'notApplicable';
      readonly reason: 'actorOutsidePlayerCount' | 'decisionPlayerNotActor';
    }
  | {
      readonly kind: 'invalidSpec';
      readonly error: unknown;
    };

export const resolveActionActor = ({
  def,
  state,
  adjacencyGraph,
  action,
  decisionPlayer,
  bindings,
}: ResolveActionActorInput): ActionActorResolution => {
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
  try {
    const resolvedActors = resolvePlayerSel(action.actor, selectorContext);
    if (!resolvedActors.includes(decisionPlayer)) {
      return { kind: 'notApplicable', reason: 'decisionPlayerNotActor' };
    }
    return { kind: 'applicable' };
  } catch (error) {
    if (isEvalErrorCode(error, 'MISSING_VAR')) {
      return { kind: 'notApplicable', reason: 'actorOutsidePlayerCount' };
    }
    return { kind: 'invalidSpec', error };
  }
};
