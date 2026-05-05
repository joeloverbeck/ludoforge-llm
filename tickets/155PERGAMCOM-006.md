# 155PERGAMCOM-006: Resolve residual FITL lane process startup topology

**Status**: PENDING
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
