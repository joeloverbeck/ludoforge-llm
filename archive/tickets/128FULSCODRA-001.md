# 128FULSCODRA-001: Extend DraftTracker interface and add COW helpers for new domains

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel state-draft module
**Deps**: `archive/specs/78-draft-state-for-effect-execution.md`

## Problem

The existing `DraftTracker` (Spec 78) only tracks copy-on-write status for 4 inner map domains: `playerVars`, `zoneVars`, `zones`, `markers`. Spec 128 widens the draft scope to the full `applyMoveCore` boundary, which requires tracking COW status for 6 additional singleton nested objects/arrays: `globalMarkers`, `turnOrderState`, `reveals`, `activeLastingEffects`, `interruptPhaseStack`, `actionUsage`. Without these tracker fields and corresponding helpers, downstream conversion tickets cannot safely mutate these nested structures.

## Assumption Reassessment (2026-04-13)

1. `DraftTracker` at `packages/engine/src/kernel/state-draft.ts:30-35` has exactly 4 fields (`playerVars`, `zoneVars`, `zones`, `markers`) — confirmed.
2. `GameState` at `packages/engine/src/kernel/types-core.ts:1087-1107` has all 6 target fields: `globalMarkers` (optional Record), `turnOrderState` (TurnOrderRuntimeState), `reveals` (optional Record), `activeLastingEffects` (optional array), `interruptPhaseStack` (optional array), `actionUsage` (Record) — confirmed.
3. `createDraftTracker()` at `state-draft.ts:64-71` initializes all existing tracker fields — will need extension.
4. No `freeOperationGrants` field exists in `GameState` — correctly excluded from this ticket per reassessment.

## Architecture Check

1. Pure additive change — extends an existing internal interface with new tracking fields and adds helper functions following the established COW pattern. No existing behavior is modified.
2. `DraftTracker` is kernel-internal infrastructure, not game-specific. The new fields track generic GameState structure (turn order, markers, effects), not any game's domain.
3. No backwards-compatibility shims — the new fields are added directly, and `createDraftTracker()` initializes them from the start.

## What to Change

### 1. Extend DraftTracker interface

Add 6 new boolean fields to the `DraftTracker` interface in `state-draft.ts`:

```typescript
export interface DraftTracker {
  // Existing (Spec 78)
  readonly playerVars: Set<number>;
  readonly zoneVars: Set<string>;
  readonly zones: Set<string>;
  readonly markers: Set<string>;
  // New (Spec 128)
  globalMarkers: boolean;
  turnOrderState: boolean;
  reveals: boolean;
  activeLastingEffects: boolean;
  interruptPhaseStack: boolean;
  actionUsage: boolean;
}
```

Boolean pattern (vs Set) is appropriate because these are singleton nested objects — only one `turnOrderState`, not one per zone.

### 2. Update createDraftTracker factory

Initialize all new boolean fields to `false`:

```typescript
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
```

### 3. Add COW helper functions

Add `ensureXCloned` helpers for each new domain, following the established pattern from existing helpers (`ensurePlayerVarCloned`, `ensureZoneVarCloned`, etc.):

- `ensureGlobalMarkersCloned(state, tracker)` — shallow-clone `state.globalMarkers` if not already cloned
- `ensureTurnOrderStateCloned(state, tracker)` — shallow-clone `state.turnOrderState`
- `ensureRevealsCloned(state, tracker)` — shallow-clone `state.reveals` (guard for undefined)
- `ensureActiveLastingEffectsCloned(state, tracker)` — shallow-copy array `state.activeLastingEffects` (guard for undefined)
- `ensureInterruptPhaseStackCloned(state, tracker)` — shallow-copy array `state.interruptPhaseStack` (guard for undefined)
- `ensureActionUsageCloned(state, tracker)` — shallow-clone `state.actionUsage`

Each helper: check tracker boolean → if false, clone the nested structure, set boolean to true. Idempotent — second call is a no-op.

## Files to Touch

- `packages/engine/src/kernel/state-draft.ts` (modify)

## Out of Scope

- Changing any function signatures to accept `MutableGameState` + `DraftTracker` (ticket 002)
- Converting any spread sites to mutations (tickets 003-005)
- Modifying `createMutableState` or `freezeState` (they already handle all GameState fields)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `createDraftTracker()` returns an object with all 10 fields at their initial values (4 empty Sets + 6 false booleans)
2. Unit test: each new `ensureXCloned` helper clones on first call (tracker boolean flips to true, state field is a new reference) and is idempotent on second call (same reference returned)
3. Unit test: `ensureRevealsCloned` and `ensureActiveLastingEffectsCloned` handle `undefined` gracefully (no-op when field is undefined)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing `DraftTracker` consumers continue to compile without modification (new fields are additive)
2. `createDraftTracker()` always returns a complete tracker — no partial initialization

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/state-draft.test.ts` — add tests for new DraftTracker fields and COW helpers

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/state-draft.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed 2026-04-13.
- Landed the owned boundary in `packages/engine/src/kernel/state-draft.ts` and `packages/engine/test/unit/kernel/state-draft.test.ts`: `DraftTracker` now carries the six singleton-domain flags, `createDraftTracker()` initializes all ten fields, and the new `ensureXCloned` helpers cover `globalMarkers`, `turnOrderState`, `reveals`, `activeLastingEffects`, `interruptPhaseStack`, and `actionUsage`.
- Boundary correction during reassessment: the draft interface example used `readonly` booleans even though these helper-owned flags must flip from `false` to `true`; the active draft ticket was corrected to reflect the live mutable-flag contract. The stale test path and focused test command were also corrected to match the live repo layout and Node test runner workflow.
- Verification run:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/state-draft.test.js`
  - `pnpm -F @ludoforge/engine test`
- Schema/artifact fallout checked: `schema:artifacts:check` ran as part of `pnpm -F @ludoforge/engine test`; no generated artifact changes were required.
