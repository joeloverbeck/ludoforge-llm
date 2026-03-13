# FITLEVEAUTHAR-004: Rework CIDG (Card 81) onto new macros and test helpers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — FITL game data and tests only
**Deps**: FITLEVEAUTHAR-002, FITLEVEAUTHAR-003

## Problem

Card 81 (CIDG) is correctly implemented but uses ~200 lines of verbose open-coded replacement/routing logic in `data/games/fire-in-the-lake/41-events/065-096.md`. Now that FITLEVEAUTHAR-002 introduced reusable macros for these patterns, CIDG should be re-expressed using them — both to validate the macros work in practice and to establish the pattern for future card rework. Its tests should also migrate to the shared fidelity helpers from FITLEVEAUTHAR-003.

This ticket is the exemplar migration, not the full rollout. Remaining cards that share the same architectural debt are tracked separately in FITLEVEAUTHAR-007.

## Assumption Reassessment (2026-03-13)

1. CIDG card is at lines ~2926-3116 of `data/games/fire-in-the-lake/41-events/065-096.md` — confirmed.
2. `fitl-events-cidg.test.ts` exists with custom `compileDef()`, `setupEventState()`, `makeToken()` boilerplate — confirmed.
3. New macros from FITLEVEAUTHAR-002 and test helpers from FITLEVEAUTHAR-003 are available — assumed (dependency).
4. CIDG behavior must be preserved exactly — spec explicitly states "Preserve existing behavior exactly unless the rules reference proves a mistake."

## Architecture Check

1. Changes are in FITL game data and FITL tests — correct boundary.
2. Macro usage replaces open-coded sequences — reduces YAML lines, same compiled output.
3. No backwards-compatibility aliases needed — CIDG is rewritten in place.

## What to Change

### 1. Re-express CIDG card using new macros

In `data/games/fire-in-the-lake/41-events/065-096.md`, replace the open-coded replacement/routing sequences in Card 81's unshaded and shaded effects with calls to the new macros from FITLEVEAUTHAR-002 where applicable:

- Replace open-coded "remove VC guerrilla → route to VC Available" with the routing macro.
- Replace open-coded "place Ranger/Irregular/Police from Available → set posture" with the replace-and-set-posture macro.
- Keep any CIDG-specific logic (die roll, count calculation, space selection) that is unique to this card.

**Critical**: The compiled `GameDef` output for Card 81 must produce identical behavior. Verify by running the existing CIDG test suite before and after.

### 2. Migrate CIDG tests to shared helpers

In `packages/engine/test/integration/fitl-events-cidg.test.ts`:

- Replace local `compileDef()` with `compileFitlDef()` from the new helpers.
- Replace local `setupEventState()` with `setupFitlEventState()`.
- Replace local `makeToken()` with `makeFitlToken()`.
- Use `runEventToCompletion()` where it simplifies the test body.
- Add fidelity checks using `assertEventText()` and `assertCompiledStructure()` if not already covered.
- Preserve all existing test cases and assertions — do not remove coverage.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — Card 81 only)
- `packages/engine/test/integration/fitl-events-cidg.test.ts` (modify)

## Out of Scope

- Modifying any other event cards in `065-096.md` or other event files.
- Auditing or migrating the rest of the deck onto the new macros — that is FITLEVEAUTHAR-007.
- Modifying engine source code (compiler, kernel, agents, sim).
- Modifying macros in `20-macros.md` (those are locked from FITLEVEAUTHAR-002).
- Modifying test helpers (those are locked from FITLEVEAUTHAR-003).
- Fixing CIDG behavioral bugs (unless rules reference proves current implementation wrong — in which case, flag via 1-3-1 rule).

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-cidg.test.ts` — all existing test cases pass with identical assertions.
2. `compileProductionSpec()` succeeds with no errors.
3. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test:e2e` — must remain green.

### Invariants

1. Card 81 compiled behavior is identical before and after — same effects, same decision points, same state transitions for the same inputs.
2. No other cards in `065-096.md` are modified.
3. No engine source files are modified.
4. CIDG test file retains all existing coverage — test case count must not decrease.
5. The reworked CIDG card YAML is shorter than the original (macro usage reduces line count).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-cidg.test.ts` — migrated to shared helpers, same assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
