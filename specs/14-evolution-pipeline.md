# Spec 14: Evolution Pipeline

**Status**: Draft
**Priority**: P2 (post-MVP)
**Complexity**: XL
**Dependencies**: Spec 13, Spec 10, Spec 11
**Estimated effort**: 5-7 days
**Source sections**: Brainstorming section 6

## Overview

Implement the MAP-Elites evolution pipeline that generates diverse, high-quality board games. The pipeline orchestrates the full loop: LLM generates Game Specs (via bundle mutation or direct generation), the compiler validates and compiles them, the simulator runs bot matches, the evaluator scores fitness, and MAP-Elites maintains a quality-diversity archive indexed by behavioral dimensions. This is the capstone module that ties all other modules together for automated game design.

## Scope

### In Scope
- MAP-Elites archive: 3D grid indexed by BehaviorCharacterization
- Fitness function: Tier 1 hard filters + Tier 2 soft metrics
- Generate-verify-feedback cycle with iteration cap (5 attempts)
- Seed population management (5-10 hand-crafted specs)
- Mutation operators: bundle swap, parameter tweak, action add/remove, trigger modification, cross-bundle wiring, zone topology change
- BehaviorCharacterization computation and discretization
- MissingCapability aggregation across generations
- Model collapse mitigation strategies
- Evolution run configuration and orchestration

### Out of Scope
- LLM API integration (this spec defines the interface; actual LLM calls are pluggable)
- CMA-ME variant (enhancement over basic MAP-Elites, defer to later)
- Novelty search secondary objective (defer)
- Human evaluation gate (post-post-MVP)
- Round-trip compilation / decompilation
- Web dashboard for evolution monitoring
- Distributed evolution across multiple machines

## Key Types & Interfaces

### MAP-Elites Archive

```typescript
interface MapElitesArchive {
  readonly grid: ReadonlyMap<string, ArchiveCell>;
  // key = discretized BehaviorCharacterization string
  readonly dimensions: ArchiveDimensions;
}

interface ArchiveCell {
  readonly game: ArchivedGame;
  readonly fitness: number;
  readonly behavior: BehaviorCharacterization;
  readonly generation: number;
  readonly isSeed: boolean; // true for hand-crafted seeds (never replaced)
}

interface ArchivedGame {
  readonly spec: GameSpecDoc; // or bundle composition
  readonly gameDef: GameDef;
  readonly traces: readonly GameTrace[];
  readonly evalReport: EvalReport;
  readonly lineage: GameLineage;
}

interface GameLineage {
  readonly parentId?: string; // which game was this mutated from
  readonly mutation?: string; // which operator was applied
  readonly generation: number;
  readonly llmModel?: string; // which LLM generated/mutated this
  readonly attempts: number; // how many compile attempts before success
}

interface ArchiveDimensions {
  readonly gameLengthBins: readonly number[]; // e.g., [5, 15, 30, 60, 100, 200]
  readonly branchingFactorBins: readonly number[]; // e.g., [1, 3, 7, 15, 30, 50]
  readonly mechanicCountBins: readonly number[]; // e.g., [1, 3, 5, 8, 12, 15]
}
```

### Archive Operations

```typescript
// Create empty archive with configured dimensions
function createArchive(dimensions: ArchiveDimensions): MapElitesArchive;

// Try to insert a game into the archive
function archiveInsert(
  archive: MapElitesArchive,
  game: ArchivedGame,
  fitness: number,
  behavior: BehaviorCharacterization,
  generation: number,
  isSeed: boolean
): MapElitesArchive;
// Returns updated archive. Insertion succeeds if:
//   (a) cell is empty, OR
//   (b) new fitness > existing fitness AND cell is not a seed

// Discretize behavior into archive cell key
function discretizeBehavior(
  behavior: BehaviorCharacterization,
  dimensions: ArchiveDimensions
): string;

// Get archive statistics
function archiveStats(archive: MapElitesArchive): {
  readonly filledCells: number;
  readonly totalCells: number;
  readonly coveragePercent: number;
  readonly avgFitness: number;
  readonly bestFitness: number;
};
```

### Fitness Function

```typescript
// Tier 1: Hard filters (binary pass/fail)
function passesTier1(evalReport: EvalReport, traces: readonly GameTrace[]): {
  readonly passes: boolean;
  readonly failReasons: readonly string[];
};

// Tier 2: Soft metrics (continuous fitness score)
function computeTier2Fitness(
  evalReport: EvalReport,
  traces: readonly GameTrace[]
): number;

// Combined fitness (Tier 1 gate + Tier 2 score)
function computeFitness(
  evalReport: EvalReport,
  traces: readonly GameTrace[]
): { readonly fitness: number; readonly tier1Pass: boolean; readonly details: FitnessDetails };

interface FitnessDetails {
  readonly tier1: { readonly passes: boolean; readonly checks: readonly Tier1Check[] };
  readonly tier2: { readonly score: number; readonly components: readonly Tier2Component[] };
}

interface Tier1Check {
  readonly name: string;
  readonly passes: boolean;
  readonly reason?: string;
}

interface Tier2Component {
  readonly name: string;
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
}
```

### Generate-Verify Loop

```typescript
interface LlmInterface {
  // Generate a new Game Spec (or mutation of existing)
  generate(prompt: string): Promise<string>; // returns markdown spec
}

interface GenerateVerifyConfig {
  readonly maxAttempts: number; // default: 5
  readonly llm: LlmInterface;
  readonly simulationRuns: number; // how many games to simulate for evaluation
  readonly maxTurns: number;
  readonly playerCount?: number; // default: gameDef.metadata.players.min
  readonly agents: readonly Agent[];
}

// Attempt to generate a valid, evaluated game
function generateAndVerify(
  config: GenerateVerifyConfig,
  prompt: string
): Promise<GenerateResult>;

interface GenerateResult {
  readonly success: boolean;
  readonly game?: ArchivedGame;
  readonly fitness?: number;
  readonly behavior?: BehaviorCharacterization;
  readonly attempts: number;
  readonly diagnosticsHistory: readonly (readonly Diagnostic[])[];
  // diagnostics from each failed attempt (for learning)
}
```

### Mutation Operators

```typescript
type MutationOperator =
  | 'bundleSwap'
  | 'parameterTweak'
  | 'actionAddRemove'
  | 'triggerModification'
  | 'crossBundleWiring'
  | 'zoneTopologyChange';

interface MutationRequest {
  readonly operator: MutationOperator;
  readonly source: ArchivedGame;
  readonly bundleRegistry: BundleRegistry;
  readonly rng: Rng; // for deterministic mutation selection
}

// Generate a mutation prompt for the LLM
function generateMutationPrompt(request: MutationRequest): string;
```

### Evolution Run

```typescript
interface EvolutionConfig {
  readonly generations: number;
  readonly populationPerGeneration: number; // games to generate per generation
  readonly archiveDimensions: ArchiveDimensions;
  readonly seedSpecs: readonly string[]; // paths to seed Game Spec files
  readonly llm: LlmInterface;
  readonly simulationRuns: number;
  readonly maxTurns: number;
  readonly playerCount?: number; // default: compiled game's metadata.players.min
  readonly agents: readonly Agent[];
  readonly mutationWeights: Readonly<Record<MutationOperator, number>>;
}

// Run the evolution pipeline
function evolve(config: EvolutionConfig): Promise<EvolutionResult>;

interface EvolutionResult {
  readonly archive: MapElitesArchive;
  readonly generationsCompleted: number;
  readonly totalAttempts: number;
  readonly totalSuccesses: number;
  readonly missingCapabilities: readonly MissingCapabilityAggregate[];
}

interface MissingCapabilityAggregate {
  readonly capability: string;
  readonly frequency: number;
  readonly firstSeen: number; // generation
  readonly lastSeen: number;
  readonly workaroundsUsed: readonly string[];
}
```

## Implementation Requirements

### MAP-Elites Archive

**Discretization**: Each behavioral dimension is discretized into bins:
- `avgGameLength`: [5, 15, 30, 60, 100, 200] → 7 bins (0-4, 5-14, 15-29, 30-59, 60-99, 100-199, 200+)
- `avgBranchingFactor`: [1, 3, 7, 15, 30, 50] → 7 bins
- `mechanicCount`: [1, 3, 5, 8, 12, 15] → 7 bins

Total grid: 7 x 7 x 7 = 343 cells.

**Cell key**: `"${gameLengthBin}_${branchingBin}_${mechanicBin}"`

**Insertion policy**:
- Empty cell → always insert
- Occupied cell with lower fitness → replace (unless cell is a seed)
- Occupied cell with higher or equal fitness → reject
- Seed cells → never replaced (ground truth anchoring)

### Fitness Function

#### Tier 1: Hard Filters

All must pass for the game to be considered:

| Check | Criterion |
|-------|-----------|
| Terminates | Game reaches terminal condition within maxTurns in >80% of runs |
| No infinite loops | LOOP_DETECTED flag not set in any run |
| Legal moves exist | NO_LEGAL_MOVES flag not set in any run |
| Not trivially won | TRIVIAL_WIN flag not set in >50% of runs |
| Multiple actions used | At least 2 distinct actions used across all runs |

#### Tier 2: Soft Metrics (weighted sum)

| Metric | Weight | Target | Scoring |
|--------|--------|--------|---------|
| Action entropy | 0.20 | High | `actionDiversity` (already [0,1]) |
| Balance | 0.15 | 50% win rate | `1 - abs(player0WinRate - 0.5) * 2` |
| Skill gradient | 0.15 | Greedy > Random | `greedyWinRate - 0.5` (clamped [0,1]) |
| Drama | 0.10 | High | `dramaMeasure` (normalized) |
| Game length | 0.10 | Medium (15-60 turns) | bell curve around target range |
| Interaction | 0.10 | Medium-high | `interactionProxy` |
| Replayability | 0.10 | High variance | `1 - (stddev(gameLengths) / mean(gameLengths))` inverted |
| Decision depth | 0.05 | High | fraction of turns with >1 legal move |
| No dominant strategy | 0.05 | Low | `1 - dominantActionFreq` |

**Score computation**: `sum(metric_i * weight_i)` → range [0, 1]

### BehaviorCharacterization

```typescript
function computeBehavior(
  evalReport: EvalReport,
  gameDef: GameDef
): BehaviorCharacterization {
  return {
    avgGameLength: evalReport.metrics.avgGameLength,
    avgBranchingFactor: evalReport.metrics.avgBranchingFactor,
    mechanicCount: countDistinctMechanics(gameDef),
  };
}

function countDistinctMechanics(def: GameDef): number {
  // Count distinct action types, trigger types, and effect patterns
  // as a proxy for mechanic diversity
  return def.actions.length + def.triggers.length;
}
```

### Generate-Verify-Feedback Cycle

```
function generateAndVerify(config, prompt):
  for attempt = 1 to config.maxAttempts:
    1. markdown = await config.llm.generate(prompt)
    2. { doc, diagnostics } = parseGameSpec(markdown)
    3. if parse errors:
         prompt = appendErrorFeedback(prompt, diagnostics)
         continue
    4. diagnostics.push(...validateGameSpec(doc))
    5. if validation errors:
         prompt = appendErrorFeedback(prompt, diagnostics)
         continue
    6. { doc: expanded } = expandMacros(doc)
    7. { gameDef, diagnostics: compileDiags } = compileGameSpecToGameDef(expanded)
    8. if compilation errors:
         prompt = appendErrorFeedback(prompt, compileDiags)
         continue
    9. traces = runGames(
         gameDef,
         generateSeeds(config.simulationRuns),
         config.agents,
         config.maxTurns,
         config.playerCount
       )
    10. evalReport = generateEvalReport(gameDef, traces)
    11. { fitness, tier1Pass } = computeFitness(evalReport, traces)
    12. if !tier1Pass:
          prompt = appendFitnessFeedback(prompt, evalReport)
          continue
    13. behavior = computeBehavior(evalReport, gameDef)
    14. return { success: true, game: { spec: doc, gameDef, traces, evalReport, lineage }, fitness, behavior, attempts: attempt }

  return { success: false, attempts: config.maxAttempts, diagnosticsHistory }
```

### Mutation Operators

Each operator generates a prompt for the LLM to mutate an existing game:

| Operator | Prompt Strategy |
|----------|----------------|
| `bundleSwap` | "Replace the [X] mechanic with [Y]. Keep other mechanics unchanged." |
| `parameterTweak` | "Adjust these constants: [list]. Keep within ranges: [ranges]." |
| `actionAddRemove` | "Add a new action that [description] / Remove the [action] action." |
| `triggerModification` | "Change the trigger [trigger] to fire when [new condition]." |
| `crossBundleWiring` | "When [action from bundle A] resolves, trigger [effect from bundle B]." |
| `zoneTopologyChange` | "Change the board from [current topology] to [new topology]." |

Operator selection: weighted random using `mutationWeights` from config.

### Seed Population

5-10 hand-crafted Game Spec files representing known game archetypes:

1. **simple-auction**: 2-4 players, ascending auction, highest bidder wins item
2. **deck-builder**: 2 players, buy cards from market, play cards for VP
3. **market-engine**: 2-3 players, produce/trade resources, convert to VP
4. **push-luck**: 2-4 players, draw-or-stop with bust condition
5. **worker-placement**: 2-3 players, place workers on action spaces
6. **set-collection**: 2-4 players, collect sets of cards for scoring
7. **route-building**: 2-4 players, claim routes on board (spatial)
8. **area-control**: 2-3 players, place tokens on board for majority scoring (spatial)

Seeds are loaded into the archive at generation 0 with `isSeed: true`. They are never replaced.

### MissingCapability Aggregation

Track compiler diagnostics of type MissingCapability across all evolution runs:

```typescript
function aggregateMissingCapabilities(
  history: readonly GenerateResult[]
): readonly MissingCapabilityAggregate[] {
  // Count frequency of each capability request
  // Track when first/last seen
  // Track workarounds that were used
  // Sort by frequency (most requested first)
}
```

### Model Collapse Mitigation

Implemented strategies:
1. **MAP-Elites diversity**: Archive structure inherently prevents monoculture
2. **Seed anchoring**: Hand-crafted seeds never replaced (`isSeed: true`)
3. **Prompt rotation**: Vary system prompts and examples across generations
4. **Weight rotation**: Periodically shift Tier 2 fitness weights to explore different quality dimensions
5. **Random restarts**: Every N generations, generate fresh specs from diverse prompts (not mutations)

## Invariants

1. MAP-Elites archive only accepts games passing all Tier 1 hard filters
2. Seed population never removed from archive (`isSeed` cells are immutable)
3. Generate-verify loop capped at `maxAttempts` (default 5) per game
4. BehaviorCharacterization discretization is deterministic (same metrics → same bin)
5. Fitness comparison is deterministic (integer comparison, no floating-point ordering issues)
6. Archive insertion is deterministic: same game + same archive state → same result
7. MissingCapability aggregation is cumulative across generations
8. Mutation operator selection is deterministic given same RNG state
9. Evolution run is reproducible given same config + same LLM responses
10. Empty archive (generation 0) contains only seeds after initialization

## Required Tests

### Unit Tests

**MAP-Elites archive**:
- Create empty archive → 0 filled cells
- Insert game into empty cell → cell populated
- Insert better game into occupied cell → cell updated
- Insert worse game into occupied cell → cell unchanged
- Insert into seed cell → cell unchanged (seed protection)
- Archive stats correct after multiple insertions

**Discretization**:
- Known behavior → expected bin key
- Edge cases: value exactly on bin boundary → consistent binning
- Extreme values (0, max) → correct bin

**Tier 1 fitness**:
- Game that terminates, no loops, has moves → passes
- Game with LOOP_DETECTED → fails with reason
- Game with NO_LEGAL_MOVES → fails
- Game ending in 2 turns → fails (trivial)
- Game using only 1 action → fails (no diversity)

**Tier 2 fitness**:
- Known metrics → expected fitness score
- Perfect balance (50% win rate) scores higher than imbalanced (80%)
- Higher action diversity scores higher

**BehaviorCharacterization**:
- Known evalReport + gameDef → expected characterization

**Generate-verify loop**:
- First attempt succeeds → attempts = 1
- First fails, second succeeds → attempts = 2
- All 5 fail → success = false, attempts = 5
- Error feedback appended to prompt on each retry

**Mutation operators**:
- Each operator produces a non-empty prompt string
- Operator selection respects weights

### Integration Tests

- Full evolution cycle: seed population → mutate 1 game → evaluate → archive update
- Generate-verify with mock LLM: succeeds on second attempt after error feedback

### Property Tests

- Archive never exceeds total cell count
- Tier 1 pass + Tier 2 computation always produces finite fitness
- Discretization is deterministic: same input → same bin key
- Archive insertion is monotonic: fitness in cell never decreases (unless seed replacement is allowed, which it isn't)

### Golden Tests

- Known evalReport → expected Tier 1 pass/fail + Tier 2 score
- Known behavior → expected archive cell key

## Acceptance Criteria

- [ ] MAP-Elites archive correctly stores and replaces games by fitness
- [ ] Seed games are protected from replacement
- [ ] Tier 1 hard filters reject degenerate games
- [ ] Tier 2 fitness weights produce meaningful differentiation
- [ ] Generate-verify loop respects iteration cap
- [ ] Error feedback from failed compilation attempts is useful for LLM
- [ ] Mutation operators produce diverse prompts
- [ ] BehaviorCharacterization discretization is consistent
- [ ] MissingCapability aggregation tracks requested features
- [ ] Evolution run is reproducible (given deterministic LLM mock)
- [ ] Archive statistics are accurate
- [ ] At least 5 seed Game Specs defined and loadable

## Files to Create/Modify

```
src/evolution/archive.ts         # NEW — MAP-Elites archive
src/evolution/fitness.ts         # NEW — Tier 1 + Tier 2 fitness functions
src/evolution/behavior.ts        # NEW — BehaviorCharacterization computation
src/evolution/generate-verify.ts # NEW — generate-verify-feedback loop
src/evolution/mutation.ts        # NEW — mutation operators and prompt generation
src/evolution/evolve.ts          # NEW — main evolution orchestrator
src/evolution/missing-capability.ts  # NEW — MissingCapability aggregation
src/evolution/seed-population.ts # NEW — seed spec loading
src/evolution/types.ts           # NEW — evolution-specific types
seeds/                           # NEW — directory for hand-crafted seed specs
seeds/simple-auction.md          # NEW — seed spec
seeds/deck-builder.md            # NEW — seed spec
seeds/market-engine.md           # NEW — seed spec
seeds/push-luck.md               # NEW — seed spec
seeds/worker-placement.md        # NEW — seed spec
test/unit/archive.test.ts        # NEW
test/unit/fitness.test.ts        # NEW
test/unit/behavior.test.ts       # NEW
test/unit/generate-verify.test.ts    # NEW
test/unit/mutation.test.ts       # NEW
test/integration/evolution-cycle.test.ts  # NEW
```
