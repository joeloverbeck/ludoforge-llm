# Spec 42: Per-Game Visual Config & Session Management

**Status**: ACTIVE
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 38 (PixiJS Canvas Foundation), Spec 39 (React DOM UI Layer)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 7–9

---

## Objective

Implement the per-game visual configuration system (data-driven visual mapping) and game session management (selection, configuration, save/load, replay, event log). This spec turns the functional game runner into a polished, self-contained application.

**Success criteria**: A user can launch the runner, select a game, configure players, play to completion, save their progress, reload and continue, and replay a past game with full animation.

---

## Constraints

- The visual config file is **display-only**. The kernel and compiler never read it. It is consumed solely by the browser runner.
- The runner MUST work without a visual config file. All visual config enhancements are optional overlays on top of default rendering.
- Game saves use Dexie.js (IndexedDB) — no server, no cloud, no file system access.
- Replay mode uses the kernel's determinism: seed + move sequence reproduces the exact game.

---

## Part A: Per-Game Visual Configuration

### D1: Visual Config YAML Schema

`packages/runner/src/config/visual-config-schema.ts`

Define a Zod schema for the visual config YAML:

```yaml
# data/games/<game>/visual-config.yaml
version: 1

colors:
  factions:
    us: "#1a5f2a"
    arvn: "#f5d442"
    nva: "#cc3333"
    vc: "#666666"
  players:
    player-0: "#1a5f2a"
    player-1: "#cc3333"

tokens:
  us-troops:
    sprite: "sprites/us-troop.png"    # Optional, falls back to colored circle
    shape: "circle"
    size: 24
  event-card:
    shape: "rect"
    size: [80, 120]                    # width x height for cards

zones:
  styles:
    city:
      shape: "circle"
      size: 80
      fill: "#e0d5c1"
      stroke: "#333"
    province:
      shape: "hex"
      size: 60
      fill: "#b8d4a0"
    loc:
      shape: "line"
      width: 4
      color: "#888"

layout:
  hints:
    regions:
      - name: "North Vietnam"
        zones: ["hanoi", "haiphong", "north-vietnam"]
        position: "top-left"
      - name: "Saigon Area"
        zones: ["saigon", "can-tho", "bien-hoa"]
        position: "bottom-right"
    fixed:
      - zone: "available-forces-us"
        x: -200
        y: 400

animations:
  actions:
    bombard: "explosion"
    sweep: "scan"
    terror: "shake"
    deal: "card-fly"

cards:
  templates:
    event-card:
      width: 200
      height: 300
      layout:
        title: { y: 20, fontSize: 16, align: "center" }
        text: { y: 80, fontSize: 11, align: "left", wrap: 180 }
        faction-icon: { y: 260, align: "center" }

variables:
  prominent:
    - "pot"
    - "currentBet"
    - "blindLevel"
  panels:
    - name: "Faction Resources"
      vars: ["resources-us", "resources-arvn", "resources-nva", "resources-vc"]
  formatting:
    chips: { type: "number", suffix: "" }
    support: { type: "track", min: -2, max: 2, labels: ["Active Opposition", "Passive Opposition", "Neutral", "Passive Support", "Active Support"] }
```

### D2: Visual Config Loader

`packages/runner/src/config/load-visual-config.ts`

- Load and parse `visual-config.yaml` from `data/games/<game>/`.
- Validate against Zod schema.
- Return typed `VisualConfig` object, or `null` if file doesn't exist.
- Config is loaded once at game start and cached.

### D3: Token-Type-to-Sprite Mappings

`packages/runner/src/config/token-sprites.ts`

- Map token types to PixiJS textures based on visual config.
- Load sprite images (if specified) as PixiJS textures.
- Fallback chain: config sprite → config shape+color → default colored circle.
- Support faction-colored variants (same shape, different tint based on owner faction).

### D4: Action-to-Animation Mappings

`packages/runner/src/config/action-animations.ts`

- Map action IDs to animation preset names from Spec 40's preset registry.
- The `animations.actions` section in `visual-config.yaml` maps action IDs (e.g., `bombard`, `deal`) to preset names (e.g., `explosion`, `card-fly`).
- Games can register custom presets for game-specific animations (card-flip, card-deal, explosion, etc.) by defining them in their visual config. These presets are loaded into Spec 40's `PresetRegistry` at game start.
- The visual config loader passes overrides to `traceToDescriptors()` via the `presetOverrides` parameter, allowing game-specific preset selection.
- Fallback: unmapped actions use default token movement only (Spec 40's built-in presets).

### D5: Card Face Templates

`packages/runner/src/config/card-templates.ts`

- Define card face layout from visual config template definition.
- Render card faces using BitmapText for title/text fields.
- Use `renderer.generateTexture()` to bake card faces into textures (Spec 38 card rendering pipeline).
- LOD: full detail (all text) → simplified (title + faction color) → skeleton (colored rectangle) based on zoom.

### D6: Zone-Type Visual Styles

`packages/runner/src/config/zone-styles.ts`

- Apply visual config zone styles to the zone renderer (Spec 38 D4).
- Override default rectangle rendering with specified shapes (circle, hex, line).
- Apply fill colors, stroke styles, and size overrides.

### D7: Variable Display Config

`packages/runner/src/config/variable-display.ts`

- Configure which variables are displayed prominently vs. in collapsible panels.
- Apply formatting rules (number, track with labels, etc.).
- Feed into the Variables Panel (Spec 39 D6).

### D8: Color/Faction Mapping

`packages/runner/src/config/faction-colors.ts`

- Map faction/player IDs to colors from visual config.
- Fallback to a default palette if no config.
- Used by token renderer, zone renderer, player indicators, and scoreboard.

---

## Part B: Session Management

### D9: Game Selection Screen

`packages/runner/src/ui/GameSelectionScreen.tsx`

- List available games from compiled GameDef files.
- Display: game name, player count range, brief description (from GameSpecDoc metadata).
- Click a game to proceed to pre-game configuration.
- This is the landing page of the runner SPA.

Game discovery: scan `data/games/*/` for compiled GameDef JSON files, or maintain a manifest.

### D10: Pre-Game Configuration

`packages/runner/src/ui/PreGameConfig.tsx`

- **Player count**: Select within GameDef's min/max player range.
- **Seat assignment**: For each seat, choose "Human" or AI type (Random Agent, Greedy Agent).
- **Random seed**: Optional field. Empty = random seed. Specified = deterministic game.
- **Start Game** button: initializes the worker bridge with the selected GameDef, seed, and player assignments.

### D11: Save/Load Game (Dexie.js)

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

### D12: Replay Mode

`packages/runner/src/replay/replay-controller.ts`

Given a saved game (seed + move history):

- Initialize game from seed.
- Step through moves one at a time, playing effect trace animations for each.
- Controls: step-forward, step-backward (undo), play/pause, speed control.
- Step-backward uses the undo stack (replay from start to move N-1).
- Progress bar showing current move / total moves.

UI: `packages/runner/src/ui/ReplayControls.tsx`

### D13: Event Log Panel

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

### Visual Config
- [ ] Runner works without any visual config file (default rendering)
- [ ] Visual config YAML loads and validates for Texas Hold'em
- [ ] Visual config YAML loads and validates for FITL
- [ ] Token sprites override default colored circles when config specifies sprites
- [ ] Zone styles apply from config (circles for cities, hexes for provinces)
- [ ] Card faces render from template with title, text, faction icon
- [ ] Variable display follows config (prominent vars, panel groupings)
- [ ] Faction colors applied consistently across tokens, zones, and UI

### Session Management
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

- Sprite/image asset creation (the visual config references images; creating them is a design task)
- Custom animation effect implementation (explosion particles, etc.)
- Cloud save sync
- Game sharing / export
- User accounts or preferences persistence beyond IndexedDB
- GameSpecDoc compilation (the runner consumes pre-compiled GameDef JSON)
