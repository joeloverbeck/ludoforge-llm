# Spec 37: State Management & Render Model

**Status**: ACTIVE
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 36 (Game Kernel Web Worker Bridge)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 1–2

---

## Objective

Implement the Zustand store that bridges the Web Worker kernel to both the PixiJS canvas and React DOM UI, and the pure `deriveRenderModel()` function that transforms GameState + GameDef into a view-friendly structure.

**Success criteria**: Store receives state updates from the worker bridge, derives a RenderModel that both rendering trees can consume, and correctly handles hidden information filtering, undo, and choice-pending state.

---

## Constraints

- `deriveRenderModel()` must be a **pure function** — no side effects, no store access, no DOM/canvas interaction.
- The RenderModel must be game-agnostic. It describes zones, tokens, variables, and actions in generic terms. No game-specific fields.
- Hidden information filtering must respect zone visibility rules and RevealGrant mechanisms from the engine.
- The store must support subscribeWithSelector for fine-grained PixiJS imperative updates.

---

## Architecture

```
GameBridge (Spec 36)
    |
    | async calls: init, applyMove, legalMoves, legalChoices, undo
    v
Zustand GameStore
    |
    | state, def, legalMoves, choicePending, effectTrace, terminal, history
    v
deriveRenderModel(state, def, playerID)
    |
    +──────────────────+──────────────────+
    |                  |                  |
    v                  v                  v
PixiJS Canvas     React DOM UI      Animation System
(subscribe)       (useStore)         (effectTrace)
```

---

## Deliverables

### D1: GameStore Interface

`packages/runner/src/store/game-store.ts`

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface GameStore {
  // Core state
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: string | null;         // The human player's ID

  // Kernel query results
  readonly legalMoves: LegalMovesResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly terminal: TerminalResult | null;

  // UI state
  readonly selectedAction: string | null;     // Currently selected action ID
  readonly choiceStack: readonly PartialChoice[];  // Breadcrumb for multi-step choices
  readonly animationPlaying: boolean;

  // Derived (computed on state change)
  readonly renderModel: RenderModel | null;

  // Actions
  initGame(def: GameDef, seed: number | bigint, playerID: string): Promise<void>;
  selectAction(actionId: string): void;
  makeChoice(choice: ChoiceValue): Promise<void>;
  confirmMove(): Promise<void>;
  cancelChoice(): void;           // Step back one choice
  cancelMove(): void;             // Cancel entire move construction
  undo(): Promise<void>;
  setAnimationPlaying(playing: boolean): void;
}
```

### D2: RenderModel Type Definition

`packages/runner/src/model/render-model.ts`

The RenderModel is a flat, denormalized view of the game state optimized for rendering:

```typescript
interface RenderModel {
  // Board
  readonly zones: readonly RenderZone[];
  readonly adjacencies: readonly RenderAdjacency[];

  // Tokens visible to this player
  readonly tokens: readonly RenderToken[];

  // Variables
  readonly globalVars: readonly RenderVariable[];
  readonly playerVars: ReadonlyMap<string, readonly RenderVariable[]>;

  // Players
  readonly players: readonly RenderPlayer[];
  readonly activePlayerID: string;
  readonly turnOrder: readonly string[];

  // Phase
  readonly phaseName: string;
  readonly phaseDisplayName: string;

  // Actions (grouped for toolbar)
  readonly actionGroups: readonly RenderActionGroup[];

  // Choice state (for progressive choice UI)
  readonly choiceBreadcrumb: readonly RenderChoiceStep[];
  readonly currentChoiceOptions: readonly RenderChoiceOption[] | null;
  readonly currentChoiceDomain: RenderChoiceDomain | null;  // For numeric inputs

  // Terminal
  readonly terminal: RenderTerminal | null;
}

interface RenderZone {
  readonly id: string;
  readonly name: string;
  readonly type: string;              // 'stack' | 'queue' | 'set' | etc.
  readonly tokenIDs: readonly string[];
  readonly markers: readonly RenderMarker[];
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly isSelectable: boolean;     // Based on current choice context
  readonly isHighlighted: boolean;    // Adjacent zone highlighting, etc.
  readonly ownerID: string | null;
  readonly metadata: Record<string, unknown>;  // Zone-specific metadata from GameDef
}

interface RenderToken {
  readonly id: string;
  readonly type: string;
  readonly zoneID: string;
  readonly ownerID: string | null;
  readonly faceUp: boolean;           // Derived from zone visibility + reveal grants
  readonly properties: Record<string, unknown>;
  readonly isSelectable: boolean;
  readonly isSelected: boolean;
}

interface RenderVariable {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly displayName: string;
}

interface RenderPlayer {
  readonly id: string;
  readonly name: string;
  readonly isHuman: boolean;
  readonly isActive: boolean;
  readonly isEliminated: boolean;
  readonly factionColor: string | null;  // From GameDef player config
}

interface RenderActionGroup {
  readonly groupName: string;
  readonly actions: readonly RenderAction[];
}

interface RenderAction {
  readonly actionId: string;
  readonly displayName: string;
  readonly isAvailable: boolean;
  readonly unavailableReason: string | null;
}

interface RenderChoiceOption {
  readonly value: string;
  readonly displayName: string;
  readonly isLegal: boolean;
  readonly illegalReason: string | null;
}

interface RenderChoiceDomain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface RenderTerminal {
  readonly type: 'win' | 'draw' | 'score-ranking' | 'loss-all';
  readonly winnerID: string | null;
  readonly rankings: readonly { playerID: string; score: number }[];
  readonly message: string;
}
```

### D3: `deriveRenderModel()` Pure Function

`packages/runner/src/model/derive-render-model.ts`

Key responsibilities:
1. Map GameDef zones to RenderZones with current token contents from GameState
2. Filter hidden information based on `playerID` and zone visibility rules
3. Apply RevealGrant effects (tokens revealed to specific players)
4. Compute `isSelectable` and `isHighlighted` for zones/tokens based on current choice context
5. Group legal moves by action type for the action toolbar
6. Extract choice options from ChoicePendingRequest
7. Derive phase name, turn order, active player from GameState
8. Compute terminal display from TerminalResult

### D4: Hidden Information Filtering

The render model must enforce:
- **Public zones**: All tokens visible to all players.
- **Owner zones**: Tokens visible only when `playerID` matches zone owner. Other players see card backs (token count only, no properties).
- **Hidden zones**: No player sees contents (show count only).
- **RevealGrants**: Temporary reveals override zone visibility for specific tokens/players.
- **Face-up/face-down**: Derived from visibility, not stored as a token property in the RenderModel.

### D5: Undo Support

The store maintains a reference to the worker bridge's undo capability:
- `undo()` calls `bridge.undo()`, receives previous state, updates store.
- Undo is only available for the human player's own moves.
- Undo during AI turns is not supported (AI turns are committed immediately).

### D6: Integration Tests

Test file: `packages/runner/test/store/game-store.test.ts`

Tests:
- [ ] `initGame()` populates store with initial state, legal moves, and render model
- [ ] `deriveRenderModel()` produces correct zones/tokens for Texas Hold'em initial state
- [ ] `deriveRenderModel()` produces correct zones/tokens for FITL initial state
- [ ] Hidden information: hole cards only visible to owning player
- [ ] Hidden information: opponent hand shows card count but no properties
- [ ] `selectAction()` updates action selection and choice state
- [ ] `makeChoice()` progresses through multi-step choice chain
- [ ] `cancelChoice()` steps back one choice in the breadcrumb
- [ ] `cancelMove()` resets to action selection
- [ ] `confirmMove()` calls bridge.applyMove and updates store with new state + trace
- [ ] `undo()` restores previous state and recomputes render model
- [ ] Terminal state detection updates render model with terminal info

---

## Implementation Notes

### Zustand subscribeWithSelector

PixiJS canvas updates use `subscribe()` with selectors to avoid full re-renders:

```typescript
// In PixiJS setup
store.subscribe(
  (s) => s.renderModel?.tokens,
  (tokens) => { /* imperatively update PixiJS sprites */ }
);
```

React DOM components use `useStore()` with selectors:

```typescript
const phaseName = useGameStore((s) => s.renderModel?.phaseName);
```

### Performance Considerations

- `deriveRenderModel()` is called on every state change. It must be fast (<5ms for typical game states).
- Consider memoization for expensive derivations (zone token lists, action grouping).
- The RenderModel should use structural sharing where possible (return same reference for unchanged sub-trees).

---

## Out of Scope

- PixiJS rendering (Spec 38)
- React DOM components (Spec 39)
- Animation processing (Spec 40)
- Game save/load (Spec 42)
- AI agent move selection (AI integration is a concern of the game loop coordinator, not the store)
