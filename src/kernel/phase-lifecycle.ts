import { dispatchTriggers } from './trigger-dispatch.js';
import type { GameDef, GameState, TriggerEvent, TriggerLogEntry } from './types.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

export const dispatchLifecycleEvent = (
  def: GameDef,
  state: GameState,
  event: TriggerEvent,
  triggerLogCollector?: TriggerLogEntry[],
): GameState => {
  const result = dispatchTriggers(
    def,
    state,
    { state: state.rng },
    event,
    0,
    def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
    [],
  );

  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...result.triggerLog);
  }

  return {
    ...result.state,
    rng: result.rng.state,
  };
};
