# Phase Transition Banners - Context Exploration Report

## Date
2026-02-21

## Exploration Scope
This document captures findings from a comprehensive exploration of:
1. Visual config YAML structure across both games
2. Texas Hold'em phase definitions
3. FITL game spec phases
4. UI components for overlays and indicators
5. Render model phase information
6. Type and interface definitions

---

## 1. Visual Config YAML Structure

### Location
- Texas Hold'em: `/data/games/texas-holdem/visual-config.yaml` (2,946 bytes)
- FITL: `/data/games/fire-in-the-lake/visual-config.yaml` (8,445 bytes)

### Structure Overview

Both games use a shared YAML schema with these top-level keys:
```yaml
version: 1
layout:
  mode: [table | graph]
  hints: (graph-only, region definitions)
  tableBackground: (table-only, background config)
factions:
  <faction-id>:
    color: <hex>
    displayName: <string>
zones:
  layoutRoles: { zone-id → layout-role }
  categoryStyles: { category → style }
  attributeRules: [ { match, style } ]
  overrides: { zone-id → { label, ...style } }
tokenTypeDefaults: [ { match, style } ]
tokenTypes: { type-id → style }
cardAnimation: { cardTokenTypes, zoneRoles, animations }
animations: { sequencing, timing, zoneHighlights, actions }
cards: { assignments, templates }
tableOverlays: (table-only, player overlays and pot display)
edges: { default, categoryStyles, highlighted }
```

### Texas Hold'em Config Specifics
- **Layout**: `table` mode with ellipse background (green felt)
- **Factions**: Single `neutral` faction (gray, #6c757d)
- **Zones**: Hand zones (hand:0–hand:9), community, burn, deck, muck
- **Token Types**: Poker cards with custom template
- **Card Template**: 48×68px with rankCorner, suitCenter, rankBottom layout
- **Table Overlays**: 
  - Pot indicator (center, yellow #fbbf24)
  - Per-player streetBet (below seat, gray)
  - Dealer marker (circle, yellow, -50px offset)

### FITL Config Specifics
- **Layout**: `graph` mode with region hints (North Vietnam, Laos, Cambodia, South Vietnam)
- **Factions**: 4 factions (US red, ARVN blue, NVA teal, VC yellow)
- **Zones**: Provinces, cities, LOCs, force pools, card zones
- **Zone Styles**: Terrain-based (highland tan, jungle dark green, lowland light green)
- **Token Types**: Multiple troop types per faction, bases, irregulars, guerrillas with symbol rules
- **No tableOverlays** (graph layout, no player seats)

### Key Insight: Game-Specific Visual Configuration
The visual-config.yaml is **game-specific** and loaded per session. It defines:
- Zone rendering (shape, size, color)
- Faction colors
- Token types and symbols
- Card templates with field rendering
- Table overlays (poker-specific)
- Animation timing and sequencing

---

## 2. Texas Hold'em Phase Definitions

### Phase Sequence
Phases are defined in `data/games/texas-holdem/30-rules-actions.md` under `turnStructure.phases`:

1. **hand-setup** (phase 0)
   - Antes/blinds collection
   - Hole cards dealt (2 per player)
   - Preflop actor determined
   - Transitions to: `preflop`

2. **preflop** (phase 0 in handPhase)
   - First betting round
   - Action starts from UTG (after big blind)
   - If all-in: auto-deal to showdown
   - If one player remains: end hand
   - Transitions to: `flop` or `showdown`

3. **flop** (phase 1 in handPhase)
   - Burn 1, deal 3 community cards
   - Reset street bets
   - Action starts from SB position
   - Transitions to: `turn` or `showdown`

4. **turn** (phase 2 in handPhase)
   - Burn 1, deal 1 community card
   - Reset street bets
   - Transitions to: `river` or `showdown`

5. **river** (phase 3 in handPhase)
   - Burn 1, deal 1 community card
   - Reset street bets
   - Transitions to: `showdown` or `showdown`

6. **showdown** (phase 4 in handPhase)
   - Reveal hands (auto-reveal for determinism)
   - Evaluate best 5-card hands
   - Build main pot + side pots
   - Award to winners
   - Transitions to: `hand-cleanup`

7. **hand-cleanup** (no handPhase number)
   - Conceal hands
   - Move cards to muck
   - Eliminate busted players
   - Increment handsPlayed
   - Transitions to: (loop to hand-setup if players remain, else terminal)

### Global Variables Tracking Phase
- **handPhase**: int [0..4], maps to preflop → river → showdown
- **currentBet**: int, current highest wager on street
- **lastRaiseSize**: int, min raise granularity
- **bettingClosed**: boolean, when true, advance to next phase
- **activePlayers**: int, count of non-eliminated players

### Key Insight: Phase Data in GameDef
Phases and transitions are baked into the compiled GameDef. The `handPhase` global var tracks progress through the 5 community-card stages.

---

## 3. Render Model Phase Information

### RenderModel Interface
```typescript
interface RenderModel {
  phaseName: string;           // Phase ID (e.g., "preflop", "flop")
  phaseDisplayName: string;    // Formatted display name (e.g., "Preflop")
  // ... (other render data)
}
```

### Phase Name Generation
File: `packages/runner/src/model/derive-render-model.ts` line 114
```typescript
phaseName: String(state.currentPhase),
phaseDisplayName: formatIdAsDisplayName(String(state.currentPhase)),
```

**How it works:**
1. `state.currentPhase` is a string ID (e.g., "preflop", "hand-setup")
2. `formatIdAsDisplayName()` converts kebab-case to Title Case (e.g., "preflop" → "Preflop", "hand-setup" → "Hand Setup")
3. Both are exposed to React components via Zustand store

### Key Insight: Phase Names Are Auto-Formatted
The phase display name is derived deterministically from the phase ID. No special config needed in visual-config.yaml for phase names (though it *could* be added).

---

## 4. UI Components for Phase Display

### PhaseIndicator Component
**File**: `packages/runner/src/ui/PhaseIndicator.tsx`

```typescript
function PhaseIndicator({ store }: PhaseIndicatorProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);
  if (renderModel === null) return null;

  const phaseLabel = resolvePhaseLabel(renderModel);
  const activePlayer = renderModel.players.find(p => p.id === renderModel.activePlayerID);

  return (
    <section className={styles.container} aria-label="Current phase and active player">
      <p className={styles.phaseLabel}>{phaseLabel}</p>
      <p className={styles.activePlayer} style={buildFactionColorStyle(...)}>
        {activePlayer?.displayName ?? 'Unknown Player'}
      </p>
    </section>
  );
}
```

**Current Behavior:**
- Displays phase label (auto-formatted or phaseDisplayName from renderModel)
- Displays active player name with faction color
- Positioned in UI toolbar (top area)
- No animation, static display

**CSS** (`PhaseIndicator.module.css`):
- Inline-flex layout
- Panel background, subtle border
- Phase label: lg, bold
- Active player: sm, with rounded bg and border

### AITurnOverlay Component
**File**: `packages/runner/src/ui/AITurnOverlay.tsx`

```typescript
function AITurnOverlay({ store }: AITurnOverlayProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);
  const viewModel = deriveAiTurnViewModel(renderModel);
  
  if (viewModel === null) return null;  // Only renders if AI is active

  return (
    <section className={styles.container} aria-label="AI turn"
             style={buildFactionColorStyle(viewModel.activePlayer, viewModel.players)}>
      <div className={styles.heading}>
        <p className={styles.label}>AI Turn</p>
        <p className={styles.playerName}>{viewModel.activePlayer.displayName}</p>
      </div>
      <div className={styles.thinking} aria-label="AI is thinking">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <div className={styles.controls}>
        <button onClick={() => skipAiTurn()}>Skip</button>
      </div>
    </section>
  );
}
```

**Current Behavior:**
- Only renders when an AI player is actively choosing
- Positioned in UI overlay (bottom bar typically)
- Shows "AI Turn", player name, animated thinking dots, skip button
- Faction color applied via inline style

**CSS** (`AITurnOverlay.module.css`):
- Flex layout with space-between
- Border-top (top border uses currentColor, i.e., faction color)
- Animated pulse on dots (3 staggered)
- Panel background

### UIOverlay Component
**File**: `packages/runner/src/ui/UIOverlay.tsx`

```typescript
function UIOverlay({
  topBarContent,
  sidePanelContent,
  bottomBarContent,
  floatingContent,
}: UIOverlayProps): ReactElement {
  return (
    <div className={styles.overlay} data-testid="ui-overlay">
      <div className={styles.topBar}>{topBarContent}</div>
      <div className={styles.sidePanels}>{sidePanelContent}</div>
      <div className={styles.bottomBar}>{bottomBarContent}</div>
      <div className={styles.floating}>{floatingContent}</div>
    </div>
  );
}
```

**Container Pattern:**
- UIOverlay is a structural component (4 slots: top, side, bottom, floating)
- PhaseIndicator typically goes in `topBar` or `sidePanels`
- AITurnOverlay typically goes in `bottomBar` or `floating`
- Used in `GameContainer.tsx` as the main UI shell

### Key Insight: Overlay Mounting Pattern
The runner uses a **slot-based UI overlay** model. Phase banners would mount in one of the existing slots or as a new floating element.

---

## 5. Store State and Terminal Detection

### GameStore Lifecycle
**File**: `packages/runner/src/store/game-store.ts`

Key state fields:
```typescript
interface GameStore {
  renderModel: RenderModel | null;
  terminal: TerminalResult | null;
  currentPhase: string;
  lifecycle: GameLifecycle;
  // ... (other state)
}
```

### Terminal Detection
```typescript
type GameLifecycle = 'initializing' | 'active' | 'terminal';

function lifecycleFromTerminal(terminal: TerminalResult | null): GameLifecycle {
  if (terminal === null) return 'active';
  return 'terminal';
}
```

**File**: `packages/runner/src/store/lifecycle-transition.ts`

When `terminal` becomes non-null (game ends), lifecycle transitions to `'terminal'`.

### Key Insight: Phase Transitions Are Implicit
Phase transitions happen in the kernel engine. The store's `renderModel.phaseName` automatically reflects the current phase via derivation. No explicit state machine for phase transitions in the runner (it's all in the compiled GameDef).

---

## 6. Type Definitions and Interfaces

### VisualConfigProvider
**File**: `packages/runner/src/config/visual-config-provider.ts`

```typescript
export class VisualConfigProvider {
  getTableOverlays(): TableOverlaysConfig | null;
  getTableBackground(): TableBackgroundConfig | null;
  getLayoutMode(hasAdjacency: boolean): LayoutMode;
  // ... (many other methods)
}

export interface ResolvedZoneVisual {
  shape: ZoneShape;
  width: number;
  height: number;
  color: string | null;
}
```

### RenderModel Types
**File**: `packages/runner/src/model/render-model.ts`

```typescript
interface RenderModel {
  phaseName: string;
  phaseDisplayName: string;
  players: readonly RenderPlayer[];
  activePlayerID: PlayerId;
  terminal: RenderTerminal | null;
  // ... (many other fields)
}

interface RenderPlayer {
  id: PlayerId;
  displayName: string;
  factionId: string | null;
  isHuman: boolean;
  // ...
}
```

### Key Insight: Type Safety and Immutability
All render data is immutable readonly structures. PhaseIndicator and AITurnOverlay derive state via Zustand selectors (no mutations).

---

## 7. Animation System Context

**File**: `packages/runner/src/animation/animation-controller.ts`

```typescript
interface VisualAnimationDescriptor {
  kind: VisualAnimationDescriptorKind;  // e.g., 'cardDeal', 'moveToken', 'createToken'
  duration: number;
  // ... (other animation properties)
}
```

The visual config supports animation timing per descriptor kind:
```yaml
animations:
  sequencing:
    cardDeal: { mode: stagger, staggerOffset: 0.15 }
  timing:
    cardDeal: { duration: 0.6 }
    cardFlip: { duration: 0.6 }
```

### Key Insight: Animation System Is Separate
Phase transitions could trigger animations if we extend the animation system to support phase-change descriptors. Currently, no phase-transition animation type exists.

---

## 8. FITL Game Phases (Comparative)

### FITL Phase Structure
**File**: `data/games/fire-in-the-lake/` (multiple 00-99 spec files)

FITL uses a **complex turn structure** with hierarchical phases:
- Multiple factions (US, ARVN, NVA, VC) take turns
- Each turn includes optional operations and activities
- Event card deck shuffles and card play
- Coup rounds, monsoon effects

**No flat phase list** like Texas Hold'em. Instead:
- Yearly/seasonal structure
- Faction-specific action opportunities
- Complex eligibility and cascading effects

### Key Insight: Game-Specific Phase Models
Each game can define its own phase structure. FITL is far more complex than poker. Any phase-banner system must accommodate both simple (5-7 phases) and complex (20+ hierarchical phases) models.

---

## 9. Visual Config Loading Flow

**File**: `packages/runner/src/config/visual-config-loader.ts`

```typescript
export function loadVisualConfig(rawYaml: unknown): VisualConfig | null {
  if (rawYaml === null || rawYaml === undefined) {
    return null;
  }

  const parsed = VisualConfigSchema.safeParse(rawYaml);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn('Invalid visual config; falling back to defaults.', parsed.error.issues);
  return null;
}

export function createVisualConfigProvider(rawYaml: unknown): VisualConfigProvider {
  return new VisualConfigProvider(loadVisualConfig(rawYaml));
}
```

### Loading Process
1. Raw YAML loaded (from data/games/{game}/visual-config.yaml)
2. Parsed with Zod schema (`VisualConfigSchema`)
3. Wrapped in VisualConfigProvider instance
4. Injected into React context (`VisualConfigContext`)
5. Components access via context hook

### Key Insight: Extensible Schema
The Zod schema is the single source of truth. To add phase banner configuration, we'd extend the schema and add corresponding provider methods.

---

## 10. Summary Findings

### Current Architecture
1. **Phase names** are auto-formatted from phase IDs (e.g., "preflop" → "Preflop")
2. **Phase display** is via PhaseIndicator (toolbar, static)
3. **AI activity** is shown via AITurnOverlay (bottom bar, animated dots + skip button)
4. **Overlays mount** in UIOverlay slots (top/side/bottom/floating)
5. **Visual config** is game-specific YAML loaded at session start
6. **Phase state** flows through Zustand store from kernel GameState

### What Exists
- ✅ RenderModel has phaseName and phaseDisplayName
- ✅ PhaseIndicator displays current phase
- ✅ AITurnOverlay shows AI turns
- ✅ Visual config system (extensible via schema)
- ✅ Overlay container (UIOverlay) with 4 slots
- ✅ Animation system (separate, not tied to phases)

### What Does NOT Exist
- ❌ Phase transition animations/banners
- ❌ Phase-change notifications in visual config
- ❌ Automatic phase-banner mounting logic
- ❌ Transition timing/duration in config
- ❌ Phase metadata (e.g., description, emoji, color)

### Design Opportunities
1. **Extend VisualConfig YAML** with `phaseDisplayConfig` section for per-game customization
2. **Create PhaseTransitionBanner component** as a floating overlay
3. **Add animation descriptor** for phase transitions (kernel-triggered)
4. **Mount banner** in UIOverlay.floating or as new slot
5. **Coordinate with animation system** for timing and stagger effects

---

## Files Explored

### Visual Config Files
- `/data/games/texas-holdem/visual-config.yaml` (2,946 bytes)
- `/data/games/fire-in-the-lake/visual-config.yaml` (8,445 bytes)

### Game Specs
- `/data/games/texas-holdem/00-metadata.md`
- `/data/games/texas-holdem/10-vocabulary.md`
- `/data/games/texas-holdem/30-rules-actions.md` (phases 20-250 lines)
- `/data/games/fire-in-the-lake/` (multiple files)
- `brainstorming/texas-hold-em-rules.md` (532 lines, comprehensive rules)

### Runner Source
- `packages/runner/src/ui/PhaseIndicator.tsx` (41 lines)
- `packages/runner/src/ui/UIOverlay.tsx` (35 lines)
- `packages/runner/src/ui/AITurnOverlay.tsx` (77 lines)
- `packages/runner/src/config/visual-config-provider.ts` (404 lines)
- `packages/runner/src/config/visual-config-loader.ts` (29 lines)
- `packages/runner/src/config/visual-config-context.ts` (5 lines)
- `packages/runner/src/model/render-model.ts` (200+ lines, RenderModel interface)
- `packages/runner/src/model/derive-render-model.ts` (600+ lines, phase derivation at line 114)
- `packages/runner/src/store/game-store.ts` (400+ lines, lifecycle and terminal)

### CSS
- `packages/runner/src/ui/PhaseIndicator.module.css` (27 lines)
- `packages/runner/src/ui/AITurnOverlay.module.css` (86 lines with animations)

---

## Conclusion

The project has a mature visual config system, a working phaseIndicator, and an animation framework. Phase transitions are defined in the game spec and flow through the kernel into the RenderModel. All the building blocks exist to add phase transition banners. The design should:

1. **Be game-agnostic** (support both simple and complex phase hierarchies)
2. **Respect the visual config** pattern (YAML-driven, not hardcoded)
3. **Use existing UI slots** (UIOverlay, or add a new floating slot)
4. **Coordinate with animations** (timing, stagger, reduced motion)
5. **Be opt-in** (games without phase banners should work as before)

**Next Steps**: Clarification questions to user about scope, placement, animation style, and config structure.

