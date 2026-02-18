# REACTUI-011: EventDeckPanel and InterruptBanner

**Spec**: 39 (React DOM UI Layer) — Deliverables D13, D16
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M
**Status**: ✅ COMPLETED

---

## Summary

Create two conditional top bar components: EventDeckPanel (shows event card title, deck/discard counts) and InterruptBanner (alerts the player when normal flow is interrupted).

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- `RenderModel` already exposes `eventDecks`, `isInInterrupt`, and `interruptStack`; no model/schema changes are required for this ticket.
- `UIOverlay` is intentionally a store-agnostic layout shell (from REACTUI-003). It receives slot content and should not subscribe to store state.
- Top bar composition currently lives in `GameContainer` via `topBarContent` passed to `UIOverlay`; top bar component mounting should happen there.
- Runner UI tests are authored as `*.test.ts` in the current Vitest setup, not `*.test.tsx`.

### Scope adjustments

- Integrate `EventDeckPanel` and `InterruptBanner` by modifying `packages/runner/src/ui/GameContainer.tsx` (and its tests), not `packages/runner/src/ui/UIOverlay.tsx`.
- Keep `UIOverlay.tsx` unchanged as a pure structural shell.
- Add targeted unit tests for each new component and extend `GameContainer` tests to verify top bar wiring.

### Architectural rationale

- Keeping data subscriptions inside leaf panels and orchestration in `GameContainer` is cleaner and more extensible than moving feature-specific mounting into `UIOverlay`.
- Preserving a store-agnostic `UIOverlay` reduces coupling and keeps future panel additions composable without expanding a layout primitive into a feature coordinator.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/EventDeckPanel.tsx` | Current card title + deck/discard counts |
| `packages/runner/src/ui/EventDeckPanel.module.css` | Deck panel styling |
| `packages/runner/src/ui/InterruptBanner.tsx` | Interrupt alert with phase context |
| `packages/runner/src/ui/InterruptBanner.module.css` | Banner styling (prominent, attention-grabbing) |
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Contract tests for EventDeckPanel rendering behavior |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Contract tests for InterruptBanner rendering behavior |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Mount `EventDeckPanel` + `InterruptBanner` in top bar composition |
| `packages/runner/test/ui/GameContainer.test.ts` | Verify top bar includes new components in playing/terminal states |

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
- Visually prominent: distinct background color (e.g., `--danger` or a warning variant), positioned in the top bar.
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
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Renders deck display name |
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Shows current card title |
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Shows "No card" when `currentCardTitle` is null |
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Shows deck and discard counts |
| `packages/runner/test/ui/EventDeckPanel.test.ts` | Not rendered when `eventDecks` is empty |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Renders when `isInInterrupt` is true |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Shows interrupt phase name |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Shows resume phase name |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Not rendered when `isInInterrupt` is false |
| `packages/runner/test/ui/InterruptBanner.test.ts` | Uses prominent visual styling contract |
| `packages/runner/test/ui/GameContainer.test.ts` | Top bar includes EventDeckPanel and InterruptBanner in playing/terminal lifecycle |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Deck names, card titles, and phase names come from RenderModel.
- Components render nothing (`null`) when their data is absent.
- `InterruptBanner` is visually distinct from other top bar elements (different background/border color).
- No interactive elements — these are display-only components.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed vs originally planned**:
- Added `EventDeckPanel` and `InterruptBanner` components with scoped CSS Modules.
- Mounted both components in `GameContainer` top bar composition.
- Added dedicated test suites for both new components and extended `GameContainer` tests for top bar wiring.
- **Deviations from original plan**:
- Did not modify `UIOverlay.tsx`; integration was intentionally kept in `GameContainer` to preserve `UIOverlay` as a store-agnostic layout shell.
- Acceptance tests were implemented as `*.test.ts` files to match the current Vitest setup.
- **Verification results**:
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner lint` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
