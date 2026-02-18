# REACTUI-013: PlayerHandPanel

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverable D10
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the floating `PlayerHandPanel` that shows the human player's private tokens (for example, hole cards). The panel renders only when owner-visible zones for the human player contain visible tokens.

---

## Assumptions Reassessment (Current Code vs Ticket)

1. `UIOverlay` is already a presentational shell with slot props (`topBarContent`, `sidePanelContent`, `bottomBarContent`, `floatingContent`).
2. `GameContainer` is the orchestration point for which panels mount in each overlay region.
3. `RenderModel` already provides token-level selectability (`RenderToken.isSelectable`) derived from choice state.
4. Existing collapsible side/floating panels use a shared `CollapsiblePanel` pattern.

**Corrections to original ticket assumptions/scope**:
- Do **not** mount `PlayerHandPanel` by changing `UIOverlay.tsx` directly.
- Mount `PlayerHandPanel` by adding it to `GameContainer` floating-region panel composition.
- Use `RenderToken.isSelectable` for interactivity/styling; do not duplicate choice-state derivation logic in the component.
- Reuse `CollapsiblePanel` for collapse/expand behavior instead of a one-off toggle implementation.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/PlayerHandPanel.tsx` | Floating panel rendering owner-visible tokens belonging to the human player |
| `packages/runner/src/ui/PlayerHandPanel.module.css` | Hand panel styling |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Unit tests for rendering/filtering/interactivity/collapse behavior |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Register `PlayerHandPanel` in floating region composition |
| `packages/runner/test/ui/GameContainer.test.ts` | Assert floating panel is mounted in playing/terminal overlay composition |

---

## Detailed Requirements

- **Store selectors**: read only the minimal slices needed from `renderModel` (`zones`, `tokens`, `players`).
- **Human player detection**: identify via `players.find((player) => player.isHuman)`.
- **Zone filter**: include zones where:
  - `zone.visibility === 'owner'`
  - `zone.ownerID === humanPlayerID`
  - `zone.tokenIDs.length > 0`
- **Token mapping**:
  - Resolve `zone.tokenIDs` through `renderModel.tokens`.
  - Preserve zone ordering and `tokenIDs` ordering.
  - Skip missing token IDs safely.
- **Rendering**:
  - Horizontal token row grouped inside a floating panel.
  - Each token shows `type` as primary label.
  - Show token `properties` as secondary key/value summary.
  - Face-up semantics only (DOM mirror of already visible owner data).
- **Interactivity**:
  - Token item is interactive only when `token.isSelectable === true`.
  - Non-selectable tokens must not appear clickable.
  - Keep this component display-only (no dispatch/selection mutation in this ticket).
- **Collapse/expand**:
  - Use shared `CollapsiblePanel`.
- **Visibility**:
  - Return `null` when no qualifying tokens are available.

---

## Architecture Rationale

This change is beneficial versus ad hoc alternatives because it keeps architecture boundaries clean:

- `UIOverlay` remains a dumb layout primitive.
- `GameContainer` remains the single composition/orchestration owner for overlay regions.
- `PlayerHandPanel` remains game-agnostic and data-driven from `RenderModel`.
- Choice/selectability logic remains centralized in `deriveRenderModel`, avoiding duplicated UI business rules.

---

## Out of Scope

- Card art or canvas-level token rendering
- Drag-and-drop interaction
- Opponent hand display
- Animation on card receipt (Spec 40)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Renders tokens from owner-visible zones for the human player |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Returns null when no qualifying owner-visible tokens exist |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Shows token type as primary label |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Shows token properties as secondary info |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Applies interactive styling only for selectable tokens |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Collapse toggle hides/shows panel content |
| `packages/runner/test/ui/GameContainer.test.ts` | Floating region includes `PlayerHandPanel` in playing/terminal composition |

### Invariants

- Uses Zustand selectors, not full-store subscription.
- No game-specific logic.
- Shows only human-owned `visibility: 'owner'` zone tokens.
- Renders `null` when there are no qualifying tokens.
- Does not modify canvas behavior.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `PlayerHandPanel` component + styles.
  - Mounted the panel through `GameContainer` floating-region composition.
  - Added dedicated UI tests for rendering filters, labels/properties, selectable styling, and collapse behavior.
  - Extended `GameContainer` composition tests to assert floating-panel presence.
- **Deviation from original plan**:
  - The original ticket proposed changing `UIOverlay.tsx`; this was corrected to preserve the existing architecture where `UIOverlay` is a passive layout shell and `GameContainer` owns panel composition.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed (`58` files, `418` tests).
  - `pnpm -F @ludoforge/runner lint` passed.
