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

**Success criteria**: Store receives state updates from the worker bridge, derives a RenderModel that both rendering trees can consume, and correctly handles hidden information filtering, undo, choice-pending state, error/loading states, and the full breadth of engine features (markers, tracks, lasting effects, interrupt stack).

---

## Constraints

- `deriveRenderModel()` must be a **pure function** — no side effects, no store access, no DOM/canvas interaction.
- The RenderModel must be game-agnostic. It describes zones, tokens, variables, and actions in generic terms. No game-specific fields.
- Hidden information filtering must respect zone visibility rules and RevealGrant mechanisms from the engine.
- The store must support subscribeWithSelector for fine-grained PixiJS imperative updates.
- All player ID fields use the branded `PlayerId` type (`Brand<number, 'PlayerId'>`) from the engine, not `string`.

---

## Architecture

```
GameBridge (Spec 36)
    |
    | sync calls: init, applyMove, legalMoves, enumerateLegalMoves,
    |             legalChoices, terminalResult, undo, getState, getMetadata
    v
createGameStore(bridge)     ← factory receives bridge instance
    |
    | state, def, legalMoves, choicePending, effectTrace, terminal,
    | triggerFirings, error, loading, gameLifecycle
    v
deriveRenderModel(state, def, context)    ← pure function
    |
    +──────────────────+──────────────────+
    |                  |                  |
    v                  v                  v
 PixiJS Canvas     React DOM UI      Animation System
 (subscribe)       (useStore)         (effectTrace + triggerFirings)
```

---

## Engine Type References

Types are sourced from `packages/engine/src/kernel/`. Key imports:

| Type | Source | Notes |
|------|--------|-------|
| `PlayerId` | `branded.ts:3` | `Brand<number, 'PlayerId'>` — all player fields use this |
| `ZoneId`, `TokenId`, `ActionId`, `PhaseId` | `branded.ts` | Branded string types |
| `GameDef`, `GameState` | `types-core.ts` | Core engine types |
| `Move`, `MoveParamValue` | `types-core.ts`, `types-ast.ts` | `MoveParamValue = MoveParamScalar \| readonly MoveParamScalar[]` |
| `TerminalResult` | `types-core.ts:726–730` | `'win' \| 'lossAll' \| 'draw' \| 'score'` |
| `PlayerScore` | `types-core.ts:721–724` | `{ player: PlayerId; score: number }` |
| `VariableValue` | `types-core.ts:69` | `number \| boolean` only — no strings |
| `ChoicePendingRequest` | `types-core.ts:508–518` | Includes `type: 'chooseOne' \| 'chooseN'`, `min?`, `max?` |
| `EffectTraceEntry` | `types-core.ts:680–688` | Union of trace entry kinds |
| `TriggerLogEntry` | `types-core.ts:553–561` | Union of trigger/lifecycle entries |
| `ApplyMoveResult` | `types-core.ts:703–708` | Includes `triggerFirings` and optional `effectTrace` |
| `LegalMoveEnumerationResult` | `legal-moves.ts:26–29` | `{ moves: readonly Move[]; warnings: readonly RuntimeWarning[] }` |
| `VictoryTerminalMetadata` | `types-victory.ts:29–34` | `timing`, `checkpointId`, `winnerFaction`, optional `ranking` |
| `VictoryTerminalRankingEntry` | `types-victory.ts:22–27` | `faction`, `margin`, `rank`, `tieBreakKey` |
| `ActiveLastingEffect` | `types-events.ts:105–116` | `id`, `sourceCardId`, `side`, `duration`, remaining boundaries |
| `InterruptPhaseFrame` | `types-core.ts:446–449` | `{ phase: PhaseId; resumePhase: PhaseId }` |
| `TurnOrderRuntimeState` | `types-turn-flow.ts:175–183` | 4-variant union |
| `NumericTrackDef` | `types-core.ts:266–273` | `id`, `scope`, `faction?`, `min`, `max`, `initial` |
| `MapSpaceDef` | `types-core.ts:249–258` | `spaceType`, `population`, `econ`, `terrainTags`, etc. |
| `EventDeckDef` | `types-events.ts:97–103` | `drawZone`, `discardZone`, `cards` |
| `WorkerError` | `game-worker-api.ts:23–27` | `code`, `message`, `details?` |
| `GameWorkerAPI` | `game-worker-api.ts:314` | Return type of `createGameWorker()` |

---

## Deliverables

### D1: GameStore Interface

`packages/runner/src/store/game-store.ts`

The store is created via a factory function that receives the bridge instance:

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PlayerId } from '@ludoforge/engine';
import type { GameWorkerAPI, WorkerError } from '../worker/game-worker-api.js';

// Factory: createGameStore(bridge: GameWorkerAPI) => StoreApi<GameStore>

interface GameStore {
  // ── Core state ─────────────────────────────────────────
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;

  // ── Lifecycle ──────────────────────────────────────────
  readonly gameLifecycle: 'idle' | 'initializing' | 'playing' | 'terminal';
  readonly loading: boolean;              // True during any async bridge call
  readonly error: WorkerError | null;     // Last error from bridge

  // ── Kernel query results ───────────────────────────────
  readonly legalMoveResult: LegalMoveEnumerationResult | null;  // Includes warnings
  readonly choicePending: ChoicePendingRequest | null;
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly triggerFirings: readonly TriggerLogEntry[];           // For animation system (Spec 40)
  readonly terminal: TerminalResult | null;

  // ── Move construction state ────────────────────────────
  readonly selectedAction: ActionId | null;
  readonly partialMove: Move | null;                             // Progressive choice build-up
  readonly choiceStack: readonly PartialChoice[];
  readonly animationPlaying: boolean;

  // ── Player configuration ───────────────────────────────
  readonly playerSeats: ReadonlyMap<PlayerId, 'human' | 'ai-random' | 'ai-greedy'>;

  // ── Derived (recomputed on state change) ───────────────
  readonly renderModel: RenderModel | null;

  // ── Actions ────────────────────────────────────────────
  initGame(def: GameDef, seed: number, playerID: PlayerId): void;
  selectAction(actionId: ActionId): void;
  makeChoice(choice: MoveParamValue): void;
  confirmMove(): void;
  cancelChoice(): void;           // Step back one choice
  cancelMove(): void;             // Cancel entire move construction
  undo(): void;
  setAnimationPlaying(playing: boolean): void;
  clearError(): void;
}
```

**Supporting types** (defined in `packages/runner/src/store/store-types.ts`):

```typescript
import type { PlayerId, MoveParamValue } from '@ludoforge/engine';

/** One step in the progressive choice breadcrumb. */
interface PartialChoice {
  readonly decisionId: string;
  readonly name: string;
  readonly value: MoveParamValue;
}
```

**Store creation pattern**:

```typescript
export function createGameStore(bridge: GameWorkerAPI) {
  return create<GameStore>()(
    subscribeWithSelector((set, get) => ({
      // ... initial state (all null/false/empty) ...
      // ... action implementations that call bridge methods ...
    }))
  );
}
```

**Undo flow** (C4 — post-undo re-derivation): After `bridge.undo()`, the store must also call `bridge.enumerateLegalMoves()` and `bridge.terminalResult()` to refresh the legal moves and terminal state for the restored position.

**initGame flow**: `bridge.init(def, seed)` → set `gameState` + `gameDef` → `bridge.enumerateLegalMoves()` → `bridge.terminalResult()` → set `gameLifecycle` to `'playing'` or `'terminal'` → derive render model.

### D2: RenderModel Type Definition

`packages/runner/src/model/render-model.ts`

The RenderModel is a flat, denormalized view of the game state optimized for rendering:

```typescript
import type { PlayerId, ActionId, MoveParamValue } from '@ludoforge/engine';

interface RenderModel {
  // ── Board ──────────────────────────────────────────────
  readonly zones: readonly RenderZone[];
  readonly adjacencies: readonly RenderAdjacency[];
  readonly mapSpaces: readonly RenderMapSpace[];      // Spatial metadata for map games

  // ── Tokens visible to this player ──────────────────────
  readonly tokens: readonly RenderToken[];

  // ── Variables ──────────────────────────────────────────
  readonly globalVars: readonly RenderVariable[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly RenderVariable[]>;

  // ── Markers ────────────────────────────────────────────
  readonly globalMarkers: readonly RenderGlobalMarker[];

  // ── Tracks ─────────────────────────────────────────────
  readonly tracks: readonly RenderTrack[];

  // ── Active lasting effects ─────────────────────────────
  readonly activeEffects: readonly RenderLastingEffect[];

  // ── Players ────────────────────────────────────────────
  readonly players: readonly RenderPlayer[];
  readonly activePlayerID: PlayerId;
  readonly turnOrder: readonly PlayerId[];

  // ── Turn order ─────────────────────────────────────────
  readonly turnOrderType: 'roundRobin' | 'fixedOrder' | 'cardDriven' | 'simultaneous';
  readonly simultaneousSubmitted: readonly PlayerId[];   // Players who have submitted (simultaneous mode)

  // ── Interrupt state ────────────────────────────────────
  readonly interruptStack: readonly RenderInterruptFrame[];
  readonly isInInterrupt: boolean;

  // ── Phase ──────────────────────────────────────────────
  readonly phaseName: string;
  readonly phaseDisplayName: string;

  // ── Event decks ────────────────────────────────────────
  readonly eventDecks: readonly RenderEventDeck[];

  // ── Actions (grouped for toolbar) ──────────────────────
  readonly actionGroups: readonly RenderActionGroup[];

  // ── Choice state (for progressive choice UI) ──────────
  readonly choiceBreadcrumb: readonly RenderChoiceStep[];
  readonly currentChoiceOptions: readonly RenderChoiceOption[] | null;
  readonly currentChoiceDomain: RenderChoiceDomain | null;
  readonly choiceType: 'chooseOne' | 'chooseN' | null;
  readonly choiceMin: number | null;                     // For chooseN: minimum selections
  readonly choiceMax: number | null;                     // For chooseN: maximum selections

  // ── Move enumeration warnings ──────────────────────────
  readonly moveEnumerationWarnings: readonly RenderWarning[];

  // ── Terminal ───────────────────────────────────────────
  readonly terminal: RenderTerminal | null;
}
```

#### Sub-types

```typescript
interface RenderZone {
  readonly id: string;
  readonly displayName: string;              // formatIdAsDisplayName(id) fallback; Spec 42 override
  readonly ordering: 'stack' | 'queue' | 'set';  // Matches ZoneDef.ordering exactly
  readonly tokenIDs: readonly string[];      // Visible token IDs (face-up)
  readonly hiddenTokenCount: number;         // Count of tokens hidden from this player
  readonly markers: readonly RenderMarker[];
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly isSelectable: boolean;            // Based on current choice context
  readonly isHighlighted: boolean;           // Adjacent zone highlighting, etc.
  readonly ownerID: PlayerId | null;         // Expanded per-player for owner zones
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface RenderAdjacency {
  readonly from: string;    // Zone ID
  readonly to: string;      // Zone ID
}

interface RenderMapSpace {
  readonly id: string;
  readonly displayName: string;
  readonly spaceType: string;
  readonly population: number;
  readonly econ: number;
  readonly terrainTags: readonly string[];
  readonly country: string;
  readonly coastal: boolean;
  readonly adjacentTo: readonly string[];
}

interface RenderToken {
  readonly id: string;
  readonly type: string;
  readonly zoneID: string;
  readonly ownerID: PlayerId | null;
  readonly faceUp: boolean;                  // Derived from zone visibility + reveal grants
  readonly properties: Readonly<Record<string, number | string | boolean>>;
  readonly isSelectable: boolean;
  readonly isSelected: boolean;
}

interface RenderVariable {
  readonly name: string;
  readonly value: number | boolean;          // Engine VariableValue: number | boolean only
  readonly displayName: string;              // formatIdAsDisplayName(name) fallback
}

interface RenderMarker {
  readonly id: string;
  readonly state: string;
  readonly possibleStates: readonly string[];  // From SpaceMarkerLatticeDef.states
}

interface RenderGlobalMarker {
  readonly id: string;
  readonly state: string;
  readonly possibleStates: readonly string[];  // From GlobalMarkerLatticeDef.states
}

interface RenderTrack {
  readonly id: string;
  readonly displayName: string;
  readonly scope: 'global' | 'faction';
  readonly faction: string | null;
  readonly min: number;
  readonly max: number;
  readonly currentValue: number;             // From global var or per-player var
}

interface RenderLastingEffect {
  readonly id: string;
  readonly sourceCardId: string;
  readonly side: 'unshaded' | 'shaded';
  readonly duration: string;                 // TurnFlowDuration: 'turn' | 'nextTurn' | 'round' | 'cycle'
  readonly displayName: string;              // Card title or formatIdAsDisplayName fallback
}

interface RenderInterruptFrame {
  readonly phase: string;
  readonly resumePhase: string;
}

interface RenderEventDeck {
  readonly id: string;
  readonly displayName: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly currentCardId: string | null;     // Derived from card-driven turn order state
  readonly currentCardTitle: string | null;
  readonly deckSize: number;                 // Token count in draw zone
  readonly discardSize: number;              // Token count in discard zone
}

interface RenderPlayer {
  readonly id: PlayerId;
  readonly displayName: string;              // formatIdAsDisplayName(playerId) or faction name
  readonly isHuman: boolean;                 // Derived from playerSeats
  readonly isActive: boolean;
  readonly isEliminated: boolean;
  readonly factionId: string | null;         // From turn order faction assignment
}

interface RenderActionGroup {
  readonly groupName: string;                // actionClass or "Actions" fallback
  readonly actions: readonly RenderAction[];
}

interface RenderAction {
  readonly actionId: string;
  readonly displayName: string;              // formatIdAsDisplayName(actionId)
  readonly isAvailable: boolean;
}

interface RenderChoiceStep {
  readonly decisionId: string;
  readonly name: string;
  readonly displayName: string;              // formatIdAsDisplayName(name)
  readonly chosenValue: MoveParamValue;
  readonly chosenDisplayName: string;        // formatIdAsDisplayName(String(chosenValue))
}

interface RenderChoiceOption {
  readonly value: MoveParamValue;            // Engine options are MoveParamValue, not string
  readonly displayName: string;
  readonly isLegal: boolean;
  readonly illegalReason: string | null;
}

interface RenderChoiceDomain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface RenderWarning {
  readonly code: string;
  readonly message: string;
}

type RenderTerminal =
  | { readonly type: 'win'; readonly player: PlayerId; readonly message: string;
      readonly victory?: RenderVictoryMetadata }
  | { readonly type: 'lossAll'; readonly message: string }
  | { readonly type: 'draw'; readonly message: string }
  | { readonly type: 'score'; readonly ranking: readonly RenderPlayerScore[];
      readonly message: string };

interface RenderPlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

interface RenderVictoryMetadata {
  readonly timing: string;                   // VictoryTiming: 'duringCoup' | 'finalCoup'
  readonly checkpointId: string;
  readonly winnerFaction: string;
  readonly ranking?: readonly RenderVictoryRankingEntry[];
}

interface RenderVictoryRankingEntry {
  readonly faction: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}
```

### D3: `deriveRenderModel()` Pure Function

`packages/runner/src/model/derive-render-model.ts`

**Signature** — requires a `RenderContext` parameter beyond just `(state, def, playerID)` because `isSelectable`/`isHighlighted` depend on choice-pending state and legal moves:

```typescript
interface RenderContext {
  readonly playerID: PlayerId;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, 'human' | 'ai-random' | 'ai-greedy'>;
  readonly terminal: TerminalResult | null;
}

function deriveRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
): RenderModel
```

Key responsibilities:

1. **Zones**: Map `GameDef.zones` to `RenderZone` entries. Per-player owner zones expand into one `RenderZone` per player (e.g., `hand:0`, `hand:1` from a single `hand` `ZoneDef` with `owner: 'player'`). Populate `tokenIDs` from `GameState.zones[zoneId]`.
2. **Hidden information**: Filter based on `playerID`, zone visibility, and `RevealGrant` (see D4).
3. **Markers**: Derive `RenderZone.markers` from `state.markers[spaceId]` cross-referenced with `def.markerLattices` for `possibleStates`.
4. **Global markers**: Derive from `state.globalMarkers` cross-referenced with `def.globalMarkerLattices`.
5. **Tracks**: Derive from `def.tracks`. Current value read from the corresponding global or per-player variable.
6. **Lasting effects**: Map `state.activeLastingEffects` to `RenderLastingEffect`. Look up card title from event deck definitions.
7. **Interrupt stack**: Map `state.interruptPhaseStack` to `RenderInterruptFrame`. Set `isInInterrupt = stack.length > 0`.
8. **Selectability**: Compute `isSelectable` / `isHighlighted` for zones and tokens based on `context.choicePending.options` and the current choice domain.
9. **Action grouping**: Group legal moves by `actionClass` when present on the `Move`. Moves without `actionClass` go into a single "Actions" fallback group. See D7 for algorithm.
10. **Choice extraction**: Map `ChoicePendingRequest` options to `RenderChoiceOption`. Expose `choiceType` (`'chooseOne'` or `'chooseN'`), `choiceMin`, `choiceMax`.
11. **Phase/turn order/active player**: Read from `state.currentPhase`, `state.activePlayer`, `state.turnOrderState`.
12. **Event decks**: Derive from `def.eventDecks`. Deck/discard sizes from zone token counts. Current card from card-driven turn order state (`runtime.currentCard`).
13. **Terminal**: Map engine `TerminalResult` to `RenderTerminal` (see D8).
14. **Map spaces**: Copy from `def.mapSpaces` with display name derivation.
15. **Warnings**: Map `legalMoveResult.warnings` to `RenderWarning`.

### D4: Hidden Information Filtering

The render model must enforce:

- **Public zones** (`visibility: 'public'`): All tokens visible to all players. Full properties exposed. `faceUp = true`.
- **Owner zones** (`visibility: 'owner'`): Tokens visible only when `playerID` matches the zone's owner. For non-owners: tokens are excluded from `tokenIDs`; the `hiddenTokenCount` field reflects how many tokens the player cannot see. `faceUp = false` for non-visible tokens (but they aren't in `tokenIDs`).
- **Hidden zones** (`visibility: 'hidden'`): No player sees individual tokens. `tokenIDs` is empty. `hiddenTokenCount` reflects the actual count. Useful for draw decks.
- **RevealGrants** (`state.reveals`): Temporary reveals override zone visibility. If the current player is in a grant's `observers` list (or observers is `'all'`), matching tokens become visible (`faceUp = true`) even in owner/hidden zones.
- **Face-up/face-down**: Derived purely from visibility rules, not stored as a token property in the engine.

### D5: Undo Support

The store delegates undo to the bridge:

- `undo()` calls `bridge.undo()`. If it returns `null` (no history), the store does nothing.
- After a successful undo, the store must also call `bridge.enumerateLegalMoves()` and `bridge.terminalResult()` to refresh the full query state for the restored position. The render model is then re-derived.
- Undo is only available for the human player's own moves.
- Undo during AI turns is not supported (AI turns are committed immediately).

### D6: Error & Loading State

The store tracks error and loading states:

- **`error: WorkerError | null`**: Set when any bridge call throws. `WorkerError` has `code` (`'ILLEGAL_MOVE' | 'VALIDATION_FAILED' | 'NOT_INITIALIZED' | 'INTERNAL_ERROR'`), `message`, and optional `details`.
- **`clearError(): void`**: Resets `error` to `null`.
- **`loading: boolean`**: Set to `true` before bridge calls, `false` after completion (success or error).
- **`gameLifecycle: 'idle' | 'initializing' | 'playing' | 'terminal'`**: Tracks the game session lifecycle. Transitions: `idle → initializing → playing → terminal`. `undo()` from terminal may return to `playing`.

### D7: Move Grouping Algorithm

Legal moves are grouped for the action toolbar:

1. Iterate over all moves from `legalMoveResult.moves`.
2. For each move, determine its group name:
   - If `move.actionClass` is defined and non-empty, use `formatIdAsDisplayName(move.actionClass)` as the group name.
   - Otherwise, use `"Actions"` as the fallback group name.
3. Within each group, deduplicate actions by `actionId` (many moves may share the same action with different params). Each unique `actionId` produces one `RenderAction`.
4. `RenderAction.isAvailable` is `true` if at least one legal move exists for that action.
5. `RenderAction.displayName` uses `formatIdAsDisplayName(actionId)`.

**Note on `unavailableReason`**: The engine's legal move enumeration simply omits unavailable actions; it does not provide reasons why an action is unavailable. The original spec's `unavailableReason` field on `RenderAction` has been removed. Illegality reasons are only available at the choice level via `ChoiceIllegalRequest.reason`.

### D8: Terminal Result Mapping

Engine `TerminalResult` maps to `RenderTerminal`:

| Engine variant | RenderTerminal |
|----------------|----------------|
| `{ type: 'win', player, victory? }` | `{ type: 'win', player, message: "Player N wins!", victory?: RenderVictoryMetadata }` |
| `{ type: 'lossAll' }` | `{ type: 'lossAll', message: "All players lose." }` |
| `{ type: 'draw' }` | `{ type: 'draw', message: "The game is a draw." }` |
| `{ type: 'score', ranking }` | `{ type: 'score', ranking: PlayerScore[] mapped to RenderPlayerScore[], message: "Game over — final rankings." }` |

`RenderVictoryMetadata` is derived from `VictoryTerminalMetadata`:
- `timing` → `string` (e.g., `'duringCoup'`, `'finalCoup'`)
- `checkpointId` → `string`
- `winnerFaction` → `string`
- `ranking` → mapped `VictoryTerminalRankingEntry[]` to `RenderVictoryRankingEntry[]`

### D9: Display Name Derivation

No `displayName` fields exist in engine types. The runner uses an ID-formatting fallback:

```typescript
/** Convert kebab-case or camelCase IDs to Title Case display names.
 *  Examples: 'train-us' → 'Train Us', 'activePlayer' → 'Active Player'
 */
function formatIdAsDisplayName(id: string): string
```

This utility is used for:
- Zone names (`RenderZone.displayName`)
- Player names (`RenderPlayer.displayName`)
- Action names (`RenderAction.displayName`)
- Variable names (`RenderVariable.displayName`)
- Phase names (`RenderModel.phaseDisplayName`)
- Choice step names (`RenderChoiceStep.displayName`, `chosenDisplayName`)
- Track names (`RenderTrack.displayName`)
- Event deck names (`RenderEventDeck.displayName`)

**Spec 42 (visual config)** will allow per-game display name overrides. Until then, `formatIdAsDisplayName` is the sole source.

### D10: Per-Player Zone Expansion

Owner zones in `GameDef.zones` (where `owner: 'player'`) are expanded at runtime into one zone per player. The zone IDs follow the pattern `{zoneId}:{playerId}` (e.g., `hand:0`, `hand:1`).

`deriveRenderModel()` must:
1. Detect owner zones from `GameDef.zones` where `owner === 'player'`.
2. For each such zone, emit one `RenderZone` per player (0 through `state.playerCount - 1`).
3. Set `ownerID` to the corresponding `PlayerId`.
4. Look up tokens from `state.zones[expandedZoneId]`.

### D11: Integration Tests

Test file: `packages/runner/test/store/game-store.test.ts`

Tests:
- [ ] `initGame()` populates store with initial state, legal moves, render model, and lifecycle = 'playing'
- [ ] `deriveRenderModel()` produces correct zones/tokens for Texas Hold'em initial state
- [ ] `deriveRenderModel()` produces correct zones/tokens for FITL initial state
- [ ] Hidden information: hole cards only visible to owning player
- [ ] Hidden information: opponent hand shows hiddenTokenCount but no token details
- [ ] `selectAction()` updates action selection and resets choice state
- [ ] `makeChoice()` progresses through multi-step choice chain
- [ ] `makeChoice()` supports `chooseN` multi-selection with min/max
- [ ] `cancelChoice()` steps back one choice in the breadcrumb
- [ ] `cancelMove()` resets to action selection
- [ ] `confirmMove()` calls bridge.applyMove, updates state, trace, trigger firings, and render model
- [ ] `undo()` restores previous state, re-enumerates legal moves, re-checks terminal, and recomputes render model
- [ ] Terminal state detection updates render model with terminal info and lifecycle = 'terminal'
- [ ] Error handling: invalid GameDef produces error state with `VALIDATION_FAILED` code
- [ ] Error handling: illegal move produces error state with `ILLEGAL_MOVE` code
- [ ] `clearError()` resets error to null
- [ ] Game lifecycle transitions: idle → initializing → playing → terminal
- [ ] Markers render correctly from state.markers + def.markerLattices
- [ ] Global markers render correctly from state.globalMarkers + def.globalMarkerLattices
- [ ] Tracks render with current values from variables
- [ ] Active lasting effects render with card titles
- [ ] Interrupt stack renders and isInInterrupt flag is correct
- [ ] Event deck state (deck size, discard size, current card) renders correctly
- [ ] Move grouping: moves with actionClass group correctly; ungrouped moves go to "Actions"

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
- **Static/dynamic separation** (optional optimization): Consider splitting into `RenderBoardDef` (zone definitions, adjacencies, map spaces — changes only on init) and `RenderBoardState` (token positions, markers, variables — changes every move). This avoids re-deriving static data on every move. Not required for MVP but recommended if the <5ms target is hard to meet.

### Effect Trace → Animation Mapping

The `effectTrace` entries map to visual animations:

| EffectTraceEntry.kind | Animation |
|-----------------------|-----------|
| `moveToken` | Token slides from `from` zone to `to` zone |
| `setTokenProp` | Token visual state change (e.g., flip, status icon) |
| `varChange` | Numeric counter animation (e.g., score ticking up/down) |
| `resourceTransfer` | Numeric counter animation between source and destination |
| `createToken` | Token appears in zone |
| `lifecycleEvent` | Phase transition banner/animation |
| `forEach` / `reduce` | Container for child animations (batch) |

`triggerFirings` (from `ApplyMoveResult`) provide trigger-level context for animation grouping and are needed by the animation system (Spec 40).

### `formatIdAsDisplayName` Utility

`packages/runner/src/utils/format-display-name.ts`

```typescript
/**
 * Convert engine IDs to human-readable display names.
 * - kebab-case: 'train-us' → 'Train Us'
 * - camelCase: 'activePlayer' → 'Active Player'
 * - snake_case: 'total_support' → 'Total Support'
 * - Numeric suffixes preserved: 'hand:0' → 'Hand 0'
 */
export function formatIdAsDisplayName(id: string): string;
```

---

## Out of Scope

- PixiJS rendering (Spec 38)
- React DOM components (Spec 39)
- Animation processing (Spec 40)
- Visual config / display name overrides (Spec 42)
- AI agent move selection (AI integration is a concern of the game loop coordinator, not the store)
