/**
 * Pure (non-mutable) Zobrist hash update helpers for phase and turn-flow
 * features: currentPhase, turnCount, activePlayer, and actionUsage.
 *
 * Unlike the mutable helpers in zobrist.ts (updateRunningHash etc.), these
 * operate on a `bigint` hash value and return a new `bigint`. They are used
 * by the immutable-state code paths in effects-turn-flow.ts and
 * phase-advance.ts where no MutableGameState is available.
 */
import type { ActionId } from './branded.js';
import type { GameState, ZobristFeature } from './types-core.js';
import type { ZobristTable } from './types-core.js';
import { zobristKey } from './zobrist.js';

/** Update hash for a currentPhase change. */
export const updatePhaseHash = (
  hash: bigint,
  table: ZobristTable,
  oldPhaseId: GameState['currentPhase'],
  newPhaseId: GameState['currentPhase'],
): bigint =>
  hash
    ^ zobristKey(table, { kind: 'currentPhase', phaseId: oldPhaseId })
    ^ zobristKey(table, { kind: 'currentPhase', phaseId: newPhaseId });

/** Update hash for a turnCount change. */
export const updateTurnCountHash = (
  hash: bigint,
  table: ZobristTable,
  oldTurnCount: number,
  newTurnCount: number,
): bigint =>
  hash
    ^ zobristKey(table, { kind: 'turnCount', value: oldTurnCount })
    ^ zobristKey(table, { kind: 'turnCount', value: newTurnCount });

/** Update hash for an activePlayer change. */
export const updateActivePlayerHash = (
  hash: bigint,
  table: ZobristTable,
  oldPlayerId: GameState['activePlayer'],
  newPlayerId: GameState['activePlayer'],
): bigint =>
  hash
    ^ zobristKey(table, { kind: 'activePlayer', playerId: oldPlayerId })
    ^ zobristKey(table, { kind: 'activePlayer', playerId: newPlayerId });

/**
 * Update hash for a single actionUsage scope change on one action.
 * XORs out the old count and XORs in the new count.
 */
const updateUsageScopeHash = (
  hash: bigint,
  table: ZobristTable,
  actionId: ActionId,
  scope: 'turn' | 'phase' | 'game',
  oldCount: number,
  newCount: number,
): bigint => {
  if (oldCount === newCount) {
    return hash;
  }
  const oldF: ZobristFeature = { kind: 'actionUsage', actionId, scope, count: oldCount };
  const newF: ZobristFeature = { kind: 'actionUsage', actionId, scope, count: newCount };
  return hash ^ zobristKey(table, oldF) ^ zobristKey(table, newF);
};

/**
 * Update hash for resetPhaseUsage: sets phaseCount to 0 for all actions.
 */
export const updatePhaseUsageResetHash = (
  hash: bigint,
  table: ZobristTable,
  oldActionUsage: GameState['actionUsage'],
): bigint => {
  let h = hash;
  for (const [actionId, usage] of Object.entries(oldActionUsage)) {
    if (!usage || usage.phaseCount === 0) {
      continue;
    }
    h = updateUsageScopeHash(h, table, actionId as ActionId, 'phase', usage.phaseCount, 0);
  }
  return h;
};

/**
 * Update hash for resetTurnUsage: sets turnCount to 0 for all actions.
 */
export const updateTurnUsageResetHash = (
  hash: bigint,
  table: ZobristTable,
  oldActionUsage: GameState['actionUsage'],
): bigint => {
  let h = hash;
  for (const [actionId, usage] of Object.entries(oldActionUsage)) {
    if (!usage || usage.turnCount === 0) {
      continue;
    }
    h = updateUsageScopeHash(h, table, actionId as ActionId, 'turn', usage.turnCount, 0);
  }
  return h;
};

/**
 * Compute the complete hash delta for a phase-usage reset on the given state.
 * Returns a new _runningHash value that reflects the resetPhaseUsage changes.
 */
export const hashAfterPhaseUsageReset = (
  table: ZobristTable,
  state: GameState,
): bigint => updatePhaseUsageResetHash(state._runningHash, table, state.actionUsage);

/**
 * Compute the complete hash delta for a turn-usage reset on the given state.
 * Returns a new _runningHash value that reflects the resetTurnUsage changes.
 */
export const hashAfterTurnUsageReset = (
  table: ZobristTable,
  state: GameState,
): bigint => updateTurnUsageResetHash(state._runningHash, table, state.actionUsage);

/**
 * Patch `_runningHash` on `after` to account for all direct mutations
 * between `before` and `after` on hashed phase/turn-flow features:
 * currentPhase, turnCount, activePlayer, and actionUsage.
 *
 * `after._runningHash` is assumed to be carried over from `before` (via
 * spread) and NOT yet adjusted for the mutations. Returns a copy of
 * `after` with corrected `_runningHash`.
 */
export const patchPhaseTransitionHash = (
  table: ZobristTable,
  before: GameState,
  after: GameState,
): GameState => {
  let h = after._runningHash;
  if (before.currentPhase !== after.currentPhase) {
    h = updatePhaseHash(h, table, before.currentPhase, after.currentPhase);
  }
  if (before.turnCount !== after.turnCount) {
    h = updateTurnCountHash(h, table, before.turnCount, after.turnCount);
  }
  if (before.activePlayer !== after.activePlayer) {
    h = updateActivePlayerHash(h, table, before.activePlayer, after.activePlayer);
  }
  // Patch actionUsage changes (reset operations zero out phaseCount/turnCount)
  for (const [actionId, afterUsage] of Object.entries(after.actionUsage)) {
    const beforeUsage = before.actionUsage[actionId];
    if (!afterUsage) {
      continue;
    }
    const oldTurn = beforeUsage?.turnCount ?? 0;
    const oldPhase = beforeUsage?.phaseCount ?? 0;
    const oldGame = beforeUsage?.gameCount ?? 0;
    h = updateUsageScopeHash(h, table, actionId as ActionId, 'turn', oldTurn, afterUsage.turnCount);
    h = updateUsageScopeHash(h, table, actionId as ActionId, 'phase', oldPhase, afterUsage.phaseCount);
    h = updateUsageScopeHash(h, table, actionId as ActionId, 'game', oldGame, afterUsage.gameCount);
  }
  if (h === after._runningHash) {
    return after;
  }
  return { ...after, _runningHash: h };
};
