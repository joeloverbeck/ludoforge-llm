# STATEMOD-009: Integration Tests — Full Store + RenderModel Pipeline

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D11)
**Deps**: STATEMOD-008 (all prior tickets)

## Objective

Close the remaining D11 integration-test gaps for the existing state pipeline architecture:
`createGameStore(bridge) → initGame → actions → deriveRenderModel`.

This ticket must extend the current test layout instead of introducing a parallel test architecture.

## Files to Touch

- `packages/runner/test/store/game-store.test.ts` — extend store pipeline integration coverage
- `packages/runner/test/model/derive-render-model-zones.test.ts` — only if hidden-info integration assertions need strengthening
- `packages/runner/test/model/derive-render-model-state.test.ts` — only if metadata/action-group derivation assertions need strengthening

## Out of Scope

- Creating `game-store-integration.test.ts` or `integration-fixtures.ts` solely to mirror D11 wording
- Rewriting existing test files without clear coverage gain
- PixiJS / React rendering tests (Specs 38, 39)
- Animation tests (Spec 40)
- Engine source changes

## What to Do

### 1. Reassessed assumptions and architecture constraints

Validated against current repo state:

- Spec D11 currently targets `packages/runner/test/store/game-store.test.ts` (not a separate integration file).
- Hidden information, marker/track/effect/interrupt/event-deck, and action-group coverage already exists in `derive-render-model-*` tests.
- Existing `game-store.test.ts` already covers major pipeline behaviors (`initGame`, `selectAction`, multi-step `makeChoice`, `confirmMove`, `undo`, error handling).
- Remaining D11-aligned gaps are specific and should be addressed by incremental additions in current files.

Architectural decision:
- Keep the split between store-flow tests (`test/store`) and pure derivation tests (`test/model`).
- Do not duplicate fixture compilers or clone existing derivation assertions into store tests unless needed for missing behavior.

### 2. Implement missing D11 coverage in existing tests

Each new test should create a store via `createGameStore(...)`, run actions synchronously, and assert postconditions.

**Core flow tests:**
- [x] `initGame()` populates store with initial state, legal moves, render model, and lifecycle = 'playing'
- [x] `selectAction()` updates action selection and resets choice state
- [x] `makeChoice()` progresses through multi-step choice chain
- [x] `makeChoice()` supports `chooseN` multi-selection with min/max
- [x] `cancelChoice()` steps back one choice in the breadcrumb
- [x] `cancelMove()` resets to action selection
- [x] `confirmMove()` assertions include effect trace + trigger firings (not only state mutation)

**Undo tests:**
- [x] `undo()` explicitly asserts re-enumeration + terminal re-check + render model refresh

**Hidden info tests (using Fixture A):**
- [x] Hidden information: owner zone tokens only visible to owning player
- [x] Hidden information: opponent's owner zone shows hiddenTokenCount but no token details

**Terminal tests:**
- [x] Terminal state detection updates render model with terminal info and lifecycle = 'terminal'

**Error tests:**
- [x] Error handling: illegal move produces error state with `ILLEGAL_MOVE` code
- [x] `clearError()` resets error to null

**Lifecycle tests:**
- [x] Game lifecycle transitions include an assertion for the `initializing` intermediate state

**State metadata tests (using Fixture B):**
- [x] Markers render correctly from state.markers + def.markerLattices
- [x] Global markers render correctly from state.globalMarkers + def.globalMarkerLattices
- [x] Tracks render with current values from variables
- [x] Active lasting effects render with card titles
- [x] Interrupt stack renders and isInInterrupt flag is correct
- [x] Event deck state (deck size, discard size, current card) renders correctly

**Action grouping tests:**
- [x] Move grouping: moves with actionClass group correctly; ungrouped moves go to "Actions"

## Acceptance Criteria

### Tests that must pass

- `pnpm -F @ludoforge/runner test` passes after adding the missing coverage above.
- No regressions in existing `derive-render-model-*` and `game-store.test.ts` cases.
- New tests are narrowly additive; no broad fixture rewrite.

### Invariants

- Tests use in-memory bridge (`createGameWorker()` directly), not a real Web Worker
- Tests do not depend on production `data/<game>` artifacts
- Each test is independent — no shared mutable state between tests
- `PlayerId` is branded number throughout test assertions
- All assertions verify structural properties of `RenderModel`, not implementation details
- No engine source files modified
- No flaky tests — all operations are synchronous (in-memory bridge)

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Extended `packages/runner/test/store/game-store.test.ts` with D11-missing integration coverage (`chooseN`, `cancelMove`, `confirmMove` trace/trigger payloads, explicit undo re-query checks, lifecycle `initializing` assertion).
  - Fixed a store derivation bug in `packages/runner/src/store/game-store.ts` where `null` patch values were being dropped by nullish-coalescing during render-model derivation input assembly.
- **Deviation vs original ticket**:
  - Did not create `game-store-integration.test.ts` or `integration-fixtures.ts`; retained existing architecture split between store-flow tests and pure render-model derivation tests.
  - Included a targeted runner store fix uncovered by TDD while adding the undo/render-model regression test.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
