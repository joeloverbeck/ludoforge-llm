import { createEvalContext, createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import { isEvalErrorCode } from './eval-error.js';
import { resolveSinglePlayerSel } from './resolve-selectors.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { ActionDef, GameDef, GameState } from './types.js';
import type { AdjacencyGraph } from './spatial.js';

interface ResolveActionExecutorPlayerInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly action: ActionDef;
  readonly decisionPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly evalRuntimeResources?: EvalRuntimeResources;
}

export type ActionExecutorResolution =
  | {
      readonly kind: 'applicable';
      readonly executionPlayer: GameState['activePlayer'];
    }
  | {
      readonly kind: 'notApplicable';
      readonly reason: 'executorOutsidePlayerCount';
    }
  | {
      readonly kind: 'invalidSpec';
      readonly error: unknown;
    };

export const resolveActionExecutor = ({
  def,
  state,
  adjacencyGraph,
  action,
  decisionPlayer,
  bindings,
  runtimeTableIndex: providedRuntimeTableIndex,
  evalRuntimeResources: providedEvalRuntimeResources,
}: ResolveActionExecutorPlayerInput): ActionExecutorResolution => {
  const runtimeTableIndex = providedRuntimeTableIndex ?? buildRuntimeTableIndex(def);
  if (providedEvalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(providedEvalRuntimeResources, 'resolveActionExecutor evalRuntimeResources');
  }
  const evalRuntimeResources = providedEvalRuntimeResources ?? createEvalRuntimeResources();
  const selectorContext = createEvalContext({
    def,
    adjacencyGraph,
    state,
    activePlayer: decisionPlayer,
    actorPlayer: decisionPlayer,
    bindings,
    runtimeTableIndex,
    resources: evalRuntimeResources,
  });
  try {
    return {
      kind: 'applicable',
      executionPlayer: resolveSinglePlayerSel(action.executor, selectorContext),
    };
  } catch (error) {
    if (isEvalErrorCode(error, 'MISSING_VAR')) {
      return { kind: 'notApplicable', reason: 'executorOutsidePlayerCount' };
    }
    return { kind: 'invalidSpec', error };
  }
};
