import { expireLastingEffectsAtBoundaries } from './event-execution.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import type {
  ExecutionCollector,
  GameDef,
  GameState,
  TriggerLogEntry,
  TurnFlowDuration,
} from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';

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
  collector?: ExecutionCollector,
  effectPathRoot = 'boundaryExpiry',
): BoundaryExpiryResult => {
  if (boundaryDurations === undefined || boundaryDurations.length === 0) {
    return { state, traceEntries: [] };
  }
  const expiry = expireLastingEffectsAtBoundaries(
    def,
    state,
    { state: state.rng },
    boundaryDurations,
    policy,
    collector,
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
      collector,
      effectPathRoot,
    );
  }
  if (triggerLogCollector !== undefined && traceEntries.length > 0) {
    triggerLogCollector.push(...traceEntries);
  }
  return { state: nextState, traceEntries };
};
