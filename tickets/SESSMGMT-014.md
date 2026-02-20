# SESSMGMT-014: Event Log Panel UI (Spec 43 D7 — UI layer)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: SESSMGMT-013

## Problem

The translated event log entries (SESSMGMT-013) need a scrollable, filterable UI panel that integrates with the existing DOM UI layer.

## What to Change

### 1. Create `packages/runner/src/ui/EventLogPanel.tsx`

- Scrollable log of `EventLogEntry[]`, grouped by move index.
- **Auto-scrolls** to latest entry (with scroll-lock when user scrolls up manually).
- **Clickable events**: Clicking an entry dispatches highlight for its `zoneIds`/`tokenIds` on the canvas (integrates with existing canvas selection/highlight system from Spec 38).
- **Filter by event kind**: Toggle buttons for `movement`, `variable`, `trigger`, `phase`, `token`, `lifecycle`.
- **Collapsible trigger chains**: Entries with `depth > 0` are visually nested under their parent. Expandable/collapsible groups.
- **Move grouping**: Visual separator between moves with move number label ("Move 15", "Move 16").

### 2. Create `packages/runner/src/ui/EventLogPanel.module.css`

### 3. Integrate with GameContainer

- Add `EventLogPanel` as a new panel in the DOM UI layer (sibling to scoreboard, variables, hand panels).
- Panel visibility toggled via toolbar button or keyboard shortcut (e.g., `L` key).
- Panel can be collapsed/expanded like other sidebar panels.

### 4. Feed event log data

- In `GameContainer` (or a parent component), after each move's effect trace is received, call `translateEffectTrace()` and accumulate `EventLogEntry[]` in component state or a dedicated store.
- During replay, entries are accumulated as moves are replayed.

## Files to Touch

- `packages/runner/src/ui/EventLogPanel.tsx` (new)
- `packages/runner/src/ui/EventLogPanel.module.css` (new)
- `packages/runner/src/ui/GameContainer.tsx` (add EventLogPanel to DOM UI overlay)
- `packages/runner/src/input/keyboard-coordinator.ts` (add `L` key or similar for toggle)
- `packages/runner/test/ui/EventLogPanel.test.tsx` (new)

## Out of Scope

- Effect trace translation logic (done in SESSMGMT-013)
- Token type `displayName` in visual config (SESSMGMT-015)
- Replay controller (SESSMGMT-011, 012)
- Save/load (SESSMGMT-009, 010)
- Session router or store changes
- Canvas rendering changes (uses existing highlight/selection APIs)

## Acceptance Criteria

### Tests That Must Pass

1. **Renders entries**: Given a list of `EventLogEntry[]`, the panel renders each entry with its message.
2. **Move grouping**: Entries are grouped by `moveIndex` with visible separators.
3. **Auto-scroll**: When new entries are added, the panel scrolls to the bottom.
4. **Scroll lock**: When user scrolls up, auto-scroll is paused. When user scrolls back to bottom, auto-scroll resumes.
5. **Filter toggles**: Toggling off `movement` hides all `kind === 'movement'` entries.
6. **Collapsible triggers**: Entries with `depth > 0` are nested and can be expanded/collapsed.
7. **Click highlight**: Clicking an entry with `zoneIds` dispatches a canvas highlight for those zones.
8. **Toggle visibility**: Panel can be shown/hidden via toolbar button.
9. **Empty state**: Panel shows "No events yet" when entry list is empty.
10. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Event log panel does not block game interaction — it's a passive display.
2. Filter state is local to the panel — does not affect game state or other panels.
3. Auto-scroll only engages when the user is at the bottom of the scroll area.
4. Clicking an entry for highlight does not navigate or change game state.
5. Panel respects CSS module scoping — no style leaks.
6. Panel works in both active game and replay modes.
