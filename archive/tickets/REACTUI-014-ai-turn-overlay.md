# REACTUI-014: AITurnOverlay

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverable D17
**Priority**: P2
**Depends on**: REACTUI-003, REACTUI-023
**Estimated complexity**: S

---

## Summary

Create the `AITurnOverlay` that appears when it's a non-human player's turn. It replaces the bottom-bar interactive branch and shows AI turn context (player name/faction), a thinking indicator, and controls for immediate turn resolution and local speed UI state.

---

## Assumptions Reassessment (2026-02-18)

- `packages/runner/src/ui/AITurnOverlay.tsx` and `packages/runner/src/ui/AITurnOverlay.module.css` do not exist yet.
- `packages/runner/src/ui/GameContainer.tsx` already owns bottom-bar orchestration (`deriveBottomBarState`) and currently renders `null` in `aiTurn` mode.
- The original assumption that "the store already handles AI turns automatically and skip just forces immediate resolution" is incorrect in current code:
  - `packages/runner/src/store/game-store.ts` has no AI-turn resolver action.
  - Existing actions are human flow (`selectAction` / `chooseOne` / `chooseN` / `confirmMove` / `undo`) with no automatic non-human progression path.
- Existing tests in `packages/runner/test/ui/GameContainer.test.ts` encode the old behavior ("no interactive branch in aiTurn mode"), so those tests must be updated to the new branch owner (`AITurnOverlay`) instead of maintaining stale expectations.

These discrepancies require ticket scope updates below before implementation.

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
| `packages/runner/src/ui/GameContainer.tsx` | Mount AITurnOverlay in the bottom bar `aiTurn` branch |
| `packages/runner/src/store/game-store.ts` | Add store-owned AI turn resolution action used by Skip |
| `packages/runner/test/ui/GameContainer.test.ts` | Replace old `aiTurn`-null assertions with `AITurnOverlay` branch assertions |
| `packages/runner/test/store/game-store.test.ts` | Add coverage for AI turn resolution semantics |
| `packages/runner/test/ui/AITurnOverlay.test.tsx` | New component-level test coverage |

---

## Detailed Requirements

- **Store selector**: `AITurnOverlay` reads `renderModel.activePlayerID`, `renderModel.players`.
- **Visible when**: `GameContainer`-owned bottom-bar state resolves to `aiTurn` (single-source orchestration from REACTUI-023).
- **Display**:
  - AI player's `displayName`.
  - Faction color border (from `factionId` mapped to `--faction-N` CSS var).
  - Animated thinking indicator (CSS-only dots or spinner).
- **Controls**:
  - "Skip" button: dispatches a **store action** that resolves non-human turns immediately until the next human turn or terminal state.
  - The AI turn resolver must be store-owned (not component-owned) so orchestration stays centralized and reusable for future keyboard shortcut wiring (REACTUI-018).
  - Speed selector: `1x`, `2x`, `4x` buttons stored in **local component state**. (Actual animation speed is a Spec 40 concern, but the control UI lives here.)
- **Bottom bar state machine**: `GameContainer` renders exactly one bottom-bar branch. `AITurnOverlay` occupies the `aiTurn` branch and does not rely on child component self-hide logic.
- `pointer-events: auto` on all interactive controls.

---

## Out of Scope

- Animation speed integration (Spec 40 — speed selector is local state only for now)
- New AI policy configurability (`ai-random` vs `ai-greedy`) beyond existing seat metadata
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
| `packages/runner/test/store/game-store.test.ts` | `resolveAiTurn()` advances through non-human turns to human/terminal |
| `packages/runner/test/store/game-store.test.ts` | `resolveAiTurn()` no-ops safely on human turn, null render model, or no legal moves |
| `packages/runner/test/ui/GameContainer.test.ts` | `aiTurn` branch mounts `AITurnOverlay` and preserves precedence over choice/action branches |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- No game-specific logic. Player names and factions come from RenderModel.
- Must not duplicate bottom-bar mode derivation in `AITurnOverlay`; ownership remains in `GameContainer`.
- Speed selector state is **local** to the component — not stored in Zustand.
- Faction color applied via CSS custom property, not hardcoded.
- Thinking indicator uses CSS-only animation — no external animation library.
- Renders nothing (`null`) when active player is human.
- AI turn skip orchestration is store-owned and reusable; UI component only dispatches the action.

---

## Outcome

- **Completion date**: 2026-02-18
- **What was changed**:
  - Added `packages/runner/src/ui/AITurnOverlay.tsx` and `packages/runner/src/ui/AITurnOverlay.module.css`.
  - Added store-owned `resolveAiTurn()` orchestration in `packages/runner/src/store/game-store.ts`.
  - Wired `GameContainer` `aiTurn` branch to render `AITurnOverlay` instead of `null`.
  - Added new component coverage in `packages/runner/test/ui/AITurnOverlay.test.tsx`.
  - Updated `packages/runner/test/ui/GameContainer.test.ts` ai-turn branch expectations.
  - Added `resolveAiTurn()` behavior coverage in `packages/runner/test/store/game-store.test.ts`.
- **Deviations from original plan**:
  - Original ticket assumption that AI turns were already auto-resolved in store was incorrect; resolution logic was implemented as part of this ticket to keep architecture coherent.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
