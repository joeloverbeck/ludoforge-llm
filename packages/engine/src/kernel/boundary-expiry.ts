import { expireLastingEffectsAtBoundaries } from './event-execution.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type {
  GameDef,
  GameState,
  TriggerLogEntry,
  TurnFlowDuration,
} from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import type { DraftTracker } from './state-draft.js';

interface BoundaryExpiryResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
}

export const applyBoundaryExpiry = (
  def: GameDef,
  state: GameState,
  boundaryDurations: readonly TurnFlowDuration[] | undefined,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  evalRuntimeResources?: EvalRuntimeResources,
  effectPathRoot = 'boundaryExpiry',
  cachedRuntime?: GameDefRuntime,
  tracker?: DraftTracker,
): BoundaryExpiryResult => {
  if (evalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(evalRuntimeResources, 'applyBoundaryExpiry evalRuntimeResources');
  }
  const runtimeResources = evalRuntimeResources ?? createEvalRuntimeResources();
  if (boundaryDurations === undefined || boundaryDurations.length === 0) {
    return { state, traceEntries: [] };
  }
  const expiry = expireLastingEffectsAtBoundaries(
    def,
    state,
    { state: state.rng },
    boundaryDurations,
    policy,
    runtimeResources.collector,
  );
  let nextState: GameState = {
    ...expiry.state,
    rng: expiry.rng.state,
  };
  const traceEntries: TriggerLogEntry[] = [];
  for (const emittedEvent of expiry.emittedEvents) {
    nextState = dispatchLifecycleEvent(
      def,
      nextState,
      emittedEvent,
      traceEntries,
      policy,
      runtimeResources,
      effectPathRoot,
      cachedRuntime,
      tracker,
    );
  }
  if (triggerLogCollector !== undefined && traceEntries.length > 0) {
    triggerLogCollector.push(...traceEntries);
  }
  return { state: nextState, traceEntries };
};
