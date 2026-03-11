# FITLEVECARENC-025: Card-65 International Forces — remove engine workarounds

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None in this ticket — relies on prior engine/compiler fixes
**Deps**: tickets/ENGINEARCH-165-canonical-rollrandom-chooseN-cardinality-contract.md, tickets/ENGINEARCH-166-generic-stochastic-decision-completion-and-normalization.md, tickets/ENGINEARCH-167-legality-backed-choice-domain-expressiveness.md

## Problem

Card-65 is currently rules-correct but not canonically encoded. The shaded side uses a six-branch data workaround for die outcomes, and the unshaded side cannot express the tightest possible source domain for out-of-play US Bases. Once the engine/compiler gaps are fixed, the card should be re-authored to use the compact declarative form the rules actually call for.

## Assumption Reassessment (2026-03-11)

1. `data/games/fire-in-the-lake/41-events/065-096.md` currently encodes card-65 shaded with explicit branches for exact removal counts instead of one dynamic exact `chooseN`.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` currently contains a bespoke `withAllStochasticRemovalChoices()` helper because generic stochastic decision normalization is missing.
3. The current unshaded implementation is rules-correct but broader than ideal at the source-selection step because dependent legality-backed source filtering is not yet available.

## Architecture Check

1. This ticket keeps FITL-specific behavior in GameSpec data while depending on generic engine/compiler fixes delivered elsewhere.
2. The goal is to delete workaround structure, not to add any new game-specific runtime logic.
3. No backwards-compatibility preservation is needed for the workaround encoding once the canonical path exists.

## What to Change

### 1. Re-encode shaded in the natural compact form

Replace the branch ladder with the declarative sequence:

1. roll d6
2. compute `min(roll, US map pieces available)`
3. exact `chooseN` by the US
4. move selected US pieces to `out-of-play-US:none`

### 2. Tighten unshaded source selection if the generic source-domain fix lands

If `ENGINEARCH-167` lands as designed, update the unshaded source domain so out-of-play US Bases are only selectable when they have at least one legal destination. If that dependency lands in a different but equivalent shape, use the canonical replacement.

### 3. Remove bespoke stochastic test scaffolding

Delete the card-specific stochastic helper and rely on shared completion/normalization helpers in integration coverage.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)

## Out of Scope

- Engine/kernel/compiler changes
- Updating stale archival/spec prose unless separately requested
- Reworking unrelated FITL event cards

## Acceptance Criteria

### Tests That Must Pass

1. Card-65 shaded no longer uses explicit per-die-result branches in event data.
2. Card-65 integration coverage passes using shared stochastic completion helpers only.
3. If the source-domain expressiveness fix lands, unshaded source options exclude undeliverable out-of-play US Bases directly at the source-choice step.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-65 remains fully rules-correct for both sides.
2. FITL card data stays declarative and game-specific; engine code remains untouched in this ticket.
3. The final encoding is simpler than the workaround it replaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — verify the canonical shaded encoding and removal of bespoke stochastic helper logic.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — if applicable, verify tighter unshaded source-option filtering for US Bases with no legal destinations.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
