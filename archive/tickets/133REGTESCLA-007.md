# 133REGTESCLA-007: Improve progress visibility for long integration test tails

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — engine test runner / reporter observability only
**Deps**: `archive/tickets/133REGTESCLA-004.md`, `archive/tickets/133REGTESCLA-001.md`

## Problem

The `133REGTESCLA-004` verification session exposed an observability gap in the integration lanes: batched `node --test` runs can print long stretches of passing files and then go silent for minutes while still legitimately working through expensive tail files. The main live example is `fitl-seed-stability.test.ts`, which runs 15 separate 300-turn FITL policy self-play witnesses inside one file and emits no intermediate progress. In WSL2 or other constrained environments, this silence makes the lane look hung and encourages unsafe parallel reruns or manual interruption.

This is not yet proven to be a harness correctness bug. It is a progress-visibility problem in long-running batched integration proofs.

## Assumption Reassessment (2026-04-18)

1. `packages/engine/scripts/test-lane-manifest.mjs` currently defines `integration`, `integration:core`, `integration:game-packages`, `integration:fitl-events`, `integration:fitl-rules`, and `integration:texas-cross-game` as batched `node --test` lanes — verified.
2. During the `133REGTESCLA-004` session, the last printed line from `integration:core` still left 14 files in that lane, and the last printed line from `integration:game-packages` still left 15 files, so lack of an immediate final footer did not by itself prove a stuck runner — verified against the live manifest.
3. Direct execution of `dist/test/integration/fitl-seed-stability.test.js` immediately showed the same `TAP version 13` then long silence pattern; source inspection confirmed the file's expensive structure (15 seeds × 300-turn FITL policy self-play), so the immediate problem is observability, not yet a confirmed runner defect.

## Architecture Check

1. The clean fix is to improve progress reporting at the test-runner/reporting layer rather than weakening tests, changing lane ownership, or introducing environment-specific workarounds.
2. This stays fully game-agnostic: the change belongs in generic engine test tooling (`run-tests.mjs` / reporter behavior), not in FITL-specific test code or per-game branches.
3. No backwards-compatibility shims are needed. The goal is additive observability for long-running files, not a second legacy runner path.

## What to Change

### 1. Add bounded progress visibility for long-running batched integration files

Adjust the engine test runner and/or the custom test-class reporter so a long-running file can emit enough progress context that operators can distinguish:

- "runner is still actively processing a known expensive file"
- from "runner appears to be wedged with no current-file visibility"

Acceptable approaches include:

- file-start / file-finish logging around batched patterns
- periodic "currently executing <file>" progress output when a file exceeds a quiet-time threshold
- other lightweight progress output that stays deterministic and readable

The implementation must avoid flooding output or duplicating per-test event spam.

### 2. Add focused tests for the new observability contract

Add or extend unit coverage around the runner/reporter so the new behavior is asserted without needing to run the full slow FITL lane in test code. The tests should prove that long-running files produce operator-visible progress output while preserving the existing class-grouped summary behavior.

### 3. Document the intended behavior in the ticket outcome / verification notes

When this ticket lands, its outcome should clearly distinguish:

- progress visibility improvements delivered
- no claim of changing test semantics or reclassifying any test lane

## Files to Touch

- `packages/engine/scripts/run-tests.mjs` (modify)
- `packages/engine/scripts/test-class-reporter.mjs` (modify if reporter-layer progress is the chosen design)
- `packages/engine/test/unit/run-tests-script.test.ts` (modify)
- `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` (modify if reporter behavior changes)

## Out of Scope

- Reclassifying tests or changing any `@test-class` / `@witness:` markers
- Rewriting `fitl-seed-stability.test.ts` or weakening its witness scope
- Converting integration lanes from batched to sequential execution by default unless reassessment proves that is the narrowest honest fix
- CI timeout policy changes outside engine-owned test tooling

## Acceptance Criteria

### Tests That Must Pass

1. A targeted unit test proves the runner/reporter emits progress visibility for a simulated long-running file without losing the final summary shape.
2. Existing class-grouped summary behavior remains covered and green.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Long-running batched integration files no longer appear as completely contextless silence once they exceed the designed quiet-time threshold.
2. The final test-class summary output remains deterministic and preserves the current class grouping semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/run-tests-script.test.ts` — assert the runner emits the new progress surface for a simulated slow file and still completes cleanly.
2. `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` — extend only if the chosen implementation changes reporter output semantics.

### Commands

1. `pnpm -F @ludoforge/engine test:unit`
2. `pnpm turbo build`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm run check:ticket-deps`

## Outcome

- `packages/engine/scripts/test-class-reporter.mjs` now emits bounded quiet-period progress lines of the form `[test-progress] [<lane>] still running <file> ...` after a configurable threshold, while preserving the existing deterministic class summary.
- `packages/engine/scripts/run-tests.mjs` now passes the active lane name into child `node --test` runs so the reporter can label those progress lines without changing test semantics or lane ownership.
- Focused unit coverage landed for both pieces:
  - `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` proves a simulated long-running file emits progress output and still ends with the same class-grouped summary.
  - `packages/engine/test/unit/run-tests-script.test.ts` proves the runner wires the lane label into batched reporter executions.
- No integration lane was reclassified, split, or weakened. This ticket only improves operator visibility during quiet long-tail files.

## Verification Record

1. `pnpm -F @ludoforge/engine build`
2. Focused built-file proof:
   `pnpm -F @ludoforge/engine exec node --test dist/test/unit/run-tests-script.test.js dist/test/unit/infrastructure/test-class-reporter.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm turbo build`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm run check:ticket-deps`

### Verification Notes

- The first focused proof attempt against raw `.ts` test paths was invalid for this package because engine unit tests run from built `dist/` output; the final focused proof was rerun against `dist/test/unit/**/*.js` after a successful package build.
- The first reporter implementation left unresolved quiet timers alive until the default threshold elapsed. That was caught by the focused proof (the green run lingered for ~30 seconds), fixed by clearing the pending quiet timer after each `Promise.race`, and then re-verified in the final focused proof.
