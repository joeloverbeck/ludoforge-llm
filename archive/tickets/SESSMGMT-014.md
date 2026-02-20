# SESSMGMT-014: Event Log Panel UI (Spec 43 D7 — UI layer)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-013

## Problem

SESSMGMT-013 introduced `translateEffectTrace()` and `EventLogEntry` records, but the runner still has no event-log surface in the active game/replay UI. We need a panel that makes trace output inspectable without coupling game logic, rendering internals, or game-specific IDs into UI behavior.

## Assumption Reassessment (2026-02-20)

1. `translateEffectTrace()` already exists at `packages/runner/src/model/translate-effect-trace.ts` with `EventLogEntry.depth`, `moveIndex`, `zoneIds`, and `tokenIds`; this ticket should not redefine translation contracts.
2. The current UI composition is `GameContainer` + `UIOverlay` region slots. There is no `Toolbar.tsx` integration point for session-level panel toggles in this area. Session buttons (`Save`, `Load`, `Quit`) are rendered directly from `GameContainer` top-bar content.
3. The keyboard path is coordinated via `createKeyboardCoordinator()` and `useKeyboardShortcuts()`; adding panel toggle logic should happen in UI layer (GameContainer-level handler), not by mutating low-level coordinator internals.
4. There is no existing generic "highlight arbitrary `zoneIds`/`tokenIds` from UI" action in `GameStore`. Canvas click dispatch currently maps to `chooseOne()` for move construction (`dispatchCanvasSelection`).
5. Replay uses `ReplayScreen` + `GameContainer` (read-only) and hydrates `effectTrace`/`triggerFirings` per replay step. Event-log accumulation for replay should subscribe to these state updates, not assume a separate replay-specific event log source.
6. `GameStore` does not expose a canonical `moveIndex` counter. For panel grouping, move index must be locally tracked in the panel integration layer as traces are observed.

## Architecture Check

1. A dedicated `EventLogPanel` component plus a thin GameContainer integration layer is better than scattering trace formatting or log state through existing panels. This keeps rendering concerns local and testable.
2. Event-log state should be derived from store outputs (`effectTrace`, `triggerFirings`, `gameDef`, visual config) and stay local to GameContainer. This avoids polluting global/session stores with transient display state.
3. Clicking entries to force canvas highlight is **not** a clean fit with current architecture because no generic highlight action exists and adding one would cut across render-model derivation, canvas interaction, and store action contracts. This ticket keeps the panel read-only/passive.
4. No backward-compatibility aliases should be introduced. We use current contracts directly and fail fast if trace/store shapes change.

## What to Change

### 1. Create `packages/runner/src/ui/EventLogPanel.tsx`

Implement a collapsible, scrollable side-panel component (using existing panel conventions) that supports:

- Rendering `EventLogEntry[]` with deterministic test IDs.
- Grouping by `moveIndex` with move separators/labels.
- Filter toggles for `movement`, `variable`, `trigger`, `phase`, `token`, `lifecycle`.
- Nested visual treatment for trigger entries with `depth > 0` and per-move expand/collapse support for trigger-depth rows.
- Empty state: `No events yet`.
- Auto-scroll to bottom when new visible entries arrive, with user scroll-lock (pause while user is scrolled up; resume at bottom).

### 2. Create `packages/runner/src/ui/EventLogPanel.module.css`

Style for:

- Scroll container and list rows.
- Move group separators.
- Filter controls.
- Nested trigger depth indentation.
- Collapsible trigger-group control styling.

### 3. Integrate in `packages/runner/src/ui/GameContainer.tsx`

- Add `EventLogPanel` into the side-panel region (with other sidebar panels).
- Add GameContainer-local state to accumulate event entries from store updates:
  - Subscribe to `effectTrace` / `triggerFirings` updates.
  - Translate with `translateEffectTrace()` and append entries.
  - Maintain local move counter for grouping.
  - Skip appending when both trace arrays are empty.
- Reset local event log when the `store` instance changes.
- Add top-bar toggle button for panel visibility (next to existing session controls).
- Add `L` keyboard shortcut in GameContainer (UI-layer coordinator registration) to toggle panel visibility in both active and replay containers while ignoring editable targets.

### 4. Add tests

- `packages/runner/test/ui/EventLogPanel.test.tsx` (new)
- `packages/runner/test/ui/GameContainer.test.ts` (extend for integration assertions)

## Files to Touch

- `packages/runner/src/ui/EventLogPanel.tsx` (new)
- `packages/runner/src/ui/EventLogPanel.module.css` (new)
- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/src/ui/GameContainer.module.css` (button style and/or layout updates)
- `packages/runner/test/ui/EventLogPanel.test.tsx` (new)
- `packages/runner/test/ui/GameContainer.test.ts` (modified)

## Out of Scope

- Any change to trace translation contracts or message wording (SESSMGMT-013 scope).
- Token-type display-name enhancements (SESSMGMT-015).
- GameStore/canvas API expansion for generic external highlight dispatch.
- Replay controller/store API changes.
- Save/load/session-router behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. **Renders entries**: Panel renders translated entries/messages.
2. **Move grouping**: Entries are grouped by `moveIndex` with visible move separators.
3. **Auto-scroll + lock**: Panel auto-scrolls on new entries only when at bottom; lock engages when user scrolls up and resumes at bottom.
4. **Filter toggles**: Disabling a kind hides matching entries.
5. **Trigger nesting/collapse**: `depth > 0` trigger entries render nested and can be collapsed/expanded by move group.
6. **Visibility toggle (button)**: Top-bar button shows/hides panel.
7. **Visibility toggle (keyboard)**: `L` key toggles panel visibility (ignores editable targets).
8. **Empty state**: Panel shows `No events yet` when no entries are available.
9. **Runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Event log panel is passive/read-only and does not mutate game state.
2. Filter state is local to panel UI.
3. Panel state is reset when runtime/store instance changes.
4. CSS is module-scoped and does not leak global styles.
5. No game-specific identifiers or branches are introduced in panel logic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/EventLogPanel.test.tsx` — panel rendering, grouping, filtering, nesting/collapse, empty state, auto-scroll/scroll-lock behavior.
2. `packages/runner/test/ui/GameContainer.test.ts` — integration coverage for event-log accumulation + visibility toggles (button/keyboard) and panel presence in side region.

### Commands

1. `pnpm -F @ludoforge/runner test -- EventLogPanel`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-20
- Implemented:
  - Added `packages/runner/src/ui/EventLogPanel.tsx` and `packages/runner/src/ui/EventLogPanel.module.css`.
  - Integrated event-log accumulation and panel visibility controls into `packages/runner/src/ui/GameContainer.tsx`.
  - Added top-bar event-log toggle button and `L` keyboard shortcut toggle in `GameContainer`.
  - Added `packages/runner/test/ui/EventLogPanel.test.tsx` and extended `packages/runner/test/ui/GameContainer.test.ts`.
- Deviations from original plan:
  - Removed clickable trace-entry highlight behavior from scope; current architecture has no generic external highlight API and this ticket kept the panel passive/read-only.
  - Integrated panel toggle into `GameContainer` top-bar controls (current architecture) rather than `Toolbar.tsx`.
- Verification:
  - `pnpm -F @ludoforge/runner test -- EventLogPanel` passed.
  - `pnpm -F @ludoforge/runner test -- GameContainer` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` fails due to pre-existing unrelated test typing issues in `test/replay/replay-store.test.ts`, `test/session/replay-runtime.test.tsx`, and `test/ui/SaveGameDialog.test.tsx`.
