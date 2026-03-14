# 62CONPIESOU-007: Edge-case coverage for prioritized `chooseN` tier legality

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — tests only unless coverage exposes a bug
**Deps**: [archive/tickets/62CONPIESOU-005.md](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/62CONPIESOU-005.md), [archive/specs/62b-incremental-choice-protocol.md](/home/joeloverbeck/projects/ludoforge-llm/archive/specs/62b-incremental-choice-protocol.md), [specs/62-conditional-piece-sourcing.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-conditional-piece-sourcing.md)

## Status Note

This ticket originally assumed the prioritized `chooseN` work still needed to be covered primarily inside the large `legal-choices*.test.ts` files.

That assumption is no longer correct. The current architecture already separates responsibilities cleanly:

- `packages/engine/src/kernel/prioritized-tier-legality.ts` owns pure tier-admissibility logic
- `packages/engine/src/kernel/advance-choose-n.ts` owns incremental `chooseN` state transitions
- `packages/engine/src/kernel/effects-choice.ts` enforces apply-time parity for full-array submissions
- `packages/engine/test/integration/prioritized-choose-n.test.ts` and FITL integration tests cover end-to-end behavior

This ticket is therefore narrowed to the remaining edge cases that are still under-covered in those canonical test locations.

## Problem

Prioritized `chooseN` already has core coverage for:

- non-qualifier tier ordering
- qualifier-aware independence across tiers
- incremental add/remove recomputation
- apply-time rejection of invalid full-array submissions
- generic and FITL integration parity

The remaining risk is edge-case drift around tier progression and qualifier fallback semantics. Those invariants should be locked down in the dedicated prioritized test files, not duplicated into unrelated executor-context tests.

## Assumption Reassessment (2026-03-14)

1. `specs/62-conditional-piece-sourcing.md` is the active Spec 62 file. Confirmed.
2. Spec 62b is archived at `archive/specs/62b-incremental-choice-protocol.md`, not under `specs/`. Confirmed.
3. Prioritized legality is already factored into `prioritized-tier-legality.ts` plus `advance-choose-n.ts`, with apply-time parity in `effects-choice.ts`. Confirmed.
4. Existing prioritized coverage already lives in:
   - `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts`
   - `packages/engine/test/unit/kernel/advance-choose-n.test.ts`
   - `packages/engine/test/unit/effects-choice.test.ts`
   - `packages/engine/test/integration/prioritized-choose-n.test.ts`
   - `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts`
5. `packages/engine/test/unit/kernel/legal-choices-executor.test.ts` is not the canonical location for prioritized move-validation parity. The ticket must not force coverage there without architectural need.

## Architecture Check

The current architecture is preferable to the original ticket plan.

Why:

1. It keeps prioritized legality in a dedicated pure helper instead of burying the logic inside `legal-choices.ts` tests.
2. It tests the incremental protocol where it actually lives (`advanceChooseN`) rather than simulating it indirectly through broader legality surfaces.
3. It keeps apply-time parity in `effects-choice.test.ts`, which is the correct boundary for validating finalized full-array submissions.

This ticket should preserve that structure. Do not migrate prioritized coverage into `legal-choices.test.ts` or `legal-choices-executor.test.ts` unless a genuine gap is only reachable there.

## What to Change

Add or strengthen edge-case tests in the existing prioritized test files.

### 1. Helper-level tier progression edge cases

In `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts`:

- 3-tier non-qualifier progression:
  - tier 3 remains inadmissible while tier 2 still has remaining values, even after tier 1 is exhausted
- single-tier passthrough:
  - prioritized with one tier behaves like ordinary `chooseN` domain admissibility
- missing qualifier property semantics:
  - tokens/items without the authored `qualifierKey` are treated as the shared null/undefined qualifier bucket, not as per-item unique qualifiers

### 2. Incremental protocol edge cases

In `packages/engine/test/unit/kernel/advance-choose-n.test.ts`:

- `min < available tier-1 count`:
  - selection can confirm early once `min` is satisfied
  - lower-tier options remain illegal until the active higher-priority tier for that qualifier is exhausted
- 3-tier incremental recomputation:
  - exhausting tier 1 unlocks tier 2, but not tier 3 while tier 2 still has remaining values

### 3. Apply-time parity only if still uncovered

Add apply-time tests in `packages/engine/test/unit/effects-choice.test.ts` only if one of the new edge cases is not already guaranteed by helper plus incremental coverage.

Do not add coverage to `legal-choices-executor.test.ts` unless a real executor-boundary behavior is discovered.

## Files to Touch

- `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts`
- `packages/engine/test/unit/kernel/advance-choose-n.test.ts`
- `packages/engine/test/unit/effects-choice.test.ts` only if needed

## Out of Scope

- Moving prioritized coverage into `legal-choices.test.ts`
- Moving prioritized coverage into `legal-choices-executor.test.ts`
- Reworking engine architecture that is already cleanly separated
- `evalQuery` coverage from ticket 006
- broader integration additions already covered elsewhere unless a failing gap is discovered
- production card rewrites

## Acceptance Criteria

1. The ticket reflects the current architecture and references the correct spec paths.
2. Dedicated prioritized tests cover the remaining helper-level and incremental edge cases listed above.
3. Discovery-time incremental legality and apply-time final-array validation remain in sync.
4. No production source file changes are made unless a newly added test exposes a real bug.
5. `pnpm -F @ludoforge/engine test` passes.
6. `pnpm turbo test` passes.

## Invariants

1. Test fixtures remain synthetic unless an existing FITL integration test is the natural place for parity coverage.
2. The engine remains game-agnostic; no FITL-specific branches are introduced into shared kernel code.
3. Missing qualifier properties follow one documented semantic in tests and ticket language: shared null/undefined qualifier bucket.
4. Canonical coverage stays aligned with the real architectural seams:
   - pure helper
   - incremental protocol
   - apply-time parity
   - integration parity

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts` — helper edge cases
2. `packages/engine/test/unit/kernel/advance-choose-n.test.ts` — incremental edge cases
3. `packages/engine/test/unit/effects-choice.test.ts` — only if an uncovered parity edge case remains

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-14
- Actual changes:
  - rewrote the ticket to match the current prioritized `chooseN` architecture and correct spec paths
  - added helper-level tests for three-tier progression, single-tier passthrough, and missing-qualifier null-bucket semantics
  - added incremental protocol tests for early confirm without unlocking lower tiers and for three-tier stepwise unlocking
- Deviations from original plan:
  - no changes were made to `legal-choices.test.ts` or `legal-choices-executor.test.ts` because those are not the canonical architecture boundaries for prioritized legality
  - no production source changes were needed because the newly added coverage passed against the existing implementation
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/prioritized-tier-legality.test.js packages/engine/dist/test/unit/kernel/advance-choose-n.test.js packages/engine/dist/test/integration/prioritized-choose-n.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo test` passed
  - `pnpm turbo lint` passed
