# Spec 39: React DOM UI Layer

**Status**: ACTIVE
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 37 (State Management & Render Model), Spec 38 (PixiJS Canvas Foundation)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 1, 4

---

## Objective

Implement the React DOM UI layer that overlays the PixiJS canvas, providing action toolbars, progressive choice UI, player hand panels, variable displays, phase indicators, and tooltips. The DOM layer reads from the Zustand store's RenderModel and dispatches actions back to the store.

**Success criteria**: A human player can select actions, make multi-step choices, see game variables, and complete a full game using the DOM UI controls in coordination with the canvas board.

---

## Constraints

- DOM UI is a **sibling** of the canvas, not a child. They share state via Zustand, not via React props.
- The DOM overlay uses `pointer-events: none` on its container, with `pointer-events: auto` on interactive elements. This lets clicks pass through to the canvas except where DOM controls exist.
- Components use Zustand selectors for minimal re-renders. No component subscribes to the entire store.
- All text and layout must be readable at standard desktop resolutions. No mobile optimization required.

---

## Architecture

```
<GameContainer>                          ← position: relative
  <GameCanvas ref={canvasRef} />         ← position: absolute, fills container
  <UIOverlay>                            ← position: absolute, pointer-events: none
    <PhaseIndicator />                   ← top bar
    <TurnOrderDisplay />                 ← top bar, beside phase
    <ActionToolbar />                    ← bottom bar
    <ChoicePanel />                      ← bottom bar, replaces toolbar during choice
    <PlayerHandPanel />                  ← bottom or side panel
    <VariablesPanel />                   ← side panel
    <Scoreboard />                       ← side panel
    <TooltipLayer />                     ← floating, positioned via coordinate bridge
    <TerminalOverlay />                  ← centered overlay on game end
  </UIOverlay>
</GameContainer>
```

---

## Deliverables

### D1: Game Container Layout

`packages/runner/src/ui/GameContainer.tsx`

- Root layout component. Uses CSS to position canvas and DOM overlay as siblings.
- Canvas fills the container. DOM overlay sits on top with `pointer-events: none`.
- Responsive: fills available viewport height/width.

### D2: Action Toolbar

`packages/runner/src/ui/ActionToolbar.tsx`

- Displays available actions grouped by `RenderActionGroup`.
- Each action rendered as a button. Unavailable actions are disabled with tooltip showing reason.
- Clicking an action dispatches `selectAction(actionId)` to the store.
- Toolbar hides when a choice is pending (replaced by ChoicePanel).
- Groups collapse to a single row if few actions, expand to multiple rows if many.

### D3: Progressive Choice UI (ChoicePanel)

`packages/runner/src/ui/ChoicePanel.tsx`

The multi-step choice flow for complex moves:

- **Breadcrumb/progress indicator**: Shows choice steps completed so far (e.g., "Train > Saigon > 3 troops"). Each completed step is clickable to go back to that point.
- **Current choice display**: Shows the current `RenderChoiceOption[]` or `RenderChoiceDomain` from the RenderModel.
- **Option buttons**: For discrete choices (zone, token, action variant). Clicking dispatches `makeChoice()`.
- **Numeric input**: For parameterized choices (raise amount, troop count). Slider with min/max from `RenderChoiceDomain`, plus direct number entry field.
- **Confirm button**: Visible when all choices are made. Dispatches `confirmMove()`.
- **Cancel/Back buttons**: "Back" steps to previous choice (`cancelChoice()`). "Cancel" abandons the entire move (`cancelMove()`).

### D4: Move Illegality Feedback

`packages/runner/src/ui/IllegalityFeedback.tsx`

- When `RenderChoiceOption.isLegal` is false, show the `illegalReason` as an inline message or tooltip.
- Non-legal options are visually muted but still visible (so the player understands what exists even if unavailable).
- Uses ChoiceIllegalReason from the engine, displayed in human-readable form.

### D5: Player Hand Panel

`packages/runner/src/ui/PlayerHandPanel.tsx`

- Shows tokens in zones owned by the human player that have `visibility: 'owner'`.
- Cards displayed as a horizontal row with face-up rendering.
- Clickable when a choice requires selecting from hand.
- Collapse/expand toggle for screen space management.

### D6: Variables Display Panel

`packages/runner/src/ui/VariablesPanel.tsx`

- Displays `globalVars` and `playerVars` from the RenderModel.
- Global variables in a labeled section (e.g., "Pot: 15,000" for poker, "Aid: 20" for FITL).
- Per-player variables in a collapsible section per player.
- Variable changes animate briefly (flash or highlight) when values change.

### D7: Phase/Turn Indicator

`packages/runner/src/ui/PhaseIndicator.tsx`

- Displays `phaseName` and `phaseDisplayName` prominently at the top of the screen.
- Highlights the active player with their name/faction and color.
- Animates phase transitions (brief text change animation).

### D8: Turn Order Display

`packages/runner/src/ui/TurnOrderDisplay.tsx`

- Shows the `turnOrder` array from RenderModel as a horizontal list of player indicators.
- Active player emphasized (larger, glowing, or bordered).
- Eliminated players shown as muted/crossed-out.
- Compact: fits beside the phase indicator.

### D9: Scoreboard/Leaderboard

`packages/runner/src/ui/Scoreboard.tsx`

- Displays player rankings based on game-specific criteria.
- For Texas Hold'em: chip counts ranked, blind level, positions (dealer, SB, BB).
- For FITL: victory point progress per faction toward individual goals.
- All data derived from RenderModel variables — no game-specific logic in the component.
- Collapsible for screen space.

### D10: Floating UI Tooltips

`packages/runner/src/ui/TooltipLayer.tsx`

- Uses Floating UI with Virtual Element pattern to anchor tooltips to canvas sprites.
- Virtual element's `getBoundingClientRect()` uses the coordinate bridge (Spec 38 D9) to convert sprite world coords to screen coords.
- Tooltip content: zone details, token properties, action descriptions.
- Legal choice explanations displayed in hierarchical format (conditions that make the choice available).
- Collision avoidance via Floating UI middleware (flip, shift, offset).

### D11: Terminal Overlay

`packages/runner/src/ui/TerminalOverlay.tsx`

- Displayed when `RenderModel.terminal` is non-null.
- Shows game result: winner, rankings, final scores.
- "New Game" button to return to game selection.
- Semi-transparent backdrop over the canvas.

---

## Verification

- [ ] Action toolbar displays grouped actions from a Texas Hold'em game
- [ ] Clicking an action starts the choice flow
- [ ] Multi-step choice breadcrumb works for a FITL operation (3+ steps)
- [ ] Back button in choice panel restores previous choice step
- [ ] Cancel button abandons move construction entirely
- [ ] Numeric slider appears for raise amount in Texas Hold'em
- [ ] Player hand shows hole cards for the human player
- [ ] Variables panel shows pot, chip stacks, blinds for Texas Hold'em
- [ ] Phase indicator updates on phase transitions
- [ ] Turn order shows all players with active player highlighted
- [ ] Tooltip appears when hovering over a canvas zone
- [ ] Tooltip content shows zone details and legal choice explanations
- [ ] Terminal overlay appears on game end with correct winner/rankings
- [ ] DOM clicks pass through to canvas when not over a UI element
- [ ] No unnecessary re-renders (verify with React DevTools profiler)

---

## Out of Scope

- Event log panel (Spec 42)
- Animation controls (Spec 40)
- Game selection screen (Spec 42)
- Pre-game configuration (Spec 42)
- Save/load UI (Spec 42)
- Visual config-driven styling (Spec 42)
- Keyboard shortcuts
- Drag-and-drop
