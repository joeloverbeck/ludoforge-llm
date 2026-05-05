# 155PERGAMCOM-005: Resolve residual FITL lane startup budget miss

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Possible — test runner, production-spec helper, or measurement contract depending on diagnosis
**Deps**: `archive/tickets/155PERGAMCOM-004.md`

## Problem

Spec 155 expected the persistent GameDef cache to reduce cumulative startup overhead across `fitl-events-shard-{a,b,c}` plus `fitl-rules` from the historical ~5.5 min baseline to under 30 s. Ticket 004 delivered the measurement script and proved that the live no-test startup seam remains red:

```json
{
  "fileCount": 192,
  "coldCumulativeMs": 1632333,
  "hotCumulativeMs": 1597210,
  "speedupRatio": 1.0219902204469042,
  "hotMeetsBudget": false,
  "budgetMs": 30000
}
```

The first-cause classification from ticket 004 shows the original budget model was incomplete:

1. Persistent cache hits are active but only reduced the direct `compileProductionSpec()` helper seam from `1756 ms` to `1380 ms` in a focused same-process probe (`1.27x`).
2. Representative no-test child startup stayed multi-second even when hot: `fitl-events-1965-us` `2112 ms -> 1850 ms`; `fitl-events-1968-vc` `6103 ms -> 5808 ms`.
3. Static inventory found 192 lane files, 150 mentioning production compile helpers, but only 25 with obvious top-level production fixture/compile calls. The `node --test --test-name-pattern "^$"` witness skips many compile calls inside test bodies and still pays Node/module/test registration cost per file.

This ticket owns the residual architecture decision for the persistent-hot production-spec helper path. If that bounded fix still leaves the warmed-cache startup budget red, this ticket records the replacement proof surface and hands runner/process-topology ownership to a successor.

## Assumption Reassessment (2026-05-05)

1. Ticket 004 proved the manual measurement script runs end-to-end and records a red advisory budget result.
2. The residual miss is not explained by an inactive cache file: `packages/engine/dist/.cache/` contained a non-empty `fire-in-the-lake.*.v1.gamedef.json` artifact after the run.
3. The original no-test startup witness is not equivalent to "compileProductionSpec cost for every file"; many live tests only call `compileProductionSpec()` inside skipped test bodies.

## Architecture Check

1. This ticket separates residual budget ownership from ticket 004's measurement artifact, avoiding a false green closeout under FOUNDATIONS F15/F16.
2. Any implementation must preserve the generic GameSpecDoc -> GameDef boundary; no FITL-specific engine branches or per-game cache contracts.
3. No compatibility aliases or fallback cache paths should be introduced. If the proof surface changes, update the spec rather than retaining parallel stale gates.

## What to Change

### 1. Residual diagnosis

Measure the real residual owners behind the red startup budget. At minimum separate:

- persistent cache hit source/fingerprint, parse/validation/load cost
- Node process startup and module graph registration cost
- skipped-body versus top-level production fixture behavior under `--test-name-pattern "^$"`
- full lane behavior with warmed cache, if the no-test witness is proven stale

### 2. Implementation or respec

If a bounded architecture fix exists, implement it and prove the revised budget. If the no-test startup witness is the wrong proof surface, update Spec 155 and the acceptance commands with a replacement FOUNDATIONS-aligned measurement.

## Files to Touch

- `specs/155-persistent-gamedef-compile-cache.md` (modify)
- `tickets/155PERGAMCOM-005.md` (modify)
- `packages/engine/src/cnl/load-gamespec-source.ts` (modify)
- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/test/helpers/gamedef-cache.ts` (modify)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify)
- `packages/engine/test/integration/gamedef-cache-equivalence.test.ts` (modify)
- `reports/155PERGAMCOM-005-residual-diagnosis.md` (new)
- `tickets/155PERGAMCOM-006.md` (new successor if the budget remains red)
- `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` (modify only if the manual witness remains the right surface)
- `packages/engine/scripts/run-tests.mjs` (modify only if runner/process topology is the selected fix)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify only if cache-hit parse/validation cost is the selected fix)

## Out of Scope

- Reopening ticket 004's measurement-script delivery.
- Replacing the persistent GameDef cache equivalence or invalidation tests from ticket 003.
- Game-specific engine shortcuts.
- Blocking CI on an environment-sensitive threshold before the proof surface is stable.

## Acceptance Criteria

### Tests That Must Pass

1. A focused diagnostic command records the residual owner split and is transcribed into this ticket or a checked-in report.
2. Either the revised measurement is green against a user-approved budget, or Spec 155 is updated with an explicit red phase decision and successor plan.
3. Existing relevant suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. The final proof surface must measure the same seam the spec claims, not a cheaper or stale surrogate.
2. Any retained budget target must be informational unless it is stable enough to become a blocking CI gate.

## Test Plan

### New/Modified Tests

To be determined by the selected residual owner. Prefer extending the manual measurement script or adding a small focused diagnostic script before changing shared runtime code.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` or the replacement/lower-bound measurement command recorded during this ticket
3. `pnpm run check:ticket-deps`

## Outcome (2026-05-05)

Landed the bounded persistent-hot helper fix:

1. Added `loadGameSpecBundleSourcesFromEntrypoint()` so the production helper can derive source order and `sourceFingerprint` without composing the full GameSpecDoc.
2. Bumped `GAMEDEF_CACHE_FORMAT_VERSION` from `v1` to `v2` and stored parsed production bundle metadata plus validator diagnostics in persistent cache entries.
3. Updated `compileProductionSpec()` and `parseProductionSpec()` to use v2 cache entries on hot paths before falling back to full composition/compile.
4. Extended `gamedef-cache-equivalence.test.ts` to prove source-only fingerprint/source-order parity and persistent cache activation with parsed metadata.
5. Added `reports/155PERGAMCOM-005-residual-diagnosis.md` and successor `tickets/155PERGAMCOM-006.md`.

Residual diagnosis:

1. Before the v2 change, the persistent-hot helper split was `loadGameSpecBundleFromEntrypoint=1424 ms`, `readGameDefCache=7 ms`, `assertValidatedGameDef=39 ms`, `validateGameSpec=18 ms`, and `runGameSpecStagesFromBundle after parse=265 ms`.
2. After the v2 change, the hot split was `loadGameSpecBundleSourcesFromEntrypoint=388 ms`, `readGameDefCache=82 ms`, `assertValidatedGameDef=54 ms`, `compileProductionSpec persistent-hot=441 ms`, `compileProductionSpec in-process repeat=321 ms`, and `loadGameSpecBundleFromEntrypoint baseline=1422 ms`.
3. Representative warmed-cache no-test samples improved from `10414 ms` to `3947 ms` across three files, a `62.10%` reduction.
4. The 30 s aggregate budget remains red. The fastest post-change no-test sample was `842 ms`; applying that fastest sample to all 192 files gives a lower bound of `161664 ms`, which is `131664 ms` over the `30000 ms` target (`438.88%` over budget).

Materiality ledger:

1. `baseline`: ticket-004 full no-test hot cumulative `1597210 ms`; same-session three-file hot no-test sample `10414 ms`.
2. `decisive final`: three-file hot no-test sample `3947 ms`; 192-file fastest-sample lower bound `161664 ms`.
3. `target`: `30000 ms`.
4. `delta`: sample improvement `-6467 ms`; lower-bound residual `+131664 ms` over target.
5. `percent change`: sample improvement `-62.10%`; lower-bound residual `+438.88%` over target.
6. `verdict`: retained helper improvement is material, but the aggregate budget remains red.
7. `terminal status allowed?`: yes after final verification, because this ticket's corrected contract allows completion with explicit red phase decision plus successor owner.

Boundary corrections applied:

1. Ticket 005 no longer owns single persistent runner / worker-pool topology after the cache-hit helper residual is reduced; that residual moves to `tickets/155PERGAMCOM-006.md`.
2. The replacement budget proof is a lower-bound red proof over representative warmed-cache file timings, not a rerun of the full 192-file cold/hot measurement. The full ticket-004 measurement remains the historical red corpus evidence; the lower-bound proof is sufficient to show the 30 s per-file process budget cannot be green after the v2 helper change.

Source file size ledger:

1. `packages/engine/test/helpers/production-spec-helpers.ts` started at 383 lines and ended at 444 lines, above the 400-line guideline but below the 800-line maximum.
2. Extraction was considered, but splitting the production helper now would widen this measurement ticket into a broader helper-layout refactor.
3. Deferral rationale: the active change is bounded to the production cache-hit seam, and the successor owns runner topology rather than helper layout.
4. Residual owner: none in this series unless a later helper refactor ticket is opened.

Expected generated fallout: compiled `dist/` only; no schema artifacts or goldens.

Runtime surface breadth: test/helper and measurement-report surface only; no shared engine/kernel runtime behavior changed.

Final verification:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/gamedef-cache-equivalence.test.js dist/test/integration/gamedef-cache-invalidation.test.js`
3. `pnpm run check:ticket-deps`
4. `pnpm -F @ludoforge/engine cache:gamedef:warm`
5. bounded helper timing probe and three-file representative timing probe recorded in `reports/155PERGAMCOM-005-residual-diagnosis.md`
6. `pnpm -F @ludoforge/engine lint`

Post-proof edit validity: after the final code proof lanes, the only edits were metric transcription, terminal status, and proof-ledger text. They did not change code, command semantics, thresholds, dependency ownership, scope, or acceptance boundaries; no code proof was invalidated. `pnpm run check:ticket-deps` was rerun after the terminal status/proof-ledger edits.

Post-review correction: before archival, Spec 155's cache API and compression prose were updated to reflect the landed v2 cache entry shape (`parsed` metadata plus validator diagnostics) and the observed 17.9 MB FITL cache entry size. This was documentation/spec truthing only; no code proof was invalidated.
