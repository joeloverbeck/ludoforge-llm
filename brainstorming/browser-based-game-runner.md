# Implementing a Browser-Based Game Runner

Our app consists mainly of a pipeline: GameSpecDoc -> GameDef -> Simulator.

- **GameSpecDoc**: YAML definition of any card/board game. Contains game-specific data.
- **GameDef**: Compilation of the GameSpecDoc. Contains no game-specific hardcoded logic (game-agnostic).
- **Simulator**: Runs the compiled game. Game-agnostic.

We have proven through golden tests for Texas Hold'em (`test/e2e/`) that at least one game is properly implemented end-to-end. Fire in the Lake (`data/games/fire-in-the-lake/`), a far more complex 4-faction COIN-series wargame, is in an advanced state of completion. These two test-case games bracket the complexity spectrum: Texas Hold'em exercises hidden information, betting, and player elimination on a simple table layout; FITL exercises spatial maps, multi-step operations, faction asymmetry, and cascading triggers on a complex board.

The game runner must work for ANY game compiled through this pipeline, not just these two. A new game added to `data/games/` should be playable with zero runner code changes, relying only on an optional per-game visual config file for enhanced presentation.

---

## 1. Core Game Loop Requirements

Requirements grounded in how the kernel actually works:

### Move selection via `legalMoves()`

The runner displays available actions from `legalMoves(def, state)`. Each move has an `actionId` and `params`. The runner groups moves by action type for display (e.g., "Operations", "Special Activities" in FITL; "Fold", "Check", "Raise" in poker).

### Progressive choice resolution via `legalChoices()`

Many moves require multi-step decisions. The kernel's `legalChoices()` returns a `ChoicePendingRequest` with options for the next decision. The runner must support this step-by-step flow:

1. Pick action (e.g., "Train" in FITL, "Raise" in poker)
2. Pick targets (e.g., which spaces to train in, how many troops)
3. Pick quantities (e.g., number of tokens, raise amount)
4. Confirm

FITL operations can be 3-5 steps deep. Texas Hold'em is simpler (1-2 steps max). The runner renders a breadcrumb/progress indicator showing which step of the choice chain the player is on, with the ability to step back at any point before confirming.

### Move application via `applyMove()`

Returns new immutable state + effect trace + trigger firings. The runner uses this data to animate the result and update the display. The effect trace is the primary animation data source (see Section 6).

### Terminal detection

The runner checks `terminalResult()` after each move. Supports win, draw, score-ranking, and loss-all outcomes. Must display victory conditions and final rankings. For tournament-style games (Texas Hold'em), show elimination events and final standings.

### Phase display

Both games have multi-phase turn structures. The runner must display the current phase name prominently and animate phase transitions (e.g., "FLOP" appearing with community cards dealing, "Coup Round" banner in FITL).

### Turn order

FITL has card-driven variable turn order; Texas Hold'em has positional order. The runner must display who acts next and the current turn order sequence. Highlight the active player's seat/faction prominently.

### Undo support

The kernel returns new immutable state per move. The runner keeps a state history stack for undo. At minimum, support undoing the last move for human players' own moves. Undo replays the state from history, not by reversing effects.

---

## 2. Visual Representation

What the runner must render for any game:

### Zones as the core visual unit

Every game is made of zones (decks, hands, boards, discard piles). The runner renders each zone according to its type and contents:

- **Stack zones**: Show as a pile with the top token visible and a count (e.g., draw deck).
- **Queue zones**: Show tokens in order (e.g., community cards revealed left-to-right).
- **Set zones**: Show all tokens spread out (e.g., hand of cards, tokens in a map space).

### Tokens

Each token has a type and properties. Render as sprites/icons based on type. Token properties drive visual state:

- **Card tokens**: Face-up/face-down (derived from zone visibility rules).
- **Guerrilla tokens**: Active/underground visual state (from `activity` prop).
- **Base tokens**: Tunneled/untunneled visual state (from `tunnel` prop).
- **Chip stacks**: Numeric display for quantities.
- **Generic tokens**: Fallback icon per token type with faction coloring.

### Hidden information

Zones have visibility (`public`, `owner`, `hidden`). The runner must:

- Show public zone contents to all players.
- Show owner-visible zones only to the owning player (e.g., hole cards in poker).
- Hide hidden zone contents (show card backs, token counts only).
- Handle `reveal` events: animate cards flipping face-up at showdown.

### Variables display

Global and per-player variables must be visible. Examples:

- **Texas Hold'em**: Pot, current bet, chip stacks per player, blinds level, current phase.
- **FITL**: Resources per faction, support/opposition markers per space, capability states, operation counts, aid, total opposition/support, ARVN patronage.

### Markers

Zones can have markers with states (e.g., support/opposition levels in FITL spaces). Render as icons or labels on the zone. Marker state changes should animate.

### Leaderboard/scoreboard

- **Tournament-style games** (Texas Hold'em): Show chip counts ranked, blind levels, table position indicators.
- **Victory-track games** (FITL): Show victory point progress per faction toward their individual victory conditions.

### Cards

Event cards (FITL) and playing cards (poker) need face rendering with title, text, and imagery. Card data comes from data assets embedded in the GameDef. Card faces are rendered from templates defined in the per-game visual config.

### Side pots

Texas Hold'em creates multi-layer side pots during all-in scenarios. The runner must visually distinguish main pot from side pots with labeled amounts and eligible player indicators.

---

## 3. Spatial/Board Rendering

For games with maps (FITL) vs table-only games (Texas Hold'em):

### Graph-based auto-layout

The kernel defines zone adjacency as a graph, not coordinates. The runner computes 2D positions from the adjacency graph using a force-directed or hierarchical layout algorithm. Zones are positioned so they don't overlap, with visual connections (lines, bezier curves) showing adjacency.

### Zone type styling

Different zone types render differently based on metadata in the spec:

- **Cities vs provinces vs LoCs** (FITL): Different shapes/sizes (circle, hex, connecting line).
- **Terrain** (jungle, highland, lowland): Different background colors/textures.
- **Coastal markers**: Visual indicator (wave icon, border style).

All styling driven by the per-game visual config (Section 8), falling back to generic shapes when no config is present.

### Adjacency highlighting

When a move requires selecting adjacent zones, highlight valid adjacent zones and mute others. Visual distinction between "selectable" and "not selectable" zones.

### Token stacking in zones

Map spaces in FITL can have 10+ tokens from 4 factions. Need clear visual stacking or grouping: faction color-coded groups within a zone, with counts when tokens exceed visual space. Click/hover to expand a crowded zone.

### Table-only games

Texas Hold'em doesn't need a map. Use a card table layout with player positions around a center area (community cards + pot). This layout can be generic for all card-only games (no spatial adjacency in the spec triggers table mode).

### Pan/zoom

For complex maps, support panning and zooming the game board. Minimap overlay for orientation on large boards.

---

## 4. Interaction Model

How the human player interacts (mouse-only + optional number input):

### Contextual on-board interaction

Valid targets highlight directly on the board/table. Invalid targets mute. The board IS the primary interface; minimize reliance on panels/menus. Players interact with the game world, not with abstract UI widgets.

### Action selection

Display available actions as clickable buttons/cards in a compact toolbar or radial menu. After selecting an action, subsequent choices happen on the board (click zones, click tokens). Group actions logically (e.g., FITL: "Operations" group, "Special Activities" group; poker: action buttons in a row).

### Drag and drop

For moving tokens (troops, cards), support drag from source zone to valid target zone. Highlight valid drop targets while dragging. Snap-back animation on invalid drop. This is optional enhancement over click-to-select for supported move types.

### Click-to-select

For choosing zones, tokens, or options: click to select, click again to deselect. Visual feedback (glow, border, elevation) on selected items. This is the primary interaction mechanism for all choice types.

### Numeric input

For parameterized choices like raise amounts in poker, the kernel provides a min-max domain range via the `ChoicePendingRequest`. Use a slider with min/max bounds, or allow direct number entry. Show quick-select buttons for common amounts (e.g., 2x BB, 3x BB, pot-size, all-in for poker; specific troop counts for FITL).

### Confirm/cancel

Multi-step moves need explicit confirmation before committing. A persistent confirm button (and cancel/back) visible during move construction. The breadcrumb/progress indicator shows which step of the choice chain the player is on.

### Move legality feedback

The kernel provides `ChoiceIllegalReason` when a move becomes illegal. Display as tooltips or inline messages explaining WHY an action can't be taken (e.g., "Insufficient resources", "No valid targets in range", "Below minimum raise").

### Cancel/undo partial move

While building a multi-step move (before confirming), the player can step back to a previous choice or cancel entirely. The runner maintains a local choice stack separate from the committed state history.

### Tooltips to explain legal choice

We would like that when you hover over a button that allows a choice, it shows a tooltip that explains the logic in a hierarchical manner as for why that choice is legal now.

---

## 5. Animation System

Grounded in the kernel's effect trace output:

### Effect trace as animation source

The kernel's `applyMove()` returns `EffectTraceEntry[]` records. Each entry type maps to an animation:

| Trace Entry | Animation |
|---|---|
| `moveToken` | Token moves from source zone to destination zone |
| `createToken` | Token appears (fade-in, deal from deck) |
| `destroyToken` (via effect AST / state diff) | Token disappears (fade-out, optional destruction effect) |
| `setTokenProp` | Property change (card flip for face-up/down, guerrilla state change) |
| `varChange` | Counter change (chip stack growing/shrinking, score updating) |
| `conditional` | Optionally show branching logic result |

### Trigger firings

When cascading triggers fire (e.g., entering a zone triggers a combat check), animate each trigger step with brief delay. Show a subtle indicator that a triggered effect is playing (vs a direct effect).

### Card animations

- **Shuffle**: Riffle animation on deck zone.
- **Deal**: Cards flying from deck to target hand/zone.
- **Flip**: Scale-to-zero then scale-back with new face showing.
- **Burn**: Slide to burn pile face-down.

### Combat/action effects

Visual effects for action types like bombard (explosion particles), attack (clash effect), sweep (scanning effect). These map from action IDs via the per-game visual config (Section 8). Games without a visual config use minimal default animations (token movement only).

### Phase transitions

Animate phase changes: text banner appearing (e.g., "FLOP", "Coup Round"), accompanied by any automatic effects of the phase (dealing community cards, resolving support shifts).

### Animation queue

Effects play sequentially with configurable delays. The queue can be:

- **Sped up**: Faster playback multiplier.
- **Paused**: Hold current state mid-animation.
- **Skipped**: Jump to final state immediately.

---

## 6. AI Agent Playback

How the runner displays non-human player turns:

### Step-by-step playback

When an AI agent acts, replay its move using the same effect trace animation system as human moves. Each sub-choice highlights on the board, tokens move, effects play.

### Configurable delay

Per-step delay between AI actions, adjustable in runner settings. Default to a moderate pace that lets the human follow what happened.

### Configurable detail level

Options to control animation phases:

- **Full**: Show zone highlighting, choice indicators, trigger animations, token movements.
- **Standard**: Show token movements and key effects, skip choice indicators.
- **Minimal**: Show final state changes only, skip intermediate animations.

### Skip/fast-forward

Player can skip the current AI turn's animation entirely, or fast-forward to the next human decision point. A "skip all AI turns" toggle for when the human just wants to play their turns.

### AI thinking indicator

While the AI agent computes its move, show a thinking/processing indicator on the active player's seat. This is especially relevant if agent computation takes noticeable time.

### All config in settings

Delay timings, detail level, skip preferences: all data-driven from a configuration file or settings panel, not hardcoded.

---

## 7. Per-Game Visual Configuration

The data-driven visual mapping system:

### Location

A YAML config file per game in `data/games/<game>/` (e.g., `visual-config.yaml`).

### Purpose

Maps GameSpecDoc elements to their visual representation WITHOUT adding display logic to the GameSpecDoc itself. This file is a display-only asset: the kernel and compiler never read it. It is consumed solely by the browser runner.

### Contents

- **Zone layout hints**: Region groupings, relative position constraints, zone shape/size overrides for auto-layout. (e.g., "group these zones as the North Vietnam region, place them top-left")
- **Token-type-to-sprite mappings**: Which sprite/image to use for each token type, keyed by faction and state. Fallback to colored shapes when no sprite is provided.
- **Action-to-animation mappings**: Which visual effect to play for each action ID (e.g., `bombard` -> explosion, `sweep` -> scan, `deal` -> card fly).
- **Zone-type visual styles**: How different zone types render (city = large circle, province = hex, LoC = connecting line).
- **Card face templates**: How to render card faces (layout of title, text, imagery, icons). Templated so the runner renders from card data, not from pre-made images.
- **Variable display config**: Which variables to show prominently, which to group in panels, formatting rules (e.g., chips as numbers, support as a track with markers).
- **Color/faction mapping**: Faction colors, token color overrides, player seat colors.

### Fallback defaults

The runner MUST work without a visual config file. Without one, the runner uses sensible defaults:

- Zones rendered as labeled rectangles with token lists.
- Tokens rendered as colored circles with type labels.
- No custom animations (token movement only).
- Variables shown in a simple table.

The visual config file enhances presentation but does not enable it.

---

## 8. Game Session Management

Save/load and pre-game configuration:

### Game selection screen

List available games from `data/games/*/`. Show game name, player count range, and description (pulled from GameSpecDoc metadata).

### Pre-game configuration

- Set number of players (within spec min/max).
- Assign each seat as human or AI agent type (random, greedy, future agent types).
- Set random seed (optional, for reproducible games).

### Save/load game

Serialize full GameState + move history to a save file. Load restores state and allows continued play. Save format should support replay: store seed + move sequence for deterministic reconstruction (since the kernel is deterministic, replaying the move sequence from a seed reproduces the exact game).

### Replay mode

Given a saved game or trace, replay the game move-by-move with full animation. Useful for reviewing past games, analyzing agent behavior, or debugging game specs. Supports pause, step-forward, step-backward, and speed control.

---

## 9. Event Log

The visual play-by-play log:

### Last N events

A scrollable log panel showing recent game events in human-readable text. The log auto-scrolls to the latest event but can be scrolled back to review history.

### Event source

The kernel's effect trace and trigger firings provide the raw data. The runner translates effect trace entries into readable descriptions:

- `moveToken`: "Player 2 moved 3 guerrillas from Saigon to Can Tho"
- `varChange`: "Pot increased to 15,000"
- `createToken`: "Dealt Ace of Spades to Player 1"
- `destroyToken`: "Removed 2 NVA troops from Hue"
- Trigger firings: "Terror triggered: shifted Saigon to Active Opposition"

### Clickable events

Clicking an event in the log highlights the relevant zones/tokens on the board. Useful for understanding what happened where.

### Filterable

Filter by event type (moves, triggers, phase changes) or by player/faction. Collapse/expand trigger chains.

---

## 10. Principles

### Decoupled from GameSpecDoc

The GameSpecDoc contains no display-only data. No screen coordinates, no sprite paths, no animation hints. The noted exception: inherent visual properties like FITL token colors/shapes that ARE part of the original game rules, not display metadata.

### Decoupled from Simulator

The simulator does not know that a browser-based game runner is consuming it. Communication happens through state snapshots and effect traces, not direct coupling. The simulator runs headless, exactly as it does in tests. Future uses (statistical analysis, evolution) must not be affected by the runner's existence.

### Data-driven visuals

All game-specific visual configuration lives in per-game config files (`data/games/<game>/visual-config.yaml`), not in runner code. Adding a new game requires zero runner code changes. The runner reads the GameDef + optional visual config and renders accordingly.

### Progressive disclosure

Don't overwhelm the player. Show essential info prominently (current phase, active player, available actions), details on hover/click (zone contents, token properties, variable breakdowns). Especially important for complex games like FITL with dozens of zones and variables.

### Simulation on worker thread

The kernel operations (`legalMoves`, `legalChoices`, `applyMove`) run in a Web Worker to prevent UI jank during complex computations. The main thread handles rendering and input only. The worker posts state updates and effect traces back to the main thread for display.

---

## Appendix A: Technology Decisions

Research conducted February 2026. Each choice based on deep-research evaluation of alternatives, real-world production usage, and fit with LudoForge's architecture.

### Approved Technology Stack

| Layer | Technology | Version | Bundle (gzip) | Rationale |
|-------|-----------|---------|---------------|-----------|
| Game board canvas | PixiJS v8 (WebGL explicitly) | v8.16.x | ~200KB | Massively overpowered for board games (200K sprites at 60fps). WebGPU not production-ready (~27% browser coverage, known fallback bugs) — use WebGL explicitly. |
| Camera/pan/zoom | pixi-viewport v6 | v6.0.1 | ~15KB | Drag, pinch-zoom, mouse wheel zoom, clamp, snap. Pass `options.events` from `app.renderer.events` (v6 breaking change). |
| React integration | @pixi/react v8 (with imperative fallback) | v8.0.x | ~5KB | Ground-up rewrite for React 19 + PixiJS v8, tree-shakeable `extend` API, JSX pragma. Young library (~11 months) — keep imperative `useEffect`/`useRef` as fallback pattern. |
| HUD/panels/UI | React 19 (DOM overlay) | v19.x | — | DOM for all complex UI (panels, toolbars, dialogs). Canvas for spatial/visual game content only. Pattern validated by Foundry VTT. |
| State management | Zustand + subscribeWithSelector | v5.x | ~1.1KB | Selector-based subscriptions. `subscribe()` enables imperative PixiJS updates outside React reconciler. Immutable state replacement per move matches Zustand's model exactly. |
| Sprite animation | GSAP + PixiPlugin | v3.x | ~28KB | 100% free after Webflow acquisition (Fall 2024). `gsap.timeline()` for sequencing effect trace into animation queue. No other library matches timeline capabilities for canvas sprites. |
| Tooltips | Floating UI (@floating-ui/react) | v1.x | ~5KB | Virtual Element API converts PixiJS sprite coords to screen coords. Flip/shift/offset middleware handles collision avoidance. |
| Board graph layout | graphology + ForceAtlas2 | v0.25.x | ~15KB | One-shot API: `forceAtlas2(graph, {iterations: 100})` returns `{nodeId: {x, y}}`. Decoupled from renderer. Built-in web worker support for larger graphs. |
| Kernel thread | Web Worker + Comlink | v4.x | ~1.1KB | Typed async RPC interface. Structured clone fast enough for <10KB state objects. Actor model pattern validated by PROXX (Google Chrome team). |
| Game saves | Dexie.js (IndexedDB) | v4.x | ~48KB | Indexed queries, built-in schema migrations, optimized bulk operations. Chunk trace logs into per-move records. |
| Card rendering | BitmapText + LOD + texture baking | (PixiJS built-in) | 0KB | BitmapText for all card text. LOD: full → simplified → skeleton based on zoom. `renderer.generateTexture()` for stable cards. HTMLText reserved for detail view only. |
| In-canvas layout | PixiJS Layout v3 (selective) | v3.x | ~10KB | Flexbox-style layout within canvas (Yoga engine). Use selectively for in-canvas UI elements, not as primary layout. |
| Build/deploy | Vite SPA + pnpm workspaces + Turborepo | latest | dev-only | 2-package monorepo (engine + runner). Turborepo adds caching + task ordering. Remote caching via Vercel. |

**Total estimated bundle addition**: ~328KB uncompressed, ~49KB gzipped (excluding React itself).

### Architecture Pattern: Separate Trees with Shared State

```
Browser Tab
+-----------------------------------------------------------------+
| Web Worker Thread          |  Main Thread                       |
|                            |                                    |
| Game Kernel (Comlink)      |  Zustand Store                    |
| - initialState()           |    |                               |
| - legalMoves()             |    v                               |
| - legalChoices()           |  deriveRenderModel() [pure fn]     |
| - applyMove()              |    |                               |
| - terminalResult()         |    +----------+---------+          |
|                            |    |          |         |          |
| Comlink postMessage  <-----|-->  PixiJS    React     Dexie.js   |
| (structured clone)         |    Canvas    DOM UI    Game Saves  |
|                            |    Board     Panels                |
+-----------------------------------------------------------------+
```

**Key decisions**:

1. **Separate rendering trees**: PixiJS canvas and React DOM are siblings sharing state via Zustand. CSS `pointer-events: none` overlay with `pointer-events: auto` on interactive DOM elements. Pattern validated by Foundry VTT (DOM for sheets/chat/inventory, canvas for spatial game board).

2. **Derived RenderModel**: Pure function `deriveRenderModel(state, def, playerID)` transforms GameState into a view-friendly structure. Analogous to boardgame.io's `G -> playerView() -> Board component`. Consumed by both PixiJS (via `subscribe()`) and React DOM (via selectors).

3. **Actor model for kernel**: Web Worker owns the GameState. Main thread sends commands, receives state snapshots + effect traces via structured clone.

4. **Effect trace as animation source**: `EffectTraceEntry[]` from `applyMove()` drives GSAP timeline sequences.

5. **Layered canvas groups** (Foundry VTT pattern):
   - **Board layer**: Zone sprites, adjacency connections, markers
   - **Token layer**: Game pieces, troops, cards on board
   - **Effects layer**: Highlights, animations, particles
   - **Interface layer**: Selection indicators, move previews

### Key Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| @pixi/react v8 is young (~11 months) | Medium | Keep imperative `useEffect`/`useRef` as fallback. Don't depend on React reconciler for performance-critical canvas updates. |
| WebGPU fallback bugs in PixiJS v8 | Low | Use WebGL explicitly via renderer options. Do not rely on automatic backend selection. |
| Structured clone overhead for large traces | Low | Chunk trace logs per-move. State objects are <10KB — structured clone is fast enough. |
| graphology ForceAtlas2 non-deterministic | Low | Compute layout once per GameDef, cache result. Layout is visual-only, not gameplay-affecting. |
| Dexie.js write blocking on large objects | Low | Chunk saves into per-move records. Write from Web Worker if needed (IndexedDB available in workers). |

### Alternatives Evaluated and Rejected

| Category | Rejected | Why |
|----------|----------|-----|
| Canvas library | Konva + react-konva | Mature React wrapper but 3x slower than PixiJS. |
| Canvas library | Phaser 4 | No React story. Game engine, not a rendering library. |
| Canvas library | Fabric.js | Too slow for animated game boards. |
| State management | Jotai | Atomic model mismatches monolithic state replacement per move. |
| State management | Redux Toolkit | More boilerplate and bundle size for same result. |
| Animation | Framer Motion / motion.dev | DOM-only, no canvas support. |
| Animation | anime.js | Works but weaker ecosystem, no timeline equivalent. |
| Graph layout | d3-force | Requires tick loop of ~300 iterations, mutates node objects. |
| Graph layout | cytoscape.js | ~300KB of renderer code we won't use. |
| Graph layout | elkjs / dagre | Better for hierarchical/DAG layouts, not force-directed. |
| Tooltips | Tippy.js | Maintenance mode (same author as Floating UI). |
| Monorepo | Nx | Overengineered for 2-package monorepo. |
| Game saves | localforage | No indexed queries, no schema migrations. |
| Game saves | raw idb | Manual everything, no bulk operations. |
| Text rendering | CanvasText (PixiJS) | Too slow for many cards. |
| Text rendering | cacheAsTexture for text cards | Creates many tiny textures, worsens performance. |

### Constraints

- **Monorepo**: Same repo, new `packages/` directory. Engine moves to `packages/engine/`, runner in `packages/runner/`.
- **Static SPA**: No server component, no SSR. Vite build produces static files.
- **Local-only play**: No networking, no multiplayer server. All players (human + AI) on the same browser tab.
- **Desktop mouse-only**: No touch optimization required initially. Keyboard shortcuts as enhancement.
