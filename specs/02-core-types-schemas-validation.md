# Spec 02: Core Types, Schemas & Validation

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 01
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming sections 1.3, 1.4, 2.1A, 2.1B, 2.6, 3.1-3.6, 4 (diagnostics), 5.1 (zone adjacency types)

## Overview

Define ALL TypeScript types for the entire LudoForge-LLM system: game definitions, game state, AST nodes, selectors, runtime logs, diagnostics, and agent interfaces. Provide Zod schemas for runtime validation and JSON Schemas for external tooling. Implement `validateGameDef` for semantic validation (referential integrity and consistency checks). Define canonical serialized forms for types containing `bigint` to keep CLI/JSON I/O deterministic. This spec is the type foundation consumed by every subsequent spec.

## Scope

### In Scope
- All TypeScript type definitions for the kernel DSL
- Branded types for type safety (PlayerId, ZoneId, TokenId)
- Zod schemas for runtime validation of GameDef and GameState
- JSON Schema files for GameDef, Trace, and EvalReport
- Serialization/deserialization contracts for runtime types that include `bigint`
- `validateGameDef(def): Diagnostic[]` — semantic validation
- Diagnostic type with LLM-friendly fields
- Agent interface definition
- MechanicBundle type definition (used post-MVP but defined now for type completeness)
- DegeneracyFlag enum

### Out of Scope
- Condition/value/query evaluation logic (Spec 04)
- Effect interpretation logic (Spec 05)
- Game loop logic (Spec 06)
- PRNG types beyond the `RngState` placeholder (Spec 03)
- Parser types like `GameSpecDoc` (Spec 08a)
- Any implementation beyond type definitions and validation

## Key Types & Interfaces

### Branded Types

```typescript
type PlayerId = number & { readonly __brand: 'PlayerId' };
type ZoneId = string & { readonly __brand: 'ZoneId' };
type TokenId = string & { readonly __brand: 'TokenId' };
type ActionId = string & { readonly __brand: 'ActionId' };
type PhaseId = string & { readonly __brand: 'PhaseId' };
type TriggerId = string & { readonly __brand: 'TriggerId' };
```

### GameDef

```typescript
interface GameDef {
  readonly metadata: {
    readonly id: string;
    readonly players: { readonly min: number; readonly max: number };
    readonly maxTriggerDepth?: number; // default: 5
  };
  readonly constants: Readonly<Record<string, number>>;
  readonly globalVars: readonly VariableDef[];
  readonly perPlayerVars: readonly VariableDef[];
  readonly zones: readonly ZoneDef[];
  readonly tokenTypes: readonly TokenTypeDef[];
  readonly setup: readonly EffectAST[];
  readonly turnStructure: TurnStructure;
  readonly actions: readonly ActionDef[];
  readonly triggers: readonly TriggerDef[];
  readonly endConditions: readonly EndCondition[];
  readonly scoring?: ScoringDef;
}
```

### GameState

```typescript
interface GameState {
  readonly globalVars: Readonly<Record<string, number>>;
  readonly perPlayerVars: Readonly<Record<string, Readonly<Record<string, number>>>>;
  // perPlayerVars keyed by PlayerId (as string), then var name
  readonly playerCount: number;
  // concrete player count used for this run (must satisfy metadata.players.min/max)
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  // zones keyed by concrete zone instance ID (e.g. "deck:none", "hand:0")
  readonly currentPhase: PhaseId;
  readonly activePlayer: PlayerId;
  readonly turnCount: number;
  readonly rng: RngState;
  readonly stateHash: bigint; // Zobrist hash
  readonly actionUsage: Readonly<Record<string, ActionUsageRecord>>;
  // tracks per-action limits (per turn, per phase, per game)
}
```

`playerCount` is runtime-selected per game instance (must satisfy `metadata.players.min/max`). The selection source/API is defined by the game-loop layer (Spec 06).

### Supporting Definitions

```typescript
interface VariableDef {
  readonly name: string;
  readonly type: 'int';
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

interface ZoneDef {
  readonly id: ZoneId;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly adjacentTo?: readonly ZoneId[]; // spatial graph edges
}

interface TokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, 'int' | 'string' | 'boolean'>>;
}

interface Token {
  readonly id: TokenId;
  readonly type: string; // references TokenTypeDef.id
  readonly props: Readonly<Record<string, number | string | boolean>>;
}

interface TurnStructure {
  readonly phases: readonly PhaseDef[];
  readonly activePlayerOrder: 'roundRobin' | 'fixed';
}

interface PhaseDef {
  readonly id: PhaseId;
  readonly onEnter?: readonly EffectAST[];
  readonly onExit?: readonly EffectAST[];
}

interface ActionDef {
  readonly id: ActionId;
  readonly actor: PlayerSel;
  readonly phase: PhaseId;
  readonly params: readonly ParamDef[];
  readonly pre: ConditionAST | null;
  readonly cost: readonly EffectAST[];
  readonly effects: readonly EffectAST[];
  readonly limits: readonly LimitDef[];
}

interface ParamDef {
  readonly name: string; // e.g. "$card"
  readonly domain: OptionsQuery;
}

interface LimitDef {
  readonly scope: 'turn' | 'phase' | 'game';
  readonly max: number;
}

interface TriggerDef {
  readonly id: TriggerId;
  readonly event: TriggerEvent;
  readonly match?: ConditionAST;
  readonly when?: ConditionAST;
  readonly effects: readonly EffectAST[];
}

type TriggerEvent =
  | { readonly type: 'phaseEnter'; readonly phase: PhaseId }
  | { readonly type: 'phaseExit'; readonly phase: PhaseId }
  | { readonly type: 'turnStart' }
  | { readonly type: 'turnEnd' }
  | { readonly type: 'actionResolved'; readonly action?: ActionId }
  | { readonly type: 'tokenEntered'; readonly zone?: ZoneId };

interface EndCondition {
  readonly when: ConditionAST;
  readonly result: TerminalResultDef;
}

type TerminalResultDef =
  | { readonly type: 'win'; readonly player: PlayerSel }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score' }; // use ScoringDef

interface ScoringDef {
  readonly method: 'highest' | 'lowest';
  readonly value: ValueExpr;
}

interface ActionUsageRecord {
  readonly turnCount: number;
  readonly phaseCount: number;
  readonly gameCount: number;
}
```

### AST Types: ConditionAST (Section 3.2)

```typescript
type ConditionAST =
  | { readonly op: 'and'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'or'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'not'; readonly arg: ConditionAST }
  | { readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
      readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly op: 'in'; readonly item: ValueExpr; readonly set: ValueExpr };
```

### AST Types: ValueExpr (Section 3.3)

```typescript
type ValueExpr =
  | number
  | boolean
  | string
  | Reference
  | { readonly op: '+' | '-' | '*'; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly aggregate: {
      readonly op: 'sum' | 'count' | 'min' | 'max';
      readonly query: OptionsQuery;
      readonly prop?: string;
    } };
```

### AST Types: Reference (Section 3.1)

```typescript
type Reference =
  | { readonly ref: 'gvar'; readonly var: string }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: string }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
  | { readonly ref: 'binding'; readonly name: string };
```

### AST Types: EffectAST (Section 3.4) — 13 variants

```typescript
type EffectAST =
  // Variable manipulation (2)
  | { readonly setVar: {
      readonly scope: 'global' | 'pvar';
      readonly player?: PlayerSel;
      readonly var: string;
      readonly value: ValueExpr;
    } }
  | { readonly addVar: {
      readonly scope: 'global' | 'pvar';
      readonly player?: PlayerSel;
      readonly var: string;
      readonly delta: ValueExpr;
    } }
  // Single token movement (1)
  | { readonly moveToken: {
      readonly token: TokenSel;
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly position?: 'top' | 'bottom' | 'random';
    } }
  // Bulk token movement (1)
  | { readonly moveAll: {
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly filter?: ConditionAST;
    } }
  // Spatial token movement (1)
  | { readonly moveTokenAdjacent: {
      readonly token: TokenSel;
      readonly from: ZoneSel;
      readonly direction?: string;
    } }
  // Zone operations (2)
  | { readonly draw: {
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly count: number;
    } }
  | { readonly shuffle: { readonly zone: ZoneSel } }
  // Token lifecycle (2)
  | { readonly createToken: {
      readonly type: string;
      readonly zone: ZoneSel;
      readonly props?: Readonly<Record<string, ValueExpr>>;
    } }
  | { readonly destroyToken: { readonly token: TokenSel } }
  // Control flow (3)
  | { readonly if: {
      readonly when: ConditionAST;
      readonly then: readonly EffectAST[];
      readonly else?: readonly EffectAST[];
    } }
  | { readonly forEach: {
      readonly bind: string;
      readonly over: OptionsQuery;
      readonly effects: readonly EffectAST[];
      readonly limit?: number; // default: 100
    } }
  | { readonly let: {
      readonly bind: string;
      readonly value: ValueExpr;
      readonly in: readonly EffectAST[];
    } }
  // Player choice (2)
  | { readonly chooseOne: {
      readonly bind: string;
      readonly options: OptionsQuery;
    } }
  | { readonly chooseN: {
      readonly bind: string;
      readonly options: OptionsQuery;
      readonly n: number;
    } };
```

### AST Types: OptionsQuery (Section 3.5) — 8 variants

```typescript
type OptionsQuery =
  // Base queries (5)
  | { readonly query: 'tokensInZone'; readonly zone: ZoneSel }
  | { readonly query: 'intsInRange'; readonly min: number; readonly max: number }
  | { readonly query: 'enums'; readonly values: readonly string[] }
  | { readonly query: 'players' }
  | { readonly query: 'zones'; readonly filter?: { readonly owner?: PlayerSel } }
  // Spatial queries (3)
  | { readonly query: 'adjacentZones'; readonly zone: ZoneSel }
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneSel }
  | { readonly query: 'connectedZones';
      readonly zone: ZoneSel;
      readonly via?: ConditionAST };
```

### Selectors (Section 3.6)

```typescript
// 7 variants
type PlayerSel =
  | 'actor'
  | 'active'
  | 'all'
  | 'allOther'
  | { readonly id: PlayerId }
  | { readonly chosen: string }
  | { readonly relative: 'left' | 'right' };

type ZoneSel = string; // format: "<zoneId>:none" | "<zoneId>:<playerSel>"

type TokenSel = string; // format: "$paramName" | "$bindName"
```

### Runtime Types (Section 1.4)

```typescript
interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
}

type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];

interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number; // needed by evaluator metrics/degeneracy checks
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerFiring[];
}

interface StateDelta {
  readonly path: string; // e.g. "globalVars.threat" or "zones.hand:0"
  readonly before: unknown;
  readonly after: unknown;
}

interface TriggerFiring {
  readonly triggerId: TriggerId;
  readonly event: TriggerEvent;
  readonly depth: number;
}

interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
}

type TerminalResult =
  | { readonly type: 'win'; readonly player: PlayerId }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score'; readonly ranking: readonly PlayerScore[] };

interface PlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

interface EvalReport {
  readonly gameDefId: string;
  readonly runCount: number;
  readonly metrics: Metrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
  readonly traces: readonly GameTrace[];
}

interface Metrics {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly actionDiversity: number; // normalized entropy [0, 1]
  readonly resourceTension: number;
  readonly interactionProxy: number;
  readonly dominantActionFreq: number;
  readonly dramaMeasure: number;
}
```

### Serialized DTO Types (JSON-safe)

```typescript
type HexBigInt = string; // /^0x[0-9a-f]+$/

interface SerializedRngState {
  readonly state: readonly HexBigInt[];
}

interface SerializedMoveLog extends Omit<MoveLog, 'stateHash'> {
  readonly stateHash: HexBigInt;
}

interface SerializedGameState extends Omit<GameState, 'rng' | 'stateHash'> {
  readonly rng: SerializedRngState;
  readonly stateHash: HexBigInt;
}

interface SerializedGameTrace extends Omit<GameTrace, 'moves' | 'finalState'> {
  readonly moves: readonly SerializedMoveLog[];
  readonly finalState: SerializedGameState;
}
```

### DegeneracyFlag Enum — 6 values

```typescript
enum DegeneracyFlag {
  LOOP_DETECTED = 'LOOP_DETECTED',
  NO_LEGAL_MOVES = 'NO_LEGAL_MOVES',
  DOMINANT_ACTION = 'DOMINANT_ACTION',
  TRIVIAL_WIN = 'TRIVIAL_WIN',
  STALL = 'STALL',
  TRIGGER_DEPTH_EXCEEDED = 'TRIGGER_DEPTH_EXCEEDED',
}
```

### BehaviorCharacterization (Section 6.1)

```typescript
interface BehaviorCharacterization {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly mechanicCount: number;
}
```

### Diagnostic Type (Section 4)

```typescript
interface Diagnostic {
  readonly code: string; // stable programmatic code, e.g. "REF_ZONE_MISSING"
  readonly path: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly suggestion?: string;
  readonly contextSnippet?: string;
  readonly alternatives?: readonly string[];
}
```

### Agent Interface (Section 2.3)

```typescript
interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
  }): { readonly move: Move; readonly rng: Rng };
}
```

Note: `Rng` type is defined in Spec 03. This spec declares the interface contract; Spec 03 provides the concrete type.

### RngState Placeholder

```typescript
// Concrete Rng type defined in Spec 03.
// This placeholder allows GameState to reference it.
interface RngState {
  readonly state: readonly bigint[];
}
```

### MechanicBundle (Section 1.2)

```typescript
interface MechanicBundle {
  readonly id: string;
  readonly name: string;
  readonly patch: {
    readonly variables?: readonly VariableDef[];
    readonly zones?: readonly ZoneDef[];
    readonly tokenTypes?: readonly TokenTypeDef[];
    readonly actions?: readonly ActionDef[];
    readonly triggers?: readonly TriggerDef[];
    readonly setup?: readonly EffectAST[];
    readonly constants?: Readonly<Record<string, number>>;
  };
  readonly requires?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly parameters?: readonly ParameterDef[];
  readonly mutationPoints?: readonly string[];
}

interface ParameterDef {
  readonly name: string;
  readonly type: 'int' | 'string' | 'boolean';
  readonly default: number | string | boolean;
  readonly min?: number;
  readonly max?: number;
}
```

## Implementation Requirements

### Zod Schemas

Create Zod schemas that mirror the TypeScript types for runtime validation. Key schemas:

- `GameDefSchema` — validates full GameDef structure including nested AST types
- `GameStateSchema` — validates GameState including zone contents and variable bounds
- `MoveSchema` — validates Move structure
- `GameTraceSchema` — validates trace format
- `EvalReportSchema` — validates eval report format

Zod schemas must:
- Accept valid GameDef JSON (round-trip from serialization)
- Reject malformed input with descriptive error paths
- Validate nested AST structures (conditions, effects, values) recursively
- Enforce enum constraints (DegeneracyFlag values, PlayerSel variants)
- Be explicit about strictness policy (`.strict()` vs passthrough) and apply it consistently
- Support runtime types with `bigint` via dedicated serialized schemas (hex string format)

### JSON Schema Files

Generate or hand-write JSON Schema files for external tooling:
- `schemas/GameDef.schema.json`
- `schemas/Trace.schema.json`
- `schemas/EvalReport.schema.json`

These must be consistent with the Zod schemas (single source of truth is the TypeScript types; both Zod and JSON Schema derive from them).

Important serialization rule:
- JSON Schema targets serialized DTOs, not raw in-memory runtime types
- Any `bigint` field (e.g. `stateHash`, PRNG state words) must be encoded as lowercase hex strings (e.g. `"0x0123abcd..."`)
- Provide explicit codec helpers:
  - `serializeGameState(state: GameState): SerializedGameState`
  - `deserializeGameState(json: SerializedGameState): GameState`
  - `serializeTrace(trace: GameTrace): SerializedGameTrace`
  - `deserializeTrace(json: SerializedGameTrace): GameTrace`

### validateGameDef

`validateGameDef(def: GameDef): Diagnostic[]`

Performs semantic validation beyond structural schema checks:

1. **Identifier uniqueness**: IDs are unique within each namespace (`zones`, `tokenTypes`, `phases`, `actions`, `triggers`, variable names)
2. **Zone reference integrity**: Every zone referenced in effects, conditions, params, triggers, and setup exists in `def.zones`
3. **Variable reference integrity**: Every `gvar` reference names a variable in `def.globalVars`; every `pvar` reference names a variable in `def.perPlayerVars`
4. **Token type integrity**: Every `createToken` type references a valid `def.tokenTypes` entry
5. **Token property integrity**: `tokenProp` and `createToken.props` keys exist on the referenced token type and value types are compatible
6. **Phase reference integrity**: Every action's `phase` and every trigger phase event reference a valid `def.turnStructure.phases` entry
7. **Action reference integrity**: Every trigger with `actionResolved` event references a valid action (if action is specified)
8. **Param domain validity**: Every param's domain query is well-formed (zone exists for `tokensInZone`, range is valid for `intsInRange`)
9. **Selector validity**: `PlayerSel.id` is within player bounds; `all`/`allOther`/`relative` selectors are valid for configured player counts
10. **Metadata validity**: `players.min >= 1`, `players.min <= players.max`, and `maxTriggerDepth` (if present) is an integer >= 1
11. **Variable bounds consistency**: Every `VariableDef` has `min <= init <= max`
12. **Scoring/end-condition consistency**: `result.type: 'score'` requires `def.scoring`; warn if `def.scoring` exists but no score-based end condition can use it
13. **Adjacency consistency**: If zone A lists zone B in `adjacentTo`, zone B should list zone A (warning if not)
14. **Zone ownership consistency**: owner-qualified zone selectors are only used with zones whose `owner` is `'player'`; `:none` only with unowned zones

Each check produces a `Diagnostic` with:
- `code`: stable machine-readable identifier
- `path`: exact location of the problem
- `severity`: 'error' for broken references, 'warning' for suspicious patterns
- `suggestion`: concrete fix when possible
- `alternatives`: valid options for reference failures (fuzzy-match zone/var names)

## Invariants

1. All AST union types are exhaustive — every variant from brainstorming sections 3.1-3.6 is represented
2. All interface fields use `readonly` modifiers (immutability enforced at type level)
3. `PlayerSel` has exactly 7 variants: `'actor'`, `'active'`, `'all'`, `'allOther'`, `{ id }`, `{ chosen }`, `{ relative }`
4. `EffectAST` has exactly 13 variants (2 variable + 1 moveToken + 1 moveAll + 1 moveTokenAdjacent + 2 zone ops + 2 token lifecycle + 3 control flow + 2 player choice)
5. `OptionsQuery` has exactly 8 variants (5 base + 3 spatial)
6. `DegeneracyFlag` has exactly 6 values: LOOP_DETECTED, NO_LEGAL_MOVES, DOMINANT_ACTION, TRIVIAL_WIN, STALL, TRIGGER_DEPTH_EXCEEDED
7. `ZoneDef` includes `adjacentTo?: readonly ZoneId[]` (spatial types defined upfront, even though spatial logic is in Spec 07)
8. Zod schemas accept valid GameDef JSON and reject invalid ones
9. JSON-facing schemas operate on serialized DTO forms for runtime types containing `bigint`
10. `MoveLog` includes `legalMoveCount` for evaluator compatibility (Spec 11)
11. `validateGameDef` catches: missing zone references, undefined variable references, unbound token type references, invalid phase/action references, duplicate IDs, and metadata constraints
12. Branded types for PlayerId, ZoneId, TokenId prevent accidental mixing of identifiers

## Required Tests

### Unit Tests

- Zod schema accepts a known-good minimal GameDef → zero errors
- Zod schema accepts a known-good full GameDef (with all features) → zero errors
- Zod schema rejects GameDef with missing `metadata` → error at path `metadata`
- Zod schema rejects GameDef with invalid `EffectAST` variant → error at correct path
- Zod schema rejects GameDef with wrong type for `VariableDef.init` (string instead of number)
- Zod schema rejects GameDef with extra unknown keys (if strictness desired) or passes through (document choice)
- Serialized trace schema enforces hex string format for `stateHash` and PRNG words
- `validateGameDef` catches missing zone: action references zone "shop" but only "market" exists → error with suggestion "did you mean 'market'?"
- `validateGameDef` catches undefined gvar: condition references gvar "gold" but only "money" defined → error with alternatives
- `validateGameDef` catches undefined pvar: effect references pvar "health" but only "vp" defined → error
- `validateGameDef` catches invalid phase: action has phase "combat" but only "start", "main", "end" exist → error with alternatives
- `validateGameDef` catches invalid token type: createToken type "weapon" but only "card" defined → error
- `validateGameDef` catches duplicate IDs (e.g. duplicate action id) → error at duplicate path
- `validateGameDef` catches invalid `PlayerSel.id` outside configured bounds → error
- `validateGameDef` catches `result.type: 'score'` without `scoring` section → error
- `validateGameDef` catches bounds inconsistency: min > max → error
- `validateGameDef` catches asymmetric adjacency: zone A lists B but B doesn't list A → warning
- `validateGameDef` on valid GameDef → empty diagnostics array

### Integration Tests

- Full GameDef JSON (from a realistic game) passes both Zod validation and `validateGameDef`
- GameDef with multiple semantic errors produces multiple diagnostics (not just first error)

### Property Tests

- For any GameDef that passes Zod validation, `JSON.parse(JSON.stringify(gameDef))` passes Zod validation again (round-trip)
- For any valid GameTrace, `deserializeTrace(serializeTrace(trace))` preserves all hash values exactly
- Every `Diagnostic` produced by `validateGameDef` has non-empty `path` and non-empty `message`
- Every `Diagnostic` produced by `validateGameDef` has non-empty `code`
- `validateGameDef` is deterministic: same input → same diagnostics in same order

### Golden Tests

- Known minimal GameDef JSON → validates with zero diagnostics
- Known invalid GameDef JSON → expected specific diagnostics (path, severity, message substring)

## Acceptance Criteria

- [ ] All TypeScript types compile with zero errors under strict mode
- [ ] All union types are exhaustive (verified by discriminated union pattern matching in tests)
- [ ] All interfaces use `readonly` on all fields
- [ ] Branded types prevent mixing PlayerId/ZoneId/TokenId at compile time
- [ ] Zod schemas accept valid GameDef and reject invalid ones
- [ ] JSON Schema files are valid JSON Schema draft-07 (or later)
- [ ] Serialization codecs correctly map runtime `bigint` fields to/from hex strings
- [ ] `validateGameDef` catches all semantic validation categories listed above
- [ ] Every diagnostic has a `path` field pointing to the error location
- [ ] Every diagnostic has a stable `code`
- [ ] Reference failure diagnostics include `alternatives` with fuzzy-matched suggestions
- [ ] DegeneracyFlag enum has exactly 6 values

## Files to Create/Modify

```
src/kernel/types.ts              # NEW — all kernel types (GameDef, GameState, AST types, etc.)
src/kernel/branded.ts            # NEW — branded type constructors and guards
src/kernel/schemas.ts            # NEW — Zod schemas for all types
src/kernel/serde.ts              # NEW — runtime <-> serialized DTO codecs (bigint-safe)
src/kernel/validate-gamedef.ts   # NEW — validateGameDef semantic validation
src/kernel/diagnostics.ts        # NEW — Diagnostic type and diagnostic helpers
src/kernel/index.ts              # MODIFY — re-export public API
schemas/GameDef.schema.json      # NEW — JSON Schema for GameDef
schemas/Trace.schema.json        # NEW — JSON Schema for GameTrace
schemas/EvalReport.schema.json   # NEW — JSON Schema for EvalReport
test/unit/schemas.test.ts        # NEW — Zod schema tests
test/unit/serde.test.ts          # NEW — serialization codec tests
test/unit/validate-gamedef.test.ts  # NEW — semantic validation tests
test/unit/types-exhaustive.test.ts  # NEW — union type exhaustiveness tests
```
