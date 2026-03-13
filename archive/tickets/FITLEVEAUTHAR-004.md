# FITLEVEAUTHAR-004: Rework CIDG (Card 81) onto replacement/routing macros

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — FITL game data and tests only
**Deps**: FITLEVEAUTHAR-002, FITLEVEAUTHAR-003

## Problem

Card 81 (CIDG) is correctly implemented but still uses verbose open-coded replacement/routing logic in `data/games/fire-in-the-lake/41-events/065-096.md`. FITLEVEAUTHAR-002 introduced narrowly-scoped FITL-local macros for exactly the shared mechanics this card repeats. CIDG should now be re-expressed using those macros where they improve the authored structure without hiding card-specific legality, counts, or chooser flow.

This ticket is the exemplar migration, not the full rollout. Remaining cards that share the same architectural debt are tracked separately in FITLEVEAUTHAR-007.

## Assumption Reassessment (2026-03-13)

1. CIDG card is at lines ~2926-3363 of `data/games/fire-in-the-lake/41-events/065-096.md` and still open-codes both routing and placement/posture sequences — confirmed.
2. `packages/engine/test/integration/fitl-events-cidg.test.ts` has already been migrated onto shared event-fidelity helpers from FITLEVEAUTHAR-003; this ticket does not own helper migration anymore — confirmed.
3. FITLEVEAUTHAR-002 completed the three narrow macros this ticket can consume:
   - `fitl-route-removed-piece-to-force-pool`
   - `fitl-place-selected-piece-in-zone`
   - `fitl-place-selected-piece-in-zone-underground-by-type`
   Initial reassessment assumed those contracts were immediately consumable by CIDG; implementation verification must re-prove that assumption.
4. The relevant spec reference is [specs/62-fitl-event-authoring-hardening.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-fitl-event-authoring-hardening.md), not a wildcard `specs/62-fitl*` path.
5. CIDG behavior must be preserved exactly unless the rules reference proves current behavior wrong — confirmed by Spec 62 and the existing CIDG test suite.

## Architecture Check

1. FITL-local authored data remains the correct boundary; no engine/compiler/kernel changes are warranted.
2. The existing narrow macros are beneficial for CIDG because they remove repeated imperative routing and placement/posture steps while keeping the unique die-roll, counting, selection, and Highland targeting logic explicit in the card.
3. A larger all-in-one CIDG-specific macro would be worse architecture: it would hide the actual event contract and create a one-off abstraction instead of reusing the shared FITL-local building blocks.
4. No backwards-compatibility aliases needed — CIDG should be rewritten directly onto the canonical macro contracts.
5. If CIDG is the first real consumer to expose a defect in one of those macro contracts, fixing that FITL-local macro is preferable to keeping CIDG open-coded. That is still within the same authored-data architecture and is a better long-term design than duplicating known-buggy sequences in each card.

## What to Change

### 1. Re-express CIDG card using the existing narrow macros

In `data/games/fire-in-the-lake/41-events/065-096.md`, replace only the genuinely shared sequences in Card 81's unshaded and shaded effects with calls to the macros from FITLEVEAUTHAR-002:

- Replace open-coded "remove selected piece to its rule-correct force pool" steps with `fitl-route-removed-piece-to-force-pool` where the macro preserves the exact destination semantics.
- Replace open-coded "place selected Available piece into the captured source zone" with `fitl-place-selected-piece-in-zone` where no posture change is needed.
- Replace open-coded "place selected Available piece into the captured source zone, then set underground only for Irregulars/Rangers or VC guerrillas" with `fitl-place-selected-piece-in-zone-underground-by-type`.
- Keep CIDG-specific logic explicit in the card: die roll, source guerrilla counting, replacement choice pool, Highland eligibility, chosen Highland binding, and capped shaded VC count.

**Critical**: The compiled `GameDef` output for Card 81 must produce identical behavior. Verify by running the existing CIDG test suite before and after.

### 2. Tighten CIDG architecture/fidelity tests around the rewrite

In `packages/engine/test/integration/fitl-events-cidg.test.ts`:

- Preserve all existing behavioral coverage and assertions.
- Update structural assertions so the suite proves CIDG now depends on the canonical routing/placement macros rather than open-coded movement/posture sequences.
- Add or strengthen edge-case coverage if the rewrite exposes an invariant that is not already locked down.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify only if CIDG integration exposes a defect in the existing macro contract)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — Card 81 only)
- `packages/engine/test/integration/fitl-events-cidg.test.ts` (modify)

## Out of Scope

- Modifying any other event cards in `065-096.md` or other event files.
- Auditing or migrating the rest of the deck onto the new macros — that is FITLEVEAUTHAR-007.
- Modifying engine source code (compiler, kernel, agents, sim).
- Broadening the macro surface in `20-macros.md`; only a narrowly-scoped correctness fix is allowed if CIDG becomes the first real consumer to expose a defect in an existing macro.
- Modifying test helpers (those are already handled by FITLEVEAUTHAR-003 and are out of scope here).
- Fixing CIDG behavioral bugs (unless rules reference proves current implementation wrong — in which case, flag via 1-3-1 rule).

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-cidg.test.ts` — all existing test cases pass with identical assertions.
2. `compileProductionSpec()` succeeds with no errors.
3. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test:e2e` — must remain green.
5. `pnpm turbo lint` — must remain green.

### Invariants

1. Card 81 compiled behavior is identical before and after — same effects, same decision points, same state transitions for the same inputs.
2. No other cards in `065-096.md` are modified.
3. No engine source files are modified.
4. CIDG test file retains all existing coverage — test case count must not decrease.
5. CIDG uses the shared FITL-local routing/placement macros where they improve clarity; card-specific selector/count logic remains explicit in the card.
6. If a shared macro is corrected as part of this ticket, the fix is covered by direct macro-contract tests and remains FITL-local.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-cidg.test.ts` — migrated to shared helpers, same assertions.
2. `packages/engine/test/integration/fitl-events-cidg.test.ts` — strengthened structural assertions that Card 81 now calls the canonical routing/placement macros.
3. `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts` — strengthened if needed to cover any macro-contract bug exposed by CIDG integration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - corrected the ticket assumptions and narrowed the core card rewrite to CIDG authored-data debt that still remained after FITLEVEAUTHAR-003
  - rewrote Card 81 (`CIDG`) in `41-events/065-096.md` to use `fitl-route-removed-piece-to-force-pool` for both unshaded and shaded removals
  - rewrote Card 81 (`CIDG`) to use `fitl-place-selected-piece-in-zone-underground-by-type` for both unshaded replacement placement and shaded VC placement while keeping CIDG-specific die-roll/count/selection logic explicit in the card
  - strengthened `packages/engine/test/integration/fitl-events-cidg.test.ts` so it asserts both the preserved behavior and the intended authored architecture
  - strengthened `packages/engine/test/integration/fitl-event-replacement-routing-macros.test.ts` to cover the posture macro’s canonical membership guard shape
  - fixed a latent FITL-local macro defect exposed by this first real CIDG integration:
    - `fitl-place-selected-piece-in-zone-underground-by-type` now uses the canonical `in` condition shape (`item` / `set`)
    - `undergroundTypes` is now correctly typed as `tokenTraitValues` for token `type`, which matches the real contract and allows canonical piece-type allow-lists
- Deviations from the original plan:
  - did not perform any test-helper migration because that work was already completed by FITLEVEAUTHAR-003 before this ticket was picked up
  - did touch `data/games/fire-in-the-lake/20-macros.md`, but only for the narrowly-scoped correctness fix exposed by CIDG becoming the first production consumer of the placement/posture macro
  - did not introduce any broader or CIDG-specific macro abstraction; the final architecture keeps the shared mechanics reusable and the card-specific selectors/counts explicit
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node packages/engine/dist/test/integration/fitl-events-cidg.test.js` passed
  - `node packages/engine/dist/test/integration/fitl-event-replacement-routing-macros.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine test:e2e` passed
  - `pnpm turbo lint` passed
