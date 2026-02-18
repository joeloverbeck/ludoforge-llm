# REACTUI-009: PhaseIndicator and TurnOrderDisplay

**Status**: COMPLETED
**Spec**: 39 (React DOM UI Layer) - Deliverables D8, D9
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two always-visible top bar components: `PhaseIndicator` (current phase + active player) and `TurnOrderDisplay` (turn order with active/eliminated visual states).

Reassessed scope: keep `UIOverlay` as a layout shell and mount top-bar content through explicit slots. This preserves clear separation between shell layout and stateful domain components.

---

## Assumptions Reassessment

- Confirmed: `renderModel` already exposes `phaseName`, `phaseDisplayName`, `activePlayerID`, `players`, and `turnOrder`.
- Confirmed: `UIOverlay` currently renders structural regions only and is the right integration point for top-bar content.
- Corrected: `factionId` is not guaranteed to be numeric. Mapping directly to `--faction-N` from `factionId` is not robust.
- Corrected approach: use CSS-variable binding that is game-agnostic:
  - Prefer `--faction-<factionId>` when faction ID exists.
  - Fallback to index palette `--faction-0`, `--faction-1`, ... using player order.
  - No hardcoded hex values in components.

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
| `packages/runner/src/ui/UIOverlay.tsx` | Add top-bar slot for composed components |
| `packages/runner/src/ui/GameContainer.tsx` | Compose and pass top-bar content |

---

## Detailed Requirements

### PhaseIndicator (D8)

- Store selector reads `renderModel.phaseName`, `renderModel.phaseDisplayName`, `renderModel.activePlayerID`, `renderModel.players`.
- Always renders when `renderModel` exists.
- Displays `phaseDisplayName` (fallback: `phaseName`).
- Displays active player's `displayName`.
- Applies active-player faction color via CSS custom properties only (generic + fallback mapping above).
- Compact horizontal layout for top bar.

### TurnOrderDisplay (D9)

- Store selector reads `renderModel.turnOrder`, `renderModel.players`, `renderModel.activePlayerID`.
- Always renders when `renderModel` exists.
- Renders turn order as a horizontal list of player chips.
- Active player chip has emphasized styling.
- Eliminated players (`isEliminated === true`) are muted with a strikethrough affordance.
- Unknown player IDs in `turnOrder` are skipped safely.
- Compact layout beside `PhaseIndicator`.

---

## Out of Scope

- Interrupt banner (REACTUI-012)
- Event deck panel (REACTUI-012)
- Turn-order animation on changes (Spec 40)
- Visual-config-specific faction theming implementation (Spec 42)
- Mobile-responsive layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Renders phase display name |
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Falls back to `phaseName` when display name is missing |
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Shows active player display name |
| `packages/runner/test/ui/PhaseIndicator.test.tsx` | Applies CSS-variable faction color binding with fallback |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Renders all players from `turnOrder` |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Active player has highlighted styling |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Eliminated player has muted/strikethrough styling |
| `packages/runner/test/ui/TurnOrderDisplay.test.tsx` | Unknown `turnOrder` IDs are skipped without crash |
| `packages/runner/test/ui/UIOverlay.test.ts` | Top-bar slot renders provided content |
| `packages/runner/test/ui/GameContainer.test.ts` | D8/D9 are mounted in top bar during `playing`/`terminal` |

### Invariants

- Components use Zustand selectors, not whole-store subscriptions.
- No game-specific logic. Player and phase data come from `RenderModel`.
- Faction color binding uses CSS custom properties only; no hardcoded hex values.
- Inline styles are used only for dynamic faction color binding.
- Display-only top-bar components remain non-interactive (`pointer-events: none`).

---

## Outcome

- **Completed on**: 2026-02-18
- **What changed (implemented)**:
  - Added `PhaseIndicator` and `TurnOrderDisplay` components with scoped CSS modules.
  - Added a shared `faction-color-style` helper to keep faction color binding generic and DRY.
  - Updated `UIOverlay` to accept/render `topBarContent`.
  - Updated `GameContainer` to mount D8/D9 in the top bar.
  - Added new test files for D8/D9 and extended integration coverage in `UIOverlay` and `GameContainer` tests.
- **Deviation from original ticket**:
  - Corrected faction color assumption from direct `factionId -> --faction-N` mapping to generic CSS-variable binding with robust fallback.
  - Added explicit handling for unknown player IDs in `turnOrder` (skip safely) as a hardening behavior.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
