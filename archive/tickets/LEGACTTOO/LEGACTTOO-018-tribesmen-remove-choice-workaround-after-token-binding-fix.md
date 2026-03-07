# LEGACTTOO-018: Tribesmen — Remove Workaround and Restore Canonical Choice-Based Implementation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — data/test-only migration that consumes completed LEGACTTOO-017 runtime behavior
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-017-choice-token-binding-fidelity-for-token-refs.md

## Problem

Card-29 (`Tribesmen`) unshaded still uses a `removeByPriority` workaround that was added before token-choice binding fidelity was fixed.

LEGACTTOO-017 is now completed, so card-29 should be re-authored to use the intended canonical flow (`chooseN` + token-derived destination refs) for “Remove any 4 Insurgent pieces total...” and no longer rely on workaround behavior.

## Assumption Reassessment (2026-03-07)

1. Current card-29 unshaded implementation uses `removeByPriority` workaround logic. **Confirmed in `data/games/fire-in-the-lake/41-content-event-decks.md`.**
2. Dedicated Tribesmen integration tests exist and currently pass with workaround semantics. **Confirmed in `packages/engine/test/integration/fitl-events-tribesmen.test.ts`.**
3. Engine limitation that originally blocked canonical implementation is now resolved in archived LEGACTTOO-017. **Confirmed.**
4. Current Tribesmen tests validate board outcomes but do not assert that unshaded emits a pending `chooseN` decision before execution. **Discrepancy found; scope updated below.**

## Architecture Check

1. Reverting to canonical `chooseN` keeps event semantics explicit and data-authored (“any 4” across eligible pool) rather than implicit via priority grouping.
2. `removeByPriority` is architecturally weaker for this event because it hardcodes resolution order rather than representing player/agent choice semantics in data.
3. Canonical `chooseN` expresses intent directly in GameSpecDoc, keeps runtime generic, and is more extensible for UI/agent decision tooling.
4. Changes remain in FITL content plus integration tests; no runtime/kernel branches are added.
5. No compatibility shim or aliasing: remove workaround once underlying engine semantics are fixed.

## What to Change

### 1. Re-author card-29 unshaded using canonical choice flow

In event deck content:
- Replace workaround `removeByPriority` block with choice-driven logic:
  - Compute eligible Insurgent tokens in spaces with US Irregulars.
  - Select exactly `min(4, eligibleCount)` with `chooseN`.
  - Move selected pieces to faction-appropriate Available zones using token-derived refs.

### 2. Tighten Tribesmen regression tests to enforce canonical flow and outcomes

Update/extend tests so they fail if behavior silently regresses back to priority-only workaround semantics.
- Explicitly assert that legal choice discovery for unshaded card-29 yields a `chooseN` decision over eligible insurgent pieces with `max` clamped to available count.
- Keep existing state-transition assertions (eligible removals, tunneled-base exclusion, faction-appropriate Available destinations).

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-tribesmen.test.ts` (modify)

## Out of Scope

- Additional FITL card refactors unrelated to card-29
- New engine architecture beyond what LEGACTTOO-017 delivers

## Acceptance Criteria

### Tests That Must Pass

1. Tribesmen unshaded executes via canonical `chooseN` selection path with token-derived destination resolution.
2. A Tribesmen integration assertion fails if unshaded no longer exposes a pending `chooseN` decision domain before completion.
3. Existing Tribesmen edge-case assertions remain green (untunneled base eligibility, map-space-with-Irregulars gate, replacement/shaded effects).
4. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Card-29 no longer uses the workaround block introduced to avoid choice binding limitations.
2. No game-specific code branches added in runtime/kernel for this migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tribesmen.test.ts` — preserve behavior coverage and add explicit pending-choice (`chooseN`) assertions for the unshaded canonical path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tribesmen.test.js`
3. `pnpm -F @ludoforge/engine test:integration`

## Outcome

- Completed: 2026-03-07
- What changed:
  - Re-authored card-29 (`Tribesmen`) unshaded from `removeByPriority` to canonical `chooseN` + `forEach moveToken` with token-derived destination resolution.
  - Added hard integration assertion in `fitl-events-tribesmen.test.ts` to verify pending `chooseN` decision shape/options before execution, in addition to outcome assertions.
- Deviations from original plan:
  - While executing the required integration suite, an unrelated token/scalar mismatch surfaced in card-117 (`Corps Commanders`) due token-choice runtime binding fidelity behavior. Fixed the data logic in-place (token membership check rewritten to token-zone comparison) so the required suite is green without adding runtime aliases/shims.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `node ./packages/engine/dist/test/integration/fitl-events-tribesmen.test.js` ✅
  - `node ./packages/engine/dist/test/integration/fitl-events-corps-commanders.test.js` ✅
  - `pnpm -F @ludoforge/engine test:integration` ✅ (137 passed, 0 failed)
