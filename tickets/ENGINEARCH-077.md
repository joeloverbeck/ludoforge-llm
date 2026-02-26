# ENGINEARCH-077: Add exhaustive trigger-log contract coverage across engine and runner

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared runtime contract test harness + runner contract fixtures
**Deps**: ENGINEARCH-074 (archived)

## Problem

`TriggerLogEntry` gained a new variant (`operationCompoundStagesReplaced`) in engine, and runner initially missed handling it. CI can catch this via typecheck, but current test fixtures claiming "all variants" are manual lists and can drift when the union evolves.

This is a contract-hardening gap: shared engine-runtime unions should have deterministic, exhaustive test coverage in downstream consumers.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/src/kernel/types-core.ts` defines `TriggerLogEntry` as a growing union used by runner via `@ludoforge/engine/runtime`.
2. Runner translation/clone-compat tests use hand-maintained trigger fixtures; they are not auto-derived from a single exhaustive contract source.
3. Mismatch + correction: add one canonical exhaustive trigger fixture utility and reuse it in runner tests so union changes force fixture updates in one place.

## Architecture Check

1. A single exhaustive fixture source is cleaner and more robust than repeated per-test variant lists.
2. This remains game-agnostic contract work (runtime entry shape), with no game-specific logic leaking into `GameDef`/simulation.
3. No backwards-compatibility aliases or shims: new variants must be handled explicitly.

## What to Change

### 1. Create shared exhaustive trigger fixture helper for tests

Add a runner test helper that exports a canonical `TRIGGER_LOG_ENTRIES_EXHAUSTIVE` typed as `readonly TriggerLogEntry[]`, including every current variant with valid minimal payloads.

### 2. Reuse the helper in variant-sensitive tests

Refactor runner tests that currently maintain local "all variants" lists to consume the shared fixture helper:
- `translate-effect-trace.test.ts`
- `clone-compat.test.ts`

### 3. Add explicit contract assertion in tests

Add at least one focused assertion verifying that every fixture entry translates/clones without throwing, so new variants fail fast when unhandled.

## Files to Touch

- `packages/runner/test/helpers/trigger-log-fixtures.ts` (new)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/worker/clone-compat.test.ts` (modify)

## Out of Scope

- Changing trigger-log runtime semantics
- Adding game-specific trigger kinds

## Acceptance Criteria

### Tests That Must Pass

1. Runner tests consume a shared exhaustive trigger fixture source.
2. Adding a new `TriggerLogEntry` variant requires fixture update in one canonical helper and fails tests/typecheck until handled.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Shared engine-runtime union changes propagate deterministically to runner coverage.
2. Trigger-log contract handling remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — consume exhaustive trigger fixture and assert translation coverage for all variants.
2. `packages/runner/test/worker/clone-compat.test.ts` — consume exhaustive trigger fixture and assert clone compatibility for all variants.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
3. `pnpm -F @ludoforge/runner test -- clone-compat`
4. `pnpm -F @ludoforge/runner test`
