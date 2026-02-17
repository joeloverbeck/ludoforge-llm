# REACTUI-014: AITurnOverlay

**Spec**: 39 (React DOM UI Layer) — Deliverable D17
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the AITurnOverlay that appears when it's a non-human player's turn. Shows the AI player's name/faction, a thinking indicator, and a skip button. Replaces ActionToolbar/ChoicePanel in the bottom bar.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/AITurnOverlay.tsx` | AI turn display with skip/speed controls |
| `packages/runner/src/ui/AITurnOverlay.module.css` | Overlay styling: faction border, spinner, controls |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount AITurnOverlay in the bottom bar region |

---

## Detailed Requirements

- **Store selector**: reads `renderModel.activePlayerID`, `renderModel.players`.
- **Visible when**: the active player is not human (`players.find(p => p.id === activePlayerID)?.isHuman === false`).
- **Display**:
  - AI player's `displayName`.
  - Faction color border (from `factionId` mapped to `--faction-N` CSS var).
  - Animated thinking indicator (CSS-only dots or spinner).
- **Controls**:
  - "Skip" button: dispatches immediate move resolution to advance past the AI turn. Uses store's internal AI move resolution (the store already handles AI turns automatically — this button forces immediate resolution).
  - Speed selector: `1x`, `2x`, `4x` buttons stored in **local component state**. (Actual animation speed is a Spec 40 concern, but the control UI lives here.)
- **Bottom bar state machine**: when visible, ActionToolbar and ChoicePanel self-hide (they check `isHuman` already). AITurnOverlay occupies the same bottom bar region.
- `pointer-events: auto` on all interactive controls.

---

## Out of Scope

- Animation speed integration (Spec 40 — speed selector is local state only for now)
- AI move computation logic (handled by worker/store)
- Keyboard shortcut for Space to skip (REACTUI-018)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Renders when active player is not human |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Not rendered when active player is human |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Shows AI player display name |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Shows faction color border |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Shows thinking indicator animation |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Skip button is present and clickable |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | Speed selector buttons are present (1x, 2x, 4x) |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- No game-specific logic. Player names and factions come from RenderModel.
- Speed selector state is **local** to the component — not stored in Zustand.
- Faction color applied via CSS custom property, not hardcoded.
- Thinking indicator uses CSS-only animation — no external animation library.
- Renders nothing (`null`) when active player is human.
