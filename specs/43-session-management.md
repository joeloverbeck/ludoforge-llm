# Spec 43: Session Management

**Status**: OPEN
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 42 (Per-Game Visual Config — game selection needs visual config for display names and preview)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 8–9
**Ticket prefix**: SESSMGMT

---

## Objective

Implement game session management: game selection, pre-game configuration, save/load via IndexedDB, replay mode, and event log panel. This spec turns the functional game runner into a polished, self-contained application.

**Success criteria**: A user can launch the runner, select a game, configure players, play to completion, save their progress, reload and continue, and replay a past game with full animation.

---

## Constraints

- Game saves use Dexie.js (IndexedDB) — no server, no cloud, no file system access.
- Replay mode uses the kernel's determinism: seed + move sequence reproduces the exact game.
- Visual display names and colors come from Spec 42's `VisualConfigProvider` — this spec does not define its own visual mapping.

---

## Deliverables

### D1: Game Selection Screen

`packages/runner/src/ui/GameSelectionScreen.tsx`

- List available games from compiled GameDef files.
- Display: game name, player count range, brief description (from GameSpecDoc metadata).
- Display names and colors come from `VisualConfigProvider` (Spec 42).
- Click a game to proceed to pre-game configuration.
- This is the landing page of the runner SPA.

Game discovery: scan `data/games/*/` for compiled GameDef JSON files, or maintain a manifest.

### D2: Pre-Game Configuration

`packages/runner/src/ui/PreGameConfig.tsx`

- **Player count**: Select within GameDef's min/max player range.
- **Seat assignment**: For each seat, choose "Human" or AI type (Random Agent, Greedy Agent).
- **Random seed**: Optional field. Empty = random seed. Specified = deterministic game.
- **Start Game** button: initializes the worker bridge with the selected GameDef, seed, and player assignments.

### D3: Save/Load Game (Dexie.js)

`packages/runner/src/persistence/game-db.ts`

Dexie.js database with tables:

```typescript
interface SavedGame {
  id: string;              // Auto-generated UUID
  gameName: string;        // e.g., "texas-holdem"
  timestamp: number;       // Date.now()
  seed: string;            // Original seed (stringified BigInt)
  moveHistory: Move[];     // Complete move sequence
  playerConfig: PlayerConfig[];  // Human/AI assignments
  displayName: string;     // User-provided save name
}
```

**Save**: Serialize seed + move history. The GameState can be reconstructed deterministically.
**Load**: Replay seed + move history through the kernel to reconstruct state. Resume play from that point.

UI components:
- `packages/runner/src/ui/SaveGameDialog.tsx` — name input + save button.
- `packages/runner/src/ui/LoadGameDialog.tsx` — list saved games, load or delete.

### D4: Replay Mode

`packages/runner/src/replay/replay-controller.ts`

Given a saved game (seed + move history):

- Initialize game from seed.
- Step through moves one at a time, playing effect trace animations for each.
- Controls: step-forward, step-backward (undo), play/pause, speed control.
- Step-backward uses the undo stack (replay from start to move N-1).
- Progress bar showing current move / total moves.

UI: `packages/runner/src/ui/ReplayControls.tsx`

### D5: Event Log Panel

`packages/runner/src/ui/EventLogPanel.tsx`

Scrollable log of game events:

- Translate `EffectTraceEntry[]` into human-readable text:
  - `moveToken`: "Player 2 moved 3 guerrillas from Saigon to Can Tho"
  - `varChange`: "Pot increased to 15,000"
  - `createToken`: "Dealt Ace of Spades to Player 1"
  - Trigger firings: "Terror triggered: shifted Saigon to Active Opposition"
- Auto-scrolls to latest event.
- **Clickable events**: clicking highlights relevant zones/tokens on the canvas.
- **Filterable**: filter by event type (moves, triggers, phase changes) or by player/faction.
- **Collapsible trigger chains**: nested triggers shown as expandable groups.

---

## Verification

- [ ] Game selection screen lists available games
- [ ] Pre-game configuration allows player count and seat assignment
- [ ] Game starts with specified seed and player config
- [ ] Save game stores seed + move history in IndexedDB
- [ ] Load game reconstructs state and allows continued play
- [ ] Replay mode steps through moves with animation
- [ ] Replay step-backward works correctly
- [ ] Event log shows human-readable effect trace
- [ ] Clicking an event log entry highlights zones on canvas
- [ ] Event log filtering by type and player works

---

## Out of Scope

- Per-game visual config (see Spec 42)
- Cloud save sync
- Game sharing / export
- User accounts or preferences persistence beyond IndexedDB
- GameSpecDoc compilation (the runner consumes pre-compiled GameDef JSON)
