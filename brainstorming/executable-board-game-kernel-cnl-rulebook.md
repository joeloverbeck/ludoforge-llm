# Executable Board Game Kernel + Structured Game Specification

This new repository intends to become a way for LLMs to evolve executable game prototypes using **Structured Game Specifications**. We want to develop it in Typescript. Full types of testing suites (test/unit/ , test/integration/, test/e2e/, test/performance/, test/memory/ ), linting, typecheck.

This is the **full programming spec** for a minimal, flexible system where:
- LLMs produce a **Structured Game Specification** (a structured DSL embedded in Markdown with fenced YAML blocks — not CNL in the academic sense of ACE/SBVR).
- Your code compiles the spec → **executable GameDef JSON**.
- A **kernel engine** runs the game deterministically.
- **bots** enumerate legal moves and play.
- You can evaluate, log, and evolve prototypes.

## 0) Guiding constraints
- **Deterministic**: same seed + same actions = same result.
- **Enumerable**: legal moves must be listable (no “free text” moves).
- **Finite**: all choices are bounded (choose tokens from a zone, ints from a range, enums).
- **Bounded iteration only**: `forEach` over finite collections, `repeat N` with compile-time bounds, no general recursion, trigger chains capped at depth K (default 5). Provably terminating — restricted to primitive recursive patterns (a strict subset: only iteration over known-size collections, not all bounded loops). Note: spatial traversal queries (`connectedZones`) require explicit depth bounds to maintain this guarantee.
- **Small instruction set**: mechanics emerge from composition, not bespoke primitives.

## 1) Artifacts (inputs/outputs)

### 1.1 Structured Game Specification (input from LLM)
A **structured DSL embedded in Markdown with fenced YAML blocks**. Not "Controlled Natural Language" in the academic sense — the format leverages LLMs' strongest generation capabilities (Markdown structure + YAML data) while remaining machine-parseable.

**Format**: Markdown + fenced YAML blocks. Each YAML block is identified by a `section:` key inside the block (not by position or fenced-code label), making parsing order-independent.

**YAML Hardening Requirements** (to mitigate systematic LLM YAML failure modes):
- Use **YAML 1.2 strict parser** (no implicit type coercion — avoids the "Norway problem" where bare `no` → boolean `false`)
- **Require quoted strings** for all non-numeric values
- **Section-order-independent parsing**: identify blocks by keys, not position
- Build a **spec linter** for the 20 most common LLM YAML mistakes (unquoted colons, indentation errors, mixed escape contexts)
- Design **error messages that LLMs can use for self-correction** (machine-readable diagnostics, not just human-readable)

**Parser recommendation**: Use the [`yaml`](https://github.com/eemeli/yaml) npm package (eemeli/yaml), NOT `js-yaml`. Most YAML parsers in the npm ecosystem still implement YAML 1.1 behavior by default. `js-yaml`'s "strict mode" doesn't fully implement YAML 1.2 schema-specific tag resolution restrictions. The `eemeli/yaml` package is the only widely-used Node.js library with true YAML 1.2 compliance, including correct `core` schema handling (no implicit boolean coercion of bare `yes`/`no`/`on`/`off`).

**Required sections**
- Metadata
- Constants
- State variables (global + per-player)
- Zones (public/private, ordering)
- Token types (optional v0)
- Setup
- Turn structure (phases, action window)
- Actions (params, preconditions, costs, effects, limits)
- Triggers (event, match, when, effects)
- End conditions & scoring

Example skeleton:
```md
# Game: <name>

```yaml meta
id: "proto-001"
players: { min: 1, max: 4 }

HAND_LIMIT: 5
MARKET_SIZE: 4

global:
  threat: { type: int, init: 0, min: 0, max: 12 }
perPlayer:
  money: { type: int, init: 2, min: 0, max: 99 }
  vp:    { type: int, init: 0, min: 0, max: 999 }

- id: deck
  owner: none
  visibility: public
  ordering: stack
- id: hand
  owner: player
  visibility: owner
  ordering: set
- id: market
  owner: none
  visibility: public
  ordering: set

effects:
  - draw: { from: "deck:none", to: "hand:each", count: 5 }

phases:
  - id: start
    onEnter: []
  - id: main
  - id: end
    onEnter:
      - addVar: { scope: global, var: threat, delta: 1 }
activePlayerOrder: roundRobin

- id: takeMoney
  actor: activePlayer
  phase: main
  params: []
  pre: { op: "<", left: {ref: pvar, player: actor, var: money}, right: 10 }
  cost: []
  effects:
    - addVar: { scope: pvar, player: actor, var: money, delta: 1 }
  limits: [{ scope: turn, max: 1 }]

- id: loseOnThreat
  when: { op: ">=", left: {ref: gvar, var: threat}, right: 12 }
  result: { type: lossAll }
```

Note: This is a **structured game DSL** embedded in Markdown — the term "Structured Game Specification" replaces the earlier "CNL Rulebook" label.

### 1.2 Mechanic Bundle IR
Intermediate representation for "mechanics as patches". LLMs can output bundles; compiler lowers bundles → GameDef patches. Precedent: Bjork & Holopainen's 200+ game design patterns, Ludii's reusable ludeme definitions, database migrations (composable schema changes), grammatical evolution.

```ts
interface MechanicBundle {
  id: string;
  name: string;
  patch: {
    variables?: VariableDef[];
    zones?: ZoneDef[];
    tokenTypes?: TokenTypeDef[];
    actions?: ActionDef[];
    triggers?: TriggerDef[];
    setup?: Effect[];
    constants?: Record<string, number>;  // tunable knobs for evolution
  };
  requires?: string[];      // dependency bundles (must be present)
  conflicts?: string[];     // incompatible bundles (cannot coexist)
  parameters?: ParameterDef[];  // configurable values
  mutationPoints?: string[];    // hints for LLM evolution operators
}
```

**Composition rules:**
- Additive by default: bundles add definitions, they don't replace
- Namespace isolation: bundle IDs prefix all names to avoid collision
- Parameter binding: constants are resolved at composition time
- Dependency resolution: `requires` bundles are included first
- Conflict detection: `conflicts` bundles are rejected at composition time

**Starter bundle library** (~20-30 bundles):
deck-building core, worker placement, auction (ascending), market row, area majority scoring, engine building (trigger chain), push-your-luck loop, resource conversion, set collection, tech tree, open draft, hand management, variable powers, route building (spatial), territory control (spatial).

**Versioning and compatibility** (post-MVP):
- Bundle versions use semver. Breaking changes (renamed actions, changed parameter types) require major version bumps.
- Cross-bundle composition: when mechanic A from bundle 1 uses mechanic B from bundle 2, the compiler resolves dependencies via `requires` declarations and validates that connected effects/triggers are type-compatible.
- Namespace collision resolution: bundle IDs prefix all names (`bundleId.actionId`). If two bundles define the same name after prefixing (unlikely but possible with nested requires), the compiler emits a `NamespaceCollision` diagnostic and rejects the composition.
- **Note**: This mechanic bundle approach is novel — no published system uses composable mechanic patches for LLM-driven game evolution. Ludii's ludeme composition is the closest analog but is designed for human authoring, not LLM mutation.

**Mutation operators** (for LLM evolution):
- Bundle swap: replace one bundle with another
- Parameter tweak: adjust constants within ranges
- Action add/remove: add or remove an action within a bundle
- Trigger modification: alter trigger conditions or effects
- Cross-bundle wiring: connect effects from one bundle to triggers of another

### 1.3 GameDef JSON (compiled executable)
This is the canonical runtime input. You validate it with JSON Schema + semantic checks.

### 1.4 Runtime Logs
- `MoveLog`: list of (stateHash, player, move, deltas, trigger firings)
- `HighlightLog`: filtered “interesting moments”
- `EvalReport`: metrics + degeneracy flags

## 2) Modules to implement (repo structure)

### 2.1 `kernel/` — core engine (must be pure + deterministic)
Implement these units:

#### A) Types
- `GameDef`
- `GameState`
- `ActionDef`, `TriggerDef`, `EndCondition`
- `ConditionAST`
- `EffectAST`
- `Move` (actionId + bound args)
- `Diagnostics` (errors/warnings with paths)

#### B) Validation
1) **Schema validation** (JSON Schema)
2) **Semantic validation**
   - referenced zones/vars exist
   - param zones exist
   - effects reference existing vars/zones
   - min/max ranges consistent
   - action limits well-formed
   - no impossible choices (e.g., choose token from zone that can never contain tokens after setup)

API:
- `validateGameDef(def): Diagnostics[]`

#### C) State initialization
- apply setup effects
- seed RNG
API:
- `initialState(def, seed): GameState`

#### D) Legal move enumeration
Given a state and player, produce all legal moves:
- filter actions by phase + actor
- enumerate param domains (tokens in zone, ints in range, enums)
- check `pre` conditions and `limits`
API:
- `legalMoves(def, state, playerId): Move[]`

#### E) Move application (core reducer)
- apply `cost` then `effects`
- dispatch triggers for `actionResolved`, `phaseEnter`, etc.
- clamp vars to bounds
- update turn/phase when explicit end-phase action is taken
API:
- `applyMove(def, state, move): GameState`

#### F) Condition evaluator
Evaluate `ConditionAST` against state + bindings.
Keep it small:
- boolean ops: `and/or/not`
- comparisons: `== != < <= > >=`
- arithmetic: `+ -` (optional; keep minimal)
- references: gvar/pvar/zoneCount/tokenProp (tokenProp only for bound tokens)
- aggregates: `sum/count/min/max` over collections (see ValueExpr in Section 3)
API:
- `evalCond(cond, ctx): boolean`

#### G) Effect interpreter
Interpret `EffectAST` (bounded iteration, no general recursion).
Core effects:
- `setVar`, `addVar` — variable manipulation
- `moveToken` — single token zone transfer
- `moveAll` — bulk token zone transfer with optional filter
- `draw` (bounded count) — draw N tokens from zone
- `shuffle(zone)` — randomize zone ordering
- `createToken`, `destroyToken` — token lifecycle
- `if` — conditional branching
- `chooseOne/chooseN` — bounded, enumerated options query
- `forEach` — bounded iteration over finite collections (zone contents, player list); hard iteration limit enforced; provably terminating
- `let/bind` — named intermediates for readability and duplication reduction
API:
- `applyEffects(effects, ctx): void` (mutates a draft state)

#### H) Trigger dispatcher
Minimal event model:
- `phaseEnter(phaseId)`
- `phaseExit(phaseId)`
- `turnStart(activePlayer)`
- `turnEnd(activePlayer)`
- `actionResolved(actionId, actor)`
- `tokenEntered(zoneId, tokenId)` — for spatial/zone-based triggers

**Trigger depth limit**: `maxTriggerDepth` (default: 5) in GameDef metadata. Cascading triggers (trigger A fires trigger B fires trigger C...) are capped at this depth. Exceeding the limit raises a runtime diagnostic, not a crash — the chain is truncated and logged.

**Boundary behavior when depth is exceeded**:
- The state is returned as-is at the point of truncation (no partial effects from the truncated trigger)
- The diagnostic includes the **full trigger chain** that was attempted (e.g., `tokenEntered:market → restock → tokenEntered:deck → ... [TRUNCATED at depth 5]`)
- The `EvalReport` flags games that frequently hit depth limits (`TRIGGER_DEPTH_EXCEEDED` degeneracy flag) — this signals either a design flaw in the game or an insufficient depth limit

API:
- `dispatch(event, ctx): void`

#### I) Terminal detection
- evaluate end conditions
- scoring if needed
API:
- `terminalResult(def, state): TerminalResult | null`

---

### 2.2 `cnl/` — Game Spec parsing + compilation (LLM-facing)
This is what makes the Structured Game Specification executable.

#### A) Parser
- Parse Markdown
- Extract fenced YAML blocks by `section:` key (order-independent identification)
- Parse YAML with **strict YAML 1.2** parser (no implicit type coercion)
- Apply YAML hardening rules (quoted strings, colon safety)
API:
- `parseGameSpec(markdownText): GameSpecDoc`

#### B) Game Spec validation
- required sections present
- no unknown keys
- helpful diagnostics for LLM mistakes (machine-readable, with suggestions)
API:
- `validateGameSpec(doc): Diagnostics[]`

#### C) Lowering / compilation
- `GameSpecDoc` → `GameDef`
  - normalize zone addressing (`"hand:each"` → macro expansion)
  - normalize player selectors (`actor/active/each`)
  - normalize effects and conditions into AST form
  - generate board topology from macros (grid, hex → zones with adjacency)
API:
- `compileGameSpecToGameDef(doc): { gameDef, diagnostics }`

> Important: keep compilation **mechanical**. No "interpretation". If the spec can't compile, fail with LLM-friendly diagnostics (see Section 4).

#### D) Macro expansion (spec convenience)
To keep the game spec readable while keeping kernel minimal, implement macro sugar in compiler, e.g.:
- `draw {to: hand:each, count: N}` expands into per-player effects.
- `refillToSize` expands into bounded draws (requires a compiler-side unrolling limit or a derived op—see below).
- `grid(rows, cols)` expands into zones with adjacency metadata (see Board-as-Graph section).
- `hex(radius)` expands into hex-grid zones with adjacency.
API:
- `expandMacros(doc): doc'`

**Compiler-only derived effects (recommended)**
These are NOT kernel primitives; they compile to bounded primitives:
- `discardDownTo(zone, size)` → chooseN + moveToken
- `refillToSize(zone, size, fromZone)` → repeated draw up to (size - currentCount), bounded by size

---

### 2.3 `agents/` — bots
Define a strict interface:

```ts
interface Agent {
  chooseMove(input: {
    def: GameDef;
    state: GameState;
    playerId: number;
    legalMoves: Move[];
    rng: Rng; // optional agent RNG
  }): Move;
}

Provide at least:

RandomAgent

GreedyAgent (heuristic: maximize VP gain, minimize threat, maximize resources)

Bandit/UCTAgent (optional early; powerful for emergence)

### 2.4 sim/ — simulation runner + evaluation
A) Simulator

run single game: runGame(def, seed, agents, maxTurns) -> GameTrace

enforce turn cap

record logs

B) Metrics

Compute from trace:

branching factor avg

action diversity

resource tension (scarcity proxy)

interaction proxy (shared-zone touches, take-that events if you add tags)

dominant-action detector (same move repeated when alternatives exist)

loop/stall detector (state hash repeats)

comeback/variance proxies (score swing stats across runs)

C) Degeneracy flags

LOOP_DETECTED

NO_LEGAL_MOVES

DOMINANT_ACTION

TRIVIAL_WIN (wins in < K turns)

STALL (no meaningful state change for N turns)

TRIGGER_DEPTH_EXCEEDED (trigger chain hit maxTriggerDepth limit)

Outputs:

EvalReport { metrics, flags, highlights }

### 2.5 cli/ — developer workflows

Commands:

spec:lint <file.md> (parse + validate game spec)

spec:compile <file.md> --out game.json

run <game.json> --agents random,greedy --seed 1

eval <game.json> --runs 50 --agents ... --out report.json

replay <trace.json> (pretty-print)

### 2.6 schemas/ — JSON Schemas

GameDef.schema.json

GameSpecDoc.schema.json (optional; mostly compiler validation)

Trace.schema.json

EvalReport.schema.json

## 3) Kernel DSL details (exact minimal AST)

### 3.1 References

```
{ ref: "gvar", var: "threat" }
{ ref: "pvar", player: PlayerSel, var: "money" }
{ ref: "zoneCount", zone: ZoneSel }
{ ref: "tokenProp", token: "$card", prop: "cost" }  // token must be bound by params, choose, or forEach
{ ref: "binding", name: "$x" }                       // reference a let/forEach-bound value
```

### 3.2 ConditionAST

```ts
type Condition =
  | { op: "and"|"or", args: Condition[] }
  | { op: "not", arg: Condition }
  | { op: "=="|"!="|"<"|"<="|">"|">=", left: ValueExpr, right: ValueExpr }
  | { op: "in", item: ValueExpr, set: ValueExpr }
```

### 3.3 ValueExpr

```ts
type ValueExpr =
  | number | boolean | string
  | { ref: ... }                                        // refs above
  | { op: "+"|"-"|"*", left: ValueExpr, right: ValueExpr }
  | { aggregate: { op: "sum"|"count"|"min"|"max", query: OptionsQuery, prop?: string } }
  // aggregate examples:
  //   { aggregate: { op: "count", query: { query: "tokensInZone", zone: "hand:actor" } } }
  //   { aggregate: { op: "sum", query: { query: "tokensInZone", zone: "tableau:actor" }, prop: "vp" } }
```

### 3.4 EffectAST

```ts
type Effect =
  // Variable manipulation
  | { setVar: { scope: "global"|"pvar", player?: PlayerSel, var: string, value: ValueExpr } }
  | { addVar: { scope: "global"|"pvar", player?: PlayerSel, var: string, delta: ValueExpr } }

  // Single token movement
  | { moveToken: { token: TokenSel, from: ZoneSel, to: ZoneSel, position?: "top"|"bottom"|"random" } }
  // Bulk token movement
  | { moveAll: { from: ZoneSel, to: ZoneSel, filter?: Condition } }
  // Spatial token movement (requires adjacency)
  | { moveTokenAdjacent: { token: TokenSel, from: ZoneSel, direction?: string } }

  // Zone operations
  | { draw: { from: ZoneSel, to: ZoneSel, count: number } }
  | { shuffle: { zone: ZoneSel } }

  // Token lifecycle
  | { createToken: { type: string, zone: ZoneSel, props?: Record<string, ValueExpr> } }
  | { destroyToken: { token: TokenSel } }

  // Control flow
  | { if: { when: Condition, then: Effect[], else?: Effect[] } }
  | { forEach: { bind: string, over: OptionsQuery, effects: Effect[], limit?: number } }
  //   forEach iterates over a finite, bounded collection. Default limit: 100.
  //   Provably terminating: restricted to primitive recursive patterns (iteration over known-size collections).

  // Named intermediates (readability, deduplication)
  | { let: { bind: string, value: ValueExpr, in: Effect[] } }

  // Player choice
  | { chooseOne: { bind: string, options: OptionsQuery } }
  | { chooseN: { bind: string, options: OptionsQuery, n: number } }
```

### 3.5 OptionsQuery

```ts
type OptionsQuery =
  | { query: "tokensInZone", zone: ZoneSel }
  | { query: "intsInRange", min: number, max: number }
  | { query: "enums", values: string[] }
  | { query: "players" }                                    // all players
  | { query: "zones", filter?: { owner?: PlayerSel } }      // zone enumeration
  // Spatial queries (require adjacency metadata on zones)
  | { query: "adjacentZones", zone: ZoneSel }
  | { query: "tokensInAdjacentZones", zone: ZoneSel }
  | { query: "connectedZones", zone: ZoneSel, via?: Condition }  // bounded traversal
```

### 3.6 Selectors

```ts
// Extended PlayerSel — supports multi-player interaction patterns
type PlayerSel =
  | "actor"                       // the player taking the current action
  | "active"                      // the active player this turn
  | "all"                         // every player
  | "allOther"                    // everyone except actor
  | { id: number }                // specific player by index
  | { chosen: string }            // player selected via chooseOne bind
  | { relative: "left"|"right" }  // seating-relative to actor

type ZoneSel = "zoneId:none" | "zoneId:<playerSel>"

type TokenSel = "$paramName" | "$bindName"  // from params, choose, or forEach bind
```

## 4) Game Spec → GameDef mapping rules (compiler contract)

To make automation realistic, the compiler must be strict:

Every action must define:

id, actor, phase

params with domains (token from zone / int range / enum)

pre, cost, effects

Every token reference in effects/conditions must be:

a param ($card) or a bind from chooseOne/chooseN

Every choose must have enumerable options.

Any macro sugar is expanded at compile-time into kernel primitives.

**LLM-friendly diagnostics** — the compiler's error messages are the critical feedback signal for the LLM evolution loop. They must be machine-readable and actionable:
- Not just `"error at line 5"` but `"action 'buy' references zone 'shop' which does not exist; did you mean 'market'? Available zones: deck, hand, market"`
- Include the **path** to the error (section, action, effect index)
- Include **available alternatives** when a reference fails, with fuzzy-match suggestions
- Include **type mismatch details** when expressions don't typecheck
- Include **context snippets**: 2-3 lines of the original spec around the error location
- Format as structured JSON for programmatic consumption

**Structured diagnostic format**:
```ts
interface Diagnostic {
  path: string;          // e.g. "actions[2].effects[0].moveToken.from"
  severity: "error" | "warning" | "info";
  message: string;       // human-readable description
  suggestion?: string;   // concrete fix suggestion (e.g. "replace 'shop' with 'market'")
  contextSnippet?: string; // 2-3 lines of spec around the error
  alternatives?: string[]; // valid options when a reference fails
}
```

**RAG-assisted correction** (post-MVP): Store historical error→fix pairs from evolution runs. When the same error pattern recurs, retrieve the previously successful fix and include it in the diagnostic's `suggestion` field. This retrieval-augmented approach to error correction has shown high success rates for syntax errors in code generation (AutoDebugger, 2023).

If something is not representable, compiler emits a **MissingCapability** diagnostic with:
- where it appears (section path)
- why it can't compile (specific constraint violated)
- suggested workaround (e.g., "replace simultaneous selection with sequential draft")

**MissingCapability aggregation**: Across evolution runs, aggregate MissingCapability diagnostics. Frequently-requested capabilities should be evaluated for kernel inclusion — this is how the primitive set grows organically over time.

## 5) Board-as-Graph Spatial Model

Zones serve double duty: they are both **containers** (for tokens/cards) AND **spatial nodes** in a graph topology. This enables route building, area control, piece movement, and tile placement without a separate Board type.

### 5.1 Zone adjacency

Add `adjacentTo?: string[]` on `ZoneDef` to define graph topology:

```ts
interface ZoneDef {
  id: string;
  owner: "none" | "player";
  visibility: "public" | "owner" | "hidden";
  ordering: "stack" | "queue" | "set";
  adjacentTo?: string[];  // list of adjacent zone IDs — defines the board graph
}
```

### 5.2 Board generation macros (compiler-level)

The compiler expands board macros into zones with adjacency metadata:
- `grid(rows, cols)` → generates `rows * cols` zones named `cell_R_C` with 4-connected adjacency
- `hex(radius)` → generates hex-grid zones with 6-connected adjacency

These are **compiler sugar only** — the kernel sees ordinary zones with `adjacentTo` arrays.

### 5.3 Spatial conditions

Add spatial references to ConditionAST:
```ts
// "Is zone X adjacent to zone Y?"
{ ref: "adjacent", zone: ZoneSel, to: ZoneSel }
// "Is there a connected path from X to Y (optionally filtered)?"
{ ref: "connected", zone: ZoneSel, to: ZoneSel, via?: Condition }
```

### 5.4 Spatial effects

```ts
// Move a token to an adjacent zone (direction optional — picks from adjacency list)
{ moveTokenAdjacent: { token: TokenSel, from: ZoneSel, direction?: string } }
```

### 5.5 Spatial queries in OptionsQuery

```ts
{ query: "adjacentZones", zone: ZoneSel }
{ query: "tokensInAdjacentZones", zone: ZoneSel }
{ query: "connectedZones", zone: ZoneSel, via?: Condition }  // bounded traversal
```

### 5.6 What this does NOT include

These are deferred — not needed for MVP spatial support:
- Named directions (N/S/E/W) — implicit from adjacency is sufficient
- Rotation / symmetry detection
- Complex geometry (triangular, star graphs)
- Distance / unbounded pathfinding as kernel primitives (use bounded `forEach` over adjacency instead)
- **Line-of-sight**: Not supported (common in wargames, dungeon crawlers — would require ray-casting or visibility graphs)
- **Continuous space**: Model is discrete zones only (no coordinate-based movement or distance calculations)
- **Multi-level boards**: Vertical adjacency not addressed (Z-axis stacking, 3D board layouts)
- **Edge weights**: No weighted edges for movement cost differentiation (all adjacencies are uniform cost)

---

## 6) Evolution Pipeline

Design for **MAP-Elites** (quality-diversity algorithm) from the start. Pure optimization converges to a monoculture — MAP-Elites maintains a diverse archive of high-quality games. This is the highest-impact recommendation from procedural content generation literature (Fontaine et al., 2020-2021).

### 6.1 Behavioral dimensions (for MAP-Elites archive)

| Dimension | Description | Range |
|-----------|-------------|-------|
| Average game length | Mean turns across N simulations | 5–200 |
| Average branching factor | Mean legal moves per turn | 1–50 |
| Mechanic count | Number of distinct mechanics used | 1–15 |

**Behavior characterization interface**: Each game maps to an archive cell via:
```ts
type BehaviorCharacterization = {
  avgGameLength: number;       // discretized into bins
  avgBranchingFactor: number;  // discretized into bins
  mechanicCount: number;       // integer count
};
```

**Enhancement: CMA-ME** (Covariance Matrix Adaptation MAP-Elites, Fontaine et al. GECCO 2020): For continuous behavior spaces, CMA-ME doubles standard MAP-Elites performance by using covariance matrix adaptation to generate solutions that both improve quality and explore new archive cells. Consider CMA-ME when behavior dimensions are continuous-valued (as `avgGameLength` and `avgBranchingFactor` are).

**Secondary diversity objective**: Complement MAP-Elites with novelty search — penalize games whose behavior characterization is too similar to existing archive occupants. This pushes exploration toward under-represented regions of the design space.

### 6.2 Generate-verify-feedback cycle

```
LLM generates game spec → compile → [errors? feed back to LLM → regenerate] → run with bots → evaluate → fitness scores → select/mutate → next generation
```

Iterative refinement (generate → compile → feed errors back → regenerate) improves success rates over single-shot generation, though gains are task-dependent and subject to diminishing returns. Self-Refine (Madaan et al., 2023) reports ~20% absolute improvement on reasoning tasks; code generation studies show ~13% improvement with iterative feedback. Literature suggests 3-5 refinement iterations are typically sufficient — beyond that, returns diminish significantly. The compiler's error messages are the critical link — invest heavily in diagnostic quality.

**LLM generation guardrails**:
- **Hallucination handling**: LLM-generated board games have high error rates (~50% in Boardwalk, 2024). The compiler's constraint validation is the primary defense — validate every generated spec exhaustively before simulation.
- **Temperature / sampling**: Document the sampling strategy for reproducible evolution runs. Use deterministic decoding (temperature=0 or fixed seed) for baseline runs; higher temperature for diversity exploration.
- **Iteration budget**: Cap refinement at 5 iterations per generation step. If a spec doesn't compile after 5 attempts, discard and regenerate from scratch.

### 6.3 Seed population

Do NOT cold-start from random LLM output. Create **5–10 hand-crafted game spec examples** of known game patterns as seeds:
- Simple auction game
- Deck builder
- Market/engine game
- Push-your-luck game
- Worker placement game
- Set collection game
- Route building game (spatial)
- Area control game (spatial)

### 6.4 Mutation operators

| Operator | Description |
|----------|-------------|
| Bundle swap | Replace one mechanic bundle with another |
| Parameter tweak | Adjust constants within ranges |
| Action add/remove | Add or remove an action definition |
| Trigger modification | Alter trigger conditions or effects |
| Cross-bundle wiring | Connect effects from one bundle to triggers of another |
| Zone topology change | Modify board adjacency graph (spatial games) |

### 6.5 Fitness function tiers

**Tier 1: Hard Filters** (binary pass/fail — games that fail these are discarded)
- Game terminates within max turns
- No infinite loops or trigger cascades
- Legal moves exist on most turns
- Not trivially won in < K turns
- Multiple actions used across a game

**Tier 2: Soft Metrics** (continuous, multi-objective — used for fitness ranking)
- Action entropy (diversity of choices)
- Balance (first-player win rate near 50%)
- Skill gradient (random vs. greedy agent win rate difference)
- Drama: `drama = count(leadChanges) / gameLengthTurns` (normalized lead changes per game)
- Game length mean and variance
- Player interaction frequency: `interaction = count(effectsTargetingOtherPlayers) / totalEffects`
- Replayability diversity: variance in game trajectories across different seeds (how different are successive games?)
- Decision depth: count of turns where `legalMoves.length > 1` and choice affects game outcome
- Dominant strategy detection: flag if a single action sequence wins >80% of games

**Human evaluation gate** (post-MVP): Automated metrics miss human quality perception — a game can be balanced and diverse yet still feel boring. Plan for human evaluation of top MAP-Elites candidates. ("It might be balanced, but is it actually good?" remains an open problem in automated game design.)

**Tier 3: Diversity Dimensions** (for MAP-Elites archive placement)
- Average branching factor
- Average game length
- Number of distinct mechanics used

### 6.6 MissingCapability aggregation

Aggregate compiler diagnostics across evolution runs. Frequently-requested capabilities should be evaluated for kernel inclusion — this is how the primitive set grows organically. Track:
- Which capabilities are most requested
- Which workarounds are used
- Which requests correlate with higher-fitness games

### 6.7 Model collapse mitigation

Over many generations, LLM mutations may converge to a narrow design style (Nature, 2024: recursive training on LLM-generated data causes model collapse via a two-stage process — early tails vanish, then variance collapses). Mitigations:
- MAP-Elites maintains diversity by design (archive structure prevents monoculture)
- Periodically inject random restarts (new seeds from different LLM prompts)
- Use different LLM prompting strategies for different lineages
- Rotate fitness weight emphasis across generations
- **Ground truth anchoring**: Always include the hand-crafted seed examples (Section 6.3) in the population — they serve as diversity anchors that prevent total collapse toward a single design idiom
- **The generate-verify pipeline itself helps**: because each game must compile and pass hard filters, the LLM cannot drift into degenerate output patterns without being caught and corrected

### 6.8 Round-trip compilation (recommended)

Implement `GameDef → Game Spec` decompilation. This enables richer mutation: the LLM can read and modify any game in the population, not just ones it originally created.

---

## 7) Deterministic Engine Requirements

### 7.1 Seedable PRNG

Use a well-vetted seedable PRNG — NOT `Math.random()`. Recommended options:
- **PCG** (specifically PCG-DXSM, the 2022+ variant): Strong statistical properties, compact state, well-analyzed. Preferred choice.
- **xoshiro256\*\***: Fast and widely used, but has a known invertible output function (O'Neill, 2018 critique) and weak low-order bits. Acceptable for game simulation (non-cryptographic) but PCG is the more modern recommendation.

For game simulation, either is acceptable — the key requirements are:
- Seedable (same seed → same sequence)
- Serializable (RNG state stored in GameState, not just the initial seed)
- Fast (millions of calls per second)
- **Not cryptographic**: Neither is suitable for security-sensitive applications, but game simulation doesn't require this

### 7.2 RNG state in GameState

The full RNG state is part of `GameState`. This means:
- Saving and restoring a GameState preserves the RNG position
- Two games with the same seed and same moves produce identical states at every point
- Forking a game state for lookahead also forks the RNG

### 7.3 Zobrist-style incremental state hashing

Implement XOR-based incremental state hashing for:
- Efficient loop detection (state hash repeats → LOOP_DETECTED flag)
- Replay verification (compare state hashes at each step)
- Determinism testing (same seed + same moves = same hash at every step)

**Implementation details**:
- Use **64-bit** Zobrist hashing (collision probability becomes significant at ~2^32 distinct positions — sufficient for game simulation, not cryptographic)
- **Seeding strategy**: Generate random bitstrings deterministically from a seed derived from the GameDef's feature names (token types, zones, variables). This ensures the same game definition always produces the same Zobrist table.
- **Variable-sized zones**: Assign one random bitstring per `(tokenType, zoneId)` pair. When a token moves from zone A to zone B, XOR out the `(tokenType, A)` bitstring and XOR in the `(tokenType, B)` bitstring — O(1) incremental update.
- **Variable state**: Also hash variable values using bitstrings per `(variableName, value)` pair. For integer variables with bounded ranges, pre-generate bitstrings for each possible value.

### 7.4 State hash in logs

Every `MoveLog` entry includes the state hash. This enables:
- O(1) determinism verification
- Efficient trace comparison
- Debugging divergent replays

### 7.5 Determinism enforcement patterns

The kernel must produce bit-identical results across platforms. These patterns are mandatory:

- **Integer-only arithmetic**: The kernel MUST NOT use floating-point math. All game values are integers. Division, if needed, uses integer division (`Math.trunc(a / b)`). This avoids cross-platform IEEE 754 rounding differences.
- **Forbidden APIs**: The following are banned in kernel code:
  - `Math.random()` — use the seeded PRNG exclusively
  - `Date.now()`, `performance.now()` — no time-dependent behavior
  - `Map` / `Set` iteration (insertion order is guaranteed in ES2015+ but avoid reliance on it in critical paths — use sorted arrays for deterministic ordering)
  - `Object.keys()` / `Object.entries()` without explicit sorting — property enumeration order is implementation-dependent for integer-like keys
  - `JSON.stringify()` for hashing — key order is not guaranteed across engines
- **State serialization round-trip**: Every `GameState` must satisfy `deepEquals(deserialize(serialize(state)), state)`. This is a mandatory test for every state transition.
- **RNG state is mandatory**: The full PRNG state (not just the initial seed) is part of `GameState`. This is not optional — forking, saving, and restoring states all depend on it.
- **TypeScript compile-time enforcement**: Use `readonly` on all GameState fields, `as const` for literal types, and branded types (e.g., `type PlayerId = number & { __brand: 'PlayerId' }`) to catch mutation and type confusion at compile time.

---

## 8) Testing requirements (non-negotiable if you want sanity)
8.1 Determinism tests

same seed + same move sequence yields identical final state hash.

8.2 Property tests (quickcheck style)

applyMove never produces invalid var bounds

tokens never duplicate across zones

legalMoves are actually legal (preconditions hold)

no crash on random play for N turns

8.3 Golden tests

compile known game spec → JSON equals expected

run known seed trace equals expected

## 9) Minimal "done" checklist (MVP)

To run bots on LLM game specs, you must implement:

1. **Game Spec parser** (markdown → yaml blocks, YAML 1.2 strict, section-order-independent, YAML hardening rules)

2. **Game Spec validator + macro expansion** (including board generation macros: `grid`, `hex`)

3. **Compiler** (Game Spec → GameDef AST/JSON) with LLM-friendly diagnostics

4. **GameDef schema + semantic validation**

5. **Kernel** (with expanded primitive set):
   - state init (seedable PRNG: PCG-DXSM preferred or xoshiro256**, NOT Math.random())
   - legal move enumeration (including spatial queries)
   - condition eval (including aggregates: sum, count, min, max)
   - effect apply (including `forEach`, `moveAll`, `let`, extended `PlayerSel`)
   - trigger dispatch (with `maxTriggerDepth` limit, default 5)
   - terminal detection
   - Zobrist-style incremental state hashing
   - state hash in every log entry

6. **Board-as-graph spatial model** (zone adjacency, spatial conditions, spatial effects, spatial OptionsQuery variants)

7. **At least 2 agents** (random + greedy)

8. **Simulator + trace logger** (with state hashes for determinism verification)

9. **Basic evaluator** (10 runs, core degeneracy flags)

Once MVP exists, then you can add:

- Hidden info observations + `reveal`/`peek` effects
- Better agents (UCT/MCTS)
- Richer metrics
- Mechanic Bundle IR + patch evolution
- Evolution pipeline with MAP-Elites
- Simultaneous play (after hidden info)
- Round-trip compilation (GameDef → Game Spec decompilation)

## 10) What you explicitly do NOT build up front

- Every mechanic — the primitive set covers ~80% of the card/resource/spatial mechanic space; remaining gaps are accepted
- General recursion / unbounded loops — bounded iteration (`forEach`) is sufficient
- Full information-set reasoning — hidden info is post-MVP
- Simultaneous play — comes after hidden info
- Negotiation, freeform text — out of scope for deterministic kernel
- Token-to-token attachment — rarely needed in target design space
- Named directions / rotation / symmetry — implicit from adjacency is sufficient
- Unbounded graph traversal / pathfinding — use bounded `forEach` over adjacency
- Tier C primitive discovery — human-supervised only, if ever
- Complex geometry (triangular, star graphs) — zone adjacency handles all needed topologies

Those arrive only when a promising prototype forces them, via MissingCapability aggregation.

---

## Appendix A) Comparison with Existing Systems

LudoForge occupies a distinct niche: it is designed *for LLM generation*, while other systems were designed for human authoring or AI research.

| Aspect | LudoForge | Ludii | OpenSpiel | GVGAI | PuzzleScript |
|--------|-----------|-------|-----------|-------|--------------|
| **Focus** | Board game evolution via LLMs | Universal game description & AI | Multi-agent AI research | Video game AI research | Puzzle game authoring |
| **Format** | YAML DSL in Markdown | Ludeme composition (Java-like) | C++ procedural API | VGDL (text DSL) | Declarative pixel rules |
| **Expressiveness** | Board game subset (intentionally bounded) | Universal (proven Turing-complete for combinatorial games, Soemers et al. 2024) | Universal (arbitrary C++) | Video game subset | Puzzle subset |
| **LLM-friendly** | Yes (primary design goal) | No (complex nested syntax) | No (C++ API) | Partial (simple text format) | No (pixel-level rules) |
| **Evolution support** | MAP-Elites (first-class) | Researched (Browne 2011, Ludi) | Not primary focus | Not primary focus | Not supported |
| **Determinism** | Mandatory (seeded PRNG, Zobrist hashing) | Yes | Yes | Yes | Yes |
| **Spatial model** | Board-as-graph (zone adjacency) | Rich (board/container/piece hierarchy) | Game-specific | Grid-based | Grid-based |

**Key differentiator**: LudoForge optimizes for the LLM→compile→simulate→evaluate loop. YAML+Markdown is 15-56% more token-efficient than JSON and has 30-50% fewer parsing failures in LLM output. The bounded instruction set prevents LLMs from generating uncompilable or non-terminating games.

---

## Appendix B) Key References

Papers and sources that validate the design decisions in this specification:

1. **Fontaine, M. et al.** "Covariance Matrix Adaptation for the Rapid Illumination of Behavior Space" (CMA-ME). GECCO 2020. — Validates MAP-Elites approach for quality-diversity optimization.

2. **Fontaine, M. & Nikolaidis, S.** "Differentiable Quality Diversity" (DQD). NeurIPS 2021. — Extensions to MAP-Elites for continuous optimization.

3. **Soemers, D. et al.** "Ludii as a General Game System" (universality proof). IEEE CoG 2024. — Validates game description languages for universal game representation; zone-based models proven sufficient.

4. **Lanctot, M. et al.** "OpenSpiel: A Framework for Reinforcement Learning in Games." arXiv 2019. — Reference for multi-agent game simulation architecture.

5. **Shumailov, I. et al.** "AI models collapse when trained on recursively generated data." Nature 2024. — Validates model collapse concern; justifies diversity preservation in evolution pipeline.

6. **Todd, G. et al.** "Boardwalk: LLM-Based Board Game Generation." arXiv 2024-2025. — Reports ~50% error rate in LLM-generated board games; validates need for compiler-driven error feedback.

7. **Bjork, S. & Holopainen, J.** *Patterns in Game Design.* Charles River Media, 2004. — Source for 200+ game design patterns; basis for mechanic bundle library.

8. **Madaan, A. et al.** "Self-Refine: Iterative Refinement with Self-Feedback." NeurIPS 2023. — Reports ~20% improvement from iterative refinement (not 2-5x); informs generate-verify-feedback cycle expectations.

9. **Li, Z. et al.** "AutoDebugger: Automated Debugging via LLM-based Multi-Agent Synergy." arXiv 2023. — Validates RAG-based error correction approach for compiler diagnostics.

10. **Ryan, C. et al.** "Grammatical Evolution." 1998. — Precedent for grammar-based evolution of game mechanics.

11. **O'Neill, M.E.** "PCG: A Family of Simple Fast Space-Efficient Statistically Good Algorithms for Random Number Generation." 2014 (PCG-DXSM variant, 2022). — PRNG recommendation and xoshiro256** critique.