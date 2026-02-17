# STATEMOD-015: Real-Worker Progressive Choice Coverage Matrix (chooseOne + chooseN)

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-014

## Objective

Ensure store integration confidence comes from real worker/kernel flows, not only bridge stubs, across both progressive choice types.

## What Needs to Change / Be Added

1. Add/expand compiled runner test fixtures to cover real-worker progressive flows for:
- effect-driven `chooseOne`
- effect-driven `chooseN`
- mixed multi-step progressive flows
2. Add store integration tests in `packages/runner/test/store/game-store.test.ts` that run end-to-end:
- `initGame -> selectAction -> makeChoice(...) -> ... -> completion`
3. Add regression assertions for `decisionId`-keyed move params in real-worker flows (not `name`-keyed).
4. Reduce overlap with stub-only progressive-choice tests where real-worker coverage now proves the same invariant.

## Invariants That Must Pass

- Progressive choices complete through real `createGameWorker()` legality APIs for both chooseOne and chooseN.
- `partialMove.params` keys for progressive decisions are `decisionId` keys.
- `cancelChoice` and `cancelMove` correctly rewind/rebuild state under real-worker flows.
- Render-model choice fields (`choiceType`, `choiceMin`, `choiceMax`, options) remain consistent before/after completion and cancellation.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- real-worker chooseOne effect flow completes and persists decisionId-keyed param
- real-worker chooseN flow completes and persists array value under decisionId key
- real-worker cancelChoice rewind path reopens expected pending decision
- regression test that would fail if params are keyed by `name` instead of `decisionId`
