# LEGACTTOO-018: Tribesmen — Remove Workaround and Restore Canonical Choice-Based Implementation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — depends on core fix from LEGACTTOO-017; content/test updates for FITL card-29
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-017-choice-token-binding-fidelity-for-token-refs.md

## Problem

Card-29 (`Tribesmen`) unshaded currently uses a `removeByPriority` workaround because canonical `chooseN` token selection + follow-up `tokenProp` usage fails under current engine semantics.

Once LEGACTTOO-017 lands, card-29 should be re-authored to use the intended choice-based flow for “Remove any 4 Insurgent pieces total...” and no longer rely on workaround behavior.

## Assumption Reassessment (2026-03-07)

1. Current card-29 unshaded implementation uses `removeByPriority` workaround logic. **Confirmed in `data/games/fire-in-the-lake/41-content-event-decks.md`.**
2. Dedicated Tribesmen integration tests exist and currently pass with workaround semantics. **Confirmed in `packages/engine/test/integration/fitl-events-tribesmen.test.ts`.**
3. Engine limitation preventing canonical implementation is tracked in LEGACTTOO-017. **Confirmed.**

## Architecture Check

1. Reverting to canonical `chooseN` keeps event semantics explicit and data-authored (“any 4” across eligible pool) rather than implicit via priority grouping.
2. Changes remain in FITL GameSpecDoc content plus tests; runtime remains agnostic and generic.
3. No compatibility shim: remove workaround once underlying engine semantics are fixed.

## What to Change

### 1. Re-author card-29 unshaded using canonical choice flow

In event deck content:
- Replace workaround `removeByPriority` block with choice-driven logic:
  - Compute eligible Insurgent tokens in spaces with US Irregulars.
  - Select exactly `min(4, eligibleCount)` with `chooseN`.
  - Move selected pieces to faction-appropriate Available zones using token-derived refs.

### 2. Tighten Tribesmen regression tests to enforce canonical flow outcome

Update/extend tests so they fail if behavior silently regresses back to priority-only workaround semantics.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-tribesmen.test.ts` (modify)

## Out of Scope

- Additional FITL card refactors unrelated to card-29
- New engine architecture beyond what LEGACTTOO-017 delivers

## Acceptance Criteria

### Tests That Must Pass

1. Tribesmen unshaded executes via canonical `chooseN` selection path with token-derived destination resolution.
2. Existing Tribesmen edge-case assertions remain green (untunneled base eligibility, map-space-with-Irregulars gate, replacement/shaded effects).
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Card-29 no longer uses the workaround block introduced to avoid choice binding limitations.
2. No game-specific code branches added in runtime/kernel for this migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tribesmen.test.ts` — preserve behavior coverage and ensure canonical path remains supported.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tribesmen.test.js`
3. `pnpm -F @ludoforge/engine test:integration`
