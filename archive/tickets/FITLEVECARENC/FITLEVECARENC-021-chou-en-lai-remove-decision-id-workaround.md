# FITLEVECARENC-021: Validate Chou En Lai Canonical Decision Flow and Harden Ownership Assertions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No engine behavior changes expected; FITL integration-test hardening only
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

This ticket was opened assuming Chou En Lai (`card-42`) still depended on runtime-error parsing to recover missing decision IDs during unshaded execution.

That assumption is now stale: canonical stochastic decision discovery landed in FITLEVENTARCH-003 and current `fitl-events-chou-en-lai.test.ts` already uses `resolveMoveDecisionSequence`.

What remains valuable is tightening ownership assertions so cross-seat chooser routing is explicitly enforced in runtime integration coverage.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` does **not** parse runtime error strings anymore.
2. `archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md` is completed and already delivered the required engine-level stochastic discovery behavior.
3. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` already asserts compiled card contract for `card-42` chooser (`chooseN.chooser -> { id: 2 }`), but runtime-flow coverage can still be stricter about pending-choice ownership.

## Architecture Reassessment

1. Re-implementing engine-side discovery changes in this ticket would be redundant and harmful to clarity; architecture is cleaner if this ticket stays test-focused.
2. The best long-term structure is:
   - compiler/integration contract tests verify encoded chooser ownership;
   - runtime decision-sequence tests verify chooser ownership is respected when decisions are surfaced and resolved.
3. No compatibility aliases/shims are introduced. If this stricter test catches a break, we should fix kernel/compiler behavior directly.

## Scope

### 1. Harden Chou En Lai runtime ownership assertions

In `fitl-events-chou-en-lai.test.ts`, assert unshaded decision discovery surfaces an NVA-owned `chooseN` pending choice before completion, and assert sequence completion through canonical decision filling.

### 2. Re-validate card contract and deck regressions

Re-run card-contract (`fitl-events-1968-nva`) and full-deck (`fitl-events-full-deck`) integration tests to ensure no drift.

### 3. Keep game data and engine logic unchanged unless tests prove a real defect

No planned YAML or kernel behavior edits in this ticket.

## Files to Touch

- `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` (modify)
- `tickets/FITLEVECARENC-021-chou-en-lai-remove-decision-id-workaround.md` (modify)

## Out of Scope

- New gameplay behavior for `card-42`
- Additional event-card migrations
- Runner/UI changes
- Broad decision-sequence refactors already covered by FITLEVENTARCH-003

## Acceptance Criteria

### Tests That Must Pass

1. Chou En Lai unshaded runtime flow explicitly validates chooser ownership and completes through standard decision-sequence APIs.
2. Card-42 runtime behavior (resource clamps and troop-removal semantics) remains unchanged.
3. `fitl-events-1968-nva` and `fitl-events-full-deck` integration suites pass.
4. Existing suite remains green: `pnpm -F @ludoforge/engine test`.

### Invariants

1. FITL card data remains declarative and game-rule-focused.
2. Decision discovery/resolution remains game-agnostic kernel behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` — strengthen unshaded runtime assertion for pending-choice ownership (`decisionPlayer === 2`) and canonical completion.
2. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — regression verification only (no edits expected).
3. `packages/engine/test/integration/fitl-events-full-deck.test.ts` — regression verification only (no edits expected).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-chou-en-lai.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Reassessed ticket assumptions against current code and corrected stale claims.
  - Strengthened `packages/engine/test/integration/fitl-events-chou-en-lai.test.ts` to explicitly assert the unshaded `chooseN` pending decision is owned by NVA (`decisionPlayer === 2`) before completing canonical decision resolution.
- Deviations from original plan:
  - No engine or FITL data changes were made because the original runtime-error parsing workaround had already been removed by prior completed work (FITLEVENTARCH-003 path).
  - No edits were required in `fitl-events-1968-nva.test.ts` or deck data; those were retained as regression checks.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-chou-en-lai.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`442` tests, `0` failures).
  - `pnpm -F @ludoforge/engine lint` passed.
