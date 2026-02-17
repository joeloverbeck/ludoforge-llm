# REACTUI-010: VariablesPanel and Scoreboard

**Spec**: 39 (React DOM UI Layer) — Deliverables D11, D12
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two side panel components for displaying game numeric state: VariablesPanel (global and per-player variables) and Scoreboard (tracks as progress bars).

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/VariablesPanel.tsx` | Global vars + per-player vars display |
| `packages/runner/src/ui/VariablesPanel.module.css` | Variable list styling with change highlight |
| `packages/runner/src/ui/Scoreboard.tsx` | Track progress bars grouped by scope/faction |
| `packages/runner/src/ui/Scoreboard.module.css` | Track bar styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount VariablesPanel + Scoreboard in the side panels region |

---

## Detailed Requirements

### VariablesPanel (D11)

- **Store selector**: reads `renderModel.globalVars`, `renderModel.playerVars`.
- **Renders when**: `globalVars.length > 0` OR `playerVars` has entries.
- **Global variables section**: labeled list of `RenderVariable` items showing `displayName: value`.
- **Per-player section**: collapsible section per player showing their variables. Player identified by ID from `playerVars` keys.
- **Value change highlight**: when a variable value changes, briefly flash/highlight the row (use CSS animation with `@keyframes`, triggered by key change or `useRef` to track previous values).
- Collapsible: the entire panel can be collapsed/expanded via a toggle.

### Scoreboard (D12)

- **Store selector**: reads `renderModel.tracks`.
- **Renders when**: `tracks.length > 0`.
- Each `RenderTrack` rendered as a labeled progress bar:
  - Label: `displayName`
  - Bar: fills from `min` to `max`, with fill width at `(currentValue - min) / (max - min) * 100%`.
  - Shows `currentValue` / `max` as text.
- **Faction-scoped tracks** (`scope === 'faction'`): grouped by `faction` value, with faction color applied to bar fill.
- **Global-scoped tracks** (`scope === 'global'`): shown in a separate section with accent color.
- Collapsible for screen space.

---

## Out of Scope

- Animation on value changes beyond brief CSS flash (Spec 40)
- Variable editing or modification from the UI
- Track history or trend graphs
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/VariablesPanel.test.tsx` | Renders global variables with display name and value |
| `packages/runner/test/ui/VariablesPanel.test.tsx` | Renders per-player variables grouped by player |
| `packages/runner/test/ui/VariablesPanel.test.tsx` | Not rendered when both globalVars and playerVars are empty |
| `packages/runner/test/ui/VariablesPanel.test.tsx` | Collapse toggle hides/shows content |
| `packages/runner/test/ui/Scoreboard.test.tsx` | Renders progress bar for each track |
| `packages/runner/test/ui/Scoreboard.test.tsx` | Progress bar fill width matches `(currentValue - min) / (max - min)` ratio |
| `packages/runner/test/ui/Scoreboard.test.tsx` | Faction-scoped tracks grouped by faction |
| `packages/runner/test/ui/Scoreboard.test.tsx` | Global-scoped tracks in separate section |
| `packages/runner/test/ui/Scoreboard.test.tsx` | Not rendered when tracks array is empty |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Variable names and track names come from RenderModel.
- Faction colors applied via CSS custom properties, not hardcoded.
- Progress bar uses CSS `width` percentage — no canvas or SVG.
- `pointer-events: auto` on interactive elements (collapse toggles).
- Components render nothing (return `null`) when their data is empty.
