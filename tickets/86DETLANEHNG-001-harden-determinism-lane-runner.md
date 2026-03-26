# 86DETLANEHNG-001: Harden determinism lane runner against silent hangs

**Status**: PENDING
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
4. In current behavior, both the lane command and direct `node --test dist/test/determinism/<file>.test.js` invocations can stall after `TAP version 13` with no subtest-level signal during extended observation — confirmed.
5. The problem is therefore broader than one npm script alias. The current runner/test execution shape does not provide enough observability or fail-fast behavior to localize the issue.
6. Fixing this ticket should not weaken determinism assertions, skip tests, or convert hard failures into warnings. The right scope is execution transparency and bounded failure semantics.

## Architecture Check

1. A deterministic verification lane must itself be bounded and diagnosable. Adding per-file progress and explicit timeout/failure reporting is cleaner than keeping one opaque bulk invocation that can hang forever.
2. This change stays entirely in generic test infrastructure. It introduces no game-specific logic and does not leak FITL or Texas-specific knowledge into the kernel or runner.
3. No backwards-compatibility shim is needed. The determinism lane should be upgraded directly to the better execution model rather than preserving the silent-hang behavior.

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

- Add or update a script-level/unit-style test proving the determinism lane runner:
  - invokes determinism files sequentially
  - reports the offending file on timeout/failure
  - exits non-zero when one file stalls or fails

## Files to Touch

- `packages/engine/scripts/run-tests.mjs` (modify)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify only if needed for cleaner lane ownership)
- `packages/engine/test/unit/` runner-script test file(s) (new or modify)

## Out of Scope

- Fixing the root-cause determinism hang inside the determinism tests or runtime code
- Weakening, skipping, quarantining, or reclassifying determinism tests
- Changing the meaning of the default, integration, or e2e lanes
- Any game-specific test exemptions

## Acceptance Criteria

### Tests That Must Pass

1. A runner-level test proves determinism files execute sequentially with explicit per-file reporting.
2. A runner-level test proves a timed-out determinism file causes a non-zero exit and names the offending file.
3. Existing suite: `pnpm turbo test`

### Invariants

1. `pnpm -F @ludoforge/engine test:determinism` no longer fails silently; it either completes or fails with an explicit offending file.
2. Determinism assertions remain hard assertions. No test is skipped or downgraded to warning-only behavior.
3. Execution remains bounded in line with Foundations 6 and 11.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/<runner test>.test.ts` — proves the determinism lane runs file-by-file and reports timeout/failure context

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="determinism|run-tests|lane"`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`
6. `pnpm turbo lint`
