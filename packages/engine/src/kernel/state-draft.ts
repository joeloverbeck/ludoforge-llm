/**
 * state-draft.ts — Mutable working state for effect execution (Spec 78).
 *
 * Within a single `applyEffectsWithBudgetState` scope, effect handlers mutate
 * a working copy instead of creating new GameState objects on every effect.
 * A DraftTracker records which inner maps/arrays have already been cloned
 * (copy-on-write) so each is cloned at most once per scope.
 *
 * The external contract is preserved: callers of `applyMove` still receive
 * an immutable GameState, and the input state is never modified.
 */

import type { GameState, Token } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Remove `readonly` modifiers from all direct properties of T. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** GameState with writable top-level fields (inner objects may still be shared). */
export type MutableGameState = Mutable<GameState>;

/**
 * Tracks which inner maps/arrays have been shallow-cloned during the current
 * execution scope. Top-level maps are cloned eagerly by `createMutableState`;
 * this tracker guards the *inner* (per-player, per-zone, per-marker) level.
 */
export interface DraftTracker {
  readonly playerVars: Set<number>;
  readonly zoneVars: Set<string>;
  readonly zones: Set<string>;
  readonly markers: Set<string>;
  globalMarkers: boolean;
  turnOrderState: boolean;
  reveals: boolean;
  activeLastingEffects: boolean;
  interruptPhaseStack: boolean;
  actionUsage: boolean;
}

// ---------------------------------------------------------------------------
// Create / freeze
// ---------------------------------------------------------------------------

/**
 * Shallow-clone a GameState for mutable use within a single effect scope.
 * All top-level nested records/arrays are cloned so that mutations to the
 * outer map never alias the original state.
 */
export function createMutableState(state: GameState): MutableGameState {
  return {
    ...state,
    globalVars: { ...state.globalVars },
    perPlayerVars: { ...state.perPlayerVars },
    zoneVars: { ...state.zoneVars },
    zones: { ...state.zones },
    actionUsage: { ...state.actionUsage },
    markers: { ...state.markers },
    turnOrderState: { ...state.turnOrderState },
    reveals: state.reveals !== undefined ? { ...state.reveals } : undefined,
    globalMarkers: state.globalMarkers !== undefined ? { ...state.globalMarkers } : undefined,
    activeLastingEffects: state.activeLastingEffects !== undefined ? [...state.activeLastingEffects] : undefined,
    interruptPhaseStack: state.interruptPhaseStack !== undefined ? [...state.interruptPhaseStack] : undefined,
  };
}

/** Factory returning a fresh DraftTracker with empty Sets. */
export function createDraftTracker(): DraftTracker {
  return {
    playerVars: new Set(),
    zoneVars: new Set(),
    zones: new Set(),
    markers: new Set(),
    globalMarkers: false,
    turnOrderState: false,
    reveals: false,
    activeLastingEffects: false,
    interruptPhaseStack: false,
    actionUsage: false,
  };
}

/**
 * Cast a MutableGameState back to GameState. Zero runtime cost — the object
 * is structurally identical, only the TypeScript type changes.
 */
export function freezeState(mutable: MutableGameState): GameState {
  return mutable as GameState;
}

// ---------------------------------------------------------------------------
// Copy-on-write helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the inner per-player variable map for `playerId` is a fresh clone.
 * Idempotent: second call for the same player is a no-op.
 */
export function ensurePlayerVarCloned(
  state: MutableGameState,
  tracker: DraftTracker,
  playerId: number,
): void {
  if (!tracker.playerVars.has(playerId)) {
    (state.perPlayerVars as Record<number, Record<string, unknown>>)[playerId] =
      { ...state.perPlayerVars[playerId] };
    tracker.playerVars.add(playerId);
  }
}

/**
 * Ensure the inner zone-variable map for `zoneId` is a fresh clone.
 * Idempotent: second call for the same zone is a no-op.
 */
export function ensureZoneVarCloned(
  state: MutableGameState,
  tracker: DraftTracker,
  zoneId: string,
): void {
  if (!tracker.zoneVars.has(zoneId)) {
    (state.zoneVars as Record<string, Record<string, number>>)[zoneId] =
      { ...state.zoneVars[zoneId] };
    tracker.zoneVars.add(zoneId);
  }
}

/**
 * Ensure the token array for `zoneId` is a fresh clone.
 * Idempotent: second call for the same zone is a no-op.
 */
export function ensureZoneCloned(
  state: MutableGameState,
  tracker: DraftTracker,
  zoneId: string,
): void {
  if (!tracker.zones.has(zoneId)) {
    (state.zones as Record<string, Token[]>)[zoneId] =
      [...(state.zones[zoneId] ?? [])];
    tracker.zones.add(zoneId);
  }
}

/**
 * Ensure the inner marker map for `key` is a fresh clone.
 * Idempotent: second call for the same key is a no-op.
 */
export function ensureMarkerCloned(
  state: MutableGameState,
  tracker: DraftTracker,
  key: string,
): void {
  if (!tracker.markers.has(key)) {
    (state.markers as Record<string, Record<string, string>>)[key] =
      { ...state.markers[key] };
    tracker.markers.add(key);
  }
}

/** Ensure the global marker map is a fresh clone. */
export function ensureGlobalMarkersCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.globalMarkers && state.globalMarkers !== undefined) {
    state.globalMarkers = { ...state.globalMarkers };
    tracker.globalMarkers = true;
  }
}

/** Ensure the turn-order runtime state is a fresh clone. */
export function ensureTurnOrderStateCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.turnOrderState) {
    state.turnOrderState = { ...state.turnOrderState };
    tracker.turnOrderState = true;
  }
}

/** Ensure the reveal-grant map is a fresh clone when present. */
export function ensureRevealsCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.reveals && state.reveals !== undefined) {
    state.reveals = { ...state.reveals };
    tracker.reveals = true;
  }
}

/** Ensure the active lasting-effects array is a fresh clone when present. */
export function ensureActiveLastingEffectsCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.activeLastingEffects && state.activeLastingEffects !== undefined) {
    state.activeLastingEffects = [...state.activeLastingEffects];
    tracker.activeLastingEffects = true;
  }
}

/** Ensure the interrupt-phase stack is a fresh clone when present. */
export function ensureInterruptPhaseStackCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.interruptPhaseStack && state.interruptPhaseStack !== undefined) {
    state.interruptPhaseStack = [...state.interruptPhaseStack];
    tracker.interruptPhaseStack = true;
  }
}

/** Ensure the action-usage map is a fresh clone. */
export function ensureActionUsageCloned(
  state: MutableGameState,
  tracker: DraftTracker,
): void {
  if (!tracker.actionUsage) {
    state.actionUsage = { ...state.actionUsage };
    tracker.actionUsage = true;
  }
}
