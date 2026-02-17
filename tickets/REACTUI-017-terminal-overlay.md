# REACTUI-017: TerminalOverlay

**Spec**: 39 (React DOM UI Layer) — Deliverable D20
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the TerminalOverlay that appears when a game ends (`terminal !== null`). Displays game results based on terminal type (win, draw, score, lossAll) with a "New Game" button.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/TerminalOverlay.tsx` | Game-end result display |
| `packages/runner/src/ui/TerminalOverlay.module.css` | Overlay styling: semi-transparent backdrop, result card |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount TerminalOverlay in the floating region |

---

## Detailed Requirements

- **Store selector**: reads `renderModel.terminal`, `renderModel.players`.
- **Displayed when**: `terminal !== null`.
- **Result rendering by type**:
  - `type === 'win'`: winner name (resolved from `players` via `terminal.player`), victory message, faction color, optional ranking from `victory.ranking`.
  - `type === 'draw'`: draw message.
  - `type === 'score'`: ranked player scores from `terminal.ranking`, showing player name + score, ordered by rank.
  - `type === 'lossAll'`: loss message.
- **"New Game" button**: for now, calls `window.location.reload()` (game selection UI is Spec 42). Has `pointer-events: auto`.
- **Semi-transparent backdrop**: covers the canvas area, dims the board to emphasize the result. Uses absolute positioning with high z-index (`--z-modal`).
- Centered result card on top of backdrop.

---

## Out of Scope

- Game selection screen (Spec 42)
- Replay mode (Spec 42)
- Save game state on terminal
- Victory animation (Spec 40)
- Score breakdown or detailed statistics
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Not rendered when terminal is null |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Renders win message with winner name for type 'win' |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Renders draw message for type 'draw' |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Renders ranked scores for type 'score' |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Renders loss message for type 'lossAll' |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | "New Game" button is present |
| `packages/runner/test/ui/TerminalOverlay.test.tsx` | Backdrop has semi-transparent styling |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- No game-specific logic. All result text comes from `RenderTerminal` data.
- Player names resolved from `renderModel.players`, not hardcoded.
- Z-index uses `--z-modal` from design tokens.
- Backdrop does NOT capture keyboard events — keyboard shortcuts (REACTUI-018) still function.
- Renders nothing (`null`) when `terminal` is null.
