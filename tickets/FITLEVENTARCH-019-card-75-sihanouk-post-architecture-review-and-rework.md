# FITLEVENTARCH-019: Card 75 Sihanouk Post-Architecture Review and Rework

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None expected — review ticket; may trigger follow-up tickets if architecture still falls short
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`, `archive/tickets/FITLEVENTARCH-018-card-75-sihanouk-exact-reencoding-on-sequence-zone-context.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts`, `reports/fire-in-the-lake-rules-section-3.md`, `reports/fire-in-the-lake-rules-section-5.md`

## Problem

Card 75 is the first known FITL event that requires both staged deferred grants and exact origin-constrained follow-up movement tied to prior selected spaces. Even after the generic engine improvement and the first exact re-encoding land, the resulting implementation needs a dedicated architecture review to verify that it is the right long-term pattern rather than merely the first passing version.

## Assumption Reassessment (2026-03-12)

1. The current card 75 placeholder proves there was previously no exact authored pattern for this combination of free-operation sequencing and origin restriction.
2. The recommended fix introduces a new generic engine contract specifically to avoid FITL-only hacks, so the first production use of that contract should be audited after implementation.
3. The most likely risk after implementation is not visible behavior mismatch alone, but accidental over-complexity in FITL data or unnecessary engine surface area that could be simplified once exercised by a real production card.
4. Corrected scope: this ticket is not a duplicate implementation ticket. It is an explicit post-change review gate that may rework the card data and, if necessary, spin out smaller follow-up architecture tickets.

## Architecture Check

1. A dedicated review ticket is cleaner than silently accepting the first passing implementation for a new engine contract.
2. The review protects the desired boundary: FITL should consume a generic capability in authored data, not force the engine to accumulate hidden game-specific assumptions.
3. No backwards-compatibility fallback should be preserved just because the first implementation shipped. If the architecture review finds a cleaner canonical pattern, rework to that pattern directly.

## What to Change

### 1. Audit the final card-75 data shape

Review the implemented card for:
- duplicated structure that should be abstracted into existing/generic FITL data helpers
- accidental coupling to internal engine details that authored data should not need to know
- unnecessary branches or redundant guards introduced during the first pass

### 2. Rework card-75 if the first implementation is mechanically correct but architecturally suboptimal

If review findings show a cleaner equivalent expression of the same behavior, rework the card immediately rather than leaving technical debt in active production data.

### 3. Open follow-up tickets only when the review finds a real remaining engine or authoring gap

Do not silently accept residual awkwardness. If the engine surface still feels wrong after real use, create targeted follow-up tickets with the same contract quality as this set.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify if review recommends a cleaner final encoding)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (modify if review changes the canonical authored pattern)
- `tickets/FITLEVENTARCH-019-card-75-sihanouk-post-architecture-review-and-rework.md` (modify only if assumptions must be corrected before work starts)

## Out of Scope

- Re-litigating the generic engine capability if card 75 proves it is clean and sufficient.
- Unrelated FITL event cleanup not motivated by the card-75 review.

## Acceptance Criteria

### Tests That Must Pass

1. Card 75 remains behaviorally exact after the review.
2. If the review finds a cleaner authored pattern, the implementation is reworked to that pattern rather than merely documented.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The canonical card-75 implementation remains data-authored and game-specific only in FITL data files.
2. Any review-driven rework reduces complexity or clarifies the reusable pattern; it does not add new FITL-specific runtime branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — keep the end-to-end assertions aligned with the final reviewed encoding.
2. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — keep compile-shape coverage aligned if the review simplifies or restructures the encoding.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
