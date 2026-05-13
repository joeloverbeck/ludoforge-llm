# 168ENGHOTPATH-007: Resolve Phase 1 token-state-index measured-gate miss

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — token-state-index hot-path investigation and follow-up optimization
**Deps**: `archive/tickets/168ENGHOTPATH-002.md`

## Problem

`archive/tickets/168ENGHOTPATH-002.md` landed the run-local
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
  by `archive/tickets/168ENGHOTPATH-002.md`
- Phase 2 compiled query/filter plans (`archive/tickets/168ENGHOTPATH-003.md`) unless
  the measured resolution proves the residual token-index gate is actually
  sibling-owned there
- Phase 3 Zobrist digest cache (`archive/tickets/168ENGHOTPATH-004.md`)
- Phase 4 bytecode input row cache (`archive/tickets/168ENGHOTPATH-005.md`)

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

## Outcome (2026-05-13)

Phase 1b landed a measured token-state-index hot-path fix instead of rewriting
the Spec 168 target. The canonical one-card probe now records
`tokenStateIndex:build + tokenStateIndex:refreshCachedEntries = 57.09 ms`
against the Phase 0 baseline `156.26 ms`, a `99.17 ms` (`63.46%`) drop. The
Phase 1 `>= 50.00 ms` gate is green.

### What Landed

1. Added `findTokenStateIndexEntry(...)` in
   `packages/engine/src/kernel/token-state-index.ts` for direct single-token
   occurrence lookup with the same entry shape as the full index.
2. Updated token write effects in `packages/engine/src/kernel/effects-token.ts`
   to use the direct lookup in tracked mutable write scopes, while preserving
   the cache-aware full-index path for untracked read scopes.
3. Threaded `GameDefRuntime.tokenStateIndexCache` through runtime-aware eval
   resources in `apply-move.ts`, `legal-moves.ts`, `microturn/apply.ts`,
   `microturn/drive.ts`, and `terminal.ts`.
4. Extended `eval-runtime-resources-contract.ts` so `tokenStateIndexCache` is a
   valid top-level eval runtime resource key.
5. Added focused witnesses for direct lookup equivalence and eval-resource
   contract acceptance. Adjusted the persistent-cache equivalence fixture to
   clear cache entries warmed by fixture collection before measuring explicit
   first-read behavior.
6. Added `reports/turnperf-005-spec-168-phase-1b.md` with the decisive metric,
   counters, root-cause profile summary, and verification record.

The profile root cause was that single-token write-effect occurrence lookups
were reaching `getTokenStateIndexEntry(...)` and paying for full index builds.
An attempted cache-threading activation exposed a stale-draft-hash aliasing
witness in tracked write scopes, so the retained solution deliberately avoids
persistent state-hash reads there.

### Generated Fallout

No schema artifacts, goldens, or `GameDef` outputs changed. The ignored perf
artifact at `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`
was regenerated for measurement only; durable values were transcribed into the
report above.

### Invariant Proof Matrix

| Invariant | Witness |
|---|---|
| Direct lookup is byte-identical to canonical full-index semantics for the same token id, including duplicate occurrences. | `token-state-index-incremental.test.ts` direct lookup witness |
| Persistent token-state-index cache hit/miss equivalence and run-local isolation remain intact. | `persistent-token-state-index-equivalence.test.ts` |
| Runtime resource validation remains strict while permitting the Spec 168 cache. | `eval-runtime-resources-contract.test.ts` |
| Tracked mutable write scopes do not consult the persistent state-hash cache with stale draft hashes. | Implementation branch: tracked scopes use `findTokenStateIndexEntry(...)`; untracked scopes use `getTokenStateIndexEntry(...)` |
| Canonical Phase 1 measured gate is green. | `reports/turnperf-005-spec-168-phase-1b.md` |

### Materiality Ledger

| Field | Value |
|---|---:|
| Phase 0 combined owned bucket | `156.26 ms` |
| Phase 1 red combined owned bucket | `155.00 ms` |
| Phase 1b combined owned bucket | `57.09 ms` |
| Required drop | `>= 50.00 ms` |
| Actual drop from Phase 0 | `99.17 ms` |
| Percent drop from Phase 0 | `63.46%` |
| Phase 0 `tokenStateIndexBuildCount` | `2903` |
| Phase 1b `tokenStateIndexBuildCount` | `1711` |
| Persistent hits / misses / writes | `3 / 0 / 66` |
| Terminal status allowed | yes |

### Source-Size Ledger

| File | Before | After | Note |
|---|---:|---:|---|
| `packages/engine/src/kernel/effects-token.ts` | `1186` | `1193` | Preexisting over cap; active growth is the minimal branch from full-index lookup to direct lookup in three token write effects. Extracting this file would widen the ticket beyond the measured hot-path fix. |
| `packages/engine/src/kernel/token-state-index.ts` | `466` | `484` | Under cap; direct lookup helper kept beside canonical index entry construction to preserve one semantics source. |
| `packages/engine/src/kernel/eval-runtime-resources-contract.ts` | `83` | `88` | Under cap. |
| `packages/engine/src/kernel/apply-move.ts` | `2140` | `2150` | Preexisting over cap; active growth is cache-resource threading at existing runtime boundaries only. |
| `packages/engine/src/kernel/legal-moves.ts` | `1649` | `1651` | Preexisting over cap; active growth is one runtime-resource threading site. |
| `packages/engine/src/kernel/microturn/apply.ts` | `789` | `791` | Near cap; active growth is one runtime-resource threading site. |
| `packages/engine/src/kernel/microturn/drive.ts` | `765` | `767` | Near cap; active growth is one runtime-resource threading site. |
| `packages/engine/src/kernel/terminal.ts` | `245` | `247` | Under cap. |

No successor extraction ticket was created because the over-cap files were
already over cap and the active changes are narrow runtime-threading or
call-site substitutions owned by this measured-gate fix.

### Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | Passed, 12 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/persistent-token-state-index-equivalence.test.js` | Passed, 4 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/unit/eval-runtime-resources-contract.test.js` | Passed, 6 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` | Passed; Phase 1b gate green |
| `pnpm turbo test` | Passed via Turbo cache replay, 5 tasks; classified as cache-hit supplemental because the focused direct lanes above prove the owned changed surfaces |
| `pnpm run check:ticket-deps` | Passed for 6 active tickets and 2316 archived tickets |

Late edits after the final compiled-output proof were limited to this ticket
closeout and `reports/turnperf-005-spec-168-phase-1b.md`; the ticket graph
check passed after those edits.
