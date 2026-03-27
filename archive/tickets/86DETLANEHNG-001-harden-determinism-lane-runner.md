# 86DETLANEHNG-001: Harden determinism lane runner against silent hangs

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine test runner scripts for determinism lane execution
**Deps**: `docs/FOUNDATIONS.md`, `tickets/README.md`

## Problem

The dedicated engine determinism lane currently fails the "Testing as Proof" contract operationally: `pnpm -F @ludoforge/engine test:determinism` can print `TAP version 13` and then provide no per-test progress or terminal result within an extended observation window.

That is not acceptable infrastructure for a determinism proof lane. Even if the underlying determinism tests are correct, a silently hanging runner prevents the repository from distinguishing:

- a genuine infinite or effectively unbounded test path
- a stalled child process
- a very slow but healthy determinism test

Per Foundations 6 and 11, the determinism verification path itself must be bounded and trustworthy.

## Assumption Reassessment (2026-03-27)

1. `packages/engine/package.json` wires `test:determinism` to `node scripts/run-tests.mjs --lane determinism` — confirmed.
2. `packages/engine/scripts/run-tests.mjs` currently delegates the entire determinism lane to one `spawnSync('node', ['--test', ...patterns], { stdio: 'inherit' })` call — confirmed.
3. The determinism lane currently expands to exactly three files from `packages/engine/test/determinism/`: `draft-state-determinism-parity`, `zobrist-incremental-parity`, and `zobrist-incremental-property` — confirmed.
4. In current behavior, the lane command and each direct `node --test packages/engine/dist/test/determinism/<file>.test.js` probe can remain silent after `TAP version 13` until an external shell timeout kills the process — confirmed. The repository currently proves an observability/boundedness gap, not yet the root cause of the underlying stall.
5. The problem is therefore broader than one npm script alias. The current runner/test execution shape does not provide enough observability or fail-fast behavior to localize the offending determinism file.
6. The repo already contains lane-policy coverage in `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts`; this ticket should extend that coverage and/or add a focused runner test, rather than assuming an entirely new test file is required.
7. After the runner hardening, the lane now exposes real durations: `draft-state-determinism-parity` completes in about 19 minutes, `zobrist-incremental-parity` in about 3 minutes, and `zobrist-incremental-property` exceeds the 20-minute per-file bound. The old problem was primarily opacity, but one proof unit is also too coarse to satisfy bounded execution well.
8. Fixing this ticket should not weaken determinism assertions, skip tests, or convert hard failures into warnings. The right scope is execution transparency plus reshaping oversized determinism proof files into bounded units.

## Architecture Check

1. A deterministic verification lane must itself be bounded and diagnosable. Adding per-file progress and explicit timeout/failure reporting is cleaner than keeping one opaque bulk invocation that can hang forever.
2. This change stays entirely in generic test infrastructure. It introduces no game-specific logic and does not leak FITL or Texas-specific knowledge into the kernel or runner.
3. The clean architecture is to express lane execution policy inside the shared runner (`batched` vs `sequential`, optional timeout metadata) rather than hard-coding one-off determinism-only control flow with duplicated spawn logic. That keeps future specialty lanes extensible without alias paths or bespoke scripts.
4. The determinism test corpus should also align with Foundation 11 by making each file a bounded, interpretable proof unit. Splitting one oversized property file by workload slice is cleaner than inflating the timeout and preserving a monolithic batch-shaped proof.
5. No backwards-compatibility shim is needed. The determinism lane should be upgraded directly to the better execution model rather than preserving the silent-hang behavior.

## What to Change

### 1. Make determinism lane execution per-file and observable

- Update `packages/engine/scripts/run-tests.mjs` so the determinism lane does not run as one opaque `node --test file1 file2 file3` batch.
- Run each determinism test file in a clearly logged sequence.
- Emit start/end markers identifying the concrete file currently running.
- Preserve a failing exit code if any determinism test fails.

### 2. Add bounded execution semantics for determinism files

- Add a per-file timeout or equivalent bounded watchdog around each determinism test process.
- If a determinism file exceeds the allowed bound, fail the lane explicitly with the offending file name.
- Keep the timeout policy local to this lane unless a broader repo decision is made later.
- Do not mask a timeout as a pass; the lane must fail loudly.

### 3. Capture enough failure signal for follow-up diagnosis

- Surface which determinism file hung or timed out.
- Prefer a small runner-level summary that makes the next ticket actionable without requiring manual process inspection.
- If necessary, add a tiny script-level helper for sequential test execution and timeout enforcement, but keep it generic and narrow.

### 4. Add regression coverage for the runner behavior

- Add or update script-level/unit-style coverage proving the determinism lane runner:
  - invokes determinism files sequentially
  - reports the offending file on timeout/failure
  - exits non-zero when one file stalls or fails

### 5. Split oversized determinism proof units

- Replace the monolithic `packages/engine/test/determinism/zobrist-incremental-property.test.ts` file with smaller determinism files grouped by game/workload slice.
- Keep the same hashing assertions and seed coverage, but distribute them across bounded file-level proof units so the lane timeout retains architectural meaning.
- Prefer extracting shared test helpers over duplicating compilation and run logic across the new files.

## Files to Touch

- `packages/engine/scripts/run-tests.mjs` (modify)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify only if needed for cleaner lane ownership)
- `packages/engine/test/determinism/` property-test file set (replace oversized file with bounded proof files)
- `packages/engine/test/helpers/` determinism helper file(s) if needed to keep the split DRY
- `packages/engine/test/unit/` runner-script and/or lane-policy test file(s) (new or modify)

## Out of Scope

- Fixing the root-cause determinism hang inside the determinism tests or runtime code
- Weakening, skipping, quarantining, or reclassifying determinism tests
- Changing the meaning of the default, integration, or e2e lanes
- Any game-specific test exemptions

## Acceptance Criteria

### Tests That Must Pass

1. A runner-level test proves determinism files execute sequentially with explicit per-file reporting.
2. A runner-level test proves a timed-out determinism file causes a non-zero exit and names the offending file.
3. Existing lane taxonomy expectations remain correct after the runner refactor.
4. `pnpm -F @ludoforge/engine test:determinism` completes successfully under the bounded per-file determinism timeout.
5. Existing suite: `pnpm turbo test`

### Invariants

1. `pnpm -F @ludoforge/engine test:determinism` no longer fails silently; it either completes or fails with an explicit offending file.
2. Determinism assertions remain hard assertions. No test is skipped or downgraded to warning-only behavior.
3. Execution remains bounded in line with Foundations 6 and 11.
4. Determinism proof files remain small enough that the lane timeout signals genuine runaways rather than normal expected completion.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/run-tests-script.test.ts` — proves the determinism lane defaults to sequential execution with a lane-local timeout, emits per-file start/end markers, and fails loudly on timeout.
2. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` — updated to assert the new bounded `zobrist-incremental-property-*` files all live in the determinism lane and stay out of default/integration coverage.
3. `packages/engine/test/determinism/zobrist-incremental-property-texas.test.ts` — preserves the Texas random-play + diverse-seed hash-parity workload from the old monolith in one bounded file.
4. `packages/engine/test/determinism/zobrist-incremental-property-fitl-diverse-seeds.test.ts` — preserves the FITL diverse-seed hash-parity workload as its own bounded proof unit.
5. `packages/engine/test/determinism/zobrist-incremental-property-fitl-seeds-01-08.test.ts` — preserves the first FITL random-play seed cohort in a bounded file.
6. `packages/engine/test/determinism/zobrist-incremental-property-fitl-seeds-09-16.test.ts` — preserves the second FITL random-play seed cohort in a bounded file.
7. `packages/engine/test/determinism/zobrist-incremental-property-fitl-seeds-17-25.test.ts` — preserves the final FITL random-play seed cohort in a bounded file.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/run-tests-script.test.js`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`
6. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-27

What actually changed:
- `packages/engine/scripts/run-tests.mjs` now models lane execution policy explicitly, runs determinism files sequentially, logs file-level start/end markers and summary output, and enforces a determinism-only per-file timeout.
- Added `packages/engine/test/unit/run-tests-script.test.ts` to verify sequential determinism execution, timeout reporting, and lane-local timeout defaults.
- Replaced the oversized `packages/engine/test/determinism/zobrist-incremental-property.test.ts` monolith with five bounded proof files plus a shared helper in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`.
- Updated `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` so the determinism lane contract tracks the new bounded file set explicitly.

Deviations from original plan:
- The original plan assumed runner hardening alone would be sufficient. After implementation, the new runner exposed that `zobrist-incremental-property` itself was too coarse for a meaningful 20-minute file bound, so the ticket scope was expanded to split that proof file rather than simply increasing the timeout.

Verification results:
- `node --test packages/engine/dist/test/unit/run-tests-script.test.js` passed.
- `node --test packages/engine/dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` passed.
- `pnpm -F @ludoforge/engine test:determinism` passed. Observed file durations under the new runner were approximately `18m 59s`, `2m 47s`, `6m 52s`, `6m 16s`, `4m 41s`, `5m 38s`, and `4s`.
- `pnpm turbo typecheck` passed.
- `pnpm turbo lint` passed.
- `pnpm turbo test` passed.
