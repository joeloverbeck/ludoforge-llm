# STATEMOD-012: Real-Worker chooseN Integration Coverage for Store Pipeline

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: None

## Objective

Strengthen architecture confidence by validating `chooseN` choice flow through the real in-memory worker (`createGameWorker()`), not only bridge stubs.

## Reassessed Assumptions (2026-02-17)

- `packages/runner/test/store/game-store.test.ts` already includes `chooseN` coverage, but it is currently driven by a custom bridge stub (`createChooseNBridgeStub`) instead of the real worker pipeline.
- Existing tests do not currently prove that kernel-backed `legalChoices()` emits and completes `chooseN` end-to-end through `createGameWorker()` inside store integration coverage.
- There is no shared runner test fixture today that compiles a dedicated game definition yielding a real `chooseN` request in a deterministic way.

## What Needs to Change / Be Added

1. Add a compiled fixture in runner tests that yields a true `chooseN` pending request from kernel legality APIs.
2. Add store integration test coverage in `packages/runner/test/store/game-store.test.ts` using real worker flow:
- `initGame` -> `selectAction` -> `makeChoice([...])` -> completion path.
3. Replace or demote stub-only `chooseN` assertions where they overlap with the real-worker path so test architecture emphasizes kernel-backed integration rather than duplicate mocked behavior.
4. Keep fixture game-agnostic and self-contained (no external `data/<game>` runtime dependency).

## Updated Scope Boundaries

- In scope:
- Runner test fixtures and store integration tests that validate `chooseN` through `createGameWorker()`.
- Assertions for `choicePending` metadata (`type`, `min`, `max`) and array param persistence in `partialMove.params`.
- Out of scope:
- Engine kernel behavior changes for `chooseN`.
- Runner store runtime refactors unrelated to test confidence for this flow.

## Invariants That Must Pass

- `choicePending.type === 'chooseN'` exposes expected `min/max` contract.
- Multi-select values are preserved in `partialMove.params` as engine-compatible arrays.
- Completing `chooseN` updates store/render model consistently with other choice flows.
- No game-specific behavior is hardcoded in runner store logic.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New test in `packages/runner/test/store/game-store.test.ts`:
- `chooseN` integration through `createGameWorker()` and compiled spec fixture

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
- Added a shared compiled runner test fixture (`CHOOSE_N_TEST_DEF`) that produces a real kernel `chooseN` pending request.
- Replaced stub-only store `chooseN` coverage with a real-worker integration test using `createGameWorker()` for `initGame -> selectAction -> makeChoice([...])`.
- Strengthened store contract correctness by constructing move params from `choicePending.decisionId` (not `name`) so effect-driven decision flows complete correctly through kernel legality APIs.
- Updated store test bridge stubs/expectations to match the `decisionId`-keyed move param contract.
- **Deviations from original plan**:
- Ticket originally scoped to tests only; implementation uncovered and fixed an architecture bug in store move construction that blocked real-worker `chooseN` completion.
- **Verification results**:
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner lint` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
