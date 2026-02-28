# FITLDATA-001: Isolate FITL `distributeTokens` GameSpecDoc Refactors from Engine Contract Changes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — integration assertion hardening + behavioral coverage
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

The FITL content refactor to `distributeTokens` already landed in GameSpecDoc, but this ticket still describes that refactor as pending implementation. That mismatch reduces traceability and obscures what remains: validating behavior with robust tests that do not over-couple to lowering internals.

## Assumption Reassessment (2026-02-28)

1. Confirmed: `data/games/fire-in-the-lake/41-content-event-decks.md` already uses `distributeTokens` for `card-1` unshaded and `card-2` shaded NVA placement.
2. Confirmed: this is still a game-data concern (GameSpecDoc authoring), not engine runtime/kernel branching.
3. Corrected mismatch: this ticket should not re-do data refactors; scope is test architecture hardening and semantic regression protection around the already-adopted data.

## Architecture Check

1. Keeping data refactors and engine-contract work isolated is still the cleaner architecture.
2. Behavior-first tests are more robust than lowered-shape assertions where authored effects are intentionally macro-like (`distributeTokens` lowering to internal choose/loop forms).
3. No backwards-compatibility aliases/shims are introduced; tests should lock semantics, not incidental lowering structure.

## What to Change

### 1. Correct ticket scope to post-refactor verification

Track already-changed cards and intended semantics explicitly (selection cardinality, per-token destination decisions, and movement effects).

### 2. Harden integration assertions toward behavior, not lowering internals

Ensure FITL integration tests validate:
- pending choice types and option sets,
- resulting state transitions,
- structural effect relationships where needed (forEach over chooseN bind),
while avoiding brittle dependence on transformed effect shape when authored semantics are stable.

### 3. Record explicit verification expectations

Require targeted FITL integration coverage and full engine suite pass tied to this content change.

## Files to Touch

- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify)

## Out of Scope

- Kernel/runtime semantics changes.
- Visual presentation config changes (`visual-config.yaml`).

## Acceptance Criteria

### Tests That Must Pass

1. Existing FITL `distributeTokens` cards preserve intended gameplay semantics under integration tests.
2. Integration assertions are resilient to lowering-shape changes and avoid compiler-internal coupling.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Engine lint passes: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Game-specific behavior remains encoded in GameSpecDoc data, not engine branching.
2. Engine/runtime remains game-agnostic with no FITL-specific logic added.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — replace lowered-shape assertions with behavior-first checks for card-1 piece distribution.
2. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — add/strengthen behavior tests for card-2 shaded NVA placement + US troop out-of-play routing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Actually Changed**:
  - Reassessed and corrected ticket assumptions/scope: `distributeTokens` data refactor was already present for the targeted FITL cards.
  - Updated Gulf of Tonkin integration compile assertion to avoid dependence on lowered `chooseN/forEach` structure.
  - Added runtime behavioral coverage for Kissinger shaded flow to verify NVA placement, US troop routing to out-of-play, and aid reduction semantics.
- **Deviations from Original Plan**:
  - Did not modify `data/games/fire-in-the-lake/41-content-event-decks.md` because the data refactor was already implemented.
  - Focus shifted from “apply data refactor” to “verify/post-refactor test hardening.”
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js` ✅
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (333/333)
  - `pnpm -F @ludoforge/engine lint` ✅
