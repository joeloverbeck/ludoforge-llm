import { createEvalContext, createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import { isEvalErrorCode } from './eval-error.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { ActionDef, GameDef, GameState } from './types.js';
import type { AdjacencyGraph } from './spatial.js';

interface ResolveActionActorInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly action: ActionDef;
  readonly decisionPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly evalRuntimeResources?: EvalRuntimeResources;
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
  runtimeTableIndex: providedRuntimeTableIndex,
  evalRuntimeResources: providedEvalRuntimeResources,
}: ResolveActionActorInput): ActionActorResolution => {
  const runtimeTableIndex = providedRuntimeTableIndex ?? buildRuntimeTableIndex(def);
  if (providedEvalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(providedEvalRuntimeResources, 'resolveActionActor evalRuntimeResources');
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
