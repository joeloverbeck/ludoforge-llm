# REACTUI-010: VariablesPanel and Scoreboard

**Status**: COMPLETED
**Spec**: 39 (React DOM UI Layer) - Deliverables D11, D12
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two side-panel components for numeric game state display:
- `VariablesPanel`: global and per-player variables
- `Scoreboard`: global and faction tracks as progress bars

Reassessed scope: keep `UIOverlay` as a layout shell and mount side-panel content through an explicit slot, consistent with the existing top/bottom slot composition pattern.

---

## Assumptions Reassessment

- Confirmed: `RenderModel` already exposes `globalVars`, `playerVars`, and `tracks`.
- Confirmed: components should read from Zustand selectors and remain game-agnostic.
- Corrected: `UIOverlay` currently has no side-panel content slot (`sidePanels` region is empty). This ticket must include adding that seam.
- Corrected: runner UI tests in this repo are `*.test.ts` under `packages/runner/test/ui/`, not `*.test.tsx`.
- Corrected: track ratio math needs defensive handling for degenerate ranges (`max <= min`) to avoid invalid `width` values.
- Corrected: component-level faction coloring should use existing CSS-variable/fallback mapping utilities, not new hardcoded mappings.

---

## Architectural Rationale

Proposed changes are an improvement over the current architecture because they:

- preserve shell/component separation: `UIOverlay` remains layout-only while stateful panels are composed from `GameContainer`
- maintain feature symmetry with existing top/bottom slot composition (no ad-hoc mounting logic inside shell)
- keep UI logic generic and data-driven from `RenderModel`
- avoid compatibility aliases and dead API surface; use one explicit side-panel slot contract

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/VariablesPanel.tsx` | Global vars + per-player vars display |
| `packages/runner/src/ui/VariablesPanel.module.css` | Variable list styling + value-change flash |
| `packages/runner/src/ui/Scoreboard.tsx` | Global/faction tracks as progress bars |
| `packages/runner/src/ui/Scoreboard.module.css` | Track group + bar styling |
| `packages/runner/test/ui/VariablesPanel.test.ts` | D11 behavior and invariants |
| `packages/runner/test/ui/Scoreboard.test.ts` | D12 behavior and invariants |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Add side-panel slot for composed content |
| `packages/runner/src/ui/UIOverlay.module.css` | Layout side-panel stack spacing/scroll behavior |
| `packages/runner/src/ui/GameContainer.tsx` | Mount `VariablesPanel` + `Scoreboard` into side slot |
| `packages/runner/src/ui/faction-color-style.ts` | Reuse faction color value derivation for scoreboard bars |
| `packages/runner/test/ui/UIOverlay.test.ts` | Add side-slot rendering coverage |
| `packages/runner/test/ui/GameContainer.test.ts` | Assert D11/D12 side-panel mounting |

---

## Detailed Requirements

### VariablesPanel (D11)

- Store selector: reads `renderModel.globalVars`, `renderModel.playerVars`.
- Renders when: `globalVars.length > 0` OR `playerVars` has entries.
- Global section: labeled list of `displayName: value` rows.
- Per-player section: one collapsible section per player ID key.
- Value-change flash: when an existing variable value changes, row briefly highlights.
- Entire panel is collapsible.
- Returns `null` when no variable data exists.

### Scoreboard (D12)

- Store selector: reads `renderModel.tracks`.
- Renders when: `tracks.length > 0`.
- Each `RenderTrack` renders label, fill bar, and textual value.
- Fill ratio: normalize from `(currentValue - min) / (max - min)` and clamp to `[0, 1]`.
- Degenerate track range (`max <= min`): no divide-by-zero/NaN; render deterministic ratio.
- Faction tracks grouped by faction label and use CSS-variable faction color binding.
- Global tracks rendered in separate section.
- Entire panel is collapsible.
- Returns `null` when no tracks exist.

---

## Out of Scope

- Spec 40 animation work beyond a brief CSS flash
- Variable editing/mutation controls
- Track history or trend graphs
- Mobile-specific layout optimizations

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/VariablesPanel.test.ts` | Renders global variables with display name/value |
| `packages/runner/test/ui/VariablesPanel.test.ts` | Renders per-player variables grouped by player |
| `packages/runner/test/ui/VariablesPanel.test.ts` | Returns `null` when both global/player variables are empty |
| `packages/runner/test/ui/VariablesPanel.test.ts` | Collapse toggle hides/shows panel content |
| `packages/runner/test/ui/VariablesPanel.test.ts` | Value changes trigger highlight class/flag transition |
| `packages/runner/test/ui/Scoreboard.test.ts` | Renders one progress row per track |
| `packages/runner/test/ui/Scoreboard.test.ts` | Fill width matches normalized/clamped ratio |
| `packages/runner/test/ui/Scoreboard.test.ts` | Handles `max <= min` safely (no invalid width) |
| `packages/runner/test/ui/Scoreboard.test.ts` | Faction tracks grouped by faction |
| `packages/runner/test/ui/Scoreboard.test.ts` | Global tracks rendered in separate section |
| `packages/runner/test/ui/Scoreboard.test.ts` | Returns `null` when tracks are empty |
| `packages/runner/test/ui/UIOverlay.test.ts` | Side-panel slot renders provided content |
| `packages/runner/test/ui/GameContainer.test.ts` | D11/D12 mount in side slot during `playing`/`terminal` |

### Invariants

- Components use Zustand selectors and avoid whole-store subscriptions.
- No game-specific logic; labels/values/scopes come from `RenderModel`.
- Faction color uses CSS custom property binding with fallback mapping; no hardcoded colors.
- Progress bars use CSS `width` percentages (no canvas/SVG dependency).
- Interactive controls explicitly use `pointer-events: auto` within overlay regions.
- Components return `null` when their backing data is empty.

---

## Outcome

- **Completed on**: 2026-02-18
- **What changed (implemented)**:
  - Added `VariablesPanel` and `Scoreboard` components with dedicated CSS modules.
  - Added shared `CollapsiblePanel` primitive and migrated both D11/D12 panels to it to remove duplicated collapse-state/view logic.
  - Added explicit `sidePanelContent` slot support to `UIOverlay`.
  - Mounted D11/D12 from `GameContainer` into the side panel region.
  - Added reusable `buildFactionColorValue()` helper and used it for faction track fills.
  - Added new tests: `VariablesPanel.test.ts`, `Scoreboard.test.ts`.
  - Extended existing tests: `UIOverlay.test.ts`, `GameContainer.test.ts`.
- **Deviation from original ticket**:
  - Included defensive ratio handling for degenerate track bounds (`max <= min`) with explicit tests.
  - Included post-implementation architectural hardening by extracting reusable collapsible panel behavior.
  - Included side-panel container CSS adjustments in `UIOverlay.module.css` to support stacked panels cleanly.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo test` passed.
