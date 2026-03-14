# 62BINCCHOPRO-007: Runner ChoicePanel — render engine-owned selections and issue incremental commands

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: tickets/62BINCCHOPRO-006.md, archive/tickets/62BINCCHOPRO-001.md

## Problem

The ChoicePanel currently manages `chooseN` multi-select state locally (React `useState` or equivalent) and submits a completed array through the store's `chooseN(fullArray)` action. With the incremental protocol, the panel must instead render `pending.selected` from the engine-returned `ChoicePendingRequest` and issue `addChooseNItem` / `removeChooseNItem` / `confirmChooseN` commands through the store.

## Assumption Reassessment (2026-03-14)

1. ChoicePanel is at `packages/runner/src/ui/ChoicePanel.tsx`. Confirmed.
2. It renders `choicePending` from the Zustand store and calls `chooseN(selectedValues)` on submission. Confirmed.
3. It manages local multi-select state for `chooseN` (tracking which items the user has clicked before submitting). Confirmed.
4. `chooseOne` handling in the panel is separate and unaffected. Confirmed.
5. The panel renders `options` with legality indicators (legal/illegal/unknown). Confirmed.

## Architecture Check

1. The panel stops owning local multi-select state for `chooseN`. Selection state comes from `choicePending.selected`.
2. Clicking an unselected legal item calls `store.addChooseNItem(value)`. Clicking a selected item calls `store.removeChooseNItem(value)`.
3. The confirm button is enabled/disabled based on `choicePending.canConfirm`. Clicking confirm calls `store.confirmChooseN()`.
4. Options legality (legal/illegal) is driven by the engine-returned `options` array in the pending request — no local legality derivation.
5. `chooseOne` rendering and submission remain unchanged.

## What to Change

### 1. Remove local multi-select state for `chooseN`

Remove any `useState` or equivalent that tracks selected items locally for `chooseN`. The source of truth is now `choicePending.selected`.

### 2. Render selected state from `choicePending.selected`

Display which items are currently selected using `choicePending.selected` from the store. Visually distinguish selected items (e.g., highlighted, checkmark, moved to a "selected" section).

### 3. Issue incremental commands on user interaction

- Click unselected legal item → `store.addChooseNItem(value)`
- Click selected item → `store.removeChooseNItem(value)`
- Click confirm button → `store.confirmChooseN()`

### 4. Use `canConfirm` for confirm button state

Enable the confirm button only when `choicePending.canConfirm === true`.

### 5. Preserve `chooseOne` behavior

`chooseOne` rendering and submission are completely unchanged.

## Files to Touch

- `packages/runner/src/ui/ChoicePanel.tsx` (modify — replace local state with engine-driven state)
- `packages/runner/test/ui/ChoicePanel.test.tsx` (modify — update tests for incremental protocol)

## Out of Scope

- Store action implementation (ticket 62BINCCHOPRO-006)
- Worker/bridge implementation (ticket 62BINCCHOPRO-005)
- Engine kernel changes (tickets 62BINCCHOPRO-001 through -004)
- Per-piece animation (future enhancement — this ticket enables it but doesn't implement animation)
- `chooseOne` panel behavior — unchanged
- Visual design changes beyond functional requirements (styling is existing)
- Accessibility changes beyond functional requirements

## Acceptance Criteria

### Tests That Must Pass

1. Panel renders items from `choicePending.options` with correct legality indicators
2. Panel renders currently selected items from `choicePending.selected` (not local state)
3. Clicking an unselected legal item calls `store.addChooseNItem(value)`
4. Clicking a selected item calls `store.removeChooseNItem(value)`
5. Clicking an illegal/disabled item does nothing
6. Confirm button is enabled when `choicePending.canConfirm === true`
7. Confirm button is disabled when `choicePending.canConfirm === false`
8. Clicking confirm calls `store.confirmChooseN()`
9. No local `useState` for multi-select tracking in `chooseN` mode
10. `chooseOne` behavior is completely unchanged
11. `pnpm -F @ludoforge/runner typecheck` succeeds
12. `pnpm -F @ludoforge/runner test` — no regressions

### Invariants

1. The panel never locally tracks `chooseN` selection state — `choicePending.selected` is the only source of truth
2. The panel never locally computes legality — `choicePending.options` legality is authoritative
3. The panel never locally computes confirm eligibility — `choicePending.canConfirm` is authoritative
4. `chooseOne` flow is completely unchanged
5. No game-specific identifiers in panel code

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ChoicePanel.test.tsx` — all acceptance criteria scenarios

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
