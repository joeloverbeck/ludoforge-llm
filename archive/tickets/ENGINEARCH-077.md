# ENGINEARCH-077: Add exhaustive trigger-log contract coverage across engine and runner

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared runtime contract test harness + runner contract fixtures
**Deps**: ENGINEARCH-074 (archived)

## Problem

`TriggerLogEntry` is a cross-package runtime contract (`@ludoforge/engine/runtime`) consumed by runner model + worker tests. Current runner tests that claim "all variants" use duplicated local arrays and can drift when the union evolves.

This is a contract-hardening gap: shared engine-runtime unions should have deterministic, exhaustive test coverage in downstream consumers.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/src/kernel/types-core.ts` defines `TriggerLogEntry` as a growing union used by runner via `@ludoforge/engine/runtime`.
2. Runner translation logic already handles `operationCompoundStagesReplaced` and `turnFlowDeferredEventLifecycle` in `packages/runner/src/model/translate-effect-trace.ts`.
3. Runner translation/clone-compat tests still use hand-maintained local trigger arrays; they are not auto-derived from a single exhaustive contract source.
4. Mismatch + correction: the actual coverage gap is duplicated fixtures + missing explicit `turnFlowDeferredEventLifecycle` coverage in those tests, not a missing runner implementation for `operationCompoundStagesReplaced`.

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

Add focused assertions verifying that every fixture entry translates/clones without throwing, and include explicit checks that the `turnFlowDeferredEventLifecycle` variant is present in the translated output.

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

1. `packages/runner/test/helpers/trigger-log-fixtures.ts` — new canonical exhaustive trigger fixture source for all `TriggerLogEntry` variants.
2. `packages/runner/test/model/translate-effect-trace.test.ts` — consume exhaustive trigger fixture and assert translation coverage for all variants, including deferred-event lifecycle entries.
3. `packages/runner/test/worker/clone-compat.test.ts` — consume exhaustive trigger fixture and assert clone compatibility for all variants.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
3. `pnpm -F @ludoforge/runner test -- clone-compat`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added canonical exhaustive trigger fixture helper at `packages/runner/test/helpers/trigger-log-fixtures.ts`.
  - Refactored `translate-effect-trace.test.ts` and `clone-compat.test.ts` to consume the shared fixture source.
  - Strengthened translation coverage assertions to explicitly validate deferred-event lifecycle trigger translation.
- Deviations from original plan:
  - Ticket assumptions were corrected before implementation: runner implementation already supported `operationCompoundStagesReplaced`; the real gap was duplicated fixtures and missing explicit deferred-lifecycle coverage in tests.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner test -- translate-effect-trace` passed.
  - `pnpm -F @ludoforge/runner test -- clone-compat` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
