# FITLEVECARENC-020: Rework Bombing Pause to Canonical Event Target Semantics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No additional engine/data changes required in this ticket; verification + closure only
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, archive/tickets/FITLEVENTARCH-002-choice-validation-error-classification.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

This ticket originally assumed `card-41` still used a manual `forEach` workaround for multi-target marker application and required a data/test migration to canonical `targets + application: each` semantics.

## Assumption Reassessment (2026-03-08)

1. `card-41` is already encoded in canonical target semantics (`targets`, `cardinality: { n: 2 }`, `application: each`, target-scoped `setMarker`) in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. The prior workaround assumption is stale for Bombing Pause specifically; no `forEach` wrapper exists in `card-41`.
3. Existing integration tests already assert deterministic invalid-parameter classification for both cardinality mismatch and outside-options-domain failures via `ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID`.

## Architecture Check

1. The architecture goal in this ticket remains correct: canonical target semantics are cleaner, more robust, and more extensible than per-card iteration workarounds.
2. This preserves game-specific vs game-agnostic layering: FITL data only declares card intent; kernel handles generic execution semantics.
3. No backward-compatibility aliasing was introduced; current representation is direct and canonical.

## Scope Update

No new implementation changes are required for this ticket. Scope is reduced to:

1. Re-verify canonical Bombing Pause representation and behavior.
2. Re-run focused and full engine suites plus lint.
3. Close and archive with documented outcome.

## Files to Touch

- `tickets/FITLEVECARENC-020-bombing-pause-rework-to-canonical-target-semantics.md` (modify for reassessment + closure metadata)

## Out of Scope

- Additional Bombing Pause code/data/test rewrites (already present and passing)
- Changes to other FITL cards unless separately ticketed
- Runner visual configuration changes
- Any gameplay rebalance

## Acceptance Criteria

### Tests That Must Pass

1. `card-41` remains encoded without manual iteration workaround and preserves behavior.
2. Bombing Pause invalid selections remain canonical `MOVE_PARAMS_INVALID`.
3. Focused suites and `pnpm -F @ludoforge/engine test` pass.
4. Lint passes (`pnpm turbo lint`).

### Invariants

1. FITL card YAML expresses rule intent directly, not engine-gap workarounds.
2. Momentum timing (`until Coup`) remains unchanged and game-agnostic infrastructure stays generic.

## Tests

1. Verified existing Bombing Pause integration assertions for canonical shape/runtime/diagnostics.
2. Re-ran related momentum prohibition/regression suite.
3. Re-ran broader engine suite and workspace lint.

## Test Plan

### New/Modified Tests

1. None in this ticket (existing coverage already matches intended invariants).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-momentum-prohibitions.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Reassessed ticket assumptions against current code/tests.
  - Corrected stale scope: Bombing Pause canonical migration was already implemented before this ticket execution.
  - Completed verification pass and archived this ticket.
- Deviations from original plan:
  - No engine/data/test code modifications were required because planned changes already existed and were validated.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-momentum-prohibitions.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (438/438).
  - `pnpm turbo lint` passed.
