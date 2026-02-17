# Spec 39: React DOM UI Layer

**Status**: ACTIVE
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 37 (State Management & Render Model), Spec 38 (PixiJS Canvas Foundation)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 1, 4

---

## Objective

Implement the React DOM UI layer that overlays the PixiJS canvas, providing a comprehensive game-agnostic interface. The DOM layer reads from the Zustand store's `RenderModel` and dispatches actions back to the store. Every feature the RenderModel exposes — action groups, progressive choice flow, event decks, tracks, markers, lasting effects, interrupts, AI turn handling, and terminal states — is surfaced through purpose-built components.

**Success criteria**: A human player can bootstrap a game, select actions, make multi-step choices (including multi-select and numeric input), see all game state information, wait through AI turns, handle errors, undo moves, use keyboard shortcuts, and complete a full game using the DOM UI controls in coordination with the canvas board.

---

## Constraints

- DOM UI is a **sibling** of the canvas, not a child. They share state via Zustand, not via React props.
- The DOM overlay uses `pointer-events: none` on its container, with `pointer-events: auto` on interactive elements. This lets clicks pass through to the canvas except where DOM controls exist.
- Components use Zustand selectors for minimal re-renders. No component subscribes to the entire store.
- Components render conditionally based on RenderModel data availability (Approach C: fixed shell + conditional rendering). Panels appear only when their backing data is non-empty.
- No game-specific logic in any component. All data comes from the RenderModel.
- CSS Modules (`.module.css` per component) for scoped styling. Design tokens via CSS custom properties.
- All text and layout must be readable at standard desktop resolutions. No mobile optimization required.

---

## Architecture

**Approach C — Fixed Shell + Conditional Rendering**: `GameContainer` is the fixed shell that always mounts. It gates on `gameLifecycle` to show loading, error, or playing states. During `playing`, the `UIOverlay` renders panels that conditionally appear based on RenderModel data availability.

```
<App>                                         <- bootstrap: bridge + store + initGame
  <ErrorBoundary>
    <GameContainer store={store}>             <- position: relative; lifecycle gating
      <LoadingState />                        <- if lifecycle === 'initializing'
      <ErrorState />                          <- if error !== null
      <GameCanvas store={store} />            <- position: absolute, fills container
      <UIOverlay>                             <- position: absolute, pointer-events: none
        +-- TOP BAR ----------------------------------+
        | <PhaseIndicator />                          |
        | <TurnOrderDisplay />                        |
        | <InterruptBanner />       (conditional)     |
        | <EventDeckPanel />        (conditional)     |
        +-----------------------------------------+
        +-- SIDE PANELS ------------------------------+
        | <VariablesPanel />        (conditional)     |
        | <Scoreboard />            (conditional)     |
        | <GlobalMarkersBar />      (conditional)     |
        | <ActiveEffectsPanel />    (conditional)     |
        +-----------------------------------------+
        +-- BOTTOM BAR -------------------------------+
        | <ActionToolbar /> + <UndoControl />         |
        |   OR                                        |
        | <ChoicePanel />                             |
        |   OR                                        |
        | <AITurnOverlay />                           |
        +-----------------------------------------+
        +-- FLOATING ---------------------------------+
        | <TooltipLayer />                            |
        | <WarningsToast />                           |
        | <TerminalOverlay />       (conditional)     |
        | <PlayerHandPanel />       (conditional)     |
        +-----------------------------------------+
      </UIOverlay>
    </GameContainer>
  </ErrorBoundary>
</App>
```

**Bottom bar state machine**: The bottom bar shows exactly one of three states:

1. **ActionToolbar + UndoControl** — when it's the human's turn and no choice is pending
2. **ChoicePanel** — when a choice is pending (human building a move)
3. **AITurnOverlay** — when it's a non-human player's turn

---

## Styling Strategy

### Design Tokens (`ui/tokens.css`)

A shared CSS custom properties file consumed by all CSS Modules:

```css
:root {
  /* Faction palette - generic defaults, overridden by visual config (Spec 42) */
  --faction-0: #4a90d9;
  --faction-1: #d94a4a;
  --faction-2: #4ad94a;
  --faction-3: #d9d94a;

  /* UI chrome */
  --bg-panel: rgba(11, 16, 32, 0.85);
  --bg-panel-hover: rgba(11, 16, 32, 0.95);
  --text-primary: #e8e8e8;
  --text-secondary: #a0a0a0;
  --text-muted: #606060;
  --border-subtle: rgba(255, 255, 255, 0.1);
  --accent: #4a90d9;
  --danger: #d94a4a;
  --success: #4ad94a;

  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-mono: 'JetBrains Mono', monospace;
  --font-ui: system-ui, sans-serif;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;

  /* Z-index layers */
  --z-canvas: 0;
  --z-overlay: 10;
  --z-panel: 20;
  --z-tooltip: 30;
  --z-modal: 40;
}
```

### CSS Module Convention

- One `.module.css` per component: `ActionToolbar.module.css`
- Import as `import styles from './ActionToolbar.module.css'`
- Use `composes:` for shared patterns (from a `ui/shared.module.css`)
- No inline styles except dynamic values (e.g., faction colors derived from RenderModel at runtime)

---

## Keyboard Shortcuts

Implemented via a single `useKeyboardShortcuts(store)` hook in `GameContainer`.

| Key | Context | Action |
|-----|---------|--------|
| Escape | Choice pending | Cancel move (`cancelMove()`) |
| Backspace | Choice pending | Back one step (`cancelChoice()`) |
| Enter | Choice ready to confirm | Confirm move (`confirmMove()`) |
| 1-9 | Action toolbar visible | Select Nth action |
| Z | Human turn | Undo last move (`undo()`) |
| Space | AI turn | Skip/fast-forward AI turn |

---

## Deliverables

### Tier 1: Foundation

Must exist before all other components.

#### D1: Design Tokens and Base Styles

`packages/runner/src/ui/tokens.css`

- CSS custom properties as listed in the Styling Strategy section above.
- Faction palette, spacing scale, typography, z-index layers, panel backgrounds.
- A companion `ui/shared.module.css` with composable base patterns (panel background, rounded corners, etc.).

#### D2: GameContainer

`packages/runner/src/ui/GameContainer.tsx` + `GameContainer.module.css`

- Root layout component. Uses CSS to position canvas and DOM overlay as siblings.
- Canvas fills the container (`position: absolute`). DOM overlay sits on top (`position: absolute`, `pointer-events: none`).
- Responsive: fills available viewport height/width.
- **Lifecycle gating**: reads `gameLifecycle` from the store.
  - `idle` / `initializing`: renders `<LoadingState />`
  - `playing` / `terminal`: renders canvas + `<UIOverlay>` with all panels
  - When `error !== null`: renders `<ErrorState />`
- Mounts the `useKeyboardShortcuts(store)` hook.

#### D3: App Shell and Bootstrap

`packages/runner/src/App.tsx` (revised)

- Creates `bridge` via `createGameBridge()` and `store` via `createGameStore(bridge)`.
- On mount: calls `store.getState().initGame(gameDef, seed, playerID)`.
  - `gameDef` loaded from a hardcoded URL or bundled fixture for now.
  - Game selection UI deferred to Spec 42.
- Renders: `<ErrorBoundary><GameContainer store={store} /></ErrorBoundary>`

---

### Tier 2: Core Interaction

Always visible during `playing` lifecycle when it's the human player's turn.

#### D4: ActionToolbar

`packages/runner/src/ui/ActionToolbar.tsx` + `ActionToolbar.module.css`

- Displays available actions grouped by `RenderActionGroup`.
- Each `RenderAction` rendered as a button.
- Unavailable actions (`isAvailable === false`) are disabled with a muted visual treatment.
- Clicking an available action dispatches `selectAction(actionId)` to the store.
- **Visibility rules**: Hidden when a choice is pending (replaced by ChoicePanel). Hidden when it's an AI turn (replaced by AITurnOverlay).
- Groups collapse to a single row if few actions, expand to multiple rows if many.
- Keyboard: pressing 1-9 selects the Nth action.

#### D5: ChoicePanel (Progressive Choice UI)

`packages/runner/src/ui/ChoicePanel.tsx` + `ChoicePanel.module.css`

The most complex component. Handles the multi-step choice flow for constructing moves. Operates in three rendering modes based on RenderModel state:

**Mode A — Discrete single-select** (`choiceType === 'chooseOne'` + `currentChoiceOptions !== null`):
- Renders each `RenderChoiceOption` as a button.
- Illegal options (`isLegal === false`): visually muted but visible, with `illegalReason` shown via `<IllegalityFeedback>`.
- Clicking a legal option dispatches `chooseOne(value)`.

**Mode B — Multi-select** (`choiceType === 'chooseN'` + `currentChoiceOptions !== null`):
- Renders each option as a toggleable checkbox button.
- Shows selected count indicator: "Selected: 2 of 3-5".
- Min/max enforcement from `choiceMin`/`choiceMax`.
- "Confirm selection" button enabled only when selected count is within bounds.
- Clicking confirm dispatches `chooseN(selectedValues)`.

**Mode C — Numeric input** (`choiceType === 'chooseOne'` + `currentChoiceDomain !== null`):
- Slider with `min`/`max`/`step` from `RenderChoiceDomain`.
- Direct number entry input field.
- Quick-select buttons at key fractions (25%, 50%, 75%, max).
- Confirm button dispatches `chooseOne(numericValue)`.

**Breadcrumb**: Always visible at top of ChoicePanel. Renders each `RenderChoiceStep` from `choiceBreadcrumb` as a clickable chip showing `chosenDisplayName`. Clicking a previous step dispatches `cancelChoice()` repeatedly to navigate back to that point.

**Navigation buttons**:
- "Back" (`cancelChoice()`): steps to the previous choice.
- "Cancel" (`cancelMove()`): abandons the entire move construction.
- "Confirm" (`confirmMove()`): visible when all required choices are made.

#### D6: IllegalityFeedback

`packages/runner/src/ui/IllegalityFeedback.tsx` + `IllegalityFeedback.module.css`

- Renders inline message or tooltip when `RenderChoiceOption.isLegal === false`.
- Displays the `illegalReason` string in human-readable form.
- Non-legal options are visually muted but remain visible so the player understands what exists even if unavailable.

#### D7: UndoControl

`packages/runner/src/ui/UndoControl.tsx` + `UndoControl.module.css`

- Undo button that dispatches `undo()`.
- Visible only when it's the human player's turn and no choice is pending.
- Sits beside the ActionToolbar in the bottom bar.
- Keyboard: Z triggers undo.

---

### Tier 3: Game State Display

Conditional panels that render only when their corresponding RenderModel data is present.

#### D8: PhaseIndicator

`packages/runner/src/ui/PhaseIndicator.tsx` + `PhaseIndicator.module.css`

- **Renders when**: always (every game has phases).
- Displays `phaseName` and `phaseDisplayName` prominently at the top of the screen.
- Highlights the active player with their name/faction and color.

#### D9: TurnOrderDisplay

`packages/runner/src/ui/TurnOrderDisplay.tsx` + `TurnOrderDisplay.module.css`

- **Renders when**: always.
- Shows the `turnOrder` array as a horizontal list of player indicators.
- Active player emphasized (bordered or highlighted).
- Eliminated players (`isEliminated === true`) shown as muted/crossed-out.
- Compact: fits beside the phase indicator in the top bar.

#### D10: PlayerHandPanel

`packages/runner/src/ui/PlayerHandPanel.tsx` + `PlayerHandPanel.module.css`

- **Renders when**: the human player owns zones with `visibility: 'owner'` that contain tokens.
- Cards/tokens displayed as a horizontal row with face-up rendering.
- Clickable when a choice requires selecting from the player's hand.
- Collapse/expand toggle for screen space management.

#### D11: VariablesPanel

`packages/runner/src/ui/VariablesPanel.tsx` + `VariablesPanel.module.css`

- **Renders when**: `globalVars.length > 0` or `playerVars.size > 0`.
- Global variables in a labeled section (e.g., "Pot: 15,000" for poker, "Aid: 20" for FITL).
- Per-player variables in a collapsible section per player.
- Variable changes animate briefly (flash or highlight) when values change.

#### D12: Scoreboard

`packages/runner/src/ui/Scoreboard.tsx` + `Scoreboard.module.css`

- **Renders when**: `tracks.length > 0`.
- Consumes `RenderTrack[]` from the RenderModel.
- Each `RenderTrack` rendered as a labeled progress bar (`min` to `max`, filled to `currentValue`).
- Faction-scoped tracks (`scope === 'faction'`) grouped by faction with faction color applied.
- Global-scoped tracks (`scope === 'global'`) shown in a separate section.
- Collapsible for screen space.

#### D13: EventDeckPanel

`packages/runner/src/ui/EventDeckPanel.tsx` + `EventDeckPanel.module.css`

- **Renders when**: `eventDecks.length > 0`.
- Consumes `RenderEventDeck[]` from the RenderModel.
- Shows current card title (`currentCardTitle`), deck count (`deckSize`), and discard count (`discardSize`).
- Positioned in the top bar alongside phase/turn indicators.

#### D14: GlobalMarkersBar

`packages/runner/src/ui/GlobalMarkersBar.tsx` + `GlobalMarkersBar.module.css`

- **Renders when**: `globalMarkers.length > 0`.
- Consumes `RenderGlobalMarker[]` from the RenderModel.
- Horizontal bar of marker chips, each showing the marker `id` and its current `state`.
- `possibleStates` available for tooltip or visual context.

#### D15: ActiveEffectsPanel

`packages/runner/src/ui/ActiveEffectsPanel.tsx` + `ActiveEffectsPanel.module.css`

- **Renders when**: `activeEffects.length > 0`.
- Consumes `RenderLastingEffect[]` from the RenderModel.
- Lists lasting effects showing `displayName`, source card (`sourceCardId`), side (`shaded`/`unshaded`), and `duration`.

#### D16: InterruptBanner

`packages/runner/src/ui/InterruptBanner.tsx` + `InterruptBanner.module.css`

- **Renders when**: `isInInterrupt === true`.
- Consumes `interruptStack` from the RenderModel.
- Shows interrupt context: the current interrupt phase name and the resume target phase.
- Positioned prominently in the top bar to alert the player that normal flow is interrupted.

---

### Tier 4: AI Turn and Feedback

#### D17: AITurnOverlay

`packages/runner/src/ui/AITurnOverlay.tsx` + `AITurnOverlay.module.css`

- **Visible when**: `activePlayer.isHuman === false` (detected via `renderModel.players.find(p => p.id === renderModel.activePlayerID)?.isHuman === false`).
- Shows: faction color border, player display name, animated thinking dots/spinner.
- Controls:
  - "Skip" button: dispatches immediate move resolution to jump past the AI turn.
  - Speed selector (1x/2x/4x): stored in local component state. Animation speed is a Spec 40 concern, but the control surface lives in this component.
- **Hides ActionToolbar and ChoicePanel** while visible (bottom bar state machine).
- Keyboard: Space skips/fast-forwards the AI turn.

#### D18: WarningsToast

`packages/runner/src/ui/WarningsToast.tsx` + `WarningsToast.module.css`

- Auto-dismissing toast notifications for `moveEnumerationWarnings` from the RenderModel.
- Each `RenderWarning` displays its `code` and `message`.
- Toasts stack vertically and auto-dismiss after a few seconds.
- Positioned in a floating region that does not overlap interactive controls.

---

### Tier 5: Overlays and Tooltips

#### D19: TooltipLayer

`packages/runner/src/ui/TooltipLayer.tsx` + `TooltipLayer.module.css`

- Uses Floating UI with Virtual Element pattern to anchor tooltips to canvas sprites.
- Virtual element's `getBoundingClientRect()` uses the coordinate bridge (Spec 38 D9) to convert sprite world coords to screen coords.
- Tooltip content: zone details (`RenderZone` fields), token properties (`RenderToken.properties`), legal choice explanations.
- Collision avoidance via Floating UI middleware (flip, shift, offset).

#### D20: TerminalOverlay

`packages/runner/src/ui/TerminalOverlay.tsx` + `TerminalOverlay.module.css`

- **Displayed when**: `RenderModel.terminal !== null`.
- Shows game result based on `RenderTerminal.type`:
  - `'win'`: winner name/faction, victory message, optional ranking
  - `'draw'`: draw message
  - `'score'`: ranked player scores
  - `'lossAll'`: loss message
- "New Game" button to reset / return to game selection.
- Semi-transparent backdrop over the canvas.

---

### Tier 6: Error and Loading

#### D21: LoadingState

`packages/runner/src/ui/LoadingState.tsx` + `LoadingState.module.css`

- Displayed during `initializing` lifecycle state.
- Spinner or loading animation with "Loading game..." text.
- Centered in the game container.

#### D22: ErrorState

`packages/runner/src/ui/ErrorState.tsx` + `ErrorState.module.css`

- Displayed when `error !== null` in the store.
- Shows error message text.
- "Retry" button that dispatches `clearError()` and re-attempts initialization.
- Centered in the game container.

#### D23: ErrorBoundary

`packages/runner/src/ui/ErrorBoundary.tsx`

- React error boundary class component wrapping `GameContainer`.
- Catches render crashes gracefully and displays a fallback error UI.
- Provides a "Reload" action to recover from unrecoverable render errors.

---

## Deliverable Summary Table

| ID | Component | File | Renders when... |
|----|-----------|------|-----------------|
| D1 | Design tokens + base styles | `ui/tokens.css`, `ui/shared.module.css` | N/A (imported by all) |
| D2 | GameContainer | `ui/GameContainer.tsx` | Always (root layout) |
| D3 | App shell + bootstrap | `App.tsx` (revised) | Always (entry point) |
| D4 | ActionToolbar | `ui/ActionToolbar.tsx` | Human turn, no choice pending, no AI turn |
| D5 | ChoicePanel | `ui/ChoicePanel.tsx` | Choice pending (human building a move) |
| D6 | IllegalityFeedback | `ui/IllegalityFeedback.tsx` | Inside ChoicePanel for illegal options |
| D7 | UndoControl | `ui/UndoControl.tsx` | Human turn, no choice pending |
| D8 | PhaseIndicator | `ui/PhaseIndicator.tsx` | Always |
| D9 | TurnOrderDisplay | `ui/TurnOrderDisplay.tsx` | Always |
| D10 | PlayerHandPanel | `ui/PlayerHandPanel.tsx` | Human owns `visibility: 'owner'` zones with tokens |
| D11 | VariablesPanel | `ui/VariablesPanel.tsx` | `globalVars.length > 0` or `playerVars.size > 0` |
| D12 | Scoreboard | `ui/Scoreboard.tsx` | `tracks.length > 0` |
| D13 | EventDeckPanel | `ui/EventDeckPanel.tsx` | `eventDecks.length > 0` |
| D14 | GlobalMarkersBar | `ui/GlobalMarkersBar.tsx` | `globalMarkers.length > 0` |
| D15 | ActiveEffectsPanel | `ui/ActiveEffectsPanel.tsx` | `activeEffects.length > 0` |
| D16 | InterruptBanner | `ui/InterruptBanner.tsx` | `isInInterrupt === true` |
| D17 | AITurnOverlay | `ui/AITurnOverlay.tsx` | Active player is non-human |
| D18 | WarningsToast | `ui/WarningsToast.tsx` | `moveEnumerationWarnings.length > 0` |
| D19 | TooltipLayer | `ui/TooltipLayer.tsx` | Always (responds to hover events) |
| D20 | TerminalOverlay | `ui/TerminalOverlay.tsx` | `terminal !== null` |
| D21 | LoadingState | `ui/LoadingState.tsx` | `lifecycle === 'initializing'` |
| D22 | ErrorState | `ui/ErrorState.tsx` | `error !== null` |
| D23 | ErrorBoundary | `ui/ErrorBoundary.tsx` | Always (wraps GameContainer) |

All component files live under `packages/runner/src/ui/`.

---

## RenderModel Data Mapping

This section clarifies which RenderModel fields each component consumes.

| Component | RenderModel Fields |
|-----------|--------------------|
| PhaseIndicator | `phaseName`, `phaseDisplayName`, `activePlayerID`, `players` |
| TurnOrderDisplay | `turnOrder`, `players`, `activePlayerID` |
| ActionToolbar | `actionGroups` |
| ChoicePanel | `choiceBreadcrumb`, `currentChoiceOptions`, `currentChoiceDomain`, `choiceType`, `choiceMin`, `choiceMax` |
| IllegalityFeedback | `RenderChoiceOption.isLegal`, `RenderChoiceOption.illegalReason` |
| UndoControl | (store: `choiceStack` length, `activePlayerID`, `players`) |
| PlayerHandPanel | `zones` (filtered by `visibility === 'owner'`), `tokens` |
| VariablesPanel | `globalVars`, `playerVars` |
| Scoreboard | `tracks` |
| EventDeckPanel | `eventDecks` |
| GlobalMarkersBar | `globalMarkers` |
| ActiveEffectsPanel | `activeEffects` |
| InterruptBanner | `isInInterrupt`, `interruptStack` |
| AITurnOverlay | `activePlayerID`, `players` |
| WarningsToast | `moveEnumerationWarnings` |
| TooltipLayer | `zones`, `tokens` (via coordinate bridge) |
| TerminalOverlay | `terminal` |

---

## Store Action Mapping

| UI Action | Store Method |
|-----------|-------------|
| Click an action button | `selectAction(actionId)` |
| Choose a discrete option | `chooseOne(value)` |
| Confirm multi-select | `chooseN(selectedValues)` |
| Confirm numeric input | `chooseOne(numericValue)` |
| Confirm completed move | `confirmMove()` |
| Back one choice step | `cancelChoice()` |
| Cancel entire move | `cancelMove()` |
| Undo last move | `undo()` |
| Initialize game | `initGame(def, seed, playerID)` |
| Clear error | `clearError()` |
| Toggle animation | `setAnimationPlaying(playing)` |

---

## Verification

### Core Interaction
- [ ] Action toolbar displays grouped actions from a Texas Hold'em game
- [ ] Clicking an action starts the choice flow (breadcrumb appears)
- [ ] Multi-step choice breadcrumb works for a FITL operation (3+ steps)
- [ ] Back button restores previous choice step
- [ ] Cancel button abandons move construction entirely
- [ ] Numeric slider appears for raise amount in Texas Hold'em
- [ ] Multi-select checkboxes appear for `chooseN` decisions
- [ ] Min/max count enforced — confirm disabled outside bounds
- [ ] Undo button visible and functional after a human move

### Game State Display
- [ ] Phase indicator updates on phase transitions
- [ ] Turn order shows all players with active player highlighted
- [ ] Player hand shows hole cards for human player
- [ ] Variables panel shows pot, chip stacks, blinds for Texas Hold'em
- [ ] Scoreboard renders `RenderTrack[]` as progress bars
- [ ] Event deck panel shows current card title + deck/discard counts (FITL)
- [ ] Global markers bar shows marker chips with states (if any)
- [ ] Active effects panel lists lasting effects (if any)
- [ ] Interrupt banner appears during interrupt phases (FITL)

### AI Turns
- [ ] AI turn overlay appears when active player is non-human
- [ ] Thinking indicator shows AI name/faction
- [ ] Skip button advances past AI turn
- [ ] Action toolbar hidden during AI turns

### Tooltips and Overlays
- [ ] Tooltip appears when hovering over a canvas zone
- [ ] Tooltip content shows zone details and legal choice explanations
- [ ] Terminal overlay appears on game end with correct winner/rankings
- [ ] DOM clicks pass through to canvas when not over a UI element

### Error and Loading
- [ ] Loading state shown during game initialization
- [ ] Error state shown with retry button on init failure
- [ ] Error boundary catches render crashes

### Performance
- [ ] No unnecessary re-renders (verify with React DevTools profiler)
- [ ] All conditional panels render only when their data exists

### Keyboard
- [ ] Escape cancels move construction
- [ ] Enter confirms when choice is ready
- [ ] Z triggers undo on human turn
- [ ] 1-9 selects actions from toolbar
- [ ] Space skips AI turn

---

## Suggested Ticket Grouping

After this spec is approved, ticket generation (REACTUI-001 through REACTUI-N) will follow the project's existing pattern. Suggested grouping:

1. **Foundation**: D1 tokens.css + D2 GameContainer + D3 App bootstrap + D21-D23 error/loading
2. **Core interaction**: D4 ActionToolbar + D5 ChoicePanel + D6 IllegalityFeedback + D7 UndoControl
3. **Game state panels**: D8-D16 (all conditional panels)
4. **AI + feedback**: D17 AITurnOverlay + D18 WarningsToast
5. **Tooltips + terminal**: D19 TooltipLayer + D20 TerminalOverlay
6. **Keyboard shortcuts**: `useKeyboardShortcuts` hook

---

## Out of Scope

- Animation playback engine (Spec 40) — but AI speed control UI lives in D17
- Board auto-layout algorithm (Spec 41)
- Game selection screen (Spec 42)
- Pre-game player/seat configuration (Spec 42)
- Save/load game (Spec 42)
- Replay mode (Spec 42)
- Event log panel (Spec 42)
- Visual config loading and theming (Spec 42)
- Drag-and-drop interaction
- Mobile optimization
