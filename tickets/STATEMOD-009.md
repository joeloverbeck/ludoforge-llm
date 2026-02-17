# STATEMOD-009: Integration Tests — Full Store + RenderModel Pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D11)
**Deps**: STATEMOD-008 (all prior tickets)

## Objective

Write the full integration test suite from spec D11 — exercising the complete pipeline from `createGameStore(bridge) → initGame → actions → deriveRenderModel` with real compiled GameDefs (both the simple test fixture and, where feasible, production game specs).

## Files to Touch

- `packages/runner/test/store/game-store-integration.test.ts` — **new file**: full pipeline integration tests
- `packages/runner/test/store/integration-fixtures.ts` — **new file**: test fixture helpers (GameDef builders with visibility, markers, tracks, etc.)

## Out of Scope

- Unit tests for individual functions (covered in STATEMOD-002 through STATEMOD-007)
- Store unit tests (covered in STATEMOD-008)
- PixiJS / React rendering tests (Spec 38, 39)
- Animation tests (Spec 40)
- Production FITL/Texas Hold'em spec compilation (only if tests can import compiled defs without circular deps; otherwise use synthetic fixtures)
- Any engine changes

## What to Do

### 1. Create integration test fixtures

Build GameDefs that exercise the full breadth of engine features:

**Fixture A: Visibility fixture** — A 2-player game with:
- A `public` zone (`table`)
- An `owner` zone (`hand`) → expands to `hand:0`, `hand:1`
- A `hidden` zone (`deck`)
- Tokens in all zones
- Used for hidden information tests

**Fixture B: Full-feature fixture** — A 2-player game with:
- Multiple zones with adjacencies
- Markers (space and global) with lattice definitions
- Tracks (global and per-faction)
- Event deck with cards
- Multiple actions with different `actionClass` values
- Multi-step choice parameters
- Terminal condition reachable within a few moves

Use `compileGameSpecToGameDef(createEmptyGameSpecDoc())` pattern from existing test fixtures, extended with the needed features.

### 2. Integration test cases (from D11)

Each test creates a store with a mock bridge (in-memory `createGameWorker()`), calls `store.getState().initGame(...)`, and asserts on the resulting state.

**Core flow tests:**
- [ ] `initGame()` populates store with initial state, legal moves, render model, and lifecycle = 'playing'
- [ ] `selectAction()` updates action selection and resets choice state
- [ ] `makeChoice()` progresses through multi-step choice chain
- [ ] `makeChoice()` supports `chooseN` multi-selection with min/max
- [ ] `cancelChoice()` steps back one choice in the breadcrumb
- [ ] `cancelMove()` resets to action selection
- [ ] `confirmMove()` calls bridge.applyMove, updates state, trace, trigger firings, and render model

**Undo tests:**
- [ ] `undo()` restores previous state, re-enumerates legal moves, re-checks terminal, and recomputes render model

**Hidden info tests (using Fixture A):**
- [ ] Hidden information: owner zone tokens only visible to owning player
- [ ] Hidden information: opponent's owner zone shows hiddenTokenCount but no token details

**Terminal tests:**
- [ ] Terminal state detection updates render model with terminal info and lifecycle = 'terminal'

**Error tests:**
- [ ] Error handling: illegal move produces error state with `ILLEGAL_MOVE` code
- [ ] `clearError()` resets error to null

**Lifecycle tests:**
- [ ] Game lifecycle transitions: idle → initializing → playing → terminal

**State metadata tests (using Fixture B):**
- [ ] Markers render correctly from state.markers + def.markerLattices
- [ ] Global markers render correctly from state.globalMarkers + def.globalMarkerLattices
- [ ] Tracks render with current values from variables
- [ ] Active lasting effects render with card titles (if fixture includes lasting effects in state)
- [ ] Interrupt stack renders and isInInterrupt flag is correct (if fixture includes interrupt state)
- [ ] Event deck state (deck size, discard size, current card) renders correctly

**Action grouping tests:**
- [ ] Move grouping: moves with actionClass group correctly; ungrouped moves go to "Actions"

## Acceptance Criteria

### Tests that must pass

All test cases listed in section 2 above. The full list maps 1:1 to spec D11.

### Invariants

- Tests use in-memory bridge (`createGameWorker()` directly), not a real Web Worker
- Tests do NOT import from production game data files — all fixtures are self-contained
- Each test is independent — no shared mutable state between tests
- `PlayerId` is branded number throughout test assertions
- All assertions verify structural properties of `RenderModel`, not implementation details
- No engine source files modified
- No flaky tests — all operations are synchronous (in-memory bridge)
