# Spec 43: Session Management

**Status**: OPEN
**Priority**: P2
**Complexity**: L
**Dependencies**: Spec 42 (Per-Game Visual Config)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 8-9
**Ticket prefix**: SESSMGMT

---

## Objective

Implement game session management: game selection, pre-game configuration, save/load via IndexedDB, replay mode with scrubber, and event log panel. This spec turns the functional game runner (Specs 35-42, all completed) into a self-contained application.

**Success criteria**: A user can launch the runner, select a game from a list, configure players and seed, play to completion, save their progress, reload and continue, replay a past game with full animation and scrubber, view a human-readable event log, and navigate between all screens without data loss.

---

## Constraints

- Game saves use Dexie.js (IndexedDB) -- no server, no cloud, no file system access.
- Replay mode uses the kernel's determinism: seed + move sequence reproduces the exact game.
- Visual display names and colors come from Spec 42's `VisualConfigProvider` -- this spec does not define its own visual mapping.
- App-level navigation (session router) is separate from the game lifecycle store (`idle|initializing|playing|terminal`).
- D0 is the only deliverable that touches the engine package. All other deliverables are runner-only.

---

## Issues Addressed

This spec revision addresses 7 issues found in the original Spec 43:

| # | Issue | Resolution |
|---|-------|------------|
| 1 | `GameSpecMetadata` and `GameDef.metadata` lack `name`/`description` -- spec assumes they exist | D0: Add optional `name` and `description` to both types, compile through, update schemas |
| 2 | No session-level navigation architecture -- `App.tsx` renders `GameContainer` unconditionally | D1: Add `AppScreen` state machine above the game store |
| 3 | No "return to menu" flow from terminal, mid-game, or replay | D1: Full navigation with unsaved-changes warning |
| 4 | Hardcoded visual config switch in `bootstrap-registry.ts` | D2: Replace with `import.meta.glob` data-driven discovery |
| 5 | Event log translation approach unspecified (needs display names) | D7: Use `VisualConfigProvider` + `formatIdAsDisplayName()` fallback |
| 6 | Replay only has step controls, no scrubber for long games | D6: Full progress bar scrubber with jump-to-move |
| 7 | Brainstorming doc mentions per-move chunking but it's overkill | D5: Keep simple single IndexedDB record per save |

---

## Deliverables

### D0: Engine Metadata Enrichment

Add optional `name` and `description` fields to `GameSpecMetadata` and `GameDef.metadata` so the game selection screen can display human-readable game info without loading full game definitions.

**Files to modify (engine package)**:

- `packages/engine/src/cnl/game-spec-doc.ts` -- Add to `GameSpecMetadata`:
  ```typescript
  readonly name?: string;
  readonly description?: string;
  ```

- `packages/engine/src/kernel/types-core.ts` -- Add to `GameDef.metadata`:
  ```typescript
  readonly name?: string;
  readonly description?: string;
  ```

- `packages/engine/src/kernel/schemas-core.ts` -- Add to `GameDefSchema.metadata`:
  ```typescript
  name: z.string().optional(),
  description: z.string().optional(),
  ```

- `packages/engine/src/cnl/compiler-core.ts` -- Update the metadata pass-through (around line 217) to include the new fields:
  ```typescript
  const runtimeMetadata =
    metadata === null
      ? null
      : {
          id: metadata.id,
          players: metadata.players,
          ...(metadata.maxTriggerDepth === undefined ? {} : { maxTriggerDepth: metadata.maxTriggerDepth }),
          ...(metadata.name === undefined ? {} : { name: metadata.name }),
          ...(metadata.description === undefined ? {} : { description: metadata.description }),
        };
  ```

- Regenerate JSON schema artifacts: `pnpm turbo schema:artifacts`

**Files to modify (data assets)**:

- `data/games/fire-in-the-lake/*.md` -- Add `name` and `description` to the metadata YAML block:
  ```yaml
  metadata:
    id: fire-in-the-lake
    name: "Fire in the Lake"
    description: "A 4-faction COIN-series wargame set in the Vietnam War"
    players:
      min: 2
      max: 4
  ```

- `data/games/texas-holdem/*.md` -- Same pattern:
  ```yaml
  metadata:
    id: texas-holdem-nlhe-tournament
    name: "Texas Hold'em"
    description: "No-limit Texas Hold'em poker tournament"
    players:
      min: 2
      max: 10
  ```

- Bootstrap fixture GameDef JSONs (`packages/runner/src/bootstrap/*-game-def.json`) -- Add `name` and `description` to the metadata objects.

**Acceptance criteria**:
- [ ] `GameSpecMetadata.name` and `.description` are optional strings
- [ ] `GameDef.metadata.name` and `.description` are optional strings
- [ ] Zod schema validates new fields
- [ ] Compiler passes them through when present
- [ ] JSON Schema artifacts regenerated
- [ ] Both production game specs include the new fields
- [ ] Bootstrap fixture JSONs include the new fields
- [ ] All engine tests pass (`pnpm -F @ludoforge/engine test`)

---

### D1: App-Level Session Router

Add a session-level navigation layer ABOVE the game store. Currently `App.tsx` renders `GameContainer` unconditionally. This deliverable adds an `AppScreen` state machine that routes between screens and manages game bridge lifecycle.

**New files**:

- `packages/runner/src/session/session-types.ts`:
  ```typescript
  export type AppScreen = 'gameSelection' | 'preGameConfig' | 'activeGame' | 'replay';

  export interface GameSelectionState {
    readonly screen: 'gameSelection';
  }

  export interface PreGameConfigState {
    readonly screen: 'preGameConfig';
    readonly gameId: string;
  }

  export interface ActiveGameState {
    readonly screen: 'activeGame';
    readonly gameId: string;
    readonly seed: bigint;
    readonly playerConfig: readonly PlayerSeatConfig[];
  }

  export interface ReplayState {
    readonly screen: 'replay';
    readonly gameId: string;
    readonly seed: bigint;
    readonly moveHistory: readonly Move[];
  }

  export type SessionState =
    | GameSelectionState
    | PreGameConfigState
    | ActiveGameState
    | ReplayState;

  export interface PlayerSeatConfig {
    readonly playerId: number;
    readonly type: 'human' | 'ai-random' | 'ai-greedy';
  }
  ```

- `packages/runner/src/session/session-store.ts`:
  Zustand store with:
  - `sessionState: SessionState` (initial: `{ screen: 'gameSelection' }`)
  - `unsavedChanges: boolean` (tracks whether active game has unsaved moves)
  - `moveAccumulator: readonly Move[]` (accumulates moves during play for save/replay)
  - Navigation actions:
    - `selectGame(gameId: string)` -- `gameSelection` -> `preGameConfig`
    - `startGame(seed: bigint, playerConfig: PlayerSeatConfig[])` -- `preGameConfig` -> `activeGame`
    - `returnToMenu()` -- any screen -> `gameSelection` (caller handles unsaved-changes confirmation)
    - `startReplay(gameId: string, seed: bigint, moveHistory: Move[])` -- `gameSelection` -> `replay`
    - `newGame()` -- `activeGame` (terminal) -> `preGameConfig` (same game)
    - `recordMove(move: Move)` -- appends to `moveAccumulator`, sets `unsavedChanges = true`
    - `markSaved()` -- sets `unsavedChanges = false`

**Files to modify**:

- `packages/runner/src/App.tsx` -- Refactor to route between screens based on `sessionStore.sessionState.screen`:
  - `'gameSelection'` -> render `<GameSelectionScreen />`
  - `'preGameConfig'` -> render `<PreGameConfigScreen />`
  - `'activeGame'` -> render `<GameContainer />` (creates bridge/store on mount, destroys on unmount)
  - `'replay'` -> render `<ReplayScreen />`
  - Game bridge and game store are created only for `activeGame` and `replay` screens
  - On screen exit: bridge cleanup (terminate worker, reset store)

**Transition rules**:

```
gameSelection  -- selectGame(id) -->     preGameConfig
preGameConfig  -- startGame(...) -->     activeGame
preGameConfig  -- returnToMenu() -->     gameSelection
activeGame     -- returnToMenu() -->     gameSelection  (unsaved-changes dialog if unsavedChanges=true)
activeGame     -- newGame() -->          preGameConfig  (same gameId; only from terminal state)
replay         -- returnToMenu() -->     gameSelection
```

**Navigation flows integrated into existing UI**:

- Terminal overlay (`packages/runner/src/ui/overlays/TerminalOverlay.tsx`): Add "Return to Menu" and "New Game" buttons
- Toolbar (`packages/runner/src/ui/Toolbar.tsx`): Add "Quit" button that triggers unsaved-changes confirmation dialog -> `returnToMenu()`
- Replay screen: "Back to Menu" button -> `returnToMenu()`

**Acceptance criteria**:
- [ ] `AppScreen` type and `SessionState` discriminated union defined
- [ ] Session store manages navigation state with Zustand
- [ ] `App.tsx` routes between all 4 screens
- [ ] Game bridge created on `activeGame`/`replay` entry, destroyed on exit
- [ ] Unsaved-changes confirmation dialog appears when quitting mid-game with unsaved progress
- [ ] Terminal overlay has "Return to Menu" and "New Game" buttons
- [ ] Toolbar has "Quit" button
- [ ] Move accumulator tracks all moves for save/replay

---

### D2: Data-Driven Game Discovery

Replace the hardcoded `resolveVisualConfigYaml()` switch with `import.meta.glob` for automatic discovery. Keep bootstrap metadata canonical by reading display data from compiled `GameDef.metadata` (originating in `GameSpecDoc`) rather than duplicating those fields in `bootstrap-targets.json`.

**Files to modify**:

- `packages/runner/src/bootstrap/bootstrap-targets.json` -- keep manifest focused on bootstrap routing/fixture linkage only (`id`, `queryValue`, `defaultSeed`, `defaultPlayerId`, `sourceLabel`, `fixtureFile`, `generatedFromSpecPath`). Do not add display metadata fields.

- `packages/runner/src/bootstrap/bootstrap-registry.ts`:
  - Replace the hardcoded `resolveVisualConfigYaml()` function with `import.meta.glob`:
    ```typescript
    const VISUAL_CONFIGS = import.meta.glob('../../../../data/games/*/visual-config.yaml', {
      eager: true,
      import: 'default',
    }) as Record<string, unknown>;
    ```
  - Map each bootstrap target's `generatedFromSpecPath` to the glob results to find the matching visual config YAML
  - Fallback to `null` when no visual config file exists for a game (e.g., the `default` target)
  - Remove any hardcoded imports/exports of per-game visual config constants
  - Keep `resolveVisualConfigYaml` synchronous

**Acceptance criteria**:
- [ ] Bootstrap manifest remains minimal and does not duplicate `name`/`description`/player-range metadata
- [ ] Visual config resolution uses `import.meta.glob` -- no hardcoded game-specific imports
- [ ] Adding `data/games/new-game/visual-config.yaml` auto-discovers it with zero code changes
- [ ] Existing games still load their visual configs correctly
- [ ] All runner tests pass

---

### D3: Game Selection Screen

The landing page of the runner SPA. Lists available games and saved games.

**New file**: `packages/runner/src/ui/GameSelectionScreen.tsx`

- Lists games from `listBootstrapDescriptors()`, filtering out the `'default'` entry
- Displays per game from compiled `GameDef.metadata`: `name`, `description`, player range (`metadata.players.min`-`metadata.players.max`)
- Saved games section: queries `listSavedGames()` from D5's save manager, shows save name, game name, timestamp, move count
- Click a game card -> `sessionStore.selectGame(gameId)` -> navigates to `preGameConfig`
- Click a saved game -> either:
  - "Resume" -> reconstructs state via `loadGame()`, navigates to `activeGame`
  - "Replay" -> navigates to `replay` with the save's seed + moveHistory
- Delete saved game button with confirmation

**Acceptance criteria**:
- [ ] Game selection screen is the landing page
- [ ] Lists all registered games (except `default`) with metadata resolved from compiled GameDef fixtures
- [ ] Saved games section shows existing saves
- [ ] Clicking a game navigates to pre-game config
- [ ] Clicking a saved game offers resume and replay options
- [ ] Saved games can be deleted

---

### D4: Pre-Game Configuration Screen

Configure player count, seat assignments, and optional seed before starting a game.

**New file**: `packages/runner/src/ui/PreGameConfigScreen.tsx`

- **Player count slider**: Within the game's compiled metadata player range (`GameDef.metadata.players.min`-`max`)
- **Seat assignment table**: For each seat (0..playerCount-1):
  - Label: Uses `VisualConfigProvider.getFactionDisplayName(factionId)` for games with factions, else "Player N"
  - Dropdown: "Human" | "AI - Random" | "AI - Greedy"
- **Optional seed field**: Empty = random seed (generated from `crypto.getRandomValues`). Non-empty = deterministic game.
- **"Start Game" button**: Creates bridge, initializes worker with selected GameDef + seed + player config, navigates to `activeGame`
- **"Back" button**: Returns to `gameSelection`

**Acceptance criteria**:
- [ ] Player count adjustable within game's min/max range
- [ ] Each seat can be assigned Human or AI type
- [ ] Faction display names used when available (from `VisualConfigProvider`)
- [ ] Random seed generated when field is empty
- [ ] "Start Game" initializes game and navigates to active game
- [ ] "Back" returns to game selection

---

### D5: Save/Load Persistence (Dexie.js)

IndexedDB-backed game persistence using Dexie.js. Saves store seed + move history as a single record (no chunking -- move arrays are ~50-100KB for 500 moves).

**New dependency**: Add `dexie` to `packages/runner/package.json`

**New files**:

- `packages/runner/src/persistence/game-db.ts`:
  ```typescript
  import Dexie from 'dexie';

  export interface SavedGameRecord {
    readonly id: string;           // Auto-generated UUID
    readonly gameId: string;       // Bootstrap target id (e.g., 'fitl', 'texas')
    readonly gameName: string;     // Human-readable (e.g., 'Fire in the Lake')
    readonly displayName: string;  // User-provided save name
    readonly timestamp: number;    // Date.now()
    readonly seed: string;         // Original seed (stringified BigInt)
    readonly moveHistory: Move[];  // Complete move sequence
    readonly playerConfig: PlayerSeatConfig[];  // Human/AI assignments
    readonly playerId: number;     // Which seat the human was playing
    readonly moveCount: number;    // Length of moveHistory (for display without deserializing)
    readonly isTerminal: boolean;  // Whether the game was finished
  }
  ```
  Dexie database class with a `saves` table, indexed by `id`, `gameId`, and `timestamp`.

- `packages/runner/src/persistence/save-manager.ts`:
  - `saveGame(record: Omit<SavedGameRecord, 'id'>): Promise<string>` -- generates UUID, stores record, returns id
  - `loadGame(id: string): Promise<SavedGameRecord | undefined>` -- retrieves by id
  - `listSavedGames(gameId?: string): Promise<SavedGameRecord[]>` -- lists saves, optionally filtered by gameId, ordered by timestamp desc
  - `deleteSavedGame(id: string): Promise<void>` -- deletes by id

- `packages/runner/src/ui/SaveGameDialog.tsx`:
  - Modal dialog with a name input field and "Save" / "Cancel" buttons
  - On save: collects current seed + moveAccumulator from session store, player config, game id -> calls `saveGame()`
  - On success: calls `sessionStore.markSaved()`, closes dialog

- `packages/runner/src/ui/LoadGameDialog.tsx`:
  - Modal dialog listing saved games for the current game (or all games)
  - Per save: display name, timestamp, move count, terminal status
  - Buttons: "Resume" (loads and continues), "Replay" (enters replay mode), "Delete" (with confirmation)

**Move accumulation**:

The session store (D1) accumulates moves during play via `recordMove()`. This is called from the game bridge after each `applyMove()` response. The save dialog reads from `sessionStore.moveAccumulator`.

**Load / resume flow**:

1. `loadGame(id)` retrieves the `SavedGameRecord`
2. Create bridge, initialize worker with the game's GameDef and the saved seed
3. Call `bridge.playSequence(moveHistory)` to reconstruct state
4. If `isTerminal === false`, the human can continue playing from where they left off
5. If `isTerminal === true`, offer replay instead

**Acceptance criteria**:
- [ ] Dexie.js database created with `saves` table
- [ ] Save game stores seed + complete move history as a single IndexedDB record
- [ ] Load game reconstructs state via `bridge.init() + bridge.playSequence(moveHistory)`
- [ ] Saved games are listed with metadata (name, timestamp, move count)
- [ ] Saved games can be deleted
- [ ] Session store tracks unsaved changes and move accumulation
- [ ] Resume from save continues play from the saved point

---

### D6: Replay Controller

Full replay system with scrubber for jumping to any move in a completed game.

**New files**:

- `packages/runner/src/replay/replay-controller.ts`:
  ```typescript
  export interface ReplayController {
    readonly totalMoves: number;
    readonly currentMoveIndex: number;  // -1 = initial state, 0 = after first move, etc.
    readonly isPlaying: boolean;
    readonly playbackSpeed: number;     // 0.5, 1, 2, 4

    stepForward(): Promise<void>;
    stepBackward(): Promise<void>;
    jumpToMove(index: number): Promise<void>;
    play(): void;
    pause(): void;
    setSpeed(speed: number): void;
  }
  ```

  Implementation details:
  - **`stepForward()`**: Apply next move from moveHistory via `bridge.applyMove()` with trace enabled. Animation plays for this move.
  - **`stepBackward()`**: Reset game via `bridge.init(def, seed)`, then `bridge.playSequence(moveHistory[0..currentIndex-1])` with trace disabled. Efficient for going back one step.
  - **`jumpToMove(index)`**: Reset game via `bridge.init(def, seed)`, then:
    - If `index > 0`: `bridge.playSequence(moveHistory[0..index-1])` with trace disabled (fast, no animation)
    - Apply `moveHistory[index]` with trace enabled (animation plays for the landing move)
    - This gives visual context for where you jumped to
  - **`play()`**: Start auto-advance timer. Calls `stepForward()` at intervals determined by `playbackSpeed`.
  - **`pause()`**: Stop auto-advance timer.
  - **`setSpeed(speed)`**: Adjust playback speed (0.5x, 1x, 2x, 4x).

- `packages/runner/src/replay/replay-store.ts`:
  Zustand store for replay UI state:
  - `currentMoveIndex: number`
  - `isPlaying: boolean`
  - `playbackSpeed: number`
  - `totalMoves: number`
  - Actions mirror the `ReplayController` interface

- `packages/runner/src/ui/ReplayControls.tsx`:
  - **Progress bar / scrubber**: Slider from 0 to `totalMoves`. Dragging or clicking jumps to that move via `jumpToMove()`.
  - **Step buttons**: |<< (to start), < (back one), > (forward one), >>| (to end)
  - **Play/Pause toggle**: Start/stop auto-advance
  - **Speed selector**: 0.5x, 1x, 2x, 4x
  - **Move counter**: "Move 15 / 237"
  - **"Back to Menu" button**: Returns to game selection

  **Keyboard shortcuts**:
  - Left arrow: step backward
  - Right arrow: step forward
  - Space: play/pause toggle
  - Home: jump to start
  - End: jump to end

- `packages/runner/src/ui/ReplayScreen.tsx`:
  Wrapper component that:
  - Creates a game bridge and store in read-only mode
  - Initializes the replay controller with the saved game's seed + moveHistory
  - Renders `<GameContainer />` (read-only, no action toolbar or choice UI) + `<ReplayControls />`
  - Destroys bridge on unmount

**Acceptance criteria**:
- [ ] Replay initializes game from seed
- [ ] Step forward applies next move with animation
- [ ] Step backward reconstructs prior state
- [ ] Progress bar scrubber allows jumping to any move
- [ ] Jump-to-move plays animation for the landing move
- [ ] Play/pause auto-advances through moves
- [ ] Speed control works (0.5x, 1x, 2x, 4x)
- [ ] Keyboard shortcuts work (arrows, space, home, end)
- [ ] "Back to Menu" returns to game selection
- [ ] Game container is read-only during replay (no action toolbar)

---

### D7: Event Log Panel

Scrollable, filterable log of game events translated into human-readable text using existing visual config infrastructure.

**New files**:

- `packages/runner/src/model/translate-effect-trace.ts`:

  Pure function that translates raw kernel trace data into human-readable event log entries:

  ```typescript
  export interface EventLogEntry {
    readonly id: string;          // Unique entry id
    readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle';
    readonly message: string;     // Human-readable description
    readonly playerId?: number;   // Associated player/faction
    readonly zoneIds: readonly string[];   // Referenced zones (for click-to-highlight)
    readonly tokenIds: readonly string[];  // Referenced tokens
    readonly depth: number;       // Trigger nesting depth (0 = top-level)
    readonly moveIndex: number;   // Which move this belongs to
  }

  export function translateEffectTrace(
    effectTrace: readonly EffectTraceEntry[],
    triggerLog: readonly TriggerLogEntry[],
    visualConfig: VisualConfigProvider,
    gameDef: GameDef,
    moveIndex: number,
  ): readonly EventLogEntry[];
  ```

  **Display name resolution** (priority order):
  1. `VisualConfigProvider.getZoneLabel(zoneId)` for zone names
  2. `VisualConfigProvider.getFactionDisplayName(factionId)` for faction/player names
  3. `formatIdAsDisplayName()` from `packages/runner/src/utils/format-display-name.ts` as universal fallback for any id (zone, token type, variable name, action id, etc.)

  Example translations:
  - `EffectTraceMoveToken`: "VC moved 3 Guerrillas from Saigon to Can Tho" (uses faction display name, zone labels, token type display name)
  - `EffectTraceVarChange`: "Pot increased to 15,000" (uses variable display name)
  - `EffectTraceCreateToken`: "Dealt Ace Of Spades to Player 1" (uses `formatIdAsDisplayName` for token type)
  - `EffectTraceDestroyToken`: "Removed 2 NVA Troops from Hue" (faction, token type, zone)
  - `TriggerFiring`: "Terror triggered: shifted Saigon to Active Opposition" (nested under parent move)

- `packages/runner/src/ui/EventLogPanel.tsx`:
  - Scrollable log of `EventLogEntry[]`, grouped by move index
  - Auto-scrolls to latest entry (with scroll-lock when user scrolls up)
  - **Clickable events**: Clicking an entry dispatches highlight for its `zoneIds`/`tokenIds` on the canvas (integrates with existing canvas selection/highlight system)
  - **Filter by event kind**: Toggle buttons for movement, variables, triggers, phases, tokens
  - **Collapsible trigger chains**: Entries with `depth > 0` are nested under their parent and shown as expandable groups
  - **Move grouping**: Visual separator between moves with move number label

**Optional visual config enhancement**:

- `packages/runner/src/config/visual-config-types.ts` -- Add optional `displayName` to `TokenTypeVisualStyleSchema`:
  ```typescript
  const TokenTypeVisualStyleSchema = z.object({
    shape: TokenShapeSchema.optional(),
    color: z.string().optional(),
    size: z.number().optional(),
    symbol: z.string().optional(),
    backSymbol: z.string().optional(),
    symbolRules: z.array(TokenSymbolRuleSchema).optional(),
    displayName: z.string().optional(),  // NEW: human-readable name for event log
  });
  ```
  Games can provide `displayName` in their `visual-config.yaml` for token types (e.g., `displayName: "Guerrilla"` for `nva-guerrilla`). When absent, `formatIdAsDisplayName()` generates one from the token type id.

- `packages/runner/src/config/visual-config-provider.ts` -- Add method:
  ```typescript
  getTokenTypeDisplayName(tokenTypeId: string): string | null {
    return this.config?.tokenTypes?.[tokenTypeId]?.displayName ?? null;
  }
  ```

**Integration with existing UI**:

- `EventLogPanel` is added as a new panel in the DOM UI layer (sibling to scoreboard, variables, hand panels)
- Panel visibility toggled via toolbar button or keyboard shortcut

**Acceptance criteria**:
- [ ] Effect trace entries translated to human-readable text
- [ ] Zone names use `VisualConfigProvider.getZoneLabel()` with `formatIdAsDisplayName()` fallback
- [ ] Faction names use `VisualConfigProvider.getFactionDisplayName()` with `formatIdAsDisplayName()` fallback
- [ ] Token type names use `VisualConfigProvider.getTokenTypeDisplayName()` with `formatIdAsDisplayName()` fallback
- [ ] Event log auto-scrolls to latest entry
- [ ] Clicking an event highlights zones/tokens on canvas
- [ ] Events filterable by kind (movement, variable, trigger, phase, token)
- [ ] Trigger chains are collapsible (depth-based nesting)
- [ ] Events grouped by move with visual separators
- [ ] Optional `displayName` field works in `TokenTypeVisualStyleSchema`

---

## Deliverable Dependency Graph

```
D0 (Engine metadata)
 └── D3 (Game selection)
D2 (Data-driven discovery)
 └── D3 (Game selection)
D1 (Session router)
 ├── D4 (Pre-game config)
 ├── D5 (Save/Load) ── D6 (Replay)
 └── D7 (Event log)  [parallel with D3-D6]
```

**Implementation order**: D0 + D2 -> D1 -> D3 + D7 (parallel) -> D4 -> D5 -> D6

---

## Key Architectural Decisions

1. **Session store separate from game store**: Game lifecycle stays `idle|initializing|playing|terminal`. App routing is a separate concern above it. Game bridge/store created per-session, destroyed on exit.

2. **`import.meta.glob` for visual config resolution**: Vite build-time file discovery. Adding `data/games/new-game/visual-config.yaml` auto-discovers it. Zero code changes for new games.

3. **Canonical metadata source**: Selection-screen display metadata comes from compiled `GameDef.metadata` (originating in `GameSpecDoc`), not duplicated fields in `bootstrap-targets.json`, preventing drift.

4. **`playSequence` for replay jumps**: Kernel determinism means `reset + playSequence(moves[0..N])` reaches any state. No snapshots or per-move caching needed.

5. **Single IndexedDB record per save**: Move arrays are ~50-100KB for 500 moves. Simple Dexie.js record, no chunking.

6. **Event log uses VisualConfigProvider + formatIdAsDisplayName fallback**: Reuses existing infrastructure. No separate display name system.

7. **TokenTypeVisualStyle gains optional displayName**: Allows games to provide human-readable token type names in visual config for the event log.

---

## Verification

- [ ] All 7 issues documented above are addressed
- [ ] D0-D7 deliverables have clear file paths, interfaces, and acceptance criteria
- [ ] Session router state machine and transitions are fully specified
- [ ] Navigation flows cover: terminal -> menu, mid-game quit, replay -> menu, preGameConfig -> back
- [ ] Engine metadata changes specified for both `GameSpecMetadata` and `GameDef.metadata`
- [ ] Event log translation approach specified with `VisualConfigProvider` + `formatIdAsDisplayName`
- [ ] Replay scrubber (jump-to-move) specified with implementation approach
- [ ] Save format specified as single Dexie.js record
- [ ] Data-driven discovery via `import.meta.glob` specified
- [ ] Cross-references between specs are correct
- [ ] All engine tests pass after D0
- [ ] All runner tests pass after D1-D7

---

## Out of Scope

- Per-game visual config (see Spec 42 -- completed)
- Cloud save sync
- Game sharing / export
- User accounts or preferences persistence beyond IndexedDB
- GameSpecDoc compilation (the runner consumes pre-compiled GameDef JSON)
- Multiplayer / networking
- Touch device optimization
