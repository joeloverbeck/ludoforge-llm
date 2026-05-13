# 168ENGHOTPATH-007: Resolve Phase 1 token-state-index measured-gate miss

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — token-state-index hot-path investigation and follow-up optimization
**Deps**: `tickets/168ENGHOTPATH-002.md`

## Problem

`tickets/168ENGHOTPATH-002.md` landed the run-local
`tokenStateIndexCache` substrate and architectural-invariant equivalence test,
but `reports/turnperf-004-spec-168-phase-1.md` shows the Phase 1 measured gate
is still red. The canonical one-card probe recorded:

- `tokenStateIndex:build + tokenStateIndex:refreshCachedEntries = 155.00 ms`
  versus the Phase 0 baseline `156.26 ms`;
- required drop `>= 50.00 ms`, actual drop `1.26 ms`;
- `tokenStateIndexBuildCount` stayed `2903`;
- persistent cache hits / misses / writes were `0 / 0 / 66`.

The live evidence says the state-hash persistent cache is correct but not
activated by the canonical workload. This ticket owns the residual Phase 1
measured-gate resolution without duplicating the substrate already delivered by
`002`.

## Assumption Reassessment (2026-05-13)

1. `GameDefRuntime.tokenStateIndexCache` exists and is run-local, forked by
   `forkGameDefRuntimeForRun(...)` — delivered by `002`.
2. `persistent-token-state-index-equivalence.test.ts` proves cache hit/miss
   equivalence, run-local isolation, LRU behavior, and mutable-refresh snapshot
   detachment — delivered by `002`.
3. The canonical Phase 1 metric remains red because the workload writes
   persistent snapshots but does not read them back by canonical state hash.
4. The attempted initial-draft-snapshot activation was rejected during `002`
   because it reduced builds but worsened the owned bucket; do not repeat it
   without a same-command A/B proof that it improves the owned metric.

## Architecture Check

1. Cleaner than forcing `002` to completion because the live evidence disproves
   the original activation premise while preserving the correct run-local cache
   substrate.
2. Preserves engine agnosticism — any follow-up optimization must remain
   generic kernel/runtime code with no FITL-specific branches.
3. Foundation #11 remains load-bearing: any mutable cache or draft-index
   optimization must stay internal to a synchronous eval/preview scope and
   cannot leak mutable descendants outside the public `applyMove(state) ->
   newState` contract.
4. Foundation #15 requires a real root-cause decision: either land a material
   token-index optimization, rewrite Phase 1 acceptance with measured evidence,
   or update Spec 168 to skip/reorder this phase.

## What to Change

### 1. Profile the Phase 1 activation miss

Use the existing perf fixture and, if needed, a focused CPU profile to identify
why `persistentTokenStateIndexCacheWriteCount > 0` but
`persistentTokenStateIndexCacheHitCount == 0` on the canonical probe. Classify
state-hash reuse, WeakMap zone reuse, draft-index refresh cost, and canonical
preview exit snapshots separately.

### 2. Choose one measured resolution

Choose the smallest evidence-backed resolution:

- a different token-index optimization that materially reduces
  `tokenStateIndex:build + tokenStateIndex:refreshCachedEntries`;
- a ticket/spec correction proving the Phase 1 state-hash cache is not
  actionable on this workload and should be skipped or reordered;
- a narrowed follow-up if the remaining token-index cost is actually owned by
  Phase 2 query/filter work or another sibling.

Use 1-3-1 before changing the explicit Phase 1 acceptance target unless the
live evidence makes the correction purely clerical.

### 3. Update Spec 168 and dependent tickets

If the measured resolution changes the Phase 1 target, phase order, or Phase 5
preconditions, update `specs/168-engine-per-decision-hot-path-optimizations.md`
and dependent tickets in the same turn.

### 4. Per-phase measurement report

Write or amend a Phase 1 follow-up report in `reports/` with the decisive
same-command metric, activation counters, and final recommendation.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify if a retained
  token-index optimization lands)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify only if cache
  ownership changes)
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify only for
  additional diagnostic counters)
- `reports/turnperf-NNN-spec-168-phase-1-*.md` (new or amend)
- `specs/168-engine-per-decision-hot-path-optimizations.md` (modify if phase
  acceptance or ordering changes)

## Out of Scope

- Re-implementing the run-local `tokenStateIndexCache` substrate already landed
  by `tickets/168ENGHOTPATH-002.md`
- Phase 2 compiled query/filter plans (`tickets/168ENGHOTPATH-003.md`) unless
  the measured resolution proves the residual token-index gate is actually
  sibling-owned there
- Phase 3 Zobrist digest cache (`tickets/168ENGHOTPATH-004.md`)
- Phase 4 bytecode input row cache (`tickets/168ENGHOTPATH-005.md`)

## Acceptance Criteria

### Tests That Must Pass

1. A focused token-index or measurement witness proving the selected resolution.
2. `persistent-token-state-index-equivalence.test.ts` remains green if the
   `002` cache substrate is retained.
3. Existing suite: `pnpm turbo test` or a recorded repo-valid substitution if
   the final resolution is evidence-only.

### Invariants

1. Same state must still produce byte-identical token-state-index contents
   regardless of cache or refresh path.
2. Any mutable cache remains run-local or private to the synchronous eval scope;
   no caller-visible mutation or cross-run aliasing.
3. The final Phase 1 verdict is measured on the canonical one-card probe or is
   explicitly rewritten in the active spec/ticket before closeout.

## Test Plan

### New/Modified Tests

1. Focused token-index witness chosen after activation profiling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/persistent-token-state-index-equivalence.test.js`
4. `pnpm turbo test` or recorded substitution
