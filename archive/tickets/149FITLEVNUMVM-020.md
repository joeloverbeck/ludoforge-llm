# 149FITLEVNUMVM-020: Phase 4B preview state and token-index lifetime

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — preview-drive state/index lifetime and token-state-index copy behavior
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`

## Problem

Ticket 016's VM-enabled one-card CPU profile classified token-index copy/lifetime work as a remaining non-policy-VM cost bucket. `copyCachedTokenStateIndex` plus token-state-index build/attach/refresh accounted for about 4.8% of CPU samples, and adjacent profile buckets still show preview application and state churn dominate the wall clock after the policy VM is enabled.

This is not a bytecode problem. It is a state/index lifetime problem in the preview-drive path.

## What to Change

1. Reprofile or inspect the Phase 4B one-card path and identify the exact preview state/index copy sites.
2. Implement the narrowest generic lifetime improvement, such as:
   - copy-on-write token-state-index snapshots;
   - scoped mutable preview state with undo log;
   - avoiding index copies when the preview branch does not mutate indexed fields;
   - another generic design proven by the profile.
3. Preserve Foundation 11:
   - caller-visible `GameState` remains immutable;
   - any mutation is scoped to one synchronous preview execution;
   - no shared mutable descendants leak outside the preview scope.
4. Preserve Foundation 8:
   - deterministic replay identity;
   - canonical state hash semantics;
   - identical legal/action publication behavior.
5. Add regression tests that prove input state is not mutated and preview results remain equivalent.
6. Record baseline/current profile evidence in this ticket's Outcome.

## Files to Touch

- Preview-drive modules under `packages/engine/src/agents/`
- Token-state-index modules under `packages/engine/src/kernel/`
- Focused tests under `packages/engine/test/unit/` or `packages/engine/test/integration/`
- `archive/tickets/149FITLEVNUMVM-020.md`

## Out of Scope

- Kernel expression/query AOT; ticket 019 owns that.
- Hash/verification strategy; ticket 021 owns that.
- Policy VM default flip and closure-tree deletion; ticket 016 owns that.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Focused immutability and equivalence tests pass.
2. The one-card profile shows a measured reduction in token-index copy/lifetime samples or wall time, or the Outcome records why this bucket is no longer the active owner.
3. No caller-visible mutable state leaks from the preview path.
4. No game-specific fast paths are introduced.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused immutability/equivalence tests for preview state/index behavior.
3. `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-preview-index`.

## Outcome

Completed: 2026-05-02

Implemented a generic copy-on-write lifetime split for the draft token-state index used by policy preview drives:

- `MutableTokenStateIndex.attachPreviewState(state)` attaches the live draft index to private intermediate preview states without immediately copying the whole `Map`.
- The next `applyZoneDelta` detaches with one copy-on-write `Map` clone before mutating, preserving the previous preview state's cache for kernel copy/read paths.
- `attachAsCanonical(state)` still stores a stable copied snapshot for states that can leave the private preview lifetime.
- `policy-preview.ts` and `microturn/drive.ts` now use private attaches for intermediate preview iterations and canonical snapshots at exit.
- `profile-fitl-preview-drive.mjs` now reports `draftTokenStateIndexSnapshotCount` and `draftTokenStateIndexCowCopyCount` so this lifetime bucket is measurable directly.

Regression proof:

- Added `token-state-index-incremental.test.ts` coverage proving private preview cache reads remain correct, returned/canonical preview snapshots survive later draft mutation, and copy-on-write detaches protect previously attached private states.
- `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/resolve-ref-memoised.test.js` — PASS.
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — PASS.

Measured evidence:

- Baseline same-seam profile before this change: `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-preview-index-baseline` — overall Phase 4 gate still RED: `elapsedMs=6761.89`, per-card `elapsedMs=6761.63`, threshold `<=250`; legacy `attachAsCanonical` behavior performed one `Map` copy per `draftTokenStateIndexAttachCount=682`.
- Current same-seam profile after this change: `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-preview-index-current` — overall Phase 4 gate still RED: `elapsedMs=7074.16`, per-card `elapsedMs=7073.92`, threshold `<=250`; ticket-owned copy work is now `draftTokenStateIndexSnapshotCount=315` plus `draftTokenStateIndexCowCopyCount=120`, for `435` total `Map` copies instead of `682` legacy copies.

Verdict: the ticket-owned token-index lifetime work landed and reduced preview token-index `Map` copy operations by `247 / 682 = 36.2%` on the one-card VM-on seam. The broader `<=250 ms` Phase 4 budget remains red and is intentionally not closed here; ticket 021 owns preview hashing/canonicalization, ticket 022 owns the final same-seam Phase 4B reprofile, and ticket 016 remains the later default-flip/deletion owner.

Touched-file correction:

- Added `packages/engine/scripts/profile-fitl-preview-drive.mjs` to the touched surface to expose the ticket-owned snapshot/COW counters in the authoritative profile command.
- Included `packages/engine/src/kernel/microturn/drive.ts` because the greedy inner-preview path also attaches draft token-state indexes.
- Placed the focused regression in `packages/engine/test/kernel/token-state-index-incremental.test.ts`, the existing token-state-index invariant suite, rather than forcing a new `unit/` or `integration/` file.

No schema artifacts, generated game fixtures, goldens, or compiled JSON changed.
