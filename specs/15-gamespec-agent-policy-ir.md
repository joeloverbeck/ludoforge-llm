# Spec 15: GameSpec Authored Agent Policy IR

**Status**: Draft  
**Priority**: P1  
**Complexity**: XL  
**Dependencies**: Spec 08b, Spec 09, Spec 10, Spec 11  
**Estimated effort**: 8-12 days  
**Source sections**: Spec 14, Spec 30 (historical specialized-agent baseline), `docs/fitl-event-authoring-cookbook.md`, current visual-config boundary validations

## Overview

Introduce a first-class authored agent policy section in `GameSpecDoc` and compile it into a normalized, typed, deterministic, JSON-serializable `AgentPolicyCatalog` in `GameDef`.

This spec is the substrate for future policy evolution, not the evolution system itself. The authored surface must therefore be:

- bounded
- typed
- visibility-safe
- deterministic
- diffable
- locally mutable

V1 is intentionally narrow:

- evaluate concrete legal moves only
- no template move completion
- no rollouts or tree search
- no scripting
- no direct raw state scanning from policy
- no hidden-information leaks
- no profile inheritance

Policy logic lives in reusable library items. Numeric thresholds, weights, flags, and preferred orders live in explicit parameter definitions. Profiles are flat assemblies of library items plus parameter values. Seat bindings are a separate map.

The engine compiles authored policies into pure data and executes them through a generic `PolicyAgent`. Simulation and `GameDef` remain game-agnostic. Policy authoring lives in `GameSpecDoc` and scenario-linked game data only. `visual-config.yaml` remains presentation-only and must not participate in policy compilation or evaluation.

## Problem Statement

The current architecture still has the wrong ownership boundary for long-term AI:

1. `GameSpecDoc` can express rules, turn flow, and victory logic, but not first-class bot policy.
2. Real game-specific bot behavior still lives outside authored game data.
3. Future evolution needs a bounded mutation target, but current agent logic is not one.
4. The draft leaves four dangerous areas too loose:
   - hidden-information access,
   - candidate completion,
   - evaluation cost,
   - seat/scenario resolution.

That is not acceptable long term. Fire in the Lake needs seat-asymmetric authored policies. Texas Hold'em proves the runtime must also work under imperfect information. The architecture must not solve one by cheating on the other.

## Goals

- Add a first-class `agents` section to `GameSpecDoc`.
- Compile it into `GameDef.agents` as a normalized `AgentPolicyCatalog`.
- Provide a generic `PolicyAgent` and policy evaluator.
- Bind policies by seat id through a separate top-level binding map.
- Make the mutation surface explicit via named parameters with bounds and tunability metadata.
- Keep policies deterministic, inspectable, and visibility-safe.
- Support both perfect-information and imperfect-information games through the same runtime.
- Keep game-specific logic in authored data, not engine branches.
- Make policy evaluation measurable, benchmarkable, and suitable for iterative improvement.
- Keep compiled policy IR serializable through existing `GameDef` JSON tooling.

## Non-Goals

- Embedded JS/TS/Lua or free-form scripting.
- Tree search, rollouts, or generic planning in v1.
- Template move completion or multi-step candidate construction in v1.
- Profile inheritance, recursive fragments, or mixins.
- Raw policy access to hidden state or visual configuration.
- Evolution implementation in this spec.

## Architectural Decisions

### 1. Separate the authoring model from the compiled IR

`GameSpecDoc.agents` is the authoring format. `GameDef.agents` is the normalized runtime IR. They are not the same structure.

Authoring format should optimize for readability, reuse, bounded mutation, and diffability.  
Compiled IR should optimize for determinism, validation, fast evaluation, and traces.

### 2. Separate profiles from seat bindings

Profiles are reusable policy assemblies. Bindings map seats to profiles.

Do not bake seat bindings into profile definitions. That makes reuse harder, diffs noisier, and mutation less clean.

Bindings are keyed by canonical seat ids, never by player index. Validation happens against the resolved seat catalog and selected scenario inputs, not against incidental runtime player ordering.

### 3. V1 evaluates concrete legal moves only

V1 policies evaluate the concrete `legalMoves` provided to the agent. That is the candidate set.

Do not add `templateLegalMoves` or generic completion in v1. That is search disguised as configuration and it is exactly how performance cliffs creep back in.

If a game needs stronger decision quality, the first response is better derived metrics and better concrete move generation, not policy-driven search.

### 4. Separate policy logic from tunable parameters

Weights, thresholds, booleans, enum choices, and preferred id orders must be declared as explicit parameters with types, bounds, and tunability metadata.

Future evolution should mutate parameter values and ordered profile selections, not arbitrary expression trees.

### 5. Policies evaluate against a policy-visible surface, not raw state

Policies may read only approved, seat-visible references resolved through generic runtime surfaces.

If a policy needs a game concept, author it as a variable or derived metric first. Do not let policies rummage through raw zones, hidden cards, or engine internals.

### 6. Profiles stay flat in v1

Profiles do not contain inline anonymous logic and do not inherit from other profiles.  
All reusable logic lives in the library. Profiles only:

- choose named rules, terms, and tie-breakers in order
- provide parameter values

This is deliberate. It keeps the compiled IR small and keeps mutation bounded.

### 7. Built-in developer agents remain opt-in tools

`random` and `greedy` may remain as developer/testing agents, but they stop shaping the architecture.

The default non-human path is `policy`, which resolves authored seat bindings.

### 8. Compiled policy IR must stay JSON-serializable

`GameDef` is serialized, diffed, schema-validated, and passed through CLI/runner tooling. Compiled policy IR must therefore use plain JSON-compatible arrays, records, literals, and branded ids.

Do not use `Map`, `Set`, functions, class instances, or other runtime-only containers inside `GameDef.agents`.

### 9. Internal agent selection uses structured descriptors, not string parsing

CLI sugar may accept text such as `policy` or `builtin:greedy`, but engine and runner boundaries must normalize that into structured descriptors before execution.

Do not let stringly-typed agent modes become the long-term runtime contract.

## GameSpecDoc Additions

Add a new top-level `agents` section.

Authoring format:

    agents:
      parameters:
        preferEventWeight:
          type: number
          default: 1.0
          min: -10
          max: 10
          tunable: true

        passFloor:
          type: number
          default: 0.25
          min: -5
          max: 5
          tunable: true

      library:
        stateFeatures:
          currentUsMargin:
            type: number
            expr:
              ref: victory.currentMargin.us

        candidateFeatures:
          isEvent:
            type: boolean
            expr:
              eq:
                - { ref: candidate.actionId }
                - { const: play-event }

          projectedUsMargin:
            type: number
            expr:
              ref: preview.victory.currentMargin.us

        candidateAggregates:
          bestNonPassProjectedMargin:
            type: number
            op: max
            of:
              ref: feature.projectedUsMargin
            where:
              not:
                ref: candidate.isPass

        pruningRules:
          dropPassWhenStrongerMoveExists:
            when:
              and:
                - { ref: candidate.isPass }
                - gt:
                    - { ref: aggregate.bestNonPassProjectedMargin }
                    - { param: passFloor }
            onEmpty: skipRule

        scoreTerms:
          preferEvents:
            weight:
              param: preferEventWeight
            value:
              boolToNumber:
                ref: feature.isEvent

        tieBreakers:
          higherProjectedUsMargin:
            kind: higherExpr
            value:
              ref: feature.projectedUsMargin

          stableMoveKey:
            kind: stableMoveKey

      profiles:
        fitl-us:
          params:
            preferEventWeight: 1.25
            passFloor: 0.50
          use:
            pruningRules:
              - dropPassWhenStrongerMoveExists
            scoreTerms:
              - preferEvents
            tieBreakers:
              - higherProjectedUsMargin
              - stableMoveKey

        fitl-arvn:
          params: {}
          use:
            pruningRules: []
            scoreTerms: []
            tieBreakers:
              - stableMoveKey

      bindings:
        us: fitl-us
        arvn: fitl-arvn
        nva: fitl-nva
        vc: fitl-vc

Notes:

- named collections under `agents` are maps keyed by id, not arrays
- order matters only where explicitly represented by lists in a profile or by ordered parameter values
- profiles may share the same library items with different parameter values
- multiple seats may bind to the same profile

### Prerequisite Visibility Metadata

Any existing authored surface used by policy evaluation must be classifiable generically as one of:

- `public`
- `seatVisible`
- `hidden`

If an existing section such as vars, metrics, or public metadata cannot currently express that distinction, extend that section generically as prerequisite work rather than granting policies raw omniscient access.

### Prerequisite Seat Resolution

Policy bindings must resolve against the same canonical seat ids selected by the compiled scenario and seat-catalog pipeline.

Requirements:

- policy compilation must validate bindings against resolved seat ids, not only `metadata.players.min/max`
- ambiguous or missing scenario/seat-catalog resolution must prevent policy binding compilation
- runtime must resolve `seat.self`, `seat.active`, and seat-scoped refs through canonical seat ids, not positional player indexes
- traces may include both `playerId` and `seatId`, but policy semantics are seat-based

### New Types

At minimum, add:

- `GameSpecAgentsSection`
- `GameSpecAgentParameterDef`
- `GameSpecAgentLibrary`
- `GameSpecStateFeatureDef`
- `GameSpecCandidateFeatureDef`
- `GameSpecCandidateAggregateDef`
- `GameSpecPruningRuleDef`
- `GameSpecScoreTermDef`
- `GameSpecTieBreakerDef`
- `GameSpecAgentProfileDef`
- `GameSpecSeatPolicyBindings`
- `GameSpecPolicyExpr`

## Authoring Model

### Parameters

Parameters are the primary bounded mutation surface.

Supported parameter types in v1:

- `number`
- `integer`
- `boolean`
- `enum`
- `idOrder`

Rules:

- tunable numeric parameters must declare finite `min` and `max`
- tunable enum parameters must declare an explicit allowed set
- `idOrder` parameters must declare the allowed ids they can order
- profiles may override defaults but may not violate parameter bounds or allowed values
- if a profile omits a required parameter with no default, compilation fails

### Library

The library contains all named reusable logic:

- state features
- candidate features
- candidate aggregates
- pruning rules
- score terms
- tie-breakers

Library items may reference:

- parameters
- other features
- aggregates
- approved runtime refs

They may not reference:

- profile ids
- seat bindings
- visual config
- engine internals not exposed through the policy surface

Dependency rules:

- state features may depend on parameters, runtime refs, and other state features
- candidate features may depend on parameters, state features, candidate refs, preview refs, and other candidate features
- candidate aggregates may depend on candidate features and other aggregates when acyclic
- pruning rules, score terms, and tie-breakers may depend on any of the above

### Profiles

Profiles are flat ordered assemblies of library items plus parameter values.

A profile may contain only:

- parameter overrides
- ordered `pruningRules`
- ordered `scoreTerms`
- ordered `tieBreakers`

Profiles may not define inline expressions or anonymous rules. If logic is worth keeping, give it a name in the library.

### Bindings

`bindings` map `seatId -> profileId`.

Rules:

- every seat used by a policy-backed simulation must resolve to exactly one profile
- multiple seats may bind to the same profile
- runner/CLI may override bindings for experiments, but authored bindings remain the default

Compilation note:

- binding validation occurs after scenario-linked seat resolution
- games that do not author seat-specific asymmetry may bind every seat to the same profile

## Policy Expression DSL

All policy logic is expressed through a typed declarative DSL.

Supported scalar types:

- `number`
- `boolean`
- `enum`
- `id`
- `idList` only where explicitly allowed by parameter type or tie-breaker kind

Supported expression forms in v1:

- constants
- parameter refs
- runtime refs
- feature refs
- aggregate refs
- arithmetic: `add`, `sub`, `mul`, `div`, `min`, `max`, `clamp`, `abs`, `neg`
- comparison: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`
- boolean: `and`, `or`, `not`
- selection: `if`
- membership: `in`
- null/unknown handling: `coalesce`
- simple conversion helpers: `boolToNumber`

Not allowed in v1:

- loops
- recursion
- dynamic reference construction
- user-defined functions
- string concatenation as logic
- arbitrary collection traversal
- nesting `preview` inside `preview`

Every expression must be fully type-checked at compile time.

Authoring note:

- policy expressions are not a general-purpose replacement for effect/condition/value DSLs
- if a required concept is missing from the approved policy surface, extend that generic surface explicitly instead of tunneling raw engine objects into policy expressions

## Cost Classes

Every feature, aggregate, pruning rule, score term, and tie-breaker has an inferred cost class.

Cost classes in v1:

- `state` — depends only on state-visible refs, parameters, and cheaper dependencies
- `candidate` — depends on candidate metadata and cheaper dependencies, but no preview
- `preview` — requires preview

Rules:

- the cost class of a node is the highest cost class of its dependencies
- runtime must evaluate cheaper work before preview work
- preview work must be lazy and cached
- diagnostics must report cost classes per profile

## Approved Policy Reference Surface

Policies do not read raw `GameState`. They read approved generic policy refs.

### Always-available built-ins

- `seat.self`
- `seat.active`
- `turn.phaseId`
- `turn.stepId`
- `turn.round`
- `candidate.actionId`
- `candidate.param.<name>` for scalar params and fixed id lists only
- `candidate.isPass`
- `candidate.stableMoveKey`

The candidate set consists only of fully decision-complete concrete legal moves already produced by the generic legality/decision pipeline.

### Approved authored state surfaces

Policies may read authored runtime data only when it is classifiable as public or acting-seat-visible:

- `var.global.<id>`
- `var.seat.<seat>.<id>`
- `metric.<id>`
- `victory.currentMargin.<seat>`
- `victory.currentRank.<seat>`
- explicitly public current-state metadata already exposed by the generic runtime, such as current public card or event metadata

### Preview-safe surfaces

Candidate features may read `preview.*` versions of the approved authored state surfaces:

- `preview.var.global.<id>`
- `preview.var.seat.<seat>.<id>`
- `preview.metric.<id>`
- `preview.victory.currentMargin.<seat>`
- `preview.victory.currentRank.<seat>`

`preview.*` means:

- apply the candidate once through a generic preview layer
- expose only refs that remain deterministic and visible to the acting seat at decision time
- return `unknown` for anything hidden, random, or unresolved
- preview operates on a concrete move only; it does not complete templates, resolve fresh decisions, or enumerate follow-up legal moves

### Explicitly forbidden

Policies may not read:

- raw hidden zone contents
- opponent private cards
- deck order
- future random outcomes
- raw token scans or zone iteration if not already exposed as vars or metrics
- verbalization strings
- visual config
- engine-private runtime caches

If a policy needs some concept such as support pressure, coup timing pressure, pot-odds proxy, or own hand-strength proxy, author it as a variable or derived metric first.

## Candidate Evaluation Model

V1 policy evaluation is strictly one-ply over the provided `legalMoves`.

### Evaluation phases

1. Resolve acting seat and bound profile.
2. Canonicalize the candidate list by stable move key.
3. Compute state features once.
4. Compute cheap candidate features that do not require preview.
5. Apply ordered pruning rules, lazily computing any needed non-preview aggregates over the current candidate set.
6. Compute preview-backed candidate features only for surviving candidates, lazily and at most once per candidate.
7. Compute any aggregates that depend on preview-backed features, lazily over the current surviving candidate set.
8. Sum score term contributions for surviving candidates.
9. Keep candidates with maximal score.
10. Apply ordered tie-breakers.
11. Return exactly one legal move.

Aggregate caches are invalidated whenever the current candidate set changes.

### Candidate aggregates

Candidate aggregates provide bounded cross-candidate reasoning without opening the door to search.

Supported aggregate ops in v1:

- `max`
- `min`
- `count`
- `any`
- `all`
- `rankDense`
- `rankOrdinal`

Rules:

- aggregates operate only over the current candidate set at the point they are used
- aggregates may reference already-computed features only
- aggregates may not iterate raw game state
- aggregates may not depend on final tie-break outcomes
- nested aggregate chains are allowed only when acyclic and when each step remains `O(n)`

This is enough to express rules like:

- reject pass if any non-pass move clears a threshold
- reward top-ranked moves by a specific feature
- prefer rare move types only when the field is otherwise weak

### Pruning rules

Pruning rules are ordered candidate elimination rules.

Each pruning rule defines:

- `when`: boolean expression evaluated per candidate
- `onEmpty`: `skipRule` or `error`

Semantics:

- if `when` is true for a candidate, that candidate is removed
- if `when` is `unknown`, treat it as `false` unless the authored expression explicitly coalesces otherwise
- if applying the rule would remove every remaining candidate:
  - `skipRule`: ignore that rule for this decision point
  - `error`: emit a policy error and jump to emergency fallback

Default recommendation: use `skipRule` unless the rule encodes a structural invariant that must never be violated.

Pruning rules are for coarse elimination only. Anything that smells like a preference belongs in score terms, not in hard pruning.

### Score terms

Each surviving candidate receives:

    totalScore = sum(termContribution)

Each score term defines:

- optional `when`
- `weight`
- `value`
- optional `unknownAs`
- optional `clamp`

Contribution semantics:

- if `when` exists and evaluates `false` or `unknown`, contribution is `0` unless the expression explicitly coalesces otherwise
- otherwise contribution is `weight * value`, then optionally clamped
- if the term result is `unknown`, use `unknownAs` if provided, else `0`

This single shape replaces a zoo of special term kinds. Constant bonuses, feature weights, threshold bonuses, rank bonuses, and penalties all fit here.

### Tie-breakers

Tie-breakers are applied after score equality.

Supported kinds in v1:

- `higherExpr`
- `lowerExpr`
- `preferredEnumOrder`
- `preferredIdOrder`
- `rng`
- `stableMoveKey`

Rules:

- tie-breakers are ordered
- `rng` may appear only after all deterministic tie-breakers
- if `rng` is used, it must sample from the tied set after canonical stable-key ordering
- if `rng` is not used, the final tie-breaker must be `stableMoveKey`
- for `higherExpr` and `lowerExpr`, known values beat `unknown`; if all tied candidates are `unknown`, the tie-breaker has no effect
- for `preferredEnumOrder` and `preferredIdOrder`, unknown or unlisted values sort last

This makes the runtime deterministic for the same seed while remaining invariant to input move order.

### Determinism Rules

The policy runtime must be deterministic under the intended information model.

Rules:

- candidate order is canonicalized before evaluation
- `stableMoveKey` must be derived from a canonical move serialization independent of map or object insertion order
- RNG may be consumed only by an explicit `rng` tie-breaker
- the same visible decision surface plus the same seed must yield the same selected move
- hidden information unavailable to the acting seat must not change policy evaluation

### Emergency fallback

`PolicyAgent` must always return a legal move.

If evaluation fails at runtime despite successful compilation, the agent must:

1. emit a `policy.emergencyFallback` trace event with the reason
2. return the canonical first legal move by stable move key

This is a safety net, not normal behavior. Golden tests and benchmark scenarios should treat emergency fallback as a failure condition.

## Visibility and Preview Rules

This section is non-negotiable.

### Visibility

Policy evaluation must be invariant to hidden information that the acting seat cannot observe.

Equivalent acting-seat observations must produce identical:

- feature values
- candidate pruning decisions
- scores
- tie-break paths
- selected move

If two full states differ only in hidden information unavailable to the acting seat, authored policy may not produce different results.

### Preview

`preview.*` exists to support one-ply heuristics without cheating.

Rules:

- preview is a generic runtime service, not raw policy access to `applyMove`
- preview may internally reuse `applyMove`, but the exposed surface must be masked through the policy visibility rules
- preview may expose only deterministic, seat-visible refs after the move
- if a candidate's effect depends on hidden information or unresolved randomness, affected preview refs resolve to `unknown`
- score terms may handle `unknown`
- pruning rules depending on `unknown` use boolean `false` unless explicitly coalesced otherwise
- preview is cached per surviving candidate
- preview may not request legal moves for the previewed state
- preview may not recurse

In perfect-information games, preview will often expose useful victory-margin or metric deltas.  
In imperfect-information games such as Texas Hold'em, preview must not leak undealt cards, opponent private cards, or deck order.

## Compiler Responsibilities

The compiler must:

1. Parse and validate the new `agents` section.
2. Lower authoring maps into a normalized runtime catalog with stable ids.
3. Type-check every expression.
4. Resolve all feature, aggregate, parameter, and profile references.
5. Classify every runtime ref by visibility and preview-safety.
6. Infer cost class for every feature, aggregate, rule, term, and tie-breaker.
7. Reject cycles in the feature and aggregate dependency graph.
8. Reject inline anonymous logic inside profiles.
9. Reject references to visual config or presentation-only metadata.
10. Reject refs to hidden or preview-unsafe data.
11. Reject arbitrary raw state traversal not already surfaced as vars, metrics, or public metadata.
12. Reject duplicate entries in a profile's rule, term, or tie-break lists.
13. Reject profiles whose deterministic tie-break contract is incomplete.
14. Compute catalog and profile fingerprints for traceability.
15. Produce a static diagnostics report with:
    - resolved profile dependencies
    - parameter tables and defaults
    - visibility classifications
    - preview usage
    - cost summary
    - fingerprints

## GameDef Additions

Add:

    interface GameDef {
      readonly agents?: AgentPolicyCatalog;
    }

Where:

    interface AgentPolicyCatalog {
      readonly schemaVersion: 1;
      readonly catalogFingerprint: string;
      readonly parameterDefs: Readonly<Record<ParamId, CompiledParameterDef>>;
      readonly profiles: Readonly<Record<PolicyProfileId, CompiledPolicyProfile>>;
      readonly bindingsBySeat: Readonly<Record<SeatId, PolicyProfileId>>;
      readonly libraryIndex: CompiledPolicyLibraryIndex;
    }

A compiled profile should include at least:

- profile id
- profile fingerprint
- resolved parameter values
- dependency-ordered features
- dependency-ordered aggregates
- ordered pruning rules
- ordered score terms
- ordered tie-breakers
- cost summary

Requirements:

- compiled catalog is pure data
- no game-specific code lives in it
- authored ids remain available for traces and diagnostics
- compiled IR stores resolved refs, dependency order, cost classes, and parameter metadata
- compiled IR remains valid JSON and round-trips through `GameDef` serialization without custom revivers

## Runtime Components

### Agent Descriptor Model

Normalize agent selection into structured descriptors before execution:

    type AgentDescriptor =
      | { readonly kind: 'policy'; readonly profileId?: PolicyProfileId }
      | { readonly kind: 'builtin'; readonly builtinId: 'random' | 'greedy' };

Runner-only seat configuration may wrap this in a higher-level controller descriptor such as:

    type SeatController =
      | { readonly kind: 'human' }
      | { readonly kind: 'agent'; readonly agent: AgentDescriptor };

Rules:

- engine factories and runner state must store structured descriptors, not `ai-greedy`-style sentinel strings
- CLI may parse textual shorthands, but must lower them immediately into structured descriptors
- `policy` without `profileId` means resolve authored binding for the acting seat
- `policy` with `profileId` means force that authored profile for experimentation

### PolicyAgent

Create a generic `PolicyAgent` with the existing simulator contract:

    chooseMove(input: {
      def: GameDef;
      state: GameState;
      playerId: PlayerId;
      legalMoves: readonly Move[];
      rng: Rng;
      runtime?: GameDefRuntime;
    }): { move: Move; rng: Rng }

Responsibilities:

- resolve acting seat
- resolve bound profile
- evaluate candidates
- select one legal move
- emit policy traces
- never inspect undeclared game-specific behavior paths

### Policy Evaluator

Add a reusable evaluator module responsible for:

- canonical candidate ordering
- feature evaluation
- aggregate evaluation
- pruning
- lazy preview evaluation
- score accumulation
- tie-breaking
- deterministic RNG usage
- trace emission

The evaluator must be pure and deterministic for the same compiled catalog, same visible decision surface, same legal moves, and same RNG state.

### Preview Runtime

Add a generic preview module responsible for:

- applying a candidate one ply for policy evaluation
- masking or rejecting hidden or preview-unsafe refs
- caching preview results per candidate
- never expanding into search or re-enumerating legal moves

### Diagnostics

Add a generic diagnostics formatter that can print or serialize:

- resolved profile plan
- cost tiers
- visible vs preview refs
- parameter values
- fingerprints

This is important for the iterative improvement loop. Policies must be inspectable without reading engine code.

## Trace Model

Replace narrow `ai-random` / `ai-greedy` framing with generic policy-aware traces.

Do not keep policy decisions encoded as a two-value seat-type enum. Trace payloads must identify the resolved agent descriptor and, for policy agents, the resolved profile and seat ids.

Always-on decision summary should capture:

- seat id
- resolved profile id
- profile fingerprint
- initial candidate count
- candidate count after each pruning rule
- selected candidate stable key
- final score
- tie-break chain used
- whether emergency fallback fired

Verbose decision traces should additionally capture:

- per-candidate stable key
- per-candidate elimination reason
- per-candidate score contributions by term
- preview refs evaluated
- unknown values encountered and how they were handled

Trace verbosity should be runtime-configurable. Full candidate tables should be opt-in, not mandatory overhead on every run.

## CLI and Runner Implications

Stop assuming only `random` and `greedy`.

CLI shorthands may remain:

- `policy` — use authored seat bindings
- `policy:<profileId>` — force a specific authored profile
- `builtin:random`
- `builtin:greedy`

Rules:

- non-human seats default to `policy`
- authored bindings remain the default seat resolution
- built-in developer agents remain available for smoke tests and debugging
- CLI and runner config should be redesigned around structured agent descriptors, not patched with more string cases
- runner pre-game configuration should expose human vs agent first, then agent descriptor details

## Authoring Guidance

### Fire in the Lake

FITL should author:

- derived metrics for support and opposition pressure, resource pressure, coup pressure, and event or opportunity value proxies
- four seat-bound profiles via top-level bindings
- shared library items reused across those profiles
- minimal baseline profiles first, then stronger faction-specific policies

Do not add FITL-specific runtime branches. If FITL needs a concept, author the metric.

### Texas Hold'em

Texas Hold'em should author:

- seat-visible derived metrics for own hand-strength proxy, pot-odds proxy, stack pressure, street phase, and position pressure
- simpler score terms around fold, check, call, and raise choice
- minimal or no preview usage before showdown, because most interesting future outcomes depend on hidden cards

Do not let Hold'em policies inspect opponent hole cards, deck order, or undealt board cards through preview or victory evaluation.

## Evolution Readiness Requirements

This spec exists to make future policy evolution practical.

Therefore the mutable surface must be explicit and bounded.

Primary mutation targets:

- parameter values
- profile inclusion or exclusion of named pruning rules
- profile inclusion or exclusion of named score terms
- profile tie-break order
- `idOrder` parameter values

Secondary mutation targets, to be allowed only by future evolution config:

- shared parameter defaults
- seat bindings for controlled experiments

Not mutation targets:

- runtime or compiler code
- simulator logic
- preview semantics
- visual config
- raw authored rules outside the declared agents section

The compiled catalog must expose enough metadata for a future evaluator to mutate policies without editing arbitrary YAML fragments blindly.

## Validation Rules

Required validation rules include:

1. Every policy-backed seat resolves to exactly one profile.
2. Every referenced profile, parameter, feature, aggregate, rule, term, and tie-breaker exists.
3. Every expression is well-typed.
4. Feature and aggregate dependency graphs are acyclic.
5. Duplicate rule, term, or tie-break entries in a profile are invalid.
6. Tunable numeric parameters have finite bounds.
7. `idOrder` parameters may only contain allowed ids exactly once each.
8. Candidate param refs target only scalar leaves or fixed id lists.
9. Preview refs are allowed only on preview-safe surfaces.
10. Policies may not depend on hidden information outside acting-seat visibility.
11. Policies may not reference visual config or presentation metadata.
12. Profiles must end in deterministic tie-break semantics: `stableMoveKey`, or canonicalized `rng`.
13. No silent truncation of legal candidates is allowed.
14. Emergency fallback must be traceable whenever it occurs.
15. Division-by-zero and other invalid arithmetic states must resolve deterministically via compile-time rejection or explicit guarding or coalescing.

## Performance Constraints

This architecture exists partly because unrestricted search was too slow.

Therefore:

- evaluation is one-ply over the provided legal move list
- cheap features and pruning run before preview
- preview is lazy and cached
- no rollout, no tree expansion, and no legal-move re-enumeration during evaluation
- candidate aggregates must remain `O(n)` over the current candidate set
- per-candidate work must be predictable from compiled cost classes
- runtime must expose hard safety limits and fail loudly rather than silently truncate

Acceptance target:

- authored policy evaluation must stay comfortably below specialized search-heavy or rule-procedural baselines
- FITL benchmark scenarios should complete decisions in milliseconds to low seconds, not minutes

## Testing Requirements

### Unit Tests

- parse and lower valid `agents` sections
- reject invalid bindings
- reject bindings that reference seats absent from the resolved seat catalog/scenario
- reject invalid parameter values
- reject cyclic feature or aggregate dependencies
- reject hidden or preview-unsafe refs
- deterministic stable move key generation
- pruning `onEmpty` semantics
- score term unknown handling
- tie-break determinism
- profile selection by seat id
- fingerprint stability for unchanged authored policy
- `GameDef.agents` JSON serialization round-trips without loss

### Integration Tests

- `PolicyAgent` returns only legal moves
- same visible decision surface plus same seed plus same profile yields identical move
- two states that differ only in hidden, acting-seat-invisible data yield identical policy evaluation
- FITL authored profiles complete long self-play runs without runtime errors
- Texas Hold'em authored policies use the same runtime without hidden-info leaks
- scenario-selected seat catalogs resolve the correct authored policy bindings

### Property Tests

- policy evaluation never returns a move outside `legalMoves`
- permutation of input `legalMoves` order does not change the selected move except through canonical RNG with the same seed
- emergency fallback, if triggered, still returns a legal move
- identical seeds replay deterministically
- pruning with `skipRule` never empties the candidate set

### Golden Tests

- baseline FITL profiles lower to expected compiled `GameDef.agents`
- baseline Texas Hold'em profiles lower to expected compiled `GameDef.agents`
- policy traces match expected summary structure for fixed seeds
- verbose candidate tables match expected reasoning for curated scenarios

### Benchmark Tests

- fixed scenario corpus for FITL and Texas Hold'em
- report candidate counts, preview counts, and p50/p95 decision times
- fail the benchmark suite on major regressions
- record emergency fallback count; expected value is zero in benchmark corpora

## Migration Plan

1. Add `GameSpecDoc.agents` schema, parameter model, and compiler support.
2. Add prerequisite generic visibility metadata and scenario-aware seat-resolution hooks for policy surfaces.
3. Add `GameDef.agents` normalized JSON-serializable runtime schema with fingerprints.
4. Implement policy expression evaluation, candidate aggregates, and pruning.
5. Implement visibility classification and preview runtime.
6. Implement generic `PolicyAgent`.
7. Redesign CLI and runner agent descriptors around structured `policy` plus built-ins.
8. Author minimal baseline policies and needed derived metrics for FITL and Texas Hold'em in `GameSpecDoc` / scenario-linked data only.
9. Move default non-human execution to authored `policy`.
10. Update future evolution specs to target parameters and profile assemblies rather than external fixed agents.

## Decisions Replacing the Previous Open Questions

1. V1 is strictly one-ply. No rollout primitive is reserved now.
2. V1 profiles stay flat. Reuse happens through named library items only.
3. `random` and `greedy` remain available as built-in developer agents, but they are no longer the default architecture or runner assumption.

## Acceptance Criteria

- [ ] `GameSpecDoc` can declare authored policies through parameters, library items, flat profiles, and seat bindings.
- [ ] `GameDef` carries a compiled `AgentPolicyCatalog` with fingerprints.
- [ ] `GameDef.agents` remains JSON-serializable and schema-valid.
- [ ] `PolicyAgent` executes authored policies with no game-specific runtime branches.
- [ ] V1 evaluates only concrete legal moves and does not support template completion or rollouts.
- [ ] Policies may read only approved visible refs and preview-safe refs.
- [ ] Hidden information unavailable to the acting seat cannot affect policy results.
- [ ] Policy bindings resolve against canonical scenario-selected seat ids, not player indexes.
- [ ] Fire in the Lake can express four asymmetric seat policies as authored game data.
- [ ] Texas Hold'em can express authored policies through the same runtime without hidden-info leakage.
- [ ] Policy traces explain why a move was selected.
- [ ] Random and greedy remain opt-in tools, not architectural defaults.
- [ ] `visual-config.yaml` remains presentation-only and contains no policy authoring or policy runtime data.
- [ ] The compiled policy surface is bounded, deterministic, validated, and evolution-ready.

## Files to Create/Modify

    packages/engine/src/cnl/game-spec-doc.ts
    packages/engine/src/cnl/compiler-core.ts
    packages/engine/src/cnl/compile-agents.ts
    packages/engine/src/kernel/types-core.ts
    packages/engine/src/kernel/schemas-core.ts
    packages/engine/src/agents/policy-ir.ts
    packages/engine/src/agents/policy-expr.ts
    packages/engine/src/agents/policy-agent.ts
    packages/engine/src/agents/policy-eval.ts
    packages/engine/src/agents/policy-preview.ts
    packages/engine/src/agents/policy-diagnostics.ts
    packages/engine/src/agents/factory.ts
    packages/engine/src/trace/trace-events.ts
    packages/runner/src/store/store-types.ts
    packages/runner/src/session/session-types.ts
    packages/runner/src/store/ai-move-policy.ts
    packages/runner/src/ui/PreGameConfigScreen.tsx
    packages/runner/src/trace/console-trace-subscriber.ts
    packages/engine/test/unit/cnl/compile-agents.test.ts
    packages/engine/test/unit/agents/policy-expr.test.ts
    packages/engine/test/unit/agents/policy-preview.test.ts
    packages/engine/test/unit/agents/policy-agent.test.ts
    packages/engine/test/integration/fitl-policy-agent.test.ts
    packages/engine/test/integration/texas-holdem-policy-agent.test.ts
    packages/engine/test/property/policy-determinism.test.ts
    packages/engine/test/property/policy-visibility.test.ts
    packages/engine/test/benchmark/policy-agent.bench.ts
    data/games/fire-in-the-lake.game-spec.md
    data/games/fire-in-the-lake/*.md
    data/games/texas-holdem.game-spec.md
    data/games/texas-holdem/*.md
    no policy data in data/games/*/visual-config.yaml
