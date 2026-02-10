import type { GameDef, GameState, Rng, TriggerEvent, TriggerLogEntry } from './types.js';

export interface DispatchTriggersResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly triggerLog: readonly TriggerLogEntry[];
}

export const dispatchTriggers = (
  _def: GameDef,
  _state: GameState,
  _rng: Rng,
  _event: TriggerEvent,
  _depth: number,
  _maxDepth: number,
  _triggerLog: readonly TriggerLogEntry[],
): DispatchTriggersResult => {
  throw new Error('dispatchTriggers is not implemented in KERGAMLOOTRI-001');
};
