/**
 * Incremental Zobrist hash helpers for variable effect handlers.
 *
 * Converts scoped-variable endpoints into ZobristFeature objects and
 * calls `updateRunningHash`. Used by setVar, addVar, transferVar, and
 * setActivePlayer to maintain `_runningHash` in-place.
 */
import { updateRunningHash } from './zobrist.js';
import type { RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import type { MutableGameState } from './state-draft.js';
import type { VariableValue, ZobristFeature, ZobristTable } from './types.js';

/**
 * Build a `ZobristFeature` from a scoped-variable endpoint and a value.
 * Handles global, perPlayer, and zone scopes.
 */
const varFeature = (
  endpoint: RuntimeScopedVarEndpoint,
  value: VariableValue,
): ZobristFeature => {
  if (endpoint.scope === 'global') {
    return { kind: 'globalVar', varName: endpoint.var, value };
  }
  if (endpoint.scope === 'pvar') {
    return { kind: 'perPlayerVar', playerId: endpoint.player, varName: endpoint.var, value };
  }
  // zone scope
  return { kind: 'zoneVar', zoneId: endpoint.zone, varName: endpoint.var, value: value as number };
};

/**
 * Update the running Zobrist hash for a variable change.
 * No-op when `table` is undefined (graceful degradation without a Zobrist table).
 */
export const updateVarRunningHash = (
  state: MutableGameState,
  table: ZobristTable | undefined,
  endpoint: RuntimeScopedVarEndpoint,
  oldValue: VariableValue,
  newValue: VariableValue,
): void => {
  if (table === undefined) return;
  updateRunningHash(state, table, varFeature(endpoint, oldValue), varFeature(endpoint, newValue));
};
