# REACTUI-017: TerminalOverlay

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverable D20
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create a game-end `TerminalOverlay` that appears when `renderModel.terminal !== null`. The overlay displays terminal results (`win`, `draw`, `score`, `lossAll`) and includes a "New Game" button.

---

## Assumption Reassessment (Current Code vs Ticket)

- `UIOverlay` is a presentational slot component and remains generic. Floating overlays are composed in `GameContainer`.
- `RenderTerminal` currently provides these shapes:
  - `win`: `player`, `message`, optional `victory` (with optional `ranking`)
  - `draw`: `message`
  - `score`: `message`, `ranking[]`
  - `lossAll`: `message`
- Player name/faction resolution uses `renderModel.players` and handles missing player IDs.
- Existing test architecture is split between component tests and container-composition tests (`GameContainer`), so both levels are covered.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/TerminalOverlay.tsx` | Game-end result display |
| `packages/runner/src/ui/TerminalOverlay.module.css` | Overlay styling: backdrop + centered result card |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Unit/component coverage for terminal rendering + CSS contracts |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Mount `TerminalOverlay` in floating region composition |
| `packages/runner/test/ui/GameContainer.test.ts` | Assert `TerminalOverlay` is mounted in playing/terminal overlay composition |

---

## Detailed Requirements

- **Store selectors**: `TerminalOverlay` reads minimum required state (`renderModel.terminal`, `renderModel.players`).
- **Displayed when**: `terminal !== null`; otherwise returns `null`.
- **Result rendering by type**:
  - `type === 'win'`: show winner display name (resolved from `players` via `terminal.player`), terminal message, optional victory ranking rows.
  - `type === 'draw'`: show draw message.
  - `type === 'score'`: show ranked scores from `terminal.ranking` in order, with player display names.
  - `type === 'lossAll'`: show loss message.
- **Faction color usage**: winner styling reuses existing UI faction-color helper patterns; no bespoke hardcoded color logic.
- **"New Game" action**: defaults to `window.location.reload()` and supports injected callback (`onNewGame`) for testability/future session-management integration.
- **Backdrop**: full overlay region dimmer with modal z-layer (`--z-modal`) and centered result card.
- **Pointer events**: compatible with current pointer-events model (`UIOverlay` root non-interactive, overlay controls interactive).

---

## Out of Scope

- Game selection/session management (Spec 42)
- Replay mode (Spec 42)
- Save game state on terminal
- Victory animation (Spec 40)
- Score breakdown or detailed statistics
- Mobile-specific layout optimization

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Returns `null` when terminal is `null` |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Renders win state with resolved winner name + message |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Falls back to player-id label when winner is absent from player list |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Renders draw state message |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Renders score ranking rows in provided order |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Renders loss-all message |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | Renders optional victory ranking when present |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | New Game button triggers injected new-game callback |
| `packages/runner/test/ui/TerminalOverlay.test.ts` | CSS contract includes modal z-layer and semi-transparent backdrop |
| `packages/runner/test/ui/GameContainer.test.ts` | Floating overlay composition includes `TerminalOverlay` |

### Invariants

- Uses Zustand selectors; does not subscribe to the entire store.
- No game-specific logic; output is derived from `RenderTerminal` + `RenderPlayer` data.
- Player names are resolved from `renderModel.players`, never hardcoded.
- Overlay layering uses design tokens (`--z-modal`).
- Overlay remains keyboard-shortcut compatible (REACTUI-018).

---

## Outcome

**Completed**: 2026-02-18

- Implemented `TerminalOverlay` with variant-specific rendering for `win`, `draw`, `score`, and `lossAll` terminal types.
- Mounted `TerminalOverlay` in `GameContainer` floating composition (instead of changing `UIOverlay` slots), preserving clean container/presentational boundaries.
- Added robust test coverage in `TerminalOverlay.test.ts` and updated `GameContainer.test.ts` to verify integration.
- Strengthened edge-case handling by adding fallback winner-name rendering when terminal player IDs do not match current player list.
- Minor deviation from original ticket wording: introduced optional `onNewGame` callback on `TerminalOverlay` while keeping default reload behavior; this improves testability and future extensibility for Spec 42 session flows.

**Verification results**:
- `pnpm -F @ludoforge/runner test` ✅
- `pnpm -F @ludoforge/runner lint` ✅
- `pnpm -F @ludoforge/runner typecheck` ✅
