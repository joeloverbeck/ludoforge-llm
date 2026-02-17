# REACTUI-011: EventDeckPanel and InterruptBanner

**Spec**: 39 (React DOM UI Layer) — Deliverables D13, D16
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two conditional top bar components: EventDeckPanel (shows event card title, deck/discard counts) and InterruptBanner (alerts the player when normal flow is interrupted).

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/EventDeckPanel.tsx` | Current card title + deck/discard counts |
| `packages/runner/src/ui/EventDeckPanel.module.css` | Deck panel styling |
| `packages/runner/src/ui/InterruptBanner.tsx` | Interrupt alert with phase context |
| `packages/runner/src/ui/InterruptBanner.module.css` | Banner styling (prominent, attention-grabbing) |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount EventDeckPanel + InterruptBanner in the top bar region |

---

## Detailed Requirements

### EventDeckPanel (D13)

- **Store selector**: reads `renderModel.eventDecks`.
- **Renders when**: `eventDecks.length > 0`.
- For each `RenderEventDeck`:
  - Shows `displayName` as deck label.
  - Shows `currentCardTitle` (or "No card" if null).
  - Shows deck count: `deckSize` remaining.
  - Shows discard count: `discardSize` discarded.
- Positioned in the top bar alongside phase/turn indicators.
- Compact layout: card title prominent, counts secondary.

### InterruptBanner (D16)

- **Store selector**: reads `renderModel.isInInterrupt`, `renderModel.interruptStack`.
- **Renders when**: `isInInterrupt === true`.
- Shows the current interrupt context from `interruptStack`:
  - Current interrupt `phase` name.
  - The `resumePhase` target (what phase will resume after interrupt resolves).
- Visually prominent: distinct background color (e.g., `--danger` or a warning variant), positioned at top of screen.
- Purpose: alert the player that normal game flow is interrupted and what phase will resume.

---

## Out of Scope

- Card detail display or card art (future visual config)
- Deck manipulation UI (shuffling, drawing — those are game actions)
- Animation on card reveal (Spec 40)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/EventDeckPanel.test.tsx` | Renders deck display name |
| `packages/runner/test/ui/EventDeckPanel.test.tsx` | Shows current card title |
| `packages/runner/test/ui/EventDeckPanel.test.tsx` | Shows "No card" when currentCardTitle is null |
| `packages/runner/test/ui/EventDeckPanel.test.tsx` | Shows deck and discard counts |
| `packages/runner/test/ui/EventDeckPanel.test.tsx` | Not rendered when eventDecks is empty |
| `packages/runner/test/ui/InterruptBanner.test.tsx` | Renders when isInInterrupt is true |
| `packages/runner/test/ui/InterruptBanner.test.tsx` | Shows interrupt phase name |
| `packages/runner/test/ui/InterruptBanner.test.tsx` | Shows resume phase name |
| `packages/runner/test/ui/InterruptBanner.test.tsx` | Not rendered when isInInterrupt is false |
| `packages/runner/test/ui/InterruptBanner.test.tsx` | Has prominent visual styling (distinct from normal panels) |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Deck names, card titles, and phase names come from RenderModel.
- Components render nothing (`null`) when their data is absent.
- InterruptBanner is visually distinct from other top bar elements (different background/border color).
- No interactive elements — these are display-only components.
