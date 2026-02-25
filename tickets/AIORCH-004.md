# AIORCH-004: Harden applyTemplateMove boundary contract tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The new atomic worker API `applyTemplateMove` is implemented and covered in core worker/store tests, but contract-hardening tests are incomplete for boundary compatibility and trace-option parity.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/test/worker/clone-compat.test.ts` does not currently round-trip `applyTemplateMove` results across all outcomes.
2. `packages/runner/test/worker/game-worker.test.ts` validates outcome matrix but does not explicitly validate per-call `{ trace: false }` vs `{ trace: true }` behavior for `applyTemplateMove`.
3. Mismatch: the worker API contract now includes `applyTemplateMove`, so parity checks should be as strict as existing `applyMove` boundary checks.

## Architecture Check

1. Contract-focused tests are a low-cost way to keep API evolution safe and extensible; they prevent boundary drift without changing runtime architecture.
2. This remains game-agnostic and runner-boundary only.
3. No backwards-compatibility aliasing/shims required.

## What to Change

### 1. Extend boundary clone-compat coverage

Add structured-clone round-trip assertions for `applyTemplateMove` result variants (`applied`, `uncompletable`, `illegal`).

### 2. Add trace-override parity tests for applyTemplateMove

Verify `applyTemplateMove(..., { trace: false })` omits `effectTrace` on applied outcome and `trace: true` includes it.

### 3. Keep test fixtures deterministic

Use deterministic mocks/spies where needed so illegal/uncompletable branches are asserted without flaky game-specific assumptions.

## Files to Touch

- `packages/runner/test/worker/clone-compat.test.ts` (modify)
- `packages/runner/test/worker/game-worker.test.ts` (modify)

## Out of Scope

- Store orchestration behavior changes.
- AI playback policy changes.
- Engine runtime behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. Structured-clone compatibility includes `applyTemplateMove` outcomes.
2. `applyTemplateMove` trace override behavior is explicitly verified.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Worker boundary contracts remain clone-safe and deterministic for all result variants.
2. Trace behavior remains explicit and consistent between `applyMove` and `applyTemplateMove`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/clone-compat.test.ts` — add atomic template execution result round-trip assertions.
2. `packages/runner/test/worker/game-worker.test.ts` — add trace-override parity assertions for `applyTemplateMove`.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/worker/clone-compat.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`
