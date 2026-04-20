/**
 * Pure (non-mutable) Zobrist hash update helpers.
 *
 * Contains two categories of helpers:
 *
 * 1. **Targeted helpers** (`updatePhaseHash`, `updatePhaseUsageResetHash`, etc.)
 *    — operate on a `bigint` hash value for a single known mutation. Used by
 *    effect handlers in `effects-turn-flow.ts` within the mutable scope.
 *
 * 2. **Comprehensive patch** (`patchImmutableMutationHash`) — diffs ALL hashed
 *    feature categories between a `before` and `after` state and XOR-corrects
 *    `_runningHash`. Used as the safety-net for any immutable code path that
 *    mutates state outside the mutable `applyEffects` scope (turn-flow
 *    eligibility, phase advance, boundary lifecycle, etc.).
 */
import type { ActionId } from './branded.js';
import type { GameState, ZobristFeature, Token, VariableValue } from './types-core.js';
import type { ZobristTable } from './types-core.js';
import { canonicalTokenFilterKey } from './hidden-info-grants.js';
import { computeFullHash, zobristKey } from './zobrist.js';

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

// ---------------------------------------------------------------------------
// Comprehensive immutable-state hash patch
// ---------------------------------------------------------------------------

/**
 * XOR out all token placement features for the given zone.
 * Mirrors the iteration in `computeFullHash`.
 */
type TokenPlacementFeature = Extract<ZobristFeature, { readonly kind: 'tokenPlacement' }>;
type PerPlayerVarFeature = Extract<ZobristFeature, { readonly kind: 'perPlayerVar' }>;

const xorZoneTokens = (
  hash: bigint,
  table: ZobristTable,
  zoneId: string,
  tokens: readonly Token[],
): bigint => {
  let h = hash;
  for (let i = 0; i < tokens.length; i++) {
    h ^= zobristKey(table, {
      kind: 'tokenPlacement',
      tokenId: tokens[i]!.id as TokenPlacementFeature['tokenId'],
      zoneId: zoneId as TokenPlacementFeature['zoneId'],
      slot: i,
    });
  }
  return h;
};

/** XOR out all per-player variable features for a single player. */
const xorPerPlayerVars = (
  hash: bigint,
  table: ZobristTable,
  playerId: number,
  vars: Readonly<Record<string, VariableValue>>,
): bigint => {
  let h = hash;
  for (const varName in vars) {
    const val = vars[varName];
    if (val !== undefined) {
      h ^= zobristKey(table, {
        kind: 'perPlayerVar',
        playerId: playerId as PerPlayerVarFeature['playerId'],
        varName,
        value: val,
      });
    }
  }
  return h;
};

/** XOR out all zone variable features for a single zone. */
const xorZoneVars = (
  hash: bigint,
  table: ZobristTable,
  zoneId: string,
  vars: Readonly<Record<string, number>>,
): bigint => {
  let h = hash;
  for (const varName in vars) {
    const val = vars[varName];
    if (val !== undefined) {
      h ^= zobristKey(table, { kind: 'zoneVar', zoneId, varName, value: val });
    }
  }
  return h;
};

/** XOR out all actionUsage features for a single action entry. */
const xorActionUsage = (
  hash: bigint,
  table: ZobristTable,
  actionId: string,
  usage: { readonly turnCount: number; readonly phaseCount: number; readonly gameCount: number },
): bigint => {
  const aid = actionId as ActionId;
  let h = hash;
  h ^= zobristKey(table, { kind: 'actionUsage', actionId: aid, scope: 'turn', count: usage.turnCount });
  h ^= zobristKey(table, { kind: 'actionUsage', actionId: aid, scope: 'phase', count: usage.phaseCount });
  h ^= zobristKey(table, { kind: 'actionUsage', actionId: aid, scope: 'game', count: usage.gameCount });
  return h;
};

/**
 * Compute the correct `_runningHash` for `target` by diffing ALL hashed
 * feature categories against `baseline`.
 *
 * `baseline._runningHash` is assumed correct. The returned bigint equals
 * `baseline._runningHash XOR (baseline features XOR target features)` —
 * the incremental hash that `computeFullHash(table, target)` would produce.
 *
 * This is the **single source of truth** for hash reconciliation. It covers
 * every feature that `computeFullHash` iterates: tokenPlacements, globalVars,
 * perPlayerVars, zoneVars, activePlayer, currentPhase, turnCount, actionUsage,
 * markers, globalMarkers, reveals, activeLastingEffects, interruptPhaseStack,
 * decisionStack, nextFrameId, nextTurnId, activeDeciderSeatId.
 *
 * For each category, only changed entries incur XOR work. Unchanged entries
 * are skipped via reference-identity fast paths. Performance is O(changed
 * features), not O(total features).
 */
export const reconcileRunningHash = (
  table: ZobristTable,
  baseline: GameState,
  target: GameState,
): bigint => {
  if (
    baseline.decisionStack !== target.decisionStack
    || baseline.nextFrameId !== target.nextFrameId
    || baseline.nextTurnId !== target.nextTurnId
    || baseline.activeDeciderSeatId !== target.activeDeciderSeatId
  ) {
    return computeFullHash(table, target);
  }

  let h = baseline._runningHash;

  // --- Scalar features ---
  if (baseline.currentPhase !== target.currentPhase) {
    h = updatePhaseHash(h, table, baseline.currentPhase, target.currentPhase);
  }
  if (baseline.turnCount !== target.turnCount) {
    h = updateTurnCountHash(h, table, baseline.turnCount, target.turnCount);
  }
  if (baseline.activePlayer !== target.activePlayer) {
    h = updateActivePlayerHash(h, table, baseline.activePlayer, target.activePlayer);
  }

  // --- Token placements (per zone) ---
  if (baseline.zones !== target.zones) {
    const allZoneIds = new Set([...Object.keys(baseline.zones), ...Object.keys(target.zones)]);
    for (const zoneId of allZoneIds) {
      const oldTokens: readonly Token[] = baseline.zones[zoneId] ?? [];
      const newTokens: readonly Token[] = target.zones[zoneId] ?? [];
      if (oldTokens !== newTokens) {
        h = xorZoneTokens(h, table, zoneId, oldTokens);
        h = xorZoneTokens(h, table, zoneId, newTokens);
      }
    }
  }

  // --- Global variables ---
  if (baseline.globalVars !== target.globalVars) {
    for (const varName in target.globalVars) {
      const oldVal = baseline.globalVars[varName];
      const newVal = target.globalVars[varName];
      if (oldVal !== newVal) {
        if (oldVal !== undefined) {
          h ^= zobristKey(table, { kind: 'globalVar', varName, value: oldVal });
        }
        if (newVal !== undefined) {
          h ^= zobristKey(table, { kind: 'globalVar', varName, value: newVal });
        }
      }
    }
    for (const varName in baseline.globalVars) {
      if (baseline.globalVars[varName] !== undefined && !(varName in target.globalVars)) {
        h ^= zobristKey(table, { kind: 'globalVar', varName, value: baseline.globalVars[varName]! });
      }
    }
  }

  // --- Per-player variables ---
  if (baseline.perPlayerVars !== target.perPlayerVars) {
    const allPlayerIds = new Set([
      ...Object.keys(baseline.perPlayerVars),
      ...Object.keys(target.perPlayerVars),
    ]);
    for (const pidStr of allPlayerIds) {
      const pid = Number(pidStr);
      const oldVars = baseline.perPlayerVars[pid] ?? {};
      const newVars = target.perPlayerVars[pid] ?? {};
      if (oldVars !== newVars) {
        h = xorPerPlayerVars(h, table, pid, oldVars);
        h = xorPerPlayerVars(h, table, pid, newVars);
      }
    }
  }

  // --- Zone variables ---
  if (baseline.zoneVars !== target.zoneVars) {
    const allZoneIds = new Set([...Object.keys(baseline.zoneVars), ...Object.keys(target.zoneVars)]);
    for (const zoneId of allZoneIds) {
      const oldVars = baseline.zoneVars[zoneId] ?? {};
      const newVars = target.zoneVars[zoneId] ?? {};
      if (oldVars !== newVars) {
        h = xorZoneVars(h, table, zoneId, oldVars);
        h = xorZoneVars(h, table, zoneId, newVars);
      }
    }
  }

  // --- Action usage ---
  if (baseline.actionUsage !== target.actionUsage) {
    const allActionIds = new Set([
      ...Object.keys(baseline.actionUsage),
      ...Object.keys(target.actionUsage),
    ]);
    for (const actionId of allActionIds) {
      const oldUsage = baseline.actionUsage[actionId];
      const newUsage = target.actionUsage[actionId];
      if (oldUsage !== newUsage) {
        if (oldUsage) { h = xorActionUsage(h, table, actionId, oldUsage); }
        if (newUsage) { h = xorActionUsage(h, table, actionId, newUsage); }
      }
    }
  }

  // --- Markers (per space) ---
  if (baseline.markers !== target.markers) {
    const allSpaceIds = new Set([...Object.keys(baseline.markers), ...Object.keys(target.markers)]);
    for (const spaceId of allSpaceIds) {
      const oldMarkers = baseline.markers[spaceId] ?? {};
      const newMarkers = target.markers[spaceId] ?? {};
      if (oldMarkers !== newMarkers) {
        const allMarkerIds = new Set([...Object.keys(oldMarkers), ...Object.keys(newMarkers)]);
        for (const markerId of allMarkerIds) {
          const oldState = oldMarkers[markerId];
          const newState = newMarkers[markerId];
          if (oldState !== newState) {
            if (oldState !== undefined) {
              h ^= zobristKey(table, { kind: 'markerState', spaceId, markerId, state: oldState });
            }
            if (newState !== undefined) {
              h ^= zobristKey(table, { kind: 'markerState', spaceId, markerId, state: newState });
            }
          }
        }
      }
    }
  }

  // --- Global markers ---
  const oldGM = baseline.globalMarkers ?? {};
  const newGM = target.globalMarkers ?? {};
  if (oldGM !== newGM) {
    const allIds = new Set([...Object.keys(oldGM), ...Object.keys(newGM)]);
    for (const markerId of allIds) {
      const oldState = oldGM[markerId];
      const newState = newGM[markerId];
      if (oldState !== newState) {
        if (oldState !== undefined) {
          h ^= zobristKey(table, { kind: 'globalMarkerState', markerId, state: oldState });
        }
        if (newState !== undefined) {
          h ^= zobristKey(table, { kind: 'globalMarkerState', markerId, state: newState });
        }
      }
    }
  }

  // --- Reveal grants (per zone, slot-indexed) ---
  const oldReveals = baseline.reveals ?? {};
  const newReveals = target.reveals ?? {};
  if (oldReveals !== newReveals) {
    const allZoneIds = new Set([...Object.keys(oldReveals), ...Object.keys(newReveals)]);
    for (const zoneId of allZoneIds) {
      const oldGrants = oldReveals[zoneId] ?? [];
      const newGrants = newReveals[zoneId] ?? [];
      if (oldGrants !== newGrants) {
        for (let slot = 0; slot < oldGrants.length; slot++) {
          const g = oldGrants[slot]!;
          h ^= zobristKey(table, {
            kind: 'revealGrant', zoneId, slot,
            observers: g.observers,
            filterKey: canonicalTokenFilterKey(g.filter),
          });
        }
        for (let slot = 0; slot < newGrants.length; slot++) {
          const g = newGrants[slot]!;
          h ^= zobristKey(table, {
            kind: 'revealGrant', zoneId, slot,
            observers: g.observers,
            filterKey: canonicalTokenFilterKey(g.filter),
          });
        }
      }
    }
  }

  // --- Active lasting effects (slot-indexed) ---
  const oldLasting = baseline.activeLastingEffects ?? [];
  const newLasting = target.activeLastingEffects ?? [];
  if (oldLasting !== newLasting) {
    for (let slot = 0; slot < oldLasting.length; slot++) {
      const e = oldLasting[slot]!;
      h ^= zobristKey(table, {
        kind: 'lastingEffect', slot,
        id: e.id, sourceCardId: e.sourceCardId, side: e.side,
        branchId: e.branchId ?? '', duration: e.duration,
        remainingTurnBoundaries: e.remainingTurnBoundaries ?? -1,
        remainingRoundBoundaries: e.remainingRoundBoundaries ?? -1,
        remainingCycleBoundaries: e.remainingCycleBoundaries ?? -1,
      });
    }
    for (let slot = 0; slot < newLasting.length; slot++) {
      const e = newLasting[slot]!;
      h ^= zobristKey(table, {
        kind: 'lastingEffect', slot,
        id: e.id, sourceCardId: e.sourceCardId, side: e.side,
        branchId: e.branchId ?? '', duration: e.duration,
        remainingTurnBoundaries: e.remainingTurnBoundaries ?? -1,
        remainingRoundBoundaries: e.remainingRoundBoundaries ?? -1,
        remainingCycleBoundaries: e.remainingCycleBoundaries ?? -1,
      });
    }
  }

  // --- Interrupt phase stack (slot-indexed) ---
  const oldInterrupt = baseline.interruptPhaseStack ?? [];
  const newInterrupt = target.interruptPhaseStack ?? [];
  if (oldInterrupt !== newInterrupt) {
    for (let slot = 0; slot < oldInterrupt.length; slot++) {
      const f = oldInterrupt[slot]!;
      h ^= zobristKey(table, { kind: 'interruptPhaseFrame', slot, phase: f.phase, resumePhase: f.resumePhase });
    }
    for (let slot = 0; slot < newInterrupt.length; slot++) {
      const f = newInterrupt[slot]!;
      h ^= zobristKey(table, { kind: 'interruptPhaseFrame', slot, phase: f.phase, resumePhase: f.resumePhase });
    }
  }

  return h;
};
