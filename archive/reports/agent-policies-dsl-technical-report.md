# Agent Policies DSL: Comprehensive Technical Report

**Status**: COMPLETED

**Project**: LudoForge-LLM
**Date**: 2026-03-31
**Purpose**: Self-sufficient reference document for external deep research review
**License**: GPL-3.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Foundational Constraints](#2-foundational-constraints)
3. [DSL Architecture Overview](#3-dsl-architecture-overview)
4. [Expression Language Reference](#4-expression-language-reference)
5. [Library Components](#5-library-components)
6. [Visibility and Information Safety](#6-visibility-and-information-safety)
7. [Profile and Binding Model](#7-profile-and-binding-model)
8. [Compilation and Validation](#8-compilation-and-validation)
9. [Runtime Evaluation Pipeline](#9-runtime-evaluation-pipeline)
10. [Diagnostics and Tracing](#10-diagnostics-and-tracing)
11. [Evolution History](#11-evolution-history)
12. [Complete Game Examples](#12-complete-game-examples)
13. [Glossary](#13-glossary)

---

## 1. Executive Summary

LudoForge-LLM is a system for evolving board games using large language models. LLMs produce **Structured Game Specifications** -- a DSL embedded in Markdown with fenced YAML blocks -- which compile into executable **GameDef JSON**. A deterministic kernel engine runs the games, bots enumerate legal moves and play, and an evaluation pipeline detects degeneracy and measures design quality. The evolution pipeline uses MAP-Elites for quality-diversity optimization.

The **Agent Policies DSL** is a declarative sublanguage within the Structured Game Specification that allows game authors to define AI agent behavior entirely in YAML. It is the substrate for evolutionary optimization of agent strategies -- evolution mutates YAML parameters, feature definitions, scoring weights, and pruning rules to discover effective strategies for each game.

The DSL compiles into a normalized, typed, deterministic, JSON-serializable `AgentPolicyCatalog` stored in the compiled `GameDef`. A generic `PolicyAgent` evaluates the catalog at runtime against the kernel's legal moves, using a pipeline of feature extraction, pruning, scoring, and tie-breaking to select a single move.

Two test-case games validate the system:

1. **Fire in the Lake (FITL)** -- a 4-faction asymmetric COIN-series wargame with 4 distinct agent profiles, event card reasoning, completion guidance, strategic conditions, and preview-based lookahead.
2. **Texas Hold'em** -- a no-limit poker tournament with hidden information, a single shared profile, and simpler feature/scoring needs.

The DSL has been extended through 9 specifications (Specs 15, 93, 94, 95, 96, 98, 99, 100, 101), each driven by empirical evidence from agent evolution campaigns that revealed concrete limitations.

### Scope of This Report

This report documents:
- The complete DSL syntax, semantics, and type system
- The compilation pipeline from YAML authoring to compiled IR
- The runtime evaluation flow (10 phases)
- The diagnostics and tracing infrastructure
- The chronological evolution history with empirical evidence
- The full YAML from both production games

This report is self-sufficient. An external reviewer needs no access to the repository to understand the system.

---

## 2. Foundational Constraints

The project defines 17 non-negotiable architectural commandments in `docs/FOUNDATIONS.md`. The agent policies DSL must align with all of them. The constraints most directly relevant to the DSL are:

### 1. Engine Agnosticism

The kernel, compiler, and runtime SHALL NOT contain game-specific logic. All game behavior is encoded in GameSpecDoc YAML and compiled to GameDef JSON. The engine is a universal interpreter -- it executes any well-formed GameDef without knowing what game it represents. No hardcoded game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.

### 2. Evolution-First Design

Evolution mutates YAML only. All rule-authoritative game data required to compile and execute the rules MUST be representable inside GameSpecDoc YAML. GameSpecDoc is the unit of evolution -- embedded `dataAssets` with `id`/`kind`/`payload` carry all semantics-affecting game content. If a datum can change legal actions, state transitions, observability, scoring, or terminal conditions, it belongs in GameSpecDoc.

### 4. Authoritative State and Observer Views

The kernel owns one authoritative state; players, agents, and runners consume projections of that state according to visibility rules encoded in the spec. Hidden and private information are first-class semantic concerns. Non-omniscient runners and agents MUST NOT inspect full state except in explicit omniscient analysis modes.

### 5. One Rules Protocol, Many Clients

The simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol. The kernel is the single source of truth for legal actions and state transitions.

### 7. Specs Are Data, Not Code

Game specs are declarative data, never executable code. No `eval`, embedded scripts, runtime callbacks, plugin hooks, or arbitrary code generation inside GameSpecDoc, GameDef, visual config, or experiment artifacts.

### 8. Determinism Is Sacred

Same GameDef + same initial state + same seed + same actions = identical result. Always. No exceptions. The kernel is a pure, deterministic state machine. All rule-authoritative numeric operations MUST be exact (integers only, division as `Math.trunc`).

### 10. Bounded Computation

All iteration MUST be bounded. No general recursion. All choices MUST be finite and enumerable. `forEach` operates over finite collections. Legal moves must be finitely listable and emitted in stable deterministic order.

### 11. Immutability

All state transitions MUST return new objects. Never mutate. The previous state is never modified.

### 12. Compiler-Kernel Validation Boundary

The compiler validates everything knowable from the spec alone. The kernel validates only state-dependent semantics and runtime invariants.

### 14. No Backwards Compatibility

Do not keep compatibility shims in production code. When a change breaks existing contracts, migrate all owned artifacts in the same change.

### 16. Testing as Proof

Architectural properties MUST be proven through automated tests, not assumed.

### 17. Strongly Typed Domain Identifiers

Domain identifiers (ZoneId, PlayerId, ActionId, etc.) MUST be represented as distinct nominal types (branded types in TypeScript), not interchangeable raw strings.

---

## 3. DSL Architecture Overview

The agent policies DSL follows a three-stage pipeline:

```
GameSpecDoc YAML (authoring) --> Compiler (validation + lowering) --> GameDef JSON (runtime IR)
                                                                         |
                                                                    PolicyAgent
                                                                    (evaluation)
```

### Stage 1: Authoring (GameSpecDoc YAML)

Game authors write agent policies in the `agents:` section of their GameSpecDoc Markdown files. The authoring format optimizes for readability, reuse, bounded mutation, and diffability.

The top-level structure:

```yaml
agents:
  visibility:       # What data agents can observe
  parameters:       # Tunable numeric/boolean/enum parameters
  library:          # Reusable logic components
    stateFeatures:          # Features derived from game state
    candidateFeatures:      # Features derived from action candidates
    candidateAggregates:    # Aggregation across all candidates
    pruningRules:           # Candidate filtering rules
    scoreTerms:             # Weighted scoring components
    completionScoreTerms:   # Scoring for inner decision guidance
    tieBreakers:            # Deterministic move selection
    strategicConditions:    # Multi-turn planning targets
  profiles:         # Named assemblies of library items + parameter values
  bindings:         # Map seat roles to profiles
```

### Stage 2: Compilation

The compiler (`lowerAgents()` in `compile-agents.ts`) transforms the authored YAML into a normalized `AgentPolicyCatalog`:

1. **Surface visibility lowering** -- classify each data surface as public/seatVisible/hidden
2. **Parameter definitions** -- validate types, bounds, tunability
3. **Candidate parameter definitions** -- introspect action pipeline parameter types
4. **Library compilation** via `AgentLibraryCompiler` -- analyze expressions, build dependency graphs, classify cost
5. **Profile lowering** -- resolve parameter overrides, validate library references, compute evaluation plans
6. **Bindings lowering** -- validate seat-to-profile mappings
7. **Fingerprinting & assembly** -- SHA256 hash of entire catalog

### Stage 3: Runtime Evaluation

The `PolicyAgent` orchestrates move selection:

1. Prepares playable moves (template completion with optional policy guidance)
2. Calls `evaluatePolicyMoveCore()` with the completed candidates
3. Returns the selected move with a structured decision trace

The evaluation core executes a 10-phase pipeline detailed in Section 9.

### Key Design Separations

- **Authoring model vs. compiled IR**: `GameSpecDoc.agents` is for humans; `GameDef.agents` is for machines. Different structures optimized for different purposes.
- **Profiles vs. seat bindings**: Profiles are reusable policy assemblies. Bindings map seats to profiles. This separation enables profile reuse across seats and cleaner diffs when only bindings change.
- **Library items vs. inline logic**: All reusable logic lives in named library items. Profiles reference library items by name. No inline expressions inside profiles.

---

## 4. Expression Language Reference

The policy expression DSL is a typed, declarative expression language for computing features, conditions, and scores.

### Literal Types

| Type | YAML Example | Notes |
|------|-------------|-------|
| `number` | `42`, `3.14` | Numeric literal |
| `boolean` | `true`, `false` | Boolean literal |
| `id` | `"check"`, `"rally"` | String identifier |
| `idList` | `["a", "b", "c"]` | List of string identifiers |
| `null` | `null` | Null/unknown value |

### Operators

#### Arithmetic
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `add` | 2+ | number[] | number | Sum of operands |
| `sub` | 2 | number, number | number | Difference |
| `mul` | 2+ | number[] | number | Product of operands |
| `div` | 2 | number, number | number | Integer division (Math.trunc) |
| `abs` | 1 | number | number | Absolute value |
| `neg` | 1 | number | number | Negation |
| `min` | 2+ | number[] | number | Minimum of operands |
| `max` | 2+ | number[] | number | Maximum of operands |
| `clamp` | 3 | number, number, number | number | Clamp value between min and max |

#### Comparison
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `eq` | 2 | any, any | boolean | Equality |
| `ne` | 2 | any, any | boolean | Inequality |
| `gt` | 2 | number, number | boolean | Greater than |
| `gte` | 2 | number, number | boolean | Greater than or equal |
| `lt` | 2 | number, number | boolean | Less than |
| `lte` | 2 | number, number | boolean | Less than or equal |

#### Logic
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `and` | 2+ | boolean[] | boolean | Logical AND (short-circuit) |
| `or` | 2+ | boolean[] | boolean | Logical OR (short-circuit) |
| `not` | 1 | boolean | boolean | Logical NOT |

#### Selection and Coalescing
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `if` | 3 | boolean, any, any | any | Conditional: if(cond, then, else) |
| `coalesce` | 2+ | any[] | any | First non-null/non-unknown value |
| `in` | 2 | id, idList | boolean | Membership test |

#### Type Conversion
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `boolToNumber` | 1 | boolean | number | true -> 1, false -> 0 |

#### Special Value Access
| Operator | Arity | Input | Output | Description |
|----------|-------|-------|--------|-------------|
| `ref` | 1 | string | varies | Runtime reference lookup |
| `param` | 1 | string | varies | Parameter value lookup |
| `const` | 1 | literal | varies | Compile-time constant |

#### Spatial Aggregation
| Operator | Description |
|----------|-------------|
| `zoneTokenAgg` | Aggregate token properties within a single named zone |
| `globalTokenAgg` | Aggregate tokens across all zones (or filtered subsets) |
| `globalZoneAgg` | Aggregate zone-level properties across all zones |
| `adjacentTokenAgg` | Aggregate tokens in zones adjacent to an anchor zone |
| `zoneProp` | Read a static property of a named zone |

### Reference Patterns

The `ref` operator resolves runtime data through a strict whitelist of approved surfaces:

#### Always Available
| Reference | Type | Description |
|-----------|------|-------------|
| `seat.self` | id | Current agent's seat identifier |
| `seat.active` | id | Currently active seat |
| `turn.phaseId` | id | Current phase identifier |
| `turn.stepId` | id | Current step identifier |
| `turn.round` | number | Current round number |
| `candidate.actionId` | id | Action identifier of the candidate move |
| `candidate.isPass` | boolean | Whether the candidate is a pass action |
| `candidate.stableMoveKey` | id | Canonical move identity key |
| `candidate.param.<name>` | varies | Scalar parameter of the candidate move |

#### Authored State Surfaces (subject to visibility)
| Reference | Type | Description |
|-----------|------|-------------|
| `var.global.<id>` | number | Global game variable |
| `var.player.self.<id>` | number | Current player's variable |
| `var.player.active.<id>` | number | Active player's variable |
| `var.seat.<seatId>.<id>` | number | Specific seat's variable |
| `metric.<id>` | number | Derived metric value |
| `victory.currentMargin.<seat>` | number | Victory margin for a seat |
| `victory.currentRank.<seat>` | number | Victory rank for a seat |

#### Event Card Surfaces (subject to visibility)
| Reference | Type | Description |
|-----------|------|-------------|
| `activeCard.id` | id | Current event card identifier |
| `activeCard.tag.<tagName>` | boolean | Whether the active card has a specific tag |
| `activeCard.metadata.<field>` | varies | Card metadata field value |
| `activeCard.annotation.<metric>` | number | Compiled effect annotation metric |

#### Preview Surfaces
| Reference | Type | Description |
|-----------|------|-------------|
| `preview.victory.currentMargin.<seat>` | number | Projected victory margin after applying this move |
| `preview.victory.currentRank.<seat>` | number | Projected victory rank after applying this move |
| `preview.var.global.<id>` | number | Projected global variable after applying this move |
| `preview.var.player.self.<id>` | number | Projected player variable after applying this move |

#### Aggregate References (within candidate aggregates)
| Reference | Type | Description |
|-----------|------|-------------|
| `aggregate.<id>` | varies | Result of a named candidate aggregate |

#### Feature References
| Reference | Type | Description |
|-----------|------|-------------|
| `feature.<id>` | varies | Result of a previously computed feature |

#### Completion Guidance References (within completionScoreTerms)
| Reference | Type | Description |
|-----------|------|-------------|
| `decision.type` | id | Inner decision type ('chooseOne' or 'chooseN') |
| `decision.name` | id | Inner decision bind name (e.g., "$targetSpaces") |
| `decision.targetKind` | id | What is being chosen ('zone', 'token') |
| `option.value` | id | Current option's value being scored |

#### Explicitly Forbidden References
- Raw hidden zone contents
- Opponent private cards or deck order
- Future random outcomes
- Verbalization strings or visual config
- Engine-private caches
- Raw token/zone iteration not exposed as vars/metrics

### Cost Classification

Every expression has a cost class that determines when it can be evaluated:

| Cost Class | When Evaluated | What It Can Access |
|------------|----------------|-------------------|
| `state` | Once per evaluation | State features, global vars, zone props |
| `candidate` | Once per candidate | Candidate params, state features, candidate features |
| `preview` | Lazily, per candidate | Preview surfaces (requires applying the move) |

Cost propagates upward: if any sub-expression has cost class `preview`, the parent expression is `preview`. Cost ordering: `state` < `candidate` < `preview`.

### Type System

The DSL supports these value types:
- `boolean` -- true/false
- `number` -- numeric (integer arithmetic in the kernel)
- `id` -- string identifier
- `idList` -- list of string identifiers
- `unknown` -- null/unresolvable value (handled by `coalesce`)

Type inference propagates through expressions. The compiler validates type compatibility at compile time.

---

## 5. Library Components

All reusable policy logic lives in named library items within the `agents.library` section.

### 5.1 State Features (`stateFeatures`)

Features derived from game state, computed once per evaluation. Cost class: `state`.

```yaml
stateFeatures:
  selfMargin:
    type: number
    expr:
      ref: victory.currentMargin.self
  selfResources:
    type: number
    expr:
      ref: var.player.self.resources
```

Fields:
- `type` (optional): Expected return type (`number` or `boolean`)
- `expr`: Policy expression to evaluate

### 5.2 Candidate Features (`candidateFeatures`)

Features derived from individual action candidates. Cost class: `candidate` or `preview` (determined by expression analysis).

```yaml
candidateFeatures:
  isRally:
    type: boolean
    expr:
      eq:
        - { ref: candidate.actionId }
        - rally
  projectedSelfMargin:
    type: number
    expr:
      coalesce:
        - { ref: preview.victory.currentMargin.self }
        - { ref: feature.selfMargin }
```

Fields:
- `type` (optional): Expected return type
- `expr`: Policy expression to evaluate

Candidate features can reference state features via `{ ref: feature.<id> }` and preview surfaces via `{ ref: preview.* }`.

### 5.3 Candidate Aggregates (`candidateAggregates`)

Aggregation operations computed across all active candidates after individual candidate features.

```yaml
candidateAggregates:
  hasNonPassAlternative:
    op: any
    of:
      not:
        ref: feature.isPass
```

Fields:
- `op`: Aggregation operator (see table below)
- `of`: Policy expression evaluated per candidate
- `where` (optional): Filter expression per candidate

Aggregation Operators:

| Operator | Output | Description |
|----------|--------|-------------|
| `any` | boolean | True if any candidate's `of` expression is truthy |
| `all` | boolean | True if all candidates' `of` expressions are truthy |
| `count` | number | Count of candidates where `of` is truthy |
| `max` | number | Maximum value of `of` across candidates |
| `min` | number | Minimum value of `of` across candidates |
| `rankDense` | number | Dense rank of current candidate's `of` value |
| `rankOrdinal` | number | Ordinal rank of current candidate's `of` value |

Aggregates are referenced via `{ ref: aggregate.<id> }`.

### 5.4 Pruning Rules (`pruningRules`)

Rules that filter candidates before scoring. Applied in the order listed in the profile's `use.pruningRules`.

```yaml
pruningRules:
  dropPassWhenOtherMovesExist:
    when:
      and:
        - { ref: feature.isPass }
        - { ref: aggregate.hasNonPassAlternative }
    onEmpty: skipRule
```

Fields:
- `when`: Policy expression that evaluates to boolean. If `true`, the candidate is pruned.
- `onEmpty` (optional): Behavior if ALL candidates would be pruned:
  - `skipRule` (default): Revert this rule and keep all candidates
  - `error`: Throw a runtime error

### 5.5 Score Terms (`scoreTerms`)

Weighted scoring components that produce a numeric score for each candidate.

```yaml
scoreTerms:
  preferProjectedSelfMargin:
    weight:
      param: projectedMarginWeight
    value:
      ref: feature.projectedSelfMargin
  preferEvent:
    weight:
      param: eventWeight
    value:
      boolToNumber:
        ref: feature.isEvent
```

Fields:
- `weight`: Policy expression for the weight (can be literal, `param` reference, or expression)
- `value`: Policy expression for the value
- `when` (optional): Conditional -- term only contributes when this evaluates to `true`
- `unknownAs` (optional): Numeric fallback value when `value` evaluates to `unknown`
- `clamp` (optional): `{ min?: number, max?: number }` -- clamp the contribution

The candidate's total score is: `sum(weight_i * value_i)` across all active score terms.

### 5.6 Completion Score Terms (`completionScoreTerms`)

Specialized scoring terms used during policy-guided move completion. These score individual options within inner decisions (chooseOne/chooseN) during move template resolution.

```yaml
completionScoreTerms:
  preferPopulousTargets:
    when:
      and:
        - eq:
            - { ref: decision.type }
            - chooseN
        - eq:
            - { ref: decision.name }
            - "$targetSpaces"
        - eq:
            - { ref: decision.targetKind }
            - zone
    weight: 2
    value:
      coalesce:
        - zoneProp:
            zone: { ref: option.value }
            prop: population
        - 0
```

Completion score terms have access to the `decision.*` and `option.*` reference families that describe the inner decision context:
- `decision.type`: The type of inner decision (`chooseOne` or `chooseN`)
- `decision.name`: The bind name of the decision (e.g., `$targetSpaces`)
- `decision.targetKind`: What kind of thing is being chosen (`zone`, `token`)
- `option.value`: The current option being scored

Fields are identical to regular `scoreTerms` (weight, value, when, unknownAs, clamp).

### 5.7 Tie Breakers (`tieBreakers`)

Deterministic tie-breaking mechanisms applied in order when multiple candidates share the best score.

```yaml
tieBreakers:
  preferCheapTargetSpaces:
    kind: lowerExpr
    value:
      ref: feature.targetSpacePopulation
  stableMoveKey:
    kind: stableMoveKey
```

Fields:
- `kind`: The tie-breaking strategy (see table below)
- `value` (optional): Policy expression (required for expr-based kinds)
- `order` (optional): List of preferred values (required for order-based kinds)

Tie Breaker Kinds:

| Kind | Description |
|------|-------------|
| `stableMoveKey` | Select by canonical move identity key (lexicographic) |
| `higherExpr` | Prefer candidate with higher expression value |
| `lowerExpr` | Prefer candidate with lower expression value |
| `preferredEnumOrder` | Prefer candidate whose expression matches earlier in the order list |
| `preferredIdOrder` | Prefer candidate whose expression matches earlier in the order list |
| `rng` | Random selection using the PRNG (consumes RNG bits) |

### 5.8 Strategic Conditions (`strategicConditions`)

Named conditions for multi-turn planning. Allow the agent to reason about progress toward strategic objectives.

```yaml
strategicConditions:
  vcPivotalReady:
    description: "VC pivotal event play condition approximation"
    target:
      gte:
        - add:
            - globalTokenAgg:
                tokenFilter: { type: vc-guerrillas }
                aggOp: count
            - globalTokenAgg:
                tokenFilter: { type: vc-bases }
                aggOp: count
        - 15
    proximity:
      current:
        add:
          - globalTokenAgg:
              tokenFilter: { type: vc-guerrillas }
              aggOp: count
          - globalTokenAgg:
              tokenFilter: { type: vc-bases }
              aggOp: count
      threshold: 15
```

Fields:
- `description` (optional): Human-readable explanation
- `target`: Policy expression evaluating to boolean -- is the condition satisfied?
- `proximity` (optional): Defines a 0-1 closeness metric
  - `current`: Policy expression evaluating to number -- current progress value
  - `threshold`: Number -- target value
  - Proximity formula: `clamp(current / threshold, 0, 1)` -- 0 = far, 1 = at/above threshold

Strategic conditions are referenced via `{ ref: strategic.<id>.satisfied }` (boolean) and `{ ref: strategic.<id>.proximity }` (number, 0-1).

---

## 6. Visibility and Information Safety

The DSL enforces an information safety model to prevent agents from accessing hidden data in imperfect-information games.

### Visibility Classes

Each data surface has a visibility classification:

| Class | Description |
|-------|-------------|
| `public` | Visible to all agents |
| `seatVisible` | Visible only to the owning seat |
| `hidden` | Not visible to any agent |

### Surface Visibility Declaration

The `agents.visibility` section declares visibility for each data surface:

```yaml
visibility:
  perPlayerVars:
    resources:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
  victory:
    currentMargin:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    currentRank:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
  activeCardIdentity:
    current: public
    preview:
      visibility: public
      allowWhenHiddenSampling: false
```

Each surface has:
- `current`: Visibility of the current (pre-move) value
- `preview`: Visibility of the projected (post-move) value
  - `visibility`: The visibility class
  - `allowWhenHiddenSampling`: Whether to allow access when the preview involves stochastic/hidden outcomes

### Compile-Time Enforcement

The compiler validates visibility at compile time:
- Features referencing `hidden` surfaces produce a compile-time error
- Preview references to hidden surfaces are blocked unless `allowWhenHiddenSampling: true`
- Cost classification ensures preview expressions are not evaluated as state-level

### Supporting Both Information Models

The same runtime supports:
- **Perfect information** (FITL): All victory margins, resources, and map state are `public`. Preview works fully.
- **Imperfect information** (Texas Hold'em): Hand contents could be `seatVisible`. Opponent hand values would resolve to `unknown`, handled by `coalesce` fallbacks.

---

## 7. Profile and Binding Model

### Parameter Definitions

Parameters are named, typed, bounded mutation targets for evolution:

```yaml
parameters:
  eventWeight:
    type: number
    default: 1
    min: -10
    max: 10
    tunable: true
  rallyWeight:
    type: number
    default: 1
    min: 0
    max: 10
    tunable: true
```

Parameter Types:

| Type | Description | Extra Fields |
|------|-------------|-------------|
| `number` | Floating-point number | `min`, `max`, `default` |
| `integer` | Integer | `min`, `max`, `default` |
| `boolean` | True/false | `default` |
| `enum` | One of a fixed set of string values | `values`, `default` |
| `idOrder` | Ordered list of identifiers | `allowedIds`, `default` |

Fields common to all types:
- `type`: The parameter type
- `default` (optional): Default value
- `tunable` (optional): Whether evolution can mutate this parameter (default: false)

### Profile Assembly

Profiles are flat assemblies of library items plus parameter value overrides. No inheritance, no recursive fragments, no mixins.

```yaml
profiles:
  vc-evolved:
    preview:
      tolerateRngDivergence: true
    params:
      rallyWeight: 3
      taxWeight: 2
    use:
      pruningRules:
        - dropPassWhenOtherMovesExist
      scoreTerms:
        - preferRallyWeighted
        - preferTaxWeighted
      completionScoreTerms:
        - preferPopulousTargets
      tieBreakers:
        - preferCheapTargetSpaces
        - stableMoveKey
    completionGuidance:
      enabled: true
      fallback: random
```

Profile fields:
- `params` (optional): Parameter value overrides (keyed by parameter name)
- `use`: Which library items this profile uses
  - `pruningRules`: Ordered list of pruning rule IDs
  - `scoreTerms`: Ordered list of score term IDs
  - `completionScoreTerms` (optional): Ordered list of completion score term IDs
  - `tieBreakers`: Ordered list of tie-breaker IDs
- `completionGuidance` (optional): Inner decision guidance configuration
  - `enabled`: Whether to use policy-guided completion (default: false)
  - `fallback`: What to do when guidance produces no positive score: `'random'` or `'first'`
- `preview` (optional): Preview configuration
  - `tolerateRngDivergence`: Accept preview results even when RNG state diverges (default: false)

### Seat Bindings

A simple map from canonical seat IDs to profile IDs:

```yaml
bindings:
  us: us-baseline
  arvn: arvn-baseline
  nva: nva-baseline
  vc: vc-evolved
```

Seat IDs are canonical role identifiers (e.g., `us`, `arvn`, `nva`, `vc` for FITL; `neutral` for symmetric games like Texas Hold'em). They are resolved to runtime player IDs by the profile resolution system.

### Fingerprinting

Each compiled profile gets a SHA256 fingerprint of its contents. The entire catalog also gets a `catalogFingerprint`. This enables:
- Detecting policy changes without full diff
- Artifact identity for experiment reproducibility
- Profile comparison across evolution generations

---

## 8. Compilation and Validation

### Validation (`validate-agents.ts`)

The compiler validates:
- Parameter type correctness and bound validity
- Visibility section references valid surface names
- Library item expressions are well-formed (valid operators, correct arity, type compatibility)
- Profile `use` lists reference existing library items
- Profile `params` only override declared parameters
- Bindings reference existing profiles
- No cyclic dependencies in feature/aggregate graphs
- Cost classification consistency (state features cannot reference candidate-level data)
- Preview references respect visibility constraints
- Strategic condition expressions are well-typed

### Compilation (`compile-agents.ts`)

The `lowerAgents()` function (line 77) produces the `AgentPolicyCatalog`:

```typescript
interface AgentPolicyCatalog {
  readonly schemaVersion: 2;
  readonly catalogFingerprint: string;
  readonly surfaceVisibility: CompiledAgentPolicySurfaceCatalog;
  readonly parameterDefs: Record<string, CompiledAgentParameterDef>;
  readonly candidateParamDefs: Record<string, CompiledAgentCandidateParamDef>;
  readonly library: CompiledAgentLibraryIndex;
  readonly profiles: Record<string, CompiledAgentProfile>;
  readonly bindingsBySeat: Record<string, string>;
}
```

The `CompiledAgentLibraryIndex` contains:
```typescript
interface CompiledAgentLibraryIndex {
  readonly stateFeatures: Record<string, CompiledAgentStateFeature>;
  readonly candidateFeatures: Record<string, CompiledAgentCandidateFeature>;
  readonly candidateAggregates: Record<string, CompiledAgentAggregate>;
  readonly pruningRules: Record<string, CompiledAgentPruningRule>;
  readonly scoreTerms: Record<string, CompiledAgentScoreTerm>;
  readonly completionScoreTerms: Record<string, CompiledAgentScoreTerm>;
  readonly tieBreakers: Record<string, CompiledAgentTieBreaker>;
  readonly strategicConditions: Record<string, CompiledStrategicCondition>;
}
```

Each compiled library item includes:
- The compiled expression (`expr` as `AgentPolicyExpr`)
- The inferred value type
- The cost class (state/candidate/preview)
- Dependency references (which other features, aggregates, or surfaces this item depends on)

### Compiled Profile Structure

```typescript
interface CompiledAgentProfile {
  readonly fingerprint: string;
  readonly params: Record<string, unknown>;
  readonly use: {
    readonly pruningRules: readonly string[];
    readonly scoreTerms: readonly string[];
    readonly completionScoreTerms: readonly string[];
    readonly tieBreakers: readonly string[];
  };
  readonly completionGuidance: {
    readonly enabled: boolean;
    readonly fallback: 'random' | 'first';
  };
  readonly preview: {
    readonly tolerateRngDivergence: boolean;
  };
  readonly plan: {
    readonly stateFeatures: readonly string[];
    readonly candidateFeatures: readonly string[];
    readonly aggregates: readonly string[];
  };
}
```

The `plan` field is a compiler-computed evaluation plan that lists exactly which features and aggregates need to be evaluated, in dependency order, for this profile.

### Dependency Graph Analysis

The compiler builds a dependency graph across all library items:
- State features may depend on other state features
- Candidate features may depend on state features and other candidate features
- Aggregates may depend on candidate features
- Pruning rules, score terms, and tie-breakers may depend on features and aggregates

Cyclic dependencies are rejected at compile time.

### Cost Propagation

Cost classes propagate upward through the dependency graph:
- A feature that references a `preview.*` surface becomes cost class `preview`
- A feature that references a `candidate.*` surface becomes cost class `candidate`
- A feature that references only `state`-level data remains cost class `state`
- If a feature depends on a `preview`-cost feature, it inherits `preview` cost

---

## 9. Runtime Evaluation Pipeline

The `evaluatePolicyMoveCore()` function in `policy-eval.ts` executes a 10-phase pipeline:

### Phase 1: Resolve Seat and Profile Binding

```
PlayerId --> seatId (via GameDef seat definitions)
seatId --> profileId (via catalog.bindingsBySeat)
profileId --> CompiledAgentProfile (via catalog.profiles)
```

If any resolution fails, the evaluation returns a structured failure with an appropriate error code (`SEAT_UNRESOLVED`, `PROFILE_BINDING_MISSING`, `PROFILE_MISSING`).

### Phase 2: Canonicalize Candidates

Legal moves are sorted by `stableMoveKey` (a canonical string representation independent of map insertion order). This ensures deterministic evaluation order.

### Phase 3: Compute State Features

For each state feature in the profile's evaluation plan, evaluate the expression against the current game state. Results are cached for reuse by candidate features.

### Phase 4: Compute Candidate Features (non-preview)

For each candidate, evaluate all non-preview candidate features. Preview-cost features are skipped in this phase (lazy evaluation).

### Phase 5: Apply Pruning Rules

Apply each pruning rule in order. For each rule:
1. Evaluate the `when` expression for each candidate
2. Remove candidates where `when` is `true`
3. If all candidates would be removed and `onEmpty` is `skipRule`, revert this rule
4. If all candidates would be removed and `onEmpty` is `error`, throw

### Phase 6: Lazy Preview Evaluation

Preview-cost features are evaluated only for surviving candidates (after pruning). For each candidate:
1. Look up the candidate's trusted executable move in the `trustedMoveIndex`
2. Apply the move to the current state via `tryApplyPreview()`
3. Read projected values from the post-move state
4. If preview fails (hidden info, unresolved decisions, RNG divergence), return `unknown`

Whether RNG divergence is tolerated depends on the profile's `preview.tolerateRngDivergence` setting.

### Phase 7: Compute Aggregates and Preview Features

After preview, compute candidate aggregates across all active candidates. Then compute any remaining preview-cost candidate features that depend on aggregates.

### Phase 8: Score Candidates

For each surviving candidate, compute the total score:
```
score = sum(weight_i * value_i) for each scoreTerm in profile.use.scoreTerms
```

Conditional terms (with `when`) only contribute when the condition is true. Unknown values use the `unknownAs` fallback (default: 0). Contributions can be clamped with `clamp`.

### Phase 9: Apply Tie-Breakers

Filter candidates to those with the best score. Then apply each tie-breaker in order until one candidate remains:
1. `stableMoveKey`: Select lexicographically smallest move key
2. `higherExpr`/`lowerExpr`: Select by expression value
3. `preferredEnumOrder`/`preferredIdOrder`: Select by position in preference list
4. `rng`: Random selection (consumes PRNG bits)

### Phase 10: Return Selected Move

Return the selected move, the (possibly advanced) RNG state, and a full metadata trace.

### Emergency Fallback

If the evaluation throws an error and `fallbackOnError` is true, the first candidate by canonical order is returned. The metadata records `usedFallback: true` and the failure details.

---

## 10. Diagnostics and Tracing

The evaluation pipeline produces a structured `PolicyEvaluationMetadata` trace:

```typescript
interface PolicyEvaluationMetadata {
  readonly seatId: string | null;
  readonly requestedProfileId: string | null;
  readonly profileId: string | null;
  readonly profileFingerprint: string | null;
  readonly canonicalOrder: readonly string[];
  readonly candidates: readonly PolicyEvaluationCandidateMetadata[];
  readonly pruningSteps: readonly PolicyEvaluationPruningStep[];
  readonly tieBreakChain: readonly PolicyEvaluationTieBreakStep[];
  readonly previewUsage: PolicyEvaluationPreviewUsage;
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly selectedStableMoveKey: string | null;
  readonly finalScore: number | null;
  readonly usedFallback: boolean;
  readonly failure: PolicyEvaluationFailure | null;
}
```

### Per-Candidate Trace

```typescript
interface PolicyEvaluationCandidateMetadata {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly score: number;
  readonly prunedBy: readonly string[];
  readonly scoreContributions: readonly {
    readonly termId: string;
    readonly contribution: number;
  }[];
  readonly previewRefIds: readonly string[];
  readonly unknownPreviewRefs: readonly PolicyPreviewUnknownRef[];
  readonly previewOutcome?: PolicyPreviewTraceOutcome;
}
```

### Preview Usage Trace

```typescript
interface PolicyEvaluationPreviewUsage {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRef[];
  readonly outcomeBreakdown: {
    readonly ready: number;
    readonly unknownRandom: number;
    readonly unknownHidden: number;
    readonly unknownUnresolved: number;
    readonly unknownFailed: number;
  };
}
```

This breakdown enables campaign harnesses to detect and categorize preview failures without ad-hoc scripts.

### Pruning Step Trace

```typescript
interface PolicyEvaluationPruningStep {
  readonly ruleId: string;
  readonly remainingCandidateCount: number;
  readonly skippedBecauseEmpty: boolean;
}
```

### Tie-Break Step Trace

```typescript
interface PolicyEvaluationTieBreakStep {
  readonly tieBreakerId: string;
  readonly candidateCountBefore: number;
  readonly candidateCountAfter: number;
}
```

### Completion Statistics

When completion guidance is active, the trace includes:

```typescript
interface PolicyCompletionStatistics {
  readonly totalDecisions: number;
  readonly guidedDecisions: number;
  readonly fallbackDecisions: number;
  readonly totalOptions: number;
  readonly guidedOptions: number;
}
```

### Failure Codes

| Code | Meaning |
|------|---------|
| `EMPTY_LEGAL_MOVES` | No legal moves provided |
| `POLICY_CATALOG_MISSING` | GameDef.agents is undefined |
| `SEAT_UNRESOLVED` | Player ID doesn't map to a seat |
| `PROFILE_BINDING_MISSING` | Seat has no profile binding |
| `PROFILE_MISSING` | Profile referenced by binding doesn't exist |
| `UNSUPPORTED_PREVIEW` | Preview evaluation failed |
| `UNSUPPORTED_RUNTIME_REF` | Unknown reference path |
| `UNSUPPORTED_AGGREGATE_OP` | Unknown aggregate operator |
| `PRUNING_RULE_EMPTIED_CANDIDATES` | Pruning rule removed all candidates (onEmpty: error) |
| `RUNTIME_EVALUATION_ERROR` | General evaluation error |

---

## 11. Evolution History

The agent policies DSL was built through 9 specifications, each driven by empirical evidence from agent evolution campaigns.

### Spec 15: GameSpec Authored Agent Policy IR (Foundation)

**Status**: Draft (living spec, continuously extended)
**Motivation**: The architecture had the wrong ownership boundary for long-term AI. Bot behavior lived outside authored game data. Future evolution needed a bounded mutation target.

**Key decisions**:
- Separate authoring model from compiled IR
- Separate profiles from seat bindings
- V1 evaluates concrete legal moves only (no template completion, no search)
- Visibility safety as a first-class concern
- Strict reference surface whitelist
- Cost classification for evaluation ordering

### Spec 93: Completed-Move Policy Evaluation

**Status**: Completed
**Problem**: The PolicyAgent's evaluation flow scored moves BEFORE completion, then completed moves separately. Preview returned `unknown` for all non-pass FITL moves because the preview system didn't recognize pre-resolved inner decisions.

**Empirical evidence**: 10 weight/parameter experiments on the FITL VC agent all produced identical `compositeScore=10.5333` despite weight ranges from 0.5 to 5.0. The `projectedSelfMargin` feature (and all other `preview.*` refs) resolved to `unknown` for ALL non-pass moves.

**Root cause**: A mismatch between two correct but incompatible subsystems. Move completion happened first, but the policy evaluator re-probed completed moves and hit the same `notDecisionComplete` classification.

**Fix**: Enabled the preview surface for completed moves by recording pre-completed moves in a `trustedMoveIndex` that the preview system could look up.

### Spec 94: Agent Evaluation Diagnostic Pipeline

**Status**: Completed
**Problem**: Preview failure was invisible until manual diagnostic scripts were written. The agent decision trace lacked classification breakdowns.

**Empirical evidence**: The FITL VC agent evolution campaign required ad-hoc scripts to diagnose why preview returned `unknown`.

**Fix**: Added structured diagnostic output: preview outcome breakdown (`ready`/`unknownRandom`/`unknownHidden`/`unknownUnresolved`/`unknownFailed`), completion statistics, per-candidate traces.

### Spec 95: Policy-Guided Move Completion

**Status**: Completed
**Problem**: Inner decisions (chooseOne/chooseN within action pipelines) were resolved randomly via PRNG. The policy profile's strategic preferences were consulted only AFTER inner decisions were resolved -- too late to influence target zone selection, piece placement, or sub-action selection.

**Empirical evidence**: 18 experiments across 2 FITL VC campaign runs proved:
- Weight ceiling: All action-type weight changes produce identical outcomes once the action-type RANKING is correct
- Candidate indistinguishability: Within the same action type, ALL completed candidates score identically
- Inner decision blindness: The agent can't prefer "Rally in high-population zone" over "Rally in empty jungle"
- More random completions don't help: PRNG is deterministic, scaling completions is wasteful

**Fix**: Added `completionScoreTerms` and `completionGuidance` to profiles. The policy's scoring criteria now participate in inner decision resolution via the kernel's existing `choose` callback.

### Spec 96: Global State Aggregation Expressions

**Status**: Completed
**Problem**: The agent had only two state features (`selfMargin`, `selfResources`). It couldn't reason about zone-level state, piece distribution, or territorial control.

**Empirical evidence**: Only `victory.currentMargin.self` and `var.player.self.resources` were available. No map-wide aggregation was possible. The agent couldn't express "How many VC bases are on the map?" or "How many US troops are in zones adjacent to my bases?"

**Fix**: Added three new expression kinds:
- `globalTokenAgg`: Aggregate tokens across all zones with token type/property filtering
- `globalZoneAgg`: Aggregate zone-level properties with zone category/attribute/variable filtering
- `adjacentTokenAgg`: Aggregate tokens in zones adjacent to an anchor zone

Also added `zoneProp` for reading static zone properties and generic token/zone filter objects.

### Spec 98: Preview Pipeline RNG Tolerance

**Status**: Completed
**Problem**: The preview pipeline still returned `unknown` for virtually all non-pass moves in games with complex effect chains, even after Spec 93 fixed the completed-move mismatch.

**Empirical evidence**: 15 experiments post-specs 93-97 confirmed that `projectedSelfMargin` still resolved to `unknown` for all action candidates.

**Root cause**: The RNG invariance check (`rngStatesEqual`) rejected ANY move whose effect execution changed the PRNG state -- even when the RNG consumption was incidental (trigger dispatch bookkeeping) rather than semantic (dice rolls). In FITL, virtually every action pipeline touches RNG indirectly.

**Fix**: Added `tolerateRngDivergence: true` as a per-profile opt-in. When enabled, preview results are accepted even when PRNG state diverges, as long as the preview was produced from a fully completed, trusted move.

### Spec 99: Event Card Policy Surface

**Status**: Completed
**Problem**: The agent was completely blind to event cards. Every event was treated identically -- the same flat `eventWeight` applied to "Gulf of Tonkin" (game-changing) and "Burning Bonze" (minor).

**Empirical evidence**: Removing `eventWeight` entirely (exp-015) had zero effect on outcomes -- events were either the only option or never chosen over Rally/Tax. The agent couldn't make informed event decisions.

**Fix**: Exposed event card identity, tags, and metadata through the policy surface system:
- `activeCard.id`: Card identifier
- `activeCard.tag.<tagName>`: Card tag presence
- `activeCard.metadata.<field>`: Card metadata fields

### Spec 100: Compiled Event Effect Annotations

**Status**: Completed
**Problem**: Spec 99 gave access to card IDENTITY but not what the card DOES. Tags and metadata are author-supplied labels -- they don't capture effects. Manual annotation of 130 FITL cards x 2 sides = 260 effects was expensive.

**Fix**: Added compile-time static analysis of event effect ASTs. The compiler walks each card's effect tree and extracts strategic feature summaries (e.g., net token placement per faction, resource changes). These are stored in a `cardAnnotationIndex` accessible via `activeCard.annotation.<metric>`.

### Spec 101: Strategic Condition Proximity Metrics

**Status**: Draft (partially implemented)
**Problem**: The agent makes purely myopic decisions -- best action NOW without regard for enabling future plays. In FITL, skilled players spend multiple turns building toward pivotal event conditions.

**Empirical evidence**: The agent had no mechanism for forward-looking behavior. It couldn't check whether a condition is satisfied, measure closeness, or score actions that move toward a strategic target.

**Fix**: Added `strategicConditions` to the library. Each condition has a `target` (boolean: is it satisfied?) and an optional `proximity` metric (number: how close, 0-1). These are available as `strategic.<id>.satisfied` and `strategic.<id>.proximity` in policy expressions.

---

## 12. Complete Game Examples

### 12.1 Texas Hold'em Agent Policies

Source: `data/games/texas-holdem/92-agents.md`

This is a simpler use case: one shared profile for all seats, no visibility restrictions (as an initial implementation), no pruning rules, no completion guidance, no strategic conditions.

```yaml
agents:
  library:
    candidateFeatures:
      isCheck:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - check
      isCall:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - call
      isRaise:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - raise
      isAllIn:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - allIn
      isFold:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - fold
      raiseAmount:
        type: number
        expr:
          coalesce:
            - { ref: candidate.param.raiseAmount }
            - 0

    stateFeatures:
      callAmount:
        type: number
        expr:
          max:
            - 0
            - sub:
                - { ref: var.global.currentBet }
                - { ref: var.player.self.streetBet }
      facingBet:
        type: boolean
        expr:
          gt:
            - { ref: feature.callAmount }
            - 0
      potOddsFavorable:
        type: boolean
        expr:
          gte:
            - { ref: var.global.pot }
            - mul:
                - max:
                    - 1
                    - sub:
                        - { ref: var.global.activePlayers }
                        - 1
                - { ref: feature.callAmount }
      handHighCard:
        type: number
        expr:
          zoneTokenAgg:
            zone: hand
            owner: self
            prop: rank
            op: max
      handLowCard:
        type: number
        expr:
          zoneTokenAgg:
            zone: hand
            owner: self
            prop: rank
            op: min
      premiumHand:
        type: boolean
        expr:
          gte:
            - { ref: feature.handHighCard }
            - 13
      isDealer:
        type: boolean
        expr:
          eq:
            - { ref: var.player.self.seatIndex }
            - { ref: var.global.dealerSeat }
      hasPair:
        type: boolean
        expr:
          eq:
            - { ref: feature.handHighCard }
            - { ref: feature.handLowCard }

    candidateAggregates: {}

    pruningRules: {}

    scoreTerms:
      preferCheck:
        weight: 100
        value:
          boolToNumber:
            ref: feature.isCheck
      preferCall:
        weight: 80
        value:
          boolToNumber:
            ref: feature.isCall
      avoidFold:
        weight: -100
        value:
          boolToNumber:
            ref: feature.isFold
      foldWhenBadPotOdds:
        weight: 200
        value:
          boolToNumber:
            and:
              - { ref: feature.isFold }
              - { ref: feature.facingBet }
              - not: { ref: feature.potOddsFavorable }
      alwaysRaise:
        weight: 90
        value:
          boolToNumber:
            ref: feature.isRaise
      preferLargerRaise:
        weight: 0.002
        value:
          ref: feature.raiseAmount

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    baseline:
      params: {}
      use:
        pruningRules: []
        scoreTerms:
          - preferCheck
          - preferCall
          - avoidFold
          - foldWhenBadPotOdds
          - alwaysRaise
          - preferLargerRaise
        tieBreakers:
          - stableMoveKey

  bindings:
    neutral: baseline
```

**Observations**:
- 6 candidate features (all action ID checks + raise amount)
- 7 state features (call amount calculation, pot odds, hand strength basics, position)
- 6 score terms with fixed weights
- No tunable parameters
- No pruning, no aggregates, no completion guidance, no strategic conditions
- Single profile shared by all seats via `neutral` binding
- `zoneTokenAgg` used for hand card analysis (hand zone, owner: self)
- `coalesce` used for optional candidate parameters

### 12.2 Fire in the Lake Agent Policies

Source: `data/games/fire-in-the-lake/92-agents.md`

This is a complex use case: 4 faction-specific profiles, visibility declarations, tunable parameters, pruning, completion guidance, preview tolerance, and strategic conditions intent.

```yaml
agents:
  visibility:
    perPlayerVars:
      resources:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
    victory:
      currentMargin:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
      currentRank:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
    activeCardIdentity:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardTag:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardMetadata:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardAnnotation:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false

  parameters:
    eventWeight:
      type: number
      default: 1
      min: -10
      max: 10
      tunable: true
    projectedMarginWeight:
      type: number
      default: 1
      min: -10
      max: 10
      tunable: true
    resourceWeight:
      type: number
      default: 0
      min: -1
      max: 1
      tunable: true
    rallyWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    taxWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true

  library:
    stateFeatures:
      selfMargin:
        type: number
        expr:
          ref: victory.currentMargin.self
      selfResources:
        type: number
        expr:
          ref: var.player.self.resources

    candidateFeatures:
      isPass:
        type: boolean
        expr:
          ref: candidate.isPass
      isEvent:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - event
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
      isTrain:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - train
      isPatrol:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - patrol
      isAssault:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - assault
      isAdvise:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - advise
      isSweep:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - sweep
      isGovern:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - govern
      isRally:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - rally
      isMarch:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - march
      isAttack:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - attack
      isTerror:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - terror
      isTax:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - tax
      isSubvert:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - subvert
      isInfiltrate:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - infiltrate
      isBombard:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - bombard
      targetSpacePopulation:
        type: number
        expr:
          coalesce:
            - zoneProp:
                zone: { ref: candidate.param.targetSpace }
                prop: population
            - 0

    candidateAggregates:
      hasNonPassAlternative:
        op: any
        of:
          not:
            ref: feature.isPass

    pruningRules:
      dropPassWhenOtherMovesExist:
        when:
          and:
            - { ref: feature.isPass }
            - { ref: aggregate.hasNonPassAlternative }
        onEmpty: skipRule

    scoreTerms:
      preferProjectedSelfMargin:
        weight:
          param: projectedMarginWeight
        value:
          ref: feature.projectedSelfMargin
      preserveResources:
        weight:
          param: resourceWeight
        value:
          ref: feature.selfResources
      preferEvent:
        weight:
          param: eventWeight
        value:
          boolToNumber:
            ref: feature.isEvent
      preferTrainAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTrain
      preferPatrolAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isPatrol
      preferAssaultAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAssault
      preferAdviseAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAdvise
      preferSweepAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isSweep
      preferGovernAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isGovern
      preferRallyAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isRally
      preferRallyWeighted:
        weight:
          param: rallyWeight
        value:
          boolToNumber:
            ref: feature.isRally
      preferMarchAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isMarch
      preferAttackAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAttack
      preferTerrorAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTerror
      preferTaxAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTax
      preferTaxWeighted:
        weight:
          param: taxWeight
        value:
          boolToNumber:
            ref: feature.isTax
      preferSubvertAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isSubvert
      preferInfiltrateAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isInfiltrate
      preferBombardAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isBombard

    completionScoreTerms:
      preferPopulousTargets:
        when:
          and:
            - eq:
                - { ref: decision.type }
                - chooseN
            - eq:
                - { ref: decision.name }
                - "$targetSpaces"
            - eq:
                - { ref: decision.targetKind }
                - zone
        weight: 2
        value:
          coalesce:
            - zoneProp:
                zone: { ref: option.value }
                prop: population
            - 0

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey
      preferCheapTargetSpaces:
        kind: lowerExpr
        value:
          ref: feature.targetSpacePopulation

  profiles:
    us-baseline:
      params:
        eventWeight: 2
        projectedMarginWeight: 1
        resourceWeight: 0.02
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferTrainAction
          - preferPatrolAction
          - preferAssaultAction
          - preferAdviseAction
        tieBreakers:
          - stableMoveKey

    arvn-baseline:
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.02
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferTrainAction
          - preferPatrolAction
          - preferSweepAction
          - preferAssaultAction
          - preferGovernAction
        tieBreakers:
          - stableMoveKey

    nva-baseline:
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.03
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferRallyAction
          - preferMarchAction
          - preferAttackAction
          - preferTerrorAction
          - preferInfiltrateAction
          - preferBombardAction
        tieBreakers:
          - stableMoveKey

    vc-baseline:
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.03
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferRallyAction
          - preferMarchAction
          - preferAttackAction
          - preferTerrorAction
          - preferTaxAction
          - preferSubvertAction
        tieBreakers:
          - stableMoveKey

    vc-evolved:
      preview:
        tolerateRngDivergence: true
      params:
        rallyWeight: 3
        taxWeight: 2
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferRallyWeighted
          - preferTaxWeighted
        completionScoreTerms:
          - preferPopulousTargets
        tieBreakers:
          - preferCheapTargetSpaces
          - stableMoveKey
      completionGuidance:
        enabled: true
        fallback: random

  bindings:
    us: us-baseline
    arvn: arvn-baseline
    nva: nva-baseline
    vc: vc-evolved
```

**Observations**:
- 6 visibility surface declarations (all public, as FITL is perfect information)
- 5 tunable parameters with defined bounds
- 2 state features (margin, resources)
- 17 candidate features (1 pass check, 1 event check, 1 projected margin, 13 action ID checks, 1 zone population)
- 1 candidate aggregate (hasNonPassAlternative)
- 1 pruning rule (drop pass when alternatives exist)
- 18 score terms (3 parameterized, 15 fixed-weight action preferences)
- 1 completion score term (prefer populous target zones)
- 2 tie-breakers (lower population first, then stable key)
- 5 profiles: 4 baseline (one per faction) + 1 evolved (VC)
- The `vc-evolved` profile uses completion guidance, preview RNG tolerance, and parameterized weights
- Seat bindings assign one profile per faction, with VC using the evolved profile

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| **AgentPolicyCatalog** | The compiled, JSON-serializable runtime representation of all agent policies for a game. Stored in `GameDef.agents`. |
| **Candidate** | A single legal move being evaluated by the policy. |
| **Candidate Feature** | A feature computed per candidate move (e.g., "is this a Rally action?"). |
| **Completion Guidance** | Policy-directed resolution of inner decisions during move template completion. |
| **Cost Class** | Classification of evaluation expense: `state` (cheapest) < `candidate` < `preview` (most expensive). |
| **GameDef** | The compiled, JSON-serializable game definition. Produced by the compiler from GameSpecDoc. |
| **GameSpecDoc** | The authored game specification in Markdown with YAML blocks. The unit of evolution. |
| **Library** | The collection of reusable policy logic items (features, aggregates, pruning rules, score terms, tie-breakers, strategic conditions). |
| **PolicyAgent** | The generic agent that evaluates authored policies. Game-agnostic. |
| **Preview** | One-ply lookahead: apply a candidate move and read projected state values. |
| **Profile** | A flat assembly of library items plus parameter values. Defines a specific agent behavior. |
| **Pruning Rule** | A filter that removes candidates from consideration before scoring. |
| **Score Term** | A weighted component contributing to a candidate's total score. |
| **Seat** | A canonical role identifier (e.g., "us", "arvn", "nva", "vc"). Maps to profiles via bindings. |
| **Stable Move Key** | A canonical, deterministic string identity for a move, independent of map insertion order. |
| **State Feature** | A feature computed once from game state (e.g., "current victory margin"). |
| **Strategic Condition** | A named condition for multi-turn planning, with boolean satisfaction and numeric proximity metrics. |
| **Tie-Breaker** | A deterministic mechanism for selecting among candidates with equal scores. |
| **Visibility** | Information safety classification: `public`, `seatVisible`, or `hidden`. |

### Key Source Files

| File | Purpose |
|------|---------|
| `packages/engine/src/cnl/game-spec-doc.ts` | Authoring types (`GameSpecAgentsSection`, all spec-level types) |
| `packages/engine/src/cnl/validate-agents.ts` | Validation |
| `packages/engine/src/cnl/compile-agents.ts` | Compilation (`lowerAgents()`, `AgentLibraryCompiler`) |
| `packages/engine/src/kernel/types-core.ts` | Compiled types (`AgentPolicyCatalog`, `CompiledAgentProfile`, etc.) |
| `packages/engine/src/agents/policy-agent.ts` | PolicyAgent orchestration |
| `packages/engine/src/agents/policy-eval.ts` | Core evaluation pipeline (`evaluatePolicyMoveCore()`) |
| `packages/engine/src/agents/policy-evaluation-core.ts` | Expression evaluation engine |
| `packages/engine/src/agents/policy-expr.ts` | Operator registry, type inference |
| `packages/engine/src/agents/policy-surface.ts` | Reference resolution |
| `packages/engine/src/agents/policy-runtime.ts` | Runtime value providers |
| `packages/engine/src/agents/policy-preview.ts` | Lookahead/preview system |
| `packages/engine/src/agents/policy-profile-resolution.ts` | Seat-to-profile binding |
| `packages/engine/src/agents/completion-guidance-eval.ts` | Multi-move choice guidance |
| `packages/engine/src/agents/policy-ir.ts` | IR fingerprinting |
| `data/games/fire-in-the-lake/92-agents.md` | FITL agent policies |
| `data/games/texas-holdem/92-agents.md` | Texas Hold'em agent policies |
| `docs/FOUNDATIONS.md` | Architectural commandments |
| `specs/15-gamespec-agent-policy-ir.md` | Binding specification |

## Outcome

Completed: 2026-04-02

- This report's architecture and reference material were exploited during the delivered agent-policy workstream, including the implemented observer, action-tag, unified considerations, explicit preview-contract, and stochastic-selection changes.
- The report is no longer an active working artifact; the authoritative implemented behavior now lives in repository code, archived specs, and archived tickets.
- Deviation from original plan: none; the document served as reference material rather than as a directly implemented spec.
- Verification result: the related implementation stream has been completed and repo verification passed through `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck`.
