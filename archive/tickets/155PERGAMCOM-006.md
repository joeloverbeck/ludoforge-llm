# 155PERGAMCOM-006: Resolve residual FITL lane process startup topology

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Possible — test runner/process topology only
**Deps**: `archive/tickets/155PERGAMCOM-005.md`

## Problem

Ticket 005 reduced the persistent-hot production-spec helper path, but the Spec 155 startup budget remains red on the current per-file `node --test` process topology. The fastest representative post-change no-test startup sample was still `842 ms`; with 192 files, even that optimistic lower bound is `161664 ms`, above the original `30000 ms` aggregate budget.

The remaining repeated work is runner/process topology and module/test registration. This successor owns deciding whether a persistent runner, worker pool, batched lane mode, or an explicit replacement budget is the right FOUNDATIONS-aligned residual proof surface.

## Assumption Reassessment (2026-05-05)

1. `archive/tickets/155PERGAMCOM-005.md` owns and lands the v2 persistent cache-hit helper improvement: cache entries include parsed bundle metadata, and source fingerprints can be derived without composing the full GameSpecDoc.
2. The 30 s target is still red after that improvement. The decisive lower-bound proof is recorded in `reports/155PERGAMCOM-005-residual-diagnosis.md`.
3. This ticket does not own further GameDef cache content, equivalence, invalidation, or source-fingerprint behavior; those remain closed under tickets 001, 003, and 005.

## Architecture Check

1. The residual owner is process/module topology, so the next fix should start at `packages/engine/scripts/run-tests.mjs` or a new runner helper rather than adding FITL-specific engine branches.
2. Any persistent runner or batching change must preserve the same Node test assertions, class reporter output, lane membership from `test-lane-manifest.mjs`, and per-lane timeout/diagnostic semantics.
3. No backwards-compatibility runner aliases or parallel stale lanes should remain. If the final proof surface changes, update Spec 155 rather than keeping the old 30 s budget as a zombie target.

## What to Change

### 1. Runner topology diagnosis

Measure the residual cost under the current per-file runner and at least one persistent-process alternative. Separate:

- one-time Node process startup
- test module import/registration
- production cache-hit helper cost inside the persistent process
- reporter/progress overhead
- timeout and failure-isolation behavior

### 2. Implementation or respec

If a bounded runner/process topology fix exists, implement it and prove the revised warmed-cache budget. If process isolation is required for correctness, timeout isolation, reporter accuracy, or debugging ergonomics, update Spec 155 with the replacement budget/proof surface and close the residual as explicitly out of scope for this cache series.

## Files to Touch

- `specs/155-persistent-gamedef-compile-cache.md` (modify)
- `tickets/155PERGAMCOM-006.md` (modify)
- `packages/engine/scripts/run-tests.mjs` (modify if runner topology changes)
- `packages/engine/scripts/test-class-reporter.mjs` (modify only if reporter semantics require it)
- `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` (modify if the measurement surface changes)

## Out of Scope

- Changing persistent GameDef cache equivalence, invalidation, or cache-entry content.
- FITL-specific engine shortcuts.
- Removing per-file process isolation without preserving timeout/failure diagnostics.
- Blocking CI on an environment-sensitive threshold before the replacement proof surface is stable.

## Acceptance Criteria

### Tests That Must Pass

1. A focused diagnostic command records the current runner-topology residual and the selected replacement topology or replacement budget.
2. If runner topology changes, existing relevant runner tests or new focused tests prove lane membership, timeout behavior, and reporter output remain correct.
3. Existing relevant suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. Lane membership remains sourced from `packages/engine/scripts/test-lane-manifest.mjs`.
2. The final proof surface measures the same seam Spec 155 claims.
3. Any retained budget is informational unless it is stable enough to become a blocking CI gate.

## Test Plan

### New/Modified Tests

To be determined by the selected topology. Prefer runner-plan unit tests before any expensive lane measurement.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. focused runner topology diagnostic command selected during implementation
3. `pnpm run check:ticket-deps`

## Outcome (2026-05-05)

This ticket closed the Spec 155 residual as a runner-topology diagnosis and respec, not as a retained runner rewrite.

What changed:

1. `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` now reports a bounded topology diagnostic over the warmed compiled `dist/` seam instead of rerunning the stale full cold/hot per-file cache budget by default.
2. The diagnostic compares a representative current per-file supervisor sample against a batched `node --test` supervisor using the shared class reporter, `--test-concurrency=1`, and the same no-test skip pattern.
3. `--full-batched` remains an explicit exploratory option for aggregate checks, but it is not the default proof lane because the reporter-inclusive aggregate path was slow and silent in this environment.
4. No `packages/engine/scripts/run-tests.mjs` topology change was retained. The attempted batched FITL lane route was rejected because the reporter-inclusive representative diagnostic showed only a `7.14%` reduction (`4232 ms` per-file representative vs `3930 ms` batched), and the full reporter-inclusive aggregate run eventually returned `491477 ms`, far above the historical `30000 ms` budget.

Residual diagnosis:

1. Prior ticket-005 evidence remains the decisive red lower bound for the old per-file process target: fastest representative no-test sample `842 ms * 192 files = 161664 ms`, above the historical `30000 ms` target.
2. A no-reporter exploratory batched aggregate probe completed in `83814 ms` for all `192` files, which is lower than the ticket-005 fastest-sample lower bound but still red against `30000 ms` and not equivalent to the real runner reporter surface.
3. The full reporter-inclusive `--full-batched` diagnostic completed in `491477 ms`, so the reporter-preserving aggregate alternative is materially red and not suitable as a cache-series replacement budget.
4. The reporter-inclusive bounded diagnostic after this ticket reported:

```json
{
  "fileCount": 192,
  "currentPerFileRepresentativeMs": 4232,
  "batchedRepresentativeMs": 3930,
  "batchedRepresentativeReductionPct": 7.14,
  "fastestRepresentativeLowerBoundMs": 209280,
  "budgetMs": 30000
}
```

Materiality ledger:

1. `baseline`: ticket-005 fastest-sample lower bound `161664 ms`; same-session reporter-inclusive representative per-file sample `4232 ms`.
2. `decisive final`: reporter-inclusive representative batched sample `3930 ms`; aggregate reporter-inclusive `--full-batched` probe `491477 ms`.
3. `target`: historical `30000 ms` informational budget.
4. `delta`: representative `-302 ms`.
5. `percent change`: representative `-7.14%`.
6. `verdict`: not material; no runner topology change retained.
7. `terminal status allowed?`: yes, because this ticket explicitly owns deciding whether to implement topology or replace the proof surface. The decision is to retire the old 30 s gate for this cache series and leave FITL runner process topology unchanged.

Boundary corrections applied:

1. The Spec 155 30 s startup budget is no longer treated as an active blocking or successor-owning gate. It remains historical red evidence showing why the cache series cannot make per-file startup cheap enough.
2. Runner topology is not a bounded cache-series fix while preserving reporter and timeout diagnostics. Any future runner redesign should be specified as its own runner architecture project, not as residual GameDef cache work.

Source file size ledger:

1. `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` grew from `89` lines to a still-small diagnostic helper.
2. `packages/engine/scripts/run-tests.mjs` was inspected and temporarily probed, but no retained diff remains there.

Expected generated fallout: compiled `dist/` only; no schema artifacts or goldens.

Runtime surface breadth: script/profile-only; no shared engine/kernel runtime behavior changed.

Final verification:

1. `node --check packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine cache:gamedef:warm`
4. `node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs`
5. `pnpm run check:ticket-deps`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm run check:ticket-deps` after the final status/spec transcription

Post-proof edit validity: final edits after the decisive diagnostic are ticket/spec transcription only and do not change code semantics, command semantics, thresholds, or dependency ownership. The dependency check was rerun after status/spec edits.
