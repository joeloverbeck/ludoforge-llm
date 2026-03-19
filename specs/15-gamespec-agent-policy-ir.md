# Spec 15: GameSpec Agent Policy IR

**Status**: Draft
**Priority**: P1
**Complexity**: XL
**Dependencies**: Spec 08b, Spec 09, Spec 10, Spec 11
**Estimated effort**: 6-9 days
**Source sections**: Spec 14, Spec 30, iterative-improvement analysis, FITL architecture constraints

## Overview

Introduce a first-class, generic AI policy intermediate representation inside `GameSpecDoc` so games can define their own non-visual bot behavior without hardcoding game-specific logic in engine code.

This spec does not implement evolution. It establishes the architectural substrate that evolution will later mutate. The goal is to make game-authored agents a clean, validated, inspectable, deterministic runtime concept rather than an external ad hoc convention or a collection of bespoke TypeScript agents.

The design principles are:

- `GameSpecDoc` owns game-specific, non-visual bot behavior.
- `visual-config.yaml` remains presentation-only.
- `GameDef` and simulation remain game-agnostic.
- Policy runtime is generic and reusable across all games.
- No backwards compatibility is required. Existing random/greedy-only assumptions may be removed or reworked.
- Evolution must mutate a bounded policy IR, not arbitrary game YAML.

## Problem Statement

The current architecture has three mismatches:

1. `GameSpecDoc` can express game rules, turn flow, and victory logic, but not bot policy.
2. The engine exposes a generic `Agent` interface, but real policies are currently external TypeScript implementations.
3. The planned evolution pipeline assumes fixed external agents, which is the wrong ownership boundary for asymmetric games such as Fire in the Lake.

This creates an architectural split where:

- game-specific rules live in data,
- game-specific AI lives in code,
- and evolution has no bounded, declarative agent search space.

That split is acceptable for prototypes but not for a robust long-term architecture.

## Goals

- Add a generic `agents` section to `GameSpecDoc`.
- Compile agent policy definitions into a generic `GameDef` runtime representation.
- Provide a generic `PolicyAgent` interpreter that implements the existing simulation seam.
- Support asymmetric faction/seat policies without simulator specialization.
- Support deterministic self-play, traceability, and later policy evolution.
- Ensure policies can reference terminal scoring, victory margins, legal move structure, and state-derived features generically.
- Make agent decisions explainable and inspectable in traces.

## Non-Goals

- Free-form scripting or embedding TypeScript/JavaScript in specs.
- General ML model execution inside the engine.
- Recreating FITL Section 8 flowcharts as hardcoded engine behavior.
- Introducing visual/presentation concerns into policy definitions.
- Implementing evolution in this spec.

## Architectural Decision

Add a new top-level `agents` section to `GameSpecDoc` and `GameDef`.

The engine will provide:

- a generic policy IR schema,
- compiler lowering and validation,
- a generic runtime evaluator for that IR,
- a generic `PolicyAgent` implementation,
- generic decision telemetry.

Games will provide:

- policy feature definitions,
- seat/faction policy profiles,
- optional reusable rule blocks,
- seat bindings from game seats to policy profiles.

## Core Model

### 1. Policy Library vs Policy Profile

Split policy data into two layers:

- **Policy library**: reusable feature extractors, candidate filters, and score terms.
- **Policy profile**: a seat-bound policy assembled from library primitives plus weights, thresholds, and tie-break rules.

This keeps policy definitions DRY and gives evolution a bounded parameter space.

### 2. Candidate-Based Decisioning

The runtime policy model is candidate-based:

1. Enumerate legal moves.
2. Optionally complete decision sequences into concrete candidates using generic engine mechanisms.
3. Compute per-candidate features.
4. Filter or penalize candidates.
5. Score candidates by a weighted declarative formula.
6. Apply deterministic tie-break rules.
7. Return exactly one legal move.

This model is generic enough for Texas Hold'em and FITL, while remaining much cheaper and more inspectable than MCTS.

### 3. Seat-Specific Asymmetry

Policies are bound by seat id, not by player index.

This is required for:

- fixed-seat asymmetry in games like FITL,
- future seat catalogs and card-driven seat orders,
- per-faction evolution without simulator specialization.

## GameSpecDoc Additions

Add the following top-level section:

```yaml
agents:
  library:
    moveFeatures: []
    stateFeatures: []
    candidateFilters: []
    scoreTerms: []
    tieBreakers: []
  profiles:
    - id: pass-baseline
      seatBindings: [us, arvn, nva, vc]
      candidateSource: concreteLegalMoves
      scorePlan:
        filters: []
        terms: []
        fallback: pass
      tieBreakPlan:
        - type: stableMoveKey
  defaults:
    unknownSeatPolicy: error
```

### New Types

At minimum, define:

- `GameSpecAgentsSection`
- `GameSpecAgentLibrary`
- `GameSpecAgentProfile`
- `GameSpecMoveFeatureDef`
- `GameSpecStateFeatureDef`
- `GameSpecCandidateFilterDef`
- `GameSpecScoreTermDef`
- `GameSpecTieBreakerDef`
- `GameSpecSeatAgentBinding`

## Policy IR Semantics

### Candidate Sources

Supported initial source kinds:

- `templateLegalMoves`
- `concreteLegalMoves`

`concreteLegalMoves` is the default for complex games because it lets policy reason over completed moves rather than partial templates.

### Feature Classes

#### State Features

Read-only values computed once per decision point.

Examples:

- current seat victory margin
- leader seat on current card
- current event card metadata
- support/opposition aggregates
- resource levels
- active turn-flow window

#### Move Features

Values computed per candidate move.

Examples:

- action id / action class
- event side
- targeted zones
- targeted token counts
- delta in a declared metric after applying the move
- delta in seat victory margin after applying the move
- whether the move passes
- whether the move consumes a scarce resource

### Score Terms

Each candidate receives a score:

```text
totalScore =
  sum(enabled term contributions)
  + deterministic tie-break comparison chain
```

Supported term shapes:

- constant weight
- feature value times weight
- conditional bonus/penalty
- normalized delta bonus
- rank-based bonus
- threshold gate

### Filters

Filters are generic boolean predicates over candidate or state features.

Examples:

- reject `pass` if any non-pass move exceeds a minimum utility threshold
- reject event plays below a configured event score floor
- prefer moves matching current strategic mode

Filters may not inspect hidden engine internals. They can only use declared generic references and computed features.

### Tie-Breakers

Tie-breakers must be deterministic and explicit.

Supported tie-breakers:

- highest/lowest feature value
- preferred action id order
- preferred seat-defined category order
- stable move key
- RNG tie-break using provided `Rng`

RNG tie-break is allowed only as the final stage.

## Generic Runtime References

To be evolution-friendly, the IR must expose useful but bounded references.

Add generic policy reference surfaces for:

- `policy.stateFeature.<id>`
- `policy.moveFeature.<id>`
- `policy.candidate.actionId`
- `policy.candidate.actionClass`
- `policy.candidate.params.<name>`
- `policy.candidate.isPass`
- `policy.candidate.moveContext`
- `policy.eval.victoryMargin.<seat>`
- `policy.eval.terminalRanking.<seat>`
- `policy.eval.scoring.<seat>`
- `policy.eval.postMoveVictoryMargin.<seat>`
- `policy.eval.postMoveScoring.<seat>`

The key requirement is that these references are generic. FITL-specific names belong only in authored feature definitions.

## Compiler Responsibilities

The compiler must:

1. Parse the new `agents` section.
2. Validate schema and determinism constraints.
3. Lower policy definitions into a runtime-safe `GameDef` policy IR.
4. Validate seat bindings against declared seats.
5. Validate all feature and term references.
6. Reject cyclic feature dependencies.
7. Reject policy expressions that depend on presentation config.
8. Reject policies that require hidden state visibility beyond the acting seat's legal decision surface.

## GameDef Additions

Add a new optional field:

```typescript
interface GameDef {
  readonly agents?: AgentPolicyCatalog;
}
```

Where:

- `AgentPolicyCatalog` is a generic, compiled runtime representation.
- No game-specific code lives in it.
- It is pure data.

## Runtime Components

### PolicyAgent

Create a generic `PolicyAgent` implementation with the same simulator contract as every other agent:

- input: `def`, `state`, `playerId`, `legalMoves`, `rng`, `runtime`
- output: `{ move, rng }`

`PolicyAgent` resolves the acting seat, loads the bound profile, computes candidate scores, and returns the selected legal move.

### Candidate Evaluation Runtime

Add a reusable policy evaluator module responsible for:

- candidate completion,
- feature evaluation,
- post-move evaluation using `applyMove`,
- score accumulation,
- tie-breaking,
- optional trace emission.

This runtime must be pure and deterministic for the same `(GameDef, state, playerId, legalMoves, rng)`.

### Policy Trace

Extend trace output to capture policy reasoning generically:

- resolved profile id
- candidate count before/after filters
- per-candidate final score
- winning candidate index
- top contributing score terms
- tie-break path used

This replaces the current narrow `ai-random` / `ai-greedy` trace framing.

## CLI and Runner Implications

The architecture should converge on policy-aware agent selection:

- CLI `--agents` must support policy-bound seats and generic runtime agent kinds.
- Runner AI seat config must stop assuming only `random` and `greedy`.
- FITL solitaire should ultimately pick authored seat policies by default.

No backwards compatibility means these interfaces may be redesigned rather than patched.

## FITL Authoring Model

For Fire in the Lake, authored policy should be structured as:

- shared library of generic move/state features,
- four separate seat profiles: `fitl-us`, `fitl-arvn`, `fitl-nva`, `fitl-vc`,
- a minimal baseline profile for early smoke tests,
- reusable profile fragments for event-vs-operation preference, resource preservation, support/opposition pressure, and coup timing.

The authored content remains game data. The runtime remains generic.

## Texas Hold'em Authoring Model

Texas Hold'em should use the same runtime architecture but much simpler policies:

- fold/check/call/raise preference terms,
- pot odds approximations encoded as features,
- street-aware aggression thresholds,
- hand-strength proxy terms.

This validates that the policy IR is not COIN-specific.

## Evolution Readiness Requirements

This spec must make future evolution straightforward.

Therefore the IR must be:

- bounded,
- serializable,
- diffable,
- composable,
- locally mutable,
- safe to validate before simulation.

Evolution should later mutate:

- term weights,
- thresholds,
- preferred action/category orders,
- enabled/disabled filters,
- profile composition,
- selected reusable fragments.

Evolution should not mutate:

- compiler/runtime code,
- simulator logic,
- trace semantics,
- victory evaluation logic,
- presentation config.

## Validation Rules

Required validation rules include:

1. Every seat used in simulation must resolve to exactly one policy profile.
2. No policy profile may reference unknown features or seats.
3. Feature dependency graphs must be acyclic.
4. Tie-break chains must end deterministically.
5. Policies may only reference generic runtime surfaces approved for policy evaluation.
6. Post-move evaluation terms must declare explicit budgets and reuse compiled runtime caches.
7. Candidate completion must be bounded to avoid combinatorial blowups.
8. Policies may not depend on visual config or presentation-only metadata.

## Performance Constraints

This architecture exists partly because universal MCTS was too slow.

Therefore:

- policy evaluation must be O(number of concrete candidates) with bounded per-candidate work,
- post-move evaluation should reuse `GameDefRuntime`,
- optional feature caching should be per-decision-point only,
- no deep tree search is required for v1,
- each policy term must have predictable cost characteristics.

For FITL, the acceptance target is that a single turn is measured in milliseconds to low seconds, not minutes.

## Testing Requirements

### Unit Tests

- parse and lower valid `agents` sections
- reject invalid seat bindings
- reject cyclic feature dependencies
- deterministic candidate scoring with same seed
- deterministic tie-break semantics
- profile selection by seat id

### Integration Tests

- `PolicyAgent` returns only legal moves
- same state + seed + profile yields identical move
- FITL authored seat profiles can complete long self-play runs without runtime errors
- Texas Hold'em authored policy profiles work through the same runtime

### Property Tests

- policy evaluation never returns a move outside `legalMoves`
- deterministic replay holds for identical seeds
- disabling all non-fallback candidates still yields a valid fallback outcome if one is configured

### Golden Tests

- authored FITL baseline profiles lower to expected `GameDef.agents` IR
- policy traces match expected structure for fixed seeds

## Migration Plan

1. Add `GameSpecDoc.agents` and compiler/lowering support.
2. Add `GameDef.agents` runtime schema.
3. Implement generic `PolicyAgent`.
4. Update CLI and runner to support policy-backed AI selection.
5. Author a minimal baseline policy for both existing games.
6. Replace FITL-specific external bot assumptions with authored FITL seat profiles.
7. Update evolution design to mutate policy IR rather than assume external fixed agents.

## Acceptance Criteria

- [ ] `GameSpecDoc` can declare generic, seat-bound AI policies.
- [ ] `GameDef` carries a compiled, generic policy catalog.
- [ ] Simulation remains unchanged except for consuming generic `Agent` implementations.
- [ ] `PolicyAgent` can execute authored policies without game-specific code branches.
- [ ] FITL can express four asymmetric seat policies as game data.
- [ ] Texas Hold'em can express a simpler authored policy through the same runtime.
- [ ] Policy traces explain why a move was selected.
- [ ] The architecture is evolution-ready: bounded, mutable, validated, and deterministic.

## Files to Create/Modify

```text
packages/engine/src/cnl/game-spec-doc.ts
packages/engine/src/cnl/compiler-core.ts
packages/engine/src/cnl/compile-agents.ts
packages/engine/src/kernel/types-core.ts
packages/engine/src/kernel/schemas-core.ts
packages/engine/src/agents/policy-agent.ts
packages/engine/src/agents/policy-eval.ts
packages/engine/src/agents/factory.ts
packages/engine/src/trace/trace-events.ts
packages/engine/test/unit/cnl/compile-agents.test.ts
packages/engine/test/unit/agents/policy-agent.test.ts
packages/engine/test/integration/fitl-policy-agent.test.ts
packages/engine/test/integration/texas-holdem-policy-agent.test.ts
data/games/fire-in-the-lake/*.md
data/games/texas-holdem/*.md
```

## Open Questions

1. Should post-move feature evaluation be limited to one-ply lookahead only in v1, or should the IR reserve a generic shallow rollout primitive now?
2. Should profile composition be explicit in the first version, or should v1 keep profiles flat and only allow reuse through library references?
3. Should the CLI and runner still expose `random` and `greedy` as developer tools, or should all non-human seats move immediately to authored policy selection?

