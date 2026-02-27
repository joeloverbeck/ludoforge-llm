# FITLDATA-001: Isolate FITL `distributeTokens` GameSpecDoc Refactors from Engine Contract Changes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — GameSpecDoc data refactor + integration assertion hardening
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

GameSpecDoc event content refactors (explicit `chooseN+forEach+chooseOne` chains rewritten to `distributeTokens`) were mixed into engine-architecture work without a dedicated ticket. This reduces traceability and makes behavior regressions harder to isolate. Some integration tests also remained coupled to compiler-internal naming details.

## Assumption Reassessment (2026-02-27)

1. FITL GameSpecDoc currently includes refactors from manual selection loops to `distributeTokens` for specific cards.
2. The semantic change belongs to game-specific data authoring, not engine-generic contract logic.
3. Mismatch: refactor was not explicitly tracked as a data ticket; corrected scope is to track and verify it as a dedicated content change with behavior-focused assertions.

## Architecture Check

1. Separating game data evolution tickets from engine architecture tickets yields cleaner ownership and safer rollback.
2. This preserves boundary rules: GameSpecDoc holds game-specific behavior/data; GameDef/simulator remain agnostic.
3. No backwards-compatibility aliases/shims; data should represent intended semantics directly.

## What to Change

### 1. Keep FITL content refactor in a dedicated data ticket

Track changed cards and intended semantics explicitly (selection cardinality, per-token destination decisions, and movement effects).

### 2. Harden integration assertions toward behavior, not compiler internals

Ensure FITL integration tests validate:
- pending choice types and option sets,
- resulting state transitions,
- structural effect relationships where needed (forEach over chooseN bind),
while avoiding brittle dependence on synthetic binder naming conventions.

### 3. Record explicit verification expectations

Require targeted FITL integration coverage and full engine suite pass tied to this content change.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify)

## Out of Scope

- Kernel/runtime semantics changes.
- Visual presentation config changes (`visual-config.yaml`).

## Acceptance Criteria

### Tests That Must Pass

1. Refactored FITL cards preserve intended gameplay semantics under integration tests.
2. Integration assertions no longer depend on fragile compiler-generated binder name literals.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Game-specific behavior remains encoded in GameSpecDoc data, not engine branching.
2. Engine/runtime remains game-agnostic with no FITL-specific logic added.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — behavior-first validation for card-1 decision flow and outcomes.
2. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — behavior/structure validation for card-2 shaded flow after `distributeTokens` adoption.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`
4. `pnpm -F @ludoforge/engine test`
