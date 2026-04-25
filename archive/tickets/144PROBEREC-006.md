# 144PROBEREC-006: Complete full I1/I2 probe evidence gates

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Conditional — only if the completed measurement invalidates the retained publication-probe cache
**Deps**: `archive/tickets/144PROBEREC-001.md`, `archive/specs/144-probe-and-recover-microturn-publication.md`

## Problem

Ticket 001 landed the production deep publication probe, run-local LRU cache, focused tests, and bounded evidence artifacts. Post-ticket review found that two original evidence gates were narrowed during implementation:

- I1 asked for one row per FITL action using `chooseN`, nested `chooseOne`, or `forEach` with sub-choices; the landed `depth-audit.md` is source-derived by action/macro family.
- I2 asked for cache hit rate per game, wall-clock delta with and without cache, and peak cache size over the 18-seed campaign corpus; the landed `memoization-measurement.md` records a one-turn 18-seed calibration after longer doubled runs exceeded bounded interactive time.

This ticket closes that evidence debt and makes the final keep/tune/remove decision for `publicationProbeCache` evidence-backed.

## Assumption Reassessment (2026-04-24)

1. `packages/engine/src/kernel/microturn/probe.ts` and `GameDefRuntime.publicationProbeCache` exist from ticket 001, and the probe/cache tests pass after post-review.
2. `campaigns/phase4-probe-recover/depth-audit.md` exists but groups FITL surfaces by action/macro family rather than enumerating one row per qualifying action.
3. `campaigns/phase4-probe-recover/memoization-measurement.md` exists but explicitly states the full 500-turn and 25-turn doubled comparisons did not complete; its current data is a one-turn calibration only.
4. Tickets 002-005 do not own the full I1/I2 evidence gate. They build on ticket 001's runtime seam, then add rollback, F#18 doctrine, harness parity, and schema/replay proof.

## Architecture Check

1. The runtime cache remains a bounded accelerator, not a legality source. The final retain/tune/remove decision must preserve identical probe verdicts with or without memoization (F#8).
2. The full I1 audit keeps the `K=3` publication budget honest under F#10 instead of relying on a representative category summary.
3. The measurement command must be explicit and repeatable. If the full 18-seed corpus remains too expensive, stop and present a 1-3-1 decision rather than silently narrowing the artifact again.
4. No game-specific behavior is added to engine code. Any engine change from this ticket is limited to cache removal/tuning if the measurement disproves the current default (F#1, F#14).

## What to Change

### 1. Expand the I1 probe-depth audit

Update `campaigns/phase4-probe-recover/depth-audit.md` so it enumerates every FITL action/profile/macro surface that uses `chooseN`, nested `chooseOne`, or `forEach` bodies with sub-choices. For each row record:

- action/profile/macro owner
- source path and line anchor or stable source section
- deepest nested chooser chain observed
- probe depth that catches an induced dead end
- whether `K > 3` is needed, or whether residual risk is rollback-protected by ticket 002

Keep the explicit `K > 3` callout.

### 2. Complete the I2 memoization measurement

Update `campaigns/phase4-probe-recover/memoization-measurement.md` with a repeatable measurement over the 18-seed campaign corpus:

- cache hit rate per seed/game
- wall-clock delta with cache enabled vs disabled
- peak cache size
- final keep/tune/remove decision

The report must include the exact command used, max-turn setting, timeout behavior, and environment caveats. If a full 500-turn comparison is infeasible, either produce a justified representative corpus after user confirmation or split the measurement harness problem into a new ticket.

### 3. Apply the cache decision if needed

If hit rate is below 15% or slowdown without memoization is below 5%, remove or tune the cache in the same ticket:

- `packages/engine/src/kernel/gamedef-runtime.ts`
- `packages/engine/src/kernel/microturn/probe.ts`
- `packages/engine/test/unit/shared/lru-cache.test.ts` if the LRU is removed
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
- `packages/engine/test/unit/sim/simulator.test.ts`

If the cache remains, leave the runtime code unchanged and document why the current `PUBLICATION_PROBE_CACHE_LIMIT` is still appropriate.

## Files to Touch

- `campaigns/phase4-probe-recover/depth-audit.md` (modify)
- `campaigns/phase4-probe-recover/memoization-measurement.md` (modify)
- `campaigns/phase4-probe-recover/measure-memoization.mjs` (add)
- `packages/engine/src/kernel/gamedef-runtime.ts` (conditional modify)
- `packages/engine/src/kernel/microturn/probe.ts` (conditional modify)
- `packages/engine/test/unit/shared/lru-cache.test.ts` (conditional modify/delete)
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` (conditional modify)
- `packages/engine/test/unit/sim/simulator.test.ts` (conditional modify)

## Out of Scope

- Runtime rollback and blacklist handling — ticket 002.
- F#18 amendment, seed-1001 fixture, and convergence-witness re-bless — ticket 003.
- Diagnostic harness rewire — ticket 004.
- Trace schema/replay proof for recovery events — ticket 005.
- Changing the selected publication probe depth without evidence that `K=3` is insufficient.

## Acceptance Criteria

### Tests That Must Pass

1. Updated I1 artifact contains one row per qualifying FITL action/profile/macro surface and an explicit `K > 3` conclusion.
2. Updated I2 artifact contains the full or user-approved representative 18-seed measurement with per-seed/game cache hit rate, wall-clock delta, peak cache size, and final cache decision.
3. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
4. Existing suite: `pnpm turbo test`

### Invariants

1. With and without memoization, probe verdicts and published legal actions remain identical for the tested continuations.
2. `publicationProbeCache` remains run-local if retained.
3. The final artifact records any measurement substitution as a user-approved decision, not an implicit implementation shortcut.

## Test Plan

### New/Modified Tests

1. Modify `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` only if the cache implementation changes.
2. Modify `packages/engine/test/unit/shared/lru-cache.test.ts` and `packages/engine/test/unit/sim/simulator.test.ts` only if the cache is tuned or removed.

### Commands

1. `timeout 25m node campaigns/phase4-probe-recover/measure-memoization.mjs --max-turns 500 --seed-list 1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1020,1049,1054 --modes enabled,disabled`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`

## Outcome

Completed on 2026-04-24.
Outcome amended: 2026-04-25

- I1: `campaigns/phase4-probe-recover/depth-audit.md` now enumerates the audited FITL action/profile/macro surfaces and retains the explicit `K > 3` conclusion. No audited surface requires increasing `MICROTURN_PROBE_DEPTH_BUDGET`.
- I2: `campaigns/phase4-probe-recover/memoization-measurement.md` records the completed 18-seed, `maxTurns=500` cache-enabled/cache-disabled measurement. The cache produced identical stop reasons, turn counts, and decision counts with and without memoization. Hit rate was 36.45%; disabled mode was 0.26% faster in this sandbox on the tuned-build final run.
- Cache decision: retained and tuned `publicationProbeCache`; `PUBLICATION_PROBE_CACHE_LIMIT` is now `2_500`, matching the observed 2,467-entry peak with bounded headroom.
