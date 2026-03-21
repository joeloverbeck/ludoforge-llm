# 74VISMAPLAYEDI-001: Session State Machine — Add `mapEditor` Screen

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The runner's session state machine has no `'mapEditor'` screen. Before any editor UI can render, the state machine must support transitioning to and from the map editor.

## Assumption Reassessment (2026-03-21)

1. `AppScreen` is a string union: `'gameSelection' | 'preGameConfig' | 'activeGame' | 'replay'` in `session-types.ts`. Confirmed.
2. `SessionState` is a discriminated union with `screen` as discriminant. Each variant carries its own fields (e.g., `gameId`, `seed`). Confirmed.
3. `session-store.ts` enforces transitions via `assertTransitionAllowed()` and typed expect functions. Confirmed.
4. `App.tsx` switches on `sessionState.screen` to render screen components. Confirmed.

## Architecture Check

1. Adding `'mapEditor'` to the discriminated union follows the exact pattern of existing screens (`preGameConfig`, `activeGame`, `replay`).
2. No engine changes — purely runner session state (Foundation 1 preserved).
3. No backwards-compatibility shims — new union member, no fallback (Foundation 9).

## What to Change

### 1. Extend `AppScreen` and `SessionState` unions

In `session-types.ts`:
- Add `'mapEditor'` to the `AppScreen` type union
- Add `MapEditorState` interface: `{ readonly screen: 'mapEditor'; readonly gameId: string }`
- Add `MapEditorState` to the `SessionState` discriminated union

### 2. Add transitions to `session-store.ts`

- Add `openMapEditor(gameId: string)` action — requires current screen is `'gameSelection'`, transitions to `{ screen: 'mapEditor', gameId }`
- Extend `returnToMenu()` to also allow transition from `'mapEditor'` back to `'gameSelection'`

### 3. Add routing case in `App.tsx`

- Add `case 'mapEditor':` that renders a placeholder `<div>Map Editor: {sessionState.gameId}</div>` (real component wired in 74VISMAPLAYEDI-005)
- Pass `returnToMenu` callback for navigation back

## Files to Touch

- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/session/session-store.ts` (modify)
- `packages/runner/src/App.tsx` (modify)

## Out of Scope

- MapEditorScreen component (74VISMAPLAYEDI-005)
- GameSelectionScreen "Edit Map" button (74VISMAPLAYEDI-005)
- Editor Zustand store (74VISMAPLAYEDI-002)
- Editor canvas (74VISMAPLAYEDI-003)
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `openMapEditor('fire-in-the-lake')` from `'gameSelection'` produces `{ screen: 'mapEditor', gameId: 'fire-in-the-lake' }`.
2. Unit test: `returnToMenu()` from `'mapEditor'` produces `{ screen: 'gameSelection' }`.
3. Unit test: `openMapEditor()` from `'activeGame'` throws (invalid transition).
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All existing session transitions remain unchanged.
2. `SessionState` discriminated union remains exhaustive — TypeScript `switch` on `screen` compiles without `default` case warnings.
3. No runtime behavior change for existing screens.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/session/session-store.test.ts` — add tests for `openMapEditor` and `returnToMenu` from `mapEditor`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`
