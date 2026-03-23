# 78DRASTAEFF-003: Add writeScopedVarsMutable helper to scoped-var-runtime-access

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — scoped-var-runtime-access.ts
**Deps**: 78DRASTAEFF-001

## Problem

The existing `writeScopedVarsToState` creates a new GameState object via full 19-field spread for every variable write. Spec 78 requires a mutable counterpart — `writeScopedVarsMutable` — that mutates the MutableGameState in place using the DraftTracker for copy-on-write of inner maps. This is the critical helper that `setVar`, `addVar`, and `transferVar` handlers will call after migration.

## Assumption Reassessment (2026-03-23)

1. `writeScopedVarsToState` delegates to `writeScopedVarsToBranches` which already implements copy-on-write logic for inner maps using local Sets (`stagedPlayers`, `stagedZones`) — confirmed at lines 509–573.
2. The new `writeScopedVarsMutable` must replicate the same write semantics but use `DraftTracker` Sets (which persist across the entire execution scope) instead of local per-call Sets.
3. `ScopedVarWrite` type and `isZoneScopedWrite`/`resolvePvarScopedWritePlayerKey` helpers are reusable as-is.

## Architecture Check

1. `writeScopedVarsMutable` is additive — `writeScopedVarsToState` is NOT removed. Non-migrated handlers and test code can still use the spread-based version.
2. The function mutates `MutableGameState` fields directly, using `DraftTracker` to guard copy-on-write for inner maps — same semantic guarantees as the spread-based version.
3. No backwards-compatibility shims. The two functions coexist until all handlers are migrated.

## What to Change

### 1. Add `writeScopedVarsMutable` to `packages/engine/src/kernel/scoped-var-runtime-access.ts`

```typescript
export const writeScopedVarsMutable = (
  state: MutableGameState,
  writes: readonly ScopedVarWrite[],
  tracker: DraftTracker,
): void => { ... };
```

Logic mirrors `writeScopedVarsToBranches` but:
- Instead of `globalVars = { ...globalVars }`, directly mutates `state.globalVars[varName] = value` (top-level map already cloned by `createMutableState`)
- For `perPlayerVars`: uses `ensurePlayerVarCloned(state, tracker, playerKey)` before writing
- For `zoneVars`: uses `ensureZoneVarCloned(state, tracker, zoneKey)` before writing
- No return value — mutation is in-place

Import `MutableGameState`, `DraftTracker`, `ensurePlayerVarCloned`, `ensureZoneVarCloned` from `state-draft.ts`.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify — add new exported function)

## Out of Scope

- Removing or modifying `writeScopedVarsToState` (it stays for non-migrated callers)
- Migrating effect handlers to call `writeScopedVarsMutable` (tickets 004, 006)
- Changes to `state-draft.ts` (ticket 001)
- Changes to any test helpers

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `writeScopedVarsMutable` applies a global var write — state.globalVars reflects the change
2. New unit test: `writeScopedVarsMutable` applies a per-player var write — inner player map is cloned (identity check), value is correct
3. New unit test: `writeScopedVarsMutable` applies a zone var write — inner zone map is cloned, value is correct
4. New unit test: `writeScopedVarsMutable` with multiple writes to same player — inner map cloned only once (tracker idempotency)
5. New unit test: `writeScopedVarsMutable` produces same var values as `writeScopedVarsToState` for identical inputs (parity check)
6. Existing suite: `pnpm turbo test --force`
7. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `writeScopedVarsMutable` MUST NOT modify the original GameState passed to `createMutableState` — only the mutable clone.
2. The DraftTracker's Sets must be checked before cloning inner maps — never double-clone.
3. `writeScopedVarsToState` continues to work unchanged for non-migrated callers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/scoped-var-mutable-write.test.ts` — unit tests for `writeScopedVarsMutable`

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "scoped-var-mutable"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`
