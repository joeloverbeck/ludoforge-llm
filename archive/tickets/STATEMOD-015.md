# STATEMOD-015: Real-Worker Progressive Choice Coverage Matrix (chooseOne + chooseN)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: None (STATEMOD-014 is already completed in `archive/tickets/STATEMOD-014.md`)

## Objective

Ensure store integration confidence comes from real worker/kernel flows, not only bridge stubs, across both progressive choice types.

## Assumption Reassessment (Current Code + Tests)

- `packages/runner/test/store/game-store.test.ts` already includes real-worker coverage for effect-driven `chooseN` (`makeChoice supports chooseN options with min/max metadata through createGameWorker`).
- Progressive `chooseOne` coverage in the same file is currently driven by `createChoiceBridgeStub(...)`, not by `createGameWorker()`.
- `decisionId`-keyed params are already asserted for a real-worker `chooseN` flow, but there is no equivalent real-worker regression for `chooseOne`.
- `cancelChoice` / `cancelMove` behavior is validated today on the stubbed progressive flow, so these tests do not yet prove worker/kernel integration behavior.
- The ticket originally implied both progressive types lacked real-worker coverage; that is inaccurate. Gap is primarily `chooseOne` and mixed multi-step real-worker flows.

## What Needs to Change / Be Added

1. Add/expand compiled runner test fixtures to cover the **missing** real-worker progressive flows for:
- effect-driven `chooseOne`
- mixed multi-step progressive flows
2. Add/replace store integration tests in `packages/runner/test/store/game-store.test.ts` so progressive integration assertions are worker-backed where practical:
- `initGame -> selectAction -> makeChoice(...) -> ... -> completion`
3. Add explicit regression assertions for `decisionId`-keyed move params in **real-worker chooseOne and chooseN** flows (not `name`-keyed).
4. Reduce overlap with stub-only progressive-choice tests where equivalent invariants are now covered by real-worker tests, while keeping stubs only for scenarios that require deterministic illegal-path forcing.

## Invariants That Must Pass

- Progressive choices complete through real `createGameWorker()` legality APIs for both chooseOne and chooseN.
- `partialMove.params` keys for progressive decisions are `decisionId` keys.
- `cancelChoice` and `cancelMove` correctly rewind/rebuild state under real-worker flows.
- Render-model choice fields (`choiceType`, `choiceMin`, `choiceMax`, options) remain consistent before/after completion and cancellation.
- Architecture remains engine-agnostic: no game-specific store logic, no decision-name fallback/aliasing, and no worker bypass in progressive integration assertions.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- real-worker chooseOne effect flow completes and persists decisionId-keyed param (and not `name`-keyed param)
- real-worker chooseN flow persists array value under decisionId key (retain/strengthen existing coverage)
- real-worker mixed progressive flow (chooseOne -> chooseN or equivalent) completes across multiple decisions
- real-worker cancelChoice rewind path reopens the expected pending decision
- real-worker cancelMove clears progressive construction state after at least one real-worker choice step

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added new real-worker compiled fixtures for progressive coverage in `packages/runner/test/worker/test-fixtures.ts`:
    - `CHOOSE_ONE_TEST_DEF`
    - `CHOOSE_MIXED_TEST_DEF` (`chooseOne -> chooseN`)
  - Updated `packages/runner/test/store/game-store.test.ts` to shift core progressive integration assertions to `createGameWorker()` flows for:
    - real-worker `chooseOne` initialization
    - real-worker mixed multi-step progression
    - real-worker `cancelChoice` rewind behavior
    - real-worker `cancelMove` progressive reset
    - real-worker `decisionId`-keyed param regression checks for both `chooseOne` and `chooseN`
  - Kept one focused stub-based illegal-choice test to deterministically validate store illegal-path preservation semantics.
- **Deviations from original plan**:
  - Did not remove all stub usage; retained a minimal illegal-path stub because forcing deterministic worker-side illegal-choice classification in this test would otherwise introduce brittle behavior checks unrelated to store invariants.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed
  - `pnpm -F @ludoforge/runner lint` passed
  - `pnpm -F @ludoforge/runner typecheck` passed
