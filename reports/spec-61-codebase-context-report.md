# Spec 61 Codebase Context Report — MCTS Agent Implementation

**Purpose**: Provide an external LLM with full technical context about the existing codebase, so it can improve the proposed Spec 61 (Universal Competent Game Player AI Agent via MCTS).

**Date**: 2026-03-13

---

## Table of Contents

1. [Existing Agents Module](#1-existing-agents-module)
2. [Kernel API Surface for MCTS](#2-kernel-api-surface-for-mcts)
3. [Hidden Information & Zone Visibility](#3-hidden-information--zone-visibility)
4. [PRNG System](#4-prng-system)
5. [Simulation Module](#5-simulation-module)
6. [Test Infrastructure & Fixtures](#6-test-infrastructure--fixtures)
7. [Affected Files & Blast Radius](#7-affected-files--blast-radius)
8. [Potential Gaps & Risks](#8-potential-gaps--risks)

---

## 1. Existing Agents Module

### File Layout (7 files, ~354 lines total)

```
packages/engine/src/agents/
  index.ts                      # Re-exports all public symbols
  factory.ts                    # AgentType union, createAgent(), parseAgentSpec()
  agent-move-selection.ts       # pickRandom<T>(), selectStochasticFallback()
  random-agent.ts               # RandomAgent class
  greedy-agent.ts               # GreedyAgent class (1-ply lookahead)
  evaluate-state.ts             # Game-agnostic heuristic evaluation
  select-candidates.ts          # Deterministic candidate sampling
```

### Agent Interface (from `kernel/types-core.ts`)

```typescript
interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
    readonly runtime?: GameDefRuntime;
  }): { readonly move: Move; readonly rng: Rng };
}
```

**Contract notes**:
- Agents receive `rng` and must return an updated `rng` — all randomness flows through this.
- `runtime` is an optional pre-computed cache (adjacency graph, runtime table index) for performance.
- `legalMoves` is pre-computed by the caller (simulator or kernel loop); agents do NOT call `legalMoves()` themselves for their initial decision point.

### Factory (`factory.ts`)

```typescript
type AgentType = 'random' | 'greedy';

const createAgent = (type: AgentType): Agent => { ... };

const parseAgentSpec = (spec: string, playerCount: number): readonly Agent[] => {
  // "random,greedy,random" → [RandomAgent, GreedyAgent, RandomAgent]
  // Validates count matches playerCount
};
```

**Key**: `parseAgentSpec` currently has NO support for agent-specific config (no `mcts:2000` syntax). The spec proposes adding this. The `isAgentType` type guard will need updating.

### RandomAgent (`random-agent.ts`)

```typescript
class RandomAgent implements Agent {
  chooseMove(input): { move: Move; rng: Rng } {
    // 1. For each legal move, call completeTemplateMove() to resolve template params
    // 2. Categorize: completedMoves vs stochasticMoves
    // 3. If no completions but stochastic exist → selectStochasticFallback()
    // 4. Otherwise → pickRandom(completedMoves, rng)
  }
}
```

**Important for MCTS rollout**: The rollout policy in Spec 61 proposes using RandomAgent logic. However, RandomAgent calls `completeTemplateMove()` for EVERY legal move upfront, which is expensive. For MCTS rollouts doing 200 steps × 1000 iterations, this could be a major bottleneck. The spec's rollout pseudocode already accounts for this but should consider whether ALL template moves need completion or just the selected one.

### GreedyAgent (`greedy-agent.ts`)

```typescript
class GreedyAgent implements Agent {
  // Config: maxMovesToEvaluate?, completionsPerTemplate? (default 5)
  chooseMove(input): { move: Move; rng: Rng } {
    // 1. Expand templates (up to completionsPerTemplate attempts per move)
    // 2. Cap with selectCandidatesDeterministically() if maxMovesToEvaluate set
    // 3. For each candidate: applyMove() → evaluateState()
    // 4. Return highest-scoring move (tie-break with pickRandom)
  }
}
```

**Relevant pattern**: GreedyAgent already does `applyMove → evaluateState` per candidate. MCTS will do this at scale during rollouts. The `evaluateState()` function is the same one MCTS will reuse for rollout cutoff evaluation.

### evaluateState (`evaluate-state.ts`)

```typescript
const evaluateState = (def: GameDef, state: GameState, playerId: PlayerId): number => {
  // 1. Terminal check: win → +1_000_000_000, loss → -1_000_000_000, draw → 0
  // 2. Scoring expression (if def.terminal.scoring exists): evalValue × 100
  // 3. Per-player int variables:
  //    - Own vars: normalized × 10_000 / range
  //    - Opponent vars: normalized × -2_500 / range
};
```

**Scoring constants**:
- `TERMINAL_WIN_SCORE = 1_000_000_000`
- `TERMINAL_LOSS_SCORE = -1_000_000_000`
- `OWN_VAR_WEIGHT = 10_000`
- `OPPONENT_VAR_WEIGHT = 2_500`
- `SCORING_WEIGHT = 100`

**Important for MCTS**: The spec proposes `evaluateForAllPlayers()` that calls `evaluateState()` per player and normalizes to [0, 1]. The current scores are on wildly different scales (billions vs thousands), so normalization is critical. Simple min-max normalization may produce misleading results if one player is in a terminal state (score = 1B) while others are at non-terminal scores (thousands). The normalization approach needs careful design.

### Helper Functions

**`pickRandom<T>(items, rng)`**: Uniformly random selection using `nextInt(rng, 0, length-1)`. Returns `{ item, rng }`. Fast path for single-item arrays.

**`selectStochasticFallback(moves, rng)`**: Wrapper around `pickRandom` for stochastic-unresolved moves.

**`selectCandidatesDeterministically(moves, rng, max)`**: Sampling without replacement when moves exceed max budget. Uses Fisher-Yates-like selection.

### Current Index Re-exports

```typescript
// packages/engine/src/agents/index.ts
export * from './random-agent.js';
export * from './greedy-agent.js';
export * from './evaluate-state.js';
export * from './select-candidates.js';
export * from './factory.js';
```

---

## 2. Kernel API Surface for MCTS

### Core Functions MCTS Will Import

#### `legalMoves(def, state, options?, runtime?)` → `readonly Move[]`

```typescript
// packages/engine/src/kernel/legal-moves.ts
const legalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): readonly Move[];
```

Returns all legal moves at the current decision point. For multi-step operations, this may return sub-decision moves (e.g., "choose a target zone" within a larger operation). MCTS treats each call as a tree node.

**Performance note**: `enumerateLegalMoves()` is the extended version returning warnings. MCTS should use the simpler `legalMoves()` to avoid overhead.

#### `applyMove(def, state, move, options?, runtime?)` → `ApplyMoveResult`

```typescript
// packages/engine/src/kernel/apply-move.ts
const applyMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyMoveResult;

interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
}
```

Applies a move and returns the new state. Immutable — never modifies input state. Fires triggers, applies effects, advances phases.

**Performance note**: MCTS calls this thousands of times per move. The `triggerFirings`, `warnings`, and `effectTrace` fields are overhead MCTS doesn't need. Consider whether `ExecutionOptions` has flags to disable trace/warning collection.

#### `terminalResult(def, state, runtime?)` → `TerminalResult | null`

```typescript
// packages/engine/src/kernel/terminal.ts
const terminalResult = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): TerminalResult | null;
```

Returns null if game is not over, otherwise a result:

```typescript
type TerminalResult =
  | { readonly type: 'win'; readonly player: PlayerId; readonly victory?: VictoryTerminalMetadata }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score'; readonly ranking: readonly PlayerScore[] };
```

**For MCTS reward computation**: The spec's `terminalToRewards()` must handle all four cases. The `'score'` type with rankings needs normalization to [0, 1] per player.

#### `completeTemplateMove(def, state, templateMove, rng, runtime?)` → `TemplateCompletionResult`

```typescript
// packages/engine/src/kernel/move-completion.ts
type TemplateCompletionResult =
  | { readonly kind: 'completed'; readonly move: Move; readonly rng: Rng }
  | { readonly kind: 'unsatisfiable' }
  | { readonly kind: 'stochasticUnresolved'; readonly move: Move; readonly rng: Rng };
```

Template moves have unfilled parameters (e.g., "choose a zone"). This function fills them randomly. Critical for agents that don't make strategic parameter choices.

**For MCTS**: During rollout, the spec calls `completeTemplateMove` for the randomly selected move. During tree expansion, MCTS should enumerate legal moves directly (they come pre-expanded from `legalMoves()`) — but some may be templates that need completion. This is a subtle interaction the spec should clarify.

### Core Types

#### GameDef (abbreviated — key fields for MCTS)

```typescript
interface GameDef {
  readonly metadata: {
    readonly id: string;
    readonly players: { readonly min: number; readonly max: number };
    readonly maxTriggerDepth?: number;
  };
  readonly perPlayerVars: readonly VariableDef[];
  readonly zones: readonly ZoneDef[];
  readonly tokenTypes: readonly TokenTypeDef[];
  readonly actions: readonly ActionDef[];
  readonly terminal: TerminalEvaluationDef;
  // ... many more fields
}
```

#### GameState (abbreviated — key fields for MCTS)

```typescript
interface GameState {
  readonly globalVars: Readonly<Record<string, VariableValue>>;
  readonly perPlayerVars: Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  readonly playerCount: number;
  readonly activePlayer: PlayerId;
  readonly currentPhase: PhaseId;
  readonly turnCount: number;
  readonly rng: RngState;
  readonly stateHash: bigint;
  readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
  // ... more fields
}
```

**Important**: `GameState` contains `rng: RngState` for game-level randomness (e.g., dice rolls in effects). The agent receives a SEPARATE `rng: Rng` for its own decisions. These are distinct streams. During MCTS simulation, the agent's RNG drives search randomness while the state's RNG handles in-game stochastic effects.

#### Move

```typescript
interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly freeOperation?: boolean;
  readonly actionClass?: string;
  readonly compound?: CompoundMovePayload;
}
```

#### GameDefRuntime (performance cache)

```typescript
interface GameDefRuntime {
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
}
```

**MCTS should pre-compute this once** and pass it to all `legalMoves()`, `applyMove()`, `terminalResult()` calls to avoid redundant computation.

---

## 3. Hidden Information & Zone Visibility

### Zone Visibility Model

```typescript
interface ZoneDef {
  readonly id: ZoneId;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  // ...
}
```

**Three visibility levels**:
- `'public'` — all players see all tokens (e.g., Texas Hold'em community cards)
- `'owner'` — only the owning player sees tokens (e.g., Texas Hold'em hand)
- `'hidden'` — no player sees tokens by default (e.g., deck)

### Dynamic Reveals (RevealGrant)

```typescript
interface RevealGrant {
  readonly observers: 'all' | readonly PlayerId[];
  readonly filter?: TokenFilterExpr;
}

// Stored in GameState
readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
// Key: ZoneId → array of RevealGrants for that zone
```

Reveals are applied dynamically via `reveal` / `conceal` effects during gameplay. They override the zone's default visibility for specific observers and optional token filters.

### Texas Hold'em Zone Configuration (real example)

```yaml
zones:
  - id: deck
    owner: none
    visibility: hidden      # No player sees deck contents
    ordering: stack
  - id: hand
    owner: player
    visibility: owner       # Only owning player sees their cards
    ordering: set
  - id: community
    owner: none
    visibility: public      # All players see community cards
    ordering: queue
```

### Implementation Files

| File | Purpose |
|------|---------|
| `kernel/hidden-info-grants.ts` | `canonicalTokenFilterKey()`, `revealGrantEquals()`, `removeMatchingRevealGrants()` |
| `kernel/effects-reveal.ts` | `reveal` and `conceal` effect execution |
| `kernel/token-filter.ts` | `matchesTokenFilterExpr()` — predicate evaluation on tokens |
| `kernel/types-core.ts` | RevealGrant type, GameState.reveals field, ZoneDef.visibility |

### ISMCTS Determinization — What Exists vs. What's Needed

**What EXISTS**:
- Zone visibility flags on `ZoneDef` (compile-time baseline)
- `RevealGrant` system for dynamic runtime reveals
- Token filter matching for selective visibility
- Zobrist hashing includes reveal grants as features
- Render model visibility logic (`derive-render-model.ts`) for UI filtering

**What does NOT exist** (must be built for ISMCTS):
- **No function to compute a player's information set** — i.e., "given player P, which tokens in which zones can P see?" This is currently only done in the runner's render model, not in the engine.
- **No determinization function** — i.e., "given player P's information set, generate a random complete state consistent with what P knows."
- **No zone token redistribution logic** — for shuffling hidden tokens while maintaining game constraints (token counts, type distributions, etc.)
- **No perfect-information detection** — a function to check whether ALL zones are `visibility: 'public'` (to skip determinization entirely for perfect-info games)

### Visibility Resolution Logic (from render model — reference implementation)

```typescript
// packages/runner/src/model/derive-render-model.ts:734-793
function deriveVisibleTokenIDs(
  zoneTokens: readonly Token[],
  visibility: 'public' | 'owner' | 'hidden',
  ownerID: PlayerId | null,
  viewingPlayerID: PlayerId,
  grants: readonly RevealGrant[],
): readonly string[] {
  // 1. Check zone default: public→all, owner→if matches, hidden→none
  // 2. If visible by default, return all token IDs
  // 3. Otherwise, iterate grants:
  //    - If grant observers includes viewer (or 'all')
  //    - If grant filter matches token (or no filter)
  //    - Token is visible
}
```

This logic must be ported to the engine side for ISMCTS. It currently lives only in the runner package.

### Key Insight: Token Constraints for Determinization

When redistributing hidden tokens, the determinization must maintain:
1. **Token count conservation** — total tokens across hidden zones stays the same
2. **Token type constraints** — if a zone only accepts certain token types (enforced by game rules, not by ZoneDef schema directly)
3. **Known public information** — tokens the observing player CAN see must remain in place
4. **Zone ordering** — stacks maintain LIFO order, queues FIFO, sets are unordered
5. **Zone capacity** — some zones may have implicit capacity limits

---

## 4. PRNG System

### API (`kernel/prng.ts`)

```typescript
// Create from seed
const createRng = (seed: bigint): Rng;

// Random integer in [min, max] inclusive
const nextInt = (rng: Rng, min: number, max: number): readonly [number, Rng];

// Fork into two independent streams
const fork = (rng: Rng): readonly [Rng, Rng];

// Low-level step
const stepRng = (rng: Rng): readonly [bigint, Rng];

// Serialization
const serialize = (rng: Rng): Rng['state'];
const deserialize = (state: Rng['state']): Rng;
```

**Algorithm**: PCG-DXSM-128 (128-bit permuted congruential generator)

**Immutability**: All functions return `readonly [value, newRng]` tuples. Never mutate.

### Agent RNG Derivation (from simulator)

```typescript
// packages/engine/src/sim/simulator.ts
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n; // Golden ratio constant

// Each player gets deterministic RNG derived from game seed
const playerSeed = gameSeed ^ (BigInt(playerId) * AGENT_RNG_MIX);
const playerRng = createRng(playerSeed);
```

**Important for MCTS**: The `fork()` function is critical for MCTS — it allows splitting the RNG into independent streams for:
- Tree search randomness (UCT tie-breaking, expansion order)
- Rollout randomness (random move selection)
- Determinization randomness (sampling hidden states)

Without `fork()`, the MCTS search would consume RNG state that affects the final move's returned RNG, breaking determinism guarantees.

---

## 5. Simulation Module

### Core: `runGame()`

```typescript
// packages/engine/src/sim/simulator.ts
const runGame = (
  def: GameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: ExecutionOptions,
): GameTrace;
```

**Game loop**:
1. `initialState(def, seed, playerCount)` → create starting state
2. Derive per-player RNG via `AGENT_RNG_MIX` XOR
3. Loop:
   a. `terminalResult(def, state)` — check if game over
   b. `legalMoves(def, state)` — enumerate options
   c. `agent.chooseMove({ def, state, playerId, legalMoves, rng })` — agent picks
   d. `applyMove(def, state, move)` — advance state
   e. `computeDeltas(preState, postState)` — track changes
4. Return `GameTrace` with all moves, final state, result

**Output**:
```typescript
interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: 'terminal' | 'maxTurns' | 'noLegalMoves';
}
```

**For MCTS**: `runGame()` is the primary integration point. Once `MctsAgent` implements `Agent`, it plugs into `runGame()` with zero changes. However, MCTS internally calls `legalMoves()` and `applyMove()` thousands of times per move — performance of these functions becomes the bottleneck.

### Delta Engine (`delta.ts`)

Computes state diffs between pre/post move application. Used for trace logging and UI animations. MCTS does NOT need this — it only needs the resulting state.

---

## 6. Test Infrastructure & Fixtures

### Test Helpers

| File | Purpose |
|------|---------|
| `test/helpers/production-spec-helpers.ts` | Lazy-cached FITL and Texas Hold'em compilation |
| `test/helpers/replay-harness.ts` | Move sequence replay for determinism verification |
| `test/helpers/agent-template-fixtures.ts` | Template move test fixtures |
| `test/helpers/gamedef-fixtures.ts` | Minimal GameDef builders |

**Production fixture access**:
```typescript
import { getFitlProductionFixture, getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';

const fitl = getFitlProductionFixture();       // 4-player COIN wargame
const texas = getTexasProductionFixture();     // Hidden-info poker
```

### Test Fixtures on Disk

```
test/fixtures/
  gamedef/          # Compiled JSON: minimal-valid.json, fitl-map-foundation-valid.json, etc.
  trace/            # Golden traces: simulator-golden-trace.json, etc.
  cnl/compiler/     # Game spec markdown: compile-valid.md, fitl-foundation-inline-assets.md, etc.
  cnl/conformance/  # Feature compliance: hidden-reveal.md, token-lifecycle.md, etc.
```

### Existing Agent Test Patterns

**Unit test structure** (from `random-agent.test.ts`, `greedy-agent-core.test.ts`):
```typescript
describe('RandomAgent', () => {
  it('selects from legal moves deterministically', () => {
    const def = createMinimalGameDef();
    const state = createMinimalState();
    const input = {
      def, state,
      playerId: asPlayerId(0),
      legalMoves: [move1, move2, move3],
      rng: createRng(42n),
      runtime: {},
    };
    const result = agent.chooseMove(input);
    assert.equal(result.move.actionId, 'expected-action');
  });
});
```

**Key assertions**:
- Move is from the legal set
- RNG advances deterministically
- Same seed → same move
- Template moves are completed before selection
- Stochastic fallback works when no completions succeed

### What MCTS Tests Should Cover (beyond what spec says)

1. **GameDefRuntime caching** — verify MCTS pre-computes and reuses runtime
2. **RNG fork isolation** — search randomness doesn't leak into returned RNG
3. **State immutability** — MCTS never mutates input state during tree search
4. **Node pool cleanup** — memory doesn't grow across multiple `chooseMove` calls
5. **Timeout behavior** — `timeLimitMs` properly short-circuits search

---

## 7. Affected Files & Blast Radius

### Files to CREATE (new)

| File | Lines Est. | Purpose |
|------|-----------|---------|
| `agents/mcts/mcts-config.ts` | 40-60 | MctsConfig interface, defaults, validation |
| `agents/mcts/mcts-node.ts` | 60-100 | MctsNode interface, NodePool, ProvenResult |
| `agents/mcts/uct.ts` | 40-60 | UCT selection formula with tie-breaking |
| `agents/mcts/rollout.ts` | 60-80 | Random rollout policy, reward normalization |
| `agents/mcts/backprop.ts` | 30-50 | Max^n backpropagation |
| `agents/mcts/mcts-solver.ts` | 60-100 | Proven win/loss detection and propagation |
| `agents/mcts/determinize.ts` | 100-150 | ISMCTS determinization (most complex new file) |
| `agents/mcts/mcts-search.ts` | 80-120 | Core search loop orchestrating all components |
| `agents/mcts/mcts-agent.ts` | 40-60 | MctsAgent class implementing Agent |
| `agents/mcts/index.ts` | 10-15 | Re-exports |

**Estimated new code**: 520-795 lines across 10 files.

### Files to MODIFY (existing)

| File | Change | Risk |
|------|--------|------|
| `agents/factory.ts` | Add `'mcts'` to AgentType, update `createAgent()`, update `parseAgentSpec()` to handle `mcts:N` config syntax, update `isAgentType()` | LOW — additive changes |
| `agents/index.ts` | Add `export * from './mcts/index.js'` | LOW — one line |

### Files REFERENCED but NOT modified

| File | Used By MCTS For |
|------|------------------|
| `kernel/legal-moves.ts` | `legalMoves()` — move enumeration in tree expansion and rollout |
| `kernel/apply-move.ts` | `applyMove()` — state transitions in tree expansion and rollout |
| `kernel/terminal.ts` | `terminalResult()` — terminal detection in rollout and solver |
| `kernel/move-completion.ts` | `completeTemplateMove()` — parameter resolution in rollout |
| `kernel/prng.ts` | `nextInt()`, `fork()`, `createRng()` — all randomness |
| `kernel/types-core.ts` | All types: GameDef, GameState, Move, Rng, PlayerId, RevealGrant, ZoneDef, TerminalResult |
| `kernel/branded.ts` | PlayerId branded type |
| `agents/evaluate-state.ts` | `evaluateState()` — rollout cutoff heuristic |
| `agents/agent-move-selection.ts` | `pickRandom()` — rollout random selection |
| `sim/simulator.ts` | `runGame()` — integration point (no changes needed) |
| `kernel/hidden-info-grants.ts` | Token filter matching for determinization |
| `kernel/effects-reveal.ts` | Understanding reveal/conceal mechanics |
| `kernel/token-filter.ts` | `matchesTokenFilterExpr()` for determinization filters |

### Test Files to CREATE

| File | Purpose |
|------|---------|
| `test/unit/agents/mcts/mcts-config.test.ts` | Config defaults, validation, partial merge |
| `test/unit/agents/mcts/mcts-node.test.ts` | Node creation, pool allocation/reset |
| `test/unit/agents/mcts/uct.test.ts` | UCT formula, tie-breaking, edge cases |
| `test/unit/agents/mcts/rollout.test.ts` | Rollout to terminal/depth, reward vectors |
| `test/unit/agents/mcts/backprop.test.ts` | Max^n propagation, visit counts |
| `test/unit/agents/mcts/mcts-solver.test.ts` | Proven results, early termination |
| `test/unit/agents/mcts/determinize.test.ts` | Hidden zone detection, redistribution, no-op for public |
| `test/integration/mcts-agent-perfect-info.test.ts` | Full game on perfect-info fixture |
| `test/integration/mcts-agent-hidden-info.test.ts` | Full game on Texas Hold'em |
| `test/integration/mcts-agent-multiplayer.test.ts` | 4-player FITL |
| `test/integration/mcts-vs-random.test.ts` | Statistical win-rate test |
| `test/integration/mcts-vs-greedy.test.ts` | Statistical win-rate test |
| `test/integration/mcts-determinism.test.ts` | Same seed = same move |
| `test/performance/mcts-benchmark.test.ts` | Iterations/sec, memory usage |

---

## 8. Potential Gaps & Risks

### 8.1 Performance Concerns

**Issue**: MCTS calls `legalMoves()` + `applyMove()` + `terminalResult()` thousands of times per move decision. These functions were designed for single-call-per-turn usage, not high-throughput simulation.

**Specific concerns**:
- `applyMove()` returns `triggerFirings`, `warnings`, and optional `effectTrace` — overhead MCTS doesn't need. Check if `ExecutionOptions` can disable these.
- `legalMoves()` builds fresh enumerations each call. No caching between parent/child states.
- `completeTemplateMove()` may call `legalChoicesEvaluate()` internally, which is expensive.
- Each state is a fresh immutable object — GC pressure from thousands of short-lived GameState objects per move.

**Mitigation questions for research**:
- Can `applyMove` be called with options to skip trace/warning collection?
- Is there a lightweight `isTerminal()` check (boolean) vs. full `terminalResult()` that builds the result object?
- Should MCTS use a mutable state representation internally (breaking engine convention) for performance?

### 8.2 Determinization Complexity

**Issue**: The `determinize.ts` module is the most complex new component. It must:
1. Determine which zones are hidden from the observing player
2. Collect all tokens in those hidden zones
3. Randomly redistribute tokens while maintaining constraints
4. Return a valid GameState

**Gaps in the spec**:
- **Zone ownership per player**: For `visibility: 'owner'` zones, each player has their own zone instance (e.g., each player's `hand` in poker). Determinization must identify which player-owned zones are hidden from the observer and which are visible.
- **Player-indexed zones**: The kernel uses `ownerPlayerIndex` on ZoneDef. How are per-player zones identified and iterated? The zone ID format and ownership model need clarification.
- **Token filter grants**: If a `RevealGrant` has a filter (e.g., "observer can see tokens with type='face-up'"), determinization must keep those specific tokens in place while shuffling the rest.
- **Constraint satisfaction**: Simple random redistribution may produce invalid states (e.g., a zone that should only contain cards of a certain suit). The spec doesn't address constraint validation during determinization.
- **State hash invalidation**: After redistributing tokens, the `stateHash` (Zobrist hash) will be wrong. Does determinization need to recompute it? If MCTS compares states by hash for transposition detection, this matters.

### 8.3 evaluateForAllPlayers() Normalization

**Issue**: The spec proposes `evaluateForAllPlayers()` that normalizes per-player scores to [0, 1]. But `evaluateState()` returns values on vastly different scales:
- Terminal: ±1,000,000,000
- Variables: ±10,000 per variable
- Scoring: ±100

**Risk**: A player at a terminal win (+1B) vs. others at non-terminal scores (thousands) will dominate normalization. Min-max normalization would map the non-terminal players to near-zero regardless of their actual position.

**Suggestion**: The spec should specify the exact normalization strategy and handle the terminal/non-terminal asymmetry explicitly.

### 8.4 Template Move Handling in Tree Expansion

**Issue**: The spec says "MCTS treats each call to `legalMoves()` as a node in the tree." But `legalMoves()` may return template moves (moves with unfilled parameters). These represent classes of moves, not concrete actions.

**Questions**:
- During tree expansion, does MCTS expand templates into concrete moves (like GreedyAgent does)?
- Or does it store template moves as tree edges and complete them lazily?
- The branching factor could explode if every template is expanded into all possible completions.
- The spec's rollout policy handles templates via `completeTemplateMove()`, but the tree expansion strategy for templates is underspecified.

### 8.5 Node Mutability vs. Engine Immutability

**Issue**: The spec's `MctsNode` interface uses mutable fields (`visits: number`, `children: MctsNode[]`, `fullyExpanded: boolean`). This breaks the codebase's immutability convention.

**Justification**: Tree search is inherently stateful — nodes accumulate statistics. Creating new node objects on every visit would be prohibitively expensive.

**Risk**: This is a conscious trade-off but should be explicitly documented as an exception to the immutability rule. The mutation is contained within the search (not exposed to callers), which makes it acceptable.

### 8.6 Missing `GameDefRuntime` Pre-computation

**Issue**: The spec doesn't mention `GameDefRuntime` (adjacency graph + runtime table index). This optional parameter significantly speeds up `legalMoves()`, `applyMove()`, and `terminalResult()`.

**Recommendation**: MCTS should pre-compute `GameDefRuntime` once in `MctsAgent.chooseMove()` and pass it to ALL internal calls. This is a significant performance optimization the spec should mandate.

### 8.7 Multi-Step Decision Sequences and Active Player

**Issue**: The spec correctly notes that MCTS handles sub-decisions naturally via `legalMoves → applyMove`. However, during sub-decisions, the `activePlayer` in `GameState` determines whose turn it is at each tree node. UCT selection uses the active player's reward component.

**Subtlety**: In multi-step operations (e.g., FITL operations with sequential choices), the active player may remain the same across multiple decision points. This is fine for UCT but affects MCTS-Solver: a "proven win" at a sub-decision node only matters if the solver correctly identifies the acting player at each level.

### 8.8 Existing `legalChoicesEvaluate` and `legalChoicesDiscover`

The kernel has `legalChoicesEvaluate()` and `legalChoicesDiscover()` functions (in `kernel/legal-choices.ts`) that GreedyAgent uses to determine if a move has pending choices. MCTS should be aware of these for template move handling but the spec doesn't reference them.

### 8.9 No Existing Information Set Infrastructure

The visibility logic currently exists ONLY in the runner package (`derive-render-model.ts`). The engine has no function like `computeInformationSet(state, playerId)` or `isZoneVisibleToPlayer(zoneDef, playerId, reveals)`. The MCTS determinization implementation will need to build this from scratch in the engine package, potentially duplicating logic from the runner.

**Recommendation**: Consider extracting the visibility resolution logic into a shared utility in the kernel (or a new engine-level module) that both the runner and MCTS can use.

---

## Appendix: Key Import Paths

For the MCTS implementation, these are the exact import paths (post-compilation, using `.js` extensions as per project convention):

```typescript
// Types
import type { Agent, GameDef, GameState, Move, Rng, GameDefRuntime } from '../kernel/types.js';
import type { PlayerId } from '../kernel/branded.js';
import type { TerminalResult } from '../kernel/types-core.js';

// Functions
import { legalMoves } from '../kernel/legal-moves.js';
import { applyMove } from '../kernel/apply-move.js';
import { terminalResult } from '../kernel/terminal.js';
import { completeTemplateMove } from '../kernel/move-completion.js';
import { nextInt, fork, createRng } from '../kernel/prng.js';
import { evaluateState } from './evaluate-state.js';
import { pickRandom } from './agent-move-selection.js';

// Hidden info (for determinization)
import { matchesTokenFilterExpr } from '../kernel/token-filter.js';
import { canonicalTokenFilterKey, revealGrantEquals } from '../kernel/hidden-info-grants.js';
```
