# AIORCH-004: Harden applyTemplateMove boundary contract tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`applyTemplateMove` is implemented and broadly covered, but boundary contract hardening is still missing in two places: structured-clone compatibility coverage for template outcomes and explicit per-call trace-option parity checks.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/test/worker/clone-compat.test.ts` does not currently round-trip any `applyTemplateMove` result variants (`applied`, `uncompletable`, `illegal`).
2. `packages/runner/test/worker/game-worker.test.ts` covers `applyTemplateMove` outcome variants and state-preservation behavior, but does not explicitly assert per-call `{ trace: false }` vs `{ trace: true }` behavior for `applyTemplateMove` applied outcomes.
3. `packages/runner/src/worker/game-worker-api.ts` already threads `options?.trace ?? enableTrace` into template execution; the gap is verification, not implementation.
4. Discrepancy discovered during verification: `applyTemplateMove` illegal outcomes can currently surface engine `IllegalMoveError` instances directly when they satisfy the structural `WorkerError` guard, which leaks non-normalized error objects across the worker boundary.

## Architecture Reassessment

1. Strengthening boundary-contract tests is the correct architectural move: it protects a generic worker API surface without introducing runtime branches, aliases, or compatibility shims.
2. Small architecture hardening is warranted: worker error mapping should normalize all errors to plain `WorkerError` DTOs at the boundary to guarantee clone-safe contracts and prevent class-instance leakage from engine internals.
3. This work remains game-agnostic and runner-boundary only.

## Scope

### In Scope

1. Extend clone-compat tests to include `applyTemplateMove` applied/uncompletable/illegal outcomes.
2. Add explicit trace-option parity tests for `applyTemplateMove` applied outcomes.
3. Normalize illegal template outcomes to plain `WorkerError` payloads in `game-worker-api` so boundary clone-compat assertions are valid and robust.
4. Keep fixtures deterministic and avoid game-specific assumptions.

### Out of Scope

1. Re-testing the existing `applyTemplateMove` outcome matrix already covered in `game-worker.test.ts`.
2. Store orchestration behavior changes.
3. AI playback policy changes.
4. Engine runtime behavior changes.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/runner/test/worker/clone-compat.test.ts` (modify)
- `packages/runner/test/worker/game-worker.test.ts` (modify)

## Acceptance Criteria

### Tests That Must Pass

1. Structured-clone compatibility includes all `applyTemplateMove` outcome variants.
2. `applyTemplateMove` trace override behavior (`trace: false` omits `effectTrace`, `trace: true` includes it) is explicitly verified.
3. Illegal template outcomes carry normalized plain `WorkerError` payloads at the worker boundary.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Worker boundary contracts remain clone-safe and deterministic for all template-application outcomes.
2. Trace behavior remains explicit and consistent between `applyMove` and `applyTemplateMove`.
3. Worker boundary errors do not leak engine-specific `Error` subclasses.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/clone-compat.test.ts` — add `applyTemplateMove` outcome round-trip assertions.
2. `packages/runner/test/worker/game-worker.test.ts` — add trace-override parity assertions for `applyTemplateMove`.
3. `packages/runner/src/worker/game-worker-api.ts` — normalize worker errors into plain DTO payloads for boundary safety.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/worker/clone-compat.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Added `applyTemplateMove` structured-clone round-trip coverage in `clone-compat.test.ts` for `applied`, `uncompletable`, and `illegal` outcomes.
  - Added explicit `applyTemplateMove` per-call trace parity checks in `game-worker.test.ts` (`trace: false` omits `effectTrace`; `trace: true` includes it).
  - Hardened worker boundary normalization in `game-worker-api.ts` so `toWorkerError` always returns a plain `WorkerError` DTO and does not leak engine error-class instances.
- **Deviation from original plan**:
  - The original ticket assumed test-only work; implementation included a small boundary hardening fix after tests exposed non-normalized illegal outcome errors during clone-compat verification.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/worker/clone-compat.test.ts` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
