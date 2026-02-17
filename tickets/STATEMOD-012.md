# STATEMOD-012: Real-Worker chooseN Integration Coverage for Store Pipeline

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: None

## Objective

Strengthen architecture confidence by validating `chooseN` choice flow through the real in-memory worker (`createGameWorker()`), not only bridge stubs.

## What Needs to Change / Be Added

1. Add a compiled fixture in runner tests that yields a true `chooseN` pending request from kernel legality APIs.
2. Add store integration test coverage in `packages/runner/test/store/game-store.test.ts` using real worker flow:
- `initGame` -> `selectAction` -> `makeChoice([...])` -> completion path.
3. Keep fixture game-agnostic and self-contained (no external `data/<game>` runtime dependency).

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
