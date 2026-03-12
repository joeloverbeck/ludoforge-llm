# FITL70-001: Reevaluate and rework card-70 ROKs after shared engine changes land

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected in this ticket; FITL `GameSpecDoc` and tests should consume shared engine contracts from dependencies
**Deps**: `tickets/README.md`, `archive/tickets/FREEOP/FREEOP-ROKS-001-free-operation-probe-scaling.md`, `archive/tickets/OPEROVERLAY-001-generic-operation-execution-overlay.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `reports/fire-in-the-lake-rules-section-3.md`, `reports/fire-in-the-lake-rules-section-5.md`, `packages/engine/test/integration/fitl-events-roks.test.ts`, `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`

## Problem

Card 70 (`ROKs`) is currently in an intermediate state. The authored implementation was pushed far enough to prove the rules intent and expose missing engine capabilities, but it should not be treated as architecturally final until the shared engine tickets land.

Once those shared fixes are available, `ROKs` must be reevaluated and reworked if necessary so that:

- the card uses the cleanest shared engine contract,
- no bespoke FITL-only operation-profile duplication remains unless still justified,
- and the final implementation exactly matches rules/playbook semantics.

## Assumption Reassessment (2026-03-12)

1. The current `ROKs` authored implementation compiles and passes compile-level production assertions. Confirmed locally.
2. The current `ROKs` runtime path exposed shared engine limitations rather than cleanly closing on a final card implementation. Confirmed locally.
3. `ROKs` semantics are stricter than a plain `executeAsSeat` grant: all US Troops, ARVN Troops, and Police act as US Troops; `Abrams` and US-base doubling must still apply. Confirmed from the playbook/rules material referenced in this ticket.
4. Therefore the current card data should be treated as provisional pending the shared engine work, not as the final architectural shape.

## Architecture Check

1. This ticket should be a FITL data cleanup / reassessment ticket, not another engine ticket. Shared capability belongs in the engine dependency tickets.
2. Reworking `ROKs` after the shared contracts land is cleaner than entrenching a large custom-profile workaround in FITL data indefinitely.
3. This preserves the boundary: `GameSpecDoc` will encode the game-specific event once the engine provides the generic contract it needs.
4. No backwards-compatibility layer should preserve the provisional `ROKs` workaround if the new shared contract can represent the rule more directly.

## What to Change

### 1. Reassess the provisional `ROKs` authored shape

After the dependency tickets land, compare the current card-70 authored implementation against the new shared engine contracts and decide explicitly whether:

- the current authored structure is still the cleanest form, or
- `ROKs` should be rewritten to remove duplicated mixed Sweep/Assault logic.

Record that reassessment in the ticket before final implementation.

### 2. Rework card-70 to the canonical shared-contract form

Update FITL event data and any supporting FITL action/macros so `ROKs` uses the shared engine capability rather than a card-specific workaround, while preserving exact rules semantics:

- US or ARVN chooses the operation details,
- Sweep is allowed during Monsoon,
- Sweep target geography matches “Phu Bon and adjacent spaces”,
- Assault geography includes the three LoCs touching Phu Bon,
- all US Troops, ARVN Troops, and Police participate as if US Troops,
- and US-profile hooks such as `Abrams` and US-base doubling apply correctly.

### 3. Keep shaded side exact and simple

Retain or simplify the shaded side only if it still exactly represents:

- Qui Nhon shift 1 toward Active Opposition,
- Phu Bon shift 1 toward Active Opposition,
- Khanh Hoa shift 1 toward Active Opposition,
- with lattice clamping preserved.

## Files to Touch

- `tickets/FITL70-001-reevaluate-roks-after-engine-rework.md` (new)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify if the provisional custom profiles/macros can be removed)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify if compile-level assertions change)

## Out of Scope

- Shared engine work tracked in dependency tickets
- Unrelated FITL event-card rewrites
- Visual presentation changes

## Acceptance Criteria

### Tests That Must Pass

1. Card-70 uses the cleanest shared engine contract available after dependency completion.
2. Runtime `ROKs` coverage passes for unshaded and shaded exact semantics, including edge cases around Monsoon, LoC assault scope, mixed cubes, `Abrams`, and support/opposition clamping.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Final `ROKs` behavior is authored in FITL `GameSpecDoc`, not hardcoded in agnostic kernel/runtime logic.
2. Card-70 must not preserve provisional bespoke authored complexity once a cleaner shared engine contract exists.
3. No backwards-compatibility path is required for earlier `ROKs` encodings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-roks.test.ts` — final end-to-end card-70 runtime verification after reevaluation/rework.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — production compile-shape assertions for the final card-70 encoding.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
