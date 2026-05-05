# 155PERGAMCOM-005: Resolve residual FITL lane startup budget miss

**Status**: PENDING
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

This ticket owns the residual architecture decision: either make the warmed-cache startup budget meaningful on the real lane seam, or update Spec 155 with a FOUNDATIONS-aligned replacement budget/proof surface.

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

- persistent cache hit parse/validation/load cost
- Node process startup and module graph registration cost
- skipped-body versus top-level production fixture behavior under `--test-name-pattern "^$"`
- full lane behavior with warmed cache, if the no-test witness is proven stale

### 2. Implementation or respec

If a bounded architecture fix exists, implement it and prove the revised budget. If the no-test startup witness is the wrong proof surface, update Spec 155 and the acceptance commands with a replacement FOUNDATIONS-aligned measurement.

## Files to Touch

- `specs/155-persistent-gamedef-compile-cache.md` (modify)
- `tickets/155PERGAMCOM-005.md` (modify)
- `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` (modify if the manual witness remains the right surface)
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
2. Either the revised measurement is green against a user-approved budget, or Spec 155 is updated with an explicit red/blocked phase decision and successor plan.
3. Existing relevant suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. The final proof surface must measure the same seam the spec claims, not a cheaper or stale surrogate.
2. Any retained budget target must be informational unless it is stable enough to become a blocking CI gate.

## Test Plan

### New/Modified Tests

To be determined by the selected residual owner. Prefer extending the manual measurement script or adding a small focused diagnostic script before changing shared runtime code.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` or the replacement measurement command approved during this ticket
3. `pnpm run check:ticket-deps`
