# FITLEVENTARCH-019: Card 75 Sihanouk Post-Architecture Review and Rework

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — the review uncovered one remaining generic strict-sequence emission gap, and the final fix combines a small engine correction with a reviewed card-75 data rework
**Deps**: `tickets/README.md`, `archive/tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`, `archive/tickets/FITLEVENTARCH-018-card-75-sihanouk-exact-reencoding-on-sequence-zone-context.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts`, `reports/fire-in-the-lake-rules-section-3.md`, `reports/fire-in-the-lake-rules-section-5.md`

## Problem

Card 75 was the first known FITL event that appeared to require both staged follow-up grants and exact origin-constrained movement tied to prior selected spaces. After the exact re-encoding landed, the live implementation moved to a cleaner shape than the intermediate plan: a single canonical free-operation sequence batch plus reusable FITL March-origin restriction authoring on top of the generic `capturedSequenceZones` engine contract.

The remaining problem is no longer "implement card 75". It is to verify that the shipped pattern is the right long-term architecture and to remove any stale ticket/test assumptions that still describe the superseded deferred-grant shape.

## Assumption Reassessment (2026-03-12)

1. The card-75 placeholder assumption is stale. `archive/tickets/FITLEVENTARCH-018-card-75-sihanouk-exact-reencoding-on-sequence-zone-context.md` is completed, and `data/games/fire-in-the-lake/41-events/065-096.md` already contains the exact production encoding.
2. The live shaded implementation does not use the intermediate deferred `afterGrants` follow-up grant shape. It now uses one canonical four-step `freeOperationGrants` batch: `VC Rally -> VC March -> NVA Rally -> NVA March`.
3. The reusable generic engine contract this card depends on is already shipped in `archive/tickets/ENGINEARCH-209-sequence-captured-zone-sets-for-later-grant-evaluation.md`; this ticket should not reopen that engine work unless the review finds a new independent architectural gap.
4. The currently known mismatch is in test assumptions, not live event data: `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` still expects the superseded deferred-grant compile shape rather than the current canonical sequence-batch shape.
5. Corrected scope: verify the current architecture against the live card/macro/test reality, update stale tests/ticket assumptions first, then rework data only if the current production encoding is still demonstrably inferior to a cleaner generic authoring pattern.

## Architecture Check

1. A dedicated review ticket is still cleaner than silently accepting the first passing implementation for a new engine contract, but the review now starts from the shipped canonical sequence-batch design rather than from an implementation gap.
2. The current boundary still looks directionally correct: FITL consumes generic `capturedSequenceZones` support plus reusable FITL macros instead of forcing new FITL-only runtime branches.
3. No backwards-compatibility fallback should be preserved. If review finds a cleaner canonical pattern than the current single-batch sequence design, rework to that pattern directly and update tests to match.

## What to Change

### 1. Audit the shipped card-75 data and macro shape

Review the implemented card and any directly supporting FITL macro surface for:
- duplicated structure that should be abstracted into existing/generic FITL data helpers
- accidental coupling to internal engine details that authored data should not need to know
- unnecessary branches or redundant guards introduced during the first pass
- divergence between the live authored shape and the compile/runtime tests that are supposed to lock it in

### 2. Rework card-75 only if the shipped canonical pattern is architecturally suboptimal

If review findings show a cleaner equivalent expression of the same behavior, rework the card immediately rather than leaving technical debt in active production data. If the current implementation is already the cleanest durable pattern, prefer tightening tests over changing working data.

### 3. Open follow-up tickets only when the review finds a real remaining engine or authoring gap

Do not silently accept residual awkwardness. If the engine surface or reusable FITL authoring surface still feels wrong after real use, create targeted follow-up tickets with the same contract quality as this set.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify if review recommends a cleaner final encoding)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (modify if review changes the canonical authored pattern)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (modify to remove stale compile-shape assumptions and lock in the reviewed canonical structure)
- `tickets/FITLEVENTARCH-019-card-75-sihanouk-post-architecture-review-and-rework.md` (modify first to correct assumptions and scope before work starts)

## Out of Scope

- Re-litigating the generic engine capability if card 75 proves it is clean and sufficient.
- Unrelated FITL event cleanup not motivated by the card-75 review.

## Acceptance Criteria

### Tests That Must Pass

1. Card 75 remains behaviorally exact after the review.
2. Compile/runtime tests describe the shipped canonical structure accurately; no stale assertions remain for the superseded deferred-grant design.
3. If the review finds a cleaner authored pattern, the implementation is reworked to that pattern rather than merely documented.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The canonical card-75 implementation remains data-authored and game-specific only in FITL data files.
2. Any review-driven rework reduces complexity or clarifies the reusable pattern; it does not add new FITL-specific runtime branches.
3. The canonical shaded pattern is whichever reviewed shape is cleanest long-term; stale intermediate test expectations are not architecture.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — keep the end-to-end assertions aligned with the final reviewed encoding and add coverage for any uncovered sequencing invariant exposed by the review.
2. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — replace stale deferred-grant compile-shape assertions with expectations for the reviewed canonical sequence-batch structure.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - Reassessed the shipped card-75 architecture against the live data, macros, and tests, and corrected this ticket before implementation so it no longer described the superseded single-batch compile assumptions as settled fact.
  - Reworked card 75 shaded from one four-step cross-faction batch into two staged faction batches:
    - `VC Rally -> VC March`
    - `afterGrants`-issued `NVA Rally -> NVA March`
  - Added `requireUsableAtIssue` plus `mustChangeGameplayState` to the shaded Rally grants so no-op Rallys do not count as usable event progress.
  - Fixed a generic engine gap in event/effect grant emission: when a `strictInOrder` batch skips an earlier step during issue-time usability gating, later steps in that same batch are now suppressed even if those later steps do not request their own viability probe.
  - Updated compile/runtime regression coverage to lock in the reviewed canonical structure and the newly exposed strict-sequence invariant.
- Deviations from original plan:
  - The review found that the shipped single four-step shaded batch was not the cleanest long-term architecture after all. It handled the happy path, but it interacted badly with the “first faction unusable” case.
  - The final solution is not “ticket-only review with no code changes”. The architecture review uncovered a real generic engine defect, so the final implementation includes both data re-encoding and a shared runtime fix rather than preserving a flawed shape.
  - The original corrected ticket text said prior generic engine work had already fully landed for this review. That was only partially true: the review exposed one more generic strict-sequence emission rule that had not yet been encoded.
- Verification results:
  - `pnpm run check:ticket-deps`
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-sihanouk.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-tutorial-medium.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - Lint completed successfully with pre-existing warnings in unrelated files.
