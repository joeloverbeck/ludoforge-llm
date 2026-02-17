# REACTUI-009: PhaseIndicator and TurnOrderDisplay

**Spec**: 39 (React DOM UI Layer) — Deliverables D8, D9
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create the two always-visible top bar components: PhaseIndicator (shows current phase and active player) and TurnOrderDisplay (shows the turn order with active player highlighted and eliminated players muted).

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/PhaseIndicator.tsx` | Phase name + active player display |
| `packages/runner/src/ui/PhaseIndicator.module.css` | Top bar phase styling |
| `packages/runner/src/ui/TurnOrderDisplay.tsx` | Horizontal player list with active/eliminated states |
| `packages/runner/src/ui/TurnOrderDisplay.module.css` | Player indicator styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount PhaseIndicator + TurnOrderDisplay in the top bar region |

---

## Detailed Requirements

### PhaseIndicator (D8)

- **Store selector**: reads `renderModel.phaseName`, `renderModel.phaseDisplayName`, `renderModel.activePlayerID`, `renderModel.players`.
- Always renders (every game has phases).
- Displays `phaseDisplayName` (or `phaseName` as fallback) prominently.
- Shows the active player's `displayName` and faction color.
- Faction color applied via inline `style` using the player's `factionId` mapped to `--faction-N` CSS vars.
- Compact: horizontal layout, fits in top bar alongside TurnOrderDisplay.

### TurnOrderDisplay (D9)

- **Store selector**: reads `renderModel.turnOrder`, `renderModel.players`, `renderModel.activePlayerID`.
- Always renders.
- Shows `turnOrder` as a horizontal list of player indicator chips.
- Each chip shows `player.displayName` (abbreviated if needed).
- Active player: highlighted border or background emphasis.
- Eliminated players (`isEliminated === true`): muted color, optional strikethrough or crossed-out visual.
- Compact: fits beside PhaseIndicator in the top bar.

---

## Out of Scope

- Interrupt banner (REACTUI-012)
- Event deck panel (REACTUI-012)
- Turn order animation on changes (Spec 40)
- Faction color overrides from visual config (Spec 42)
- Mobile-responsive layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Renders phase display name |
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Shows active player display name |
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Applies faction color to active player indicator |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Renders all players from turnOrder |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Active player has highlighted styling |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Eliminated player has muted/strikethrough styling |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Player count matches turnOrder length |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Player names and phase names come from RenderModel.
- Faction color is applied via CSS custom properties (`--faction-0`, etc.) — not hardcoded hex values.
- Inline styles are used ONLY for dynamic faction color binding.
- Both components have `pointer-events: auto` only on interactive elements (none here — these are display-only).
