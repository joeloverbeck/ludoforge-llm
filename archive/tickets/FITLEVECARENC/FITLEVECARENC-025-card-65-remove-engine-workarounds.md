# FITLEVECARENC-025: Card-65 International Forces — remove engine workarounds

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None in this ticket — uses current generic engine/compiler behavior as-is
**Deps**: archive/tickets/ENGINEARCH/ENGINEARCH-165-canonical-rollrandom-chooseN-cardinality-contract.md, archive/tickets/ENGINEARCH/ENGINEARCH-166-generic-stochastic-decision-completion-and-normalization.md, archive/tickets/ENGINEARCH/ENGINEARCH-167-legality-backed-choice-domain-expressiveness.md

## Problem

Card-65 is currently rules-correct but not canonically encoded. The shaded side still uses a six-branch data workaround for die outcomes even though the engine now supports the compact declarative shape directly. The unshaded side already relies on the preferred generic legality architecture; its authored flow should only change if a clearly cleaner data expression exists.

## Assumption Reassessment (2026-03-11)

1. `data/games/fire-in-the-lake/41-events/065-096.md` currently encodes card-65 shaded with explicit branches for exact removal counts instead of one dynamic exact `chooseN`.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` no longer contains any bespoke stochastic helper. It already uses shared decision normalization helpers delivered by `ENGINEARCH-166`.
3. The current unshaded implementation is already protected by generic downstream legality propagation, and that behavior is now explicitly covered by integration tests added through `ENGINEARCH-167`.
4. `packages/engine/src/kernel/types-ast.ts` and `packages/engine/src/kernel/effects-choice.ts` already support expression-valued `chooseN.min/max`, so the remaining workaround is authored data, not an engine limitation.

## Architecture Check

1. This ticket keeps FITL-specific behavior in GameSpec data while depending on generic engine/compiler behavior already delivered elsewhere.
2. The goal is to delete duplicated workaround structure, not to add any new game-specific runtime logic.
3. The unshaded side should keep relying on generic downstream legality rather than duplicating destination constraints back into the source query.
4. No backwards-compatibility preservation is needed for the workaround encoding once the canonical data path exists.

## What to Change

### 1. Re-encode shaded in the natural compact form

Replace the branch ladder with the declarative sequence:

1. roll d6
2. compute `min(roll, US map pieces available)`
3. exact `chooseN` by the US
4. move selected US pieces to `out-of-play-US:none`

### 2. Keep unshaded as-is unless a strictly simpler declarative encoding exists

Because generic downstream legality already blocks undeliverable US Bases at the source-choice step, do not add redundant source-domain logic that duplicates destination legality. Only change unshaded data if it becomes materially simpler.

### 3. Refresh integration assertions around the canonical shaded encoding

Update the existing card-65 integration test so it verifies the compact shaded authoring shape and continues to cover shared stochastic normalization/choice ownership through the generic helpers already in use.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)

## Out of Scope

- Engine/kernel/compiler changes
- Reworking unshaded source domains to duplicate already-working legality propagation
- Updating stale archival/spec prose unless separately requested
- Reworking unrelated FITL event cards

## Acceptance Criteria

### Tests That Must Pass

1. Card-65 shaded no longer uses explicit per-die-result branches in event data.
2. Card-65 shaded uses one expression-valued exact `chooseN` (`min == max == min(roll, available US map pieces)`) plus one shared removal loop.
3. Card-65 integration coverage passes using the existing shared stochastic completion helpers.
4. Unshaded source-choice behavior remains correct without broadening scope into redundant source-domain logic.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-65 remains fully rules-correct for both sides.
2. FITL card data stays declarative and game-specific; engine code remains untouched in this ticket.
3. The final encoding is strictly simpler than the workaround it replaces.
4. Shared stochastic normalization and generic legality propagation remain the architectural source of truth.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — verify the canonical shaded encoding now uses one expression-valued exact `chooseN` instead of a branch ladder.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — keep the shared stochastic normalization and chooser-ownership assertions for shaded execution.
3. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — retain the existing unshaded legality regression proving undeliverable US Bases are illegal at the source-choice step.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- What actually changed:
  - Re-authored card-65 shaded in `data/games/fire-in-the-lake/41-events/065-096.md` from a six-branch die-result ladder to one expression-valued exact `chooseN` plus one shared removal loop.
  - Updated `packages/engine/test/integration/fitl-events-international-forces.test.ts` to assert the compact shaded authoring shape directly while preserving the existing shared stochastic normalization and unshaded legality coverage.
  - Corrected the ticket assumptions to reflect that shared stochastic helpers and unshaded legality propagation were already delivered by earlier engine tickets.
- Deviations from original plan:
  - No unshaded data rewrite was made because the current authored flow already matches the stronger architecture: downstream legality determines source-option legality without duplicating constraints in the source query.
  - No engine/compiler/test-helper work was needed; the remaining issue was stale FITL card data, not runtime architecture.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings only)
  - `pnpm run check:ticket-deps`
