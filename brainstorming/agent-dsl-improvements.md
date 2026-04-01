# Agent Policies DSL Review and vNext Proposal

## Spec Coverage Status (2026-04-01, revised)

This document was produced by an external reviewer (ChatGPT Pro) without codebase access. After reassessing each claim against the actual codebase and `docs/FOUNDATIONS.md`, the following specs were created:

| Issue | Status | Spec |
|-------|--------|------|
| #1 Observability in wrong layer | **Completed** | Spec 102 — Shared Observer Model (archived) |
| #2 Two policy languages | **Completed** | Spec 104 — Unified Decision-Context Considerations (archived) |
| #3 Preview semantics too loose | **In Progress** | Spec 105 — Explicit Preview Contracts (tickets created) |
| #4 Surface growth / special-case accretion | **Deferred** | Action tags (Spec 103, archived) address the worst symptom; generic query IR deferred |
| #5a Stochastic selection modes | **Spec'd** | Spec 107 — Stochastic Selection Modes |
| #5b Transforms, tiers, veto/gate | **Deferred** | Enhancement — weight tuning approximates; revisit when authoring friction is acute |
| #6 Numeric domain / floats | **Deferred** | No determinism issues observed in practice; revisit if complex scoring formulas adopted |
| #7 Action modelling too low-level | **Completed** | Spec 103 — Action Tags and Candidate Metadata (archived) |
| #8 StrategicConditions too weak | **Deferred** | Spec 101 delivered boolean + proximity; extensions not needed by current games |
| #9 Evolutionary genotype implicit | **Deferred** | Evolution pipeline (Spec 14) not started |
| #10 Bounded search layer | **Deferred** | Single-ply sufficient for current games |

Reassessment notes (2026-04-01 revisit after specs 102-105 landed):
- Specs 102, 103, 104 are now implemented and archived. Spec 105 has tickets in progress.
- Claim #5 was split during re-triage: stochastic selection modes (#5a) are a real architectural ceiling — Texas Hold'em (imperfect-info) fundamentally cannot express mixed strategies with argmax-only selection, and MAP-Elites diversity is limited. Promoted to Spec 107. Transforms, tiers, and veto/gate (#5b) remain deferred as enhancements.
- Claims #4, #6, #8, #9, #10 were re-evaluated and remain correctly deferred — YAGNI still applies. None are blocking current games or evolution readiness.
- Claim #3 was partially overstated — the codebase already distinguishes 6 preview outcome types. Spec 105 formalizes the profile-level contract.
- Claim #4 is real but large. Spec 103 (action tags) kills the most visible pain (boolean forest). The full generic query IR remains a candidate for future work.

---

## Executive verdict

The current Agent DSL is not a dead end. It already has several right ideas: declarative YAML, compiled typed IR, bounded evaluation, deterministic move ordering, strong traces, no embedded code, and clean profile/binding separation.

But the architecture is still wrong in four foundational ways:

1. It treats observability as an agent concern instead of a game-rules concern.
2. It models policies as scorers of completed legal moves, then patches the gap with a second DSL for completion guidance.
3. It is accumulating one-off surfaces/operators instead of converging toward a generic typed query model.
4. It uses a preview system whose semantics around randomness and hidden information are not strong enough for "any game".

If you keep extending the current design organically, you will end up with a brittle pile of special cases that works for FITL and fails to generalise. Do not throw it away. Refactor it now.

## What should stay

- YAML-authored, compiler-lowered, JSON-runtime IR.
- No embedded code, no plugins, no callbacks.
- Profiles separate from seat bindings.
- Strict whitelist of runtime references.
- Compiler-built dependency graphs and cost classes.
- Stable move keys and deterministic canonical ordering.
- Structured per-candidate decision traces.
- Flat profiles with no inheritance.

## What is architecturally wrong

### 1. Observability is in the wrong layer — **SPEC'D: Spec 102**

`agents.visibility` is the biggest design mistake. Visibility is not an agent-policy feature. It is a rule-authoritative property of the game world. The runner, simulator, replays, human players, and agents should all consume the same observer definitions. Keeping visibility inside `agents` invites drift and omniscient leaks.

This matters especially for imperfect-information games. Static surface classes like `public`, `seatVisible`, and `hidden` are not expressive enough for conditional perception such as "see opponent hand only at showdown", "see bid after reveal", "see selected card only if both players committed", etc.

The Texas Hold'em example should be treated as proof that imperfect-information support is incomplete, not as proof that it exists. A hidden-information game running under an initial omniscient policy surface is a canary, not a success case.

**Required fix**

Move observability out of `agents:` and into a shared game-level `observability:` / `observers:` section used by every client. Policies should select an observer, not define visibility.

### 2. The DSL has two policy languages, not one — **SPEC'D: Spec 104**

You currently have:
- `scoreTerms` for completed legal moves
- `completionScoreTerms` for inner decisions during move construction

That is the same idea duplicated across two contexts. Completion guidance was the right diagnosis, but architecturally it is a patch over a deeper issue: the system has no first-class concept of a `decision context`.

**Required fix**

Create one unified consideration model that can run in any bounded decision context:
- top-level move choice
- chooseOne / chooseN step
- optional later: simultaneous move commitment, mulligan, draft pick, bid, reaction window

A consideration should declare its scope(s), not live in a separate library section.

### 3. Preview semantics are too loose — **SPEC'D: Spec 105** (partially overstated; codebase already has 6 outcome types)

`preview.tolerateRngDivergence` is not a solution. It is a safety valve. It may be pragmatically useful, but as a long-term architecture it is too hand-wavy.

Right now preview mixes several cases that should be distinct:
- deterministic lookahead
- public chance outcomes
- hidden chance outcomes
- unresolved inner decisions
- engine bookkeeping that happens to touch RNG

Those cases need explicit semantics. Otherwise the agent will either reject useful previews or silently depend on unsound ones.

**Required fix**

Replace RNG-divergence tolerance with explicit preview contracts:
- `exactWorld`
- `enumeratePublicChance`
- `infoSetSample`
- `expectedValue`
- `unsupported`

Also record which chance/hidden assumptions were used, and never let policy evaluation mutate the authoritative game RNG stream.

### 4. Surface growth is turning into special-case accretion — **PARTIALLY ADDRESSED: Spec 103** (action tags kill boolean forest; generic query IR deferred)

The DSL started with vars and victory margins. Then it needed preview. Then event card identity. Then event tags. Then card metadata. Then compiled annotations. Then global token aggregations. Then adjacency aggregations.

This is the smell of a surface model that is expanding sideways instead of converging toward a small generic algebra.

**Required fix**

Replace the growing zoo of one-off operators/surfaces with a generic typed collection-query IR. Current sugar can be reintroduced as compile-time macros if it genuinely improves authoring, but runtime should execute one generic model.

### 5. Additive scoring is too primitive for general use — **DEFERRED** (enhancement, not blocking)

The current `sum(weight * value)` model is fine as a base layer. It is not enough as the whole language.

Missing pieces:
- transforms / normalization
- lexicographic tiers
- veto/gate semantics
- candidate-relative transforms
- stochastic selection for mixed strategies

Without these, authors will use giant weights, brittle clamps, and ad hoc tie-breakers to fake semantics the DSL should express directly.

### 6. The numeric domain does not align cleanly with the foundations — **DEFERRED** (needs policy decision on agent scoring rule-authoritativeness)

The report allows decimal numbers and floating-point style weights. The foundations say rule-authoritative numeric operations must be exact and today are integers only.

I would treat agent scoring as simulation-authoritative. It changes chosen moves, therefore it changes outcomes. I do not recommend carving policy evaluation out of the determinism rule.

**Required fix**

Move policy arithmetic to an exact numeric representation:
- preferred: compiler-lowered fixed-point integers or exact rationals
- not acceptable as the long-term contract: ambient IEEE-754 floats

### 7. Action modelling is too low-level — **SPEC'D: Spec 103**

The FITL example explodes into a large pile of `isRally`, `isMarch`, `isAttack`, etc. boolean features. That does not scale.

The DSL needs first-class action metadata:
- action tags
- action families
- authored costs
- compiled effect annotations
- candidate template / binding metadata

Otherwise every game becomes a boolean forest of action-id checks.

### 8. StrategicConditions are too weak — **DEFERRED** (Spec 101 just landed; sufficient for now)

`target` + `current/threshold` proximity is a useful first step. It is not a strategic layer.

You need:
- progress delta
- urgency / deadline
- enable/disable conditions
- hysteresis / mode switching support
- composition of multiple strategic conditions

### 9. The evolutionary genotype is implicit — **DEFERRED** (evolution pipeline Spec 14 not started)

Right now the authored DSL doubles as the mutation surface. That is convenient, but messy. Evolution should operate over an explicit bounded gene schema derived from YAML:
- parameter genes
- term enabled/disabled genes
- tier membership genes
- transform choice genes
- stance choice genes
- search budget genes

The authoritative artifact remains YAML. The point is to make the search space explicit and stable.

## Recommended target architecture

### 1. Shared observer model — **SPEC'D: Spec 102**

Game-level observability should define observer projections. Agent profiles should bind to one of those observers.

Illustrative sketch:

~~~yaml
observability:
  observers:
    public:
      expose:
        - metric.*
        - victory.currentMargin
        - activeCard.*
        - history.public
    currentPlayer:
      extends: public
      expose:
        - hand.self
        - objectives.self
        - resources.self

agents:
  profiles:
    holdem-baseline:
      observer: currentPlayer
~~~

Design rules:
- observer projections are rule-authoritative
- runner, simulator, replay tools, and agents all use the same observer contracts
- preview is defined over projected observer states, not raw authoritative state with ad hoc masking

### 2. Unified decision-context IR — **SPEC'D: Spec 104**

Replace `scoreTerms` and `completionScoreTerms` with a single `considerations` model.

Illustrative sketch:

~~~yaml
library:
  considerations:
    preferPopulousTargets:
      scopes: [move, completion]
      when:
        and:
          - eq: [ { ref: context.kind }, completion ]
          - eq: [ { ref: decision.targetKind }, zone ]
      value:
        query:
          from: zones
          pick: { ref: option.value }
          prop: population
      transform:
        - clamp: { min: 0, max: 10 }
      weight: { param: targetWeight }
      tier: 2
~~~

Required context families:
- `context.kind` = move | completion | simultaneous | reaction
- `partialMove.*`
- `decision.*`
- `option.*`
- `candidate.*` (for top-level move scope)
- `observer.*` or `obs.*`

### 3. Generic collection/query IR — **DEFERRED** (Spec 103 addresses the worst symptom)

Internally, every state/action lookup should lower into a small generic query algebra over finite collections:
- players
- zones
- tokens
- cards
- legal candidates
- decision options
- history events

Supported operations should stay bounded and compile-analyzable:
- filter
- exists / all
- count
- sum / min / max
- dense rank / ordinal rank
- candidate-relative normalization
- relation predicates such as adjacency, ownership, containment

`candidateAggregates` currently mixes true set reductions with per-candidate ranking transforms. Split that in the new IR into:
- candidate-set features
- candidate-relative transforms

Do not keep adding runtime evaluator branches for every new game need. Add generic query capability, then express specific needs as authored sugar or compiler macros.

### 4. Generalised compiled annotations — **DEFERRED** (Spec 100 covers event annotations; broader generalization deferred)

Spec 100 was the right idea, but it is too narrow. Do not stop at event cards.

Generalise annotations to:
- actions
- action templates
- event cards
- decision options
- triggered effects
- objectives / scoring opportunities

Expose them generically:
- `candidate.annotation.<metric>`
- `option.annotation.<metric>`
- `observer.annotation.<metric>` where appropriate

This will often be cheaper and safer than preview.

### 5. Selection tiers, transforms, and mixed strategies — **DEFERRED**

Selection needs more structure than `sum(weight * value)` plus tie-breakers.

Add:
- per-term transforms (`normalize`, `logistic`, `tanh`, `bucket`, `rankDense`, `rankPercentile`, `minMaxAcrossCandidates`)
- tiered evaluation (`tier 1` decides before `tier 2`)
- veto/gate rules that are stronger than soft penalties
- stochastic output modes:
  - `argmax`
  - `softmaxSample`
  - `weightedSample`
  - `topKSample`

For imperfect-information games, mixed strategies are not optional sugar. They are part of sane policy expression.

### 6. Explicit preview contracts — **SPEC'D: Spec 105**

Profile-level preview must be declarative and explicit.

Illustrative sketch:

~~~yaml
profiles:
  holdem:
    preview:
      mode: infoSetSample
      samples: 8
      seedDerivation: stableByCandidate
      publicChance: enumerate
      hiddenChance: sample
      unresolvedDecision: forbid
~~~

Rules:
- preview never consumes authoritative game RNG
- candidate comparison must be order-independent
- info-set sampling must be consistent with the selected observer
- traces must record whether a preview value was exact, enumerated, or sampled

### 7. Optional bounded search layer — **DEFERRED** (single-ply sufficient)

Do not replace the DSL with search. Add search above it.

The right relationship is:
- considerations define value features and policy priors
- search uses them when a profile opts in

Profile example:

~~~yaml
profiles:
  vc-advanced:
    search:
      mode: rollout
      nodeBudget: 256
      leafEvaluator: default
      movePrior: default
      opponentModel: boundProfiles
~~~

Hard rules:
- no wall-clock budgets
- only bounded node / rollout / depth budgets
- deterministic seed derivation
- unsupported search modes must fail at compile time or capability-report time

### 8. Exact numeric policy arithmetic — **DEFERRED** (needs policy decision)

Pick one exact contract and commit:
- fixed-point integer arithmetic with a repo-wide scale, or
- exact rationals compiled to numerator/denominator pairs

Authoring can stay readable, but compiled IR must be exact and canonical.

### 9. Stances, not inheritance — **DEFERRED**

Do not add profile inheritance or mixins. That road ends in YAML spaghetti.

If you need higher-level modularity, add stances / agendas:
- each stance has an activation condition
- each stance contributes term sets, weight overrides, or search settings
- the selected stance is itself deterministic and traceable

That gives you useful hierarchy without procedural trees or OOP-style config abuse.

### 10. Evolution schema — **DEFERRED** (evolution pipeline not started)

Add optional evolution metadata so the search space is explicit.

Example directions:
- bounded integer/rational parameter ranges
- enable/disable flags on considerations
- allowed transforms
- allowed tier moves
- allowed stance switches
- allowed search budget ranges

The compiler should emit a canonical gene order and gene fingerprint for each profile.

## Features I recommend adding

1. **Observer-bound policies** — **SPEC'D: Spec 102**
   Policies should name the observer they consume.

2. **Action tags and candidate annotations** — **SPEC'D: Spec 103**
   This removes the explosion of action-id boolean features.

3. **Candidate-relative transforms** — **DEFERRED**
   Dense rank, percentile, best-gap, min-max normalization.

4. **Mixed-strategy selection** — **DEFERRED**
   Necessary for poker-like games and often useful elsewhere.

5. **Bounded history surfaces** — **DEFERRED**
   Example: last public action, last action by self, rounds since event, last revealed card. Keep this bounded and observer-safe.

6. **Strategic progress delta** — **DEFERRED**
   `preview.strategic.<id>.delta` is more useful than a bare proximity scalar.

7. **Capability reports** — **DEFERRED**
   The compiler should report which features/search/preview modes are supported for a given game/profile.

8. **Evolution metadata** — **DEFERRED**
   Make the search space first-class.

9. **Pattern / spatial features** — **DEFERRED**
   Especially for board games. These should lower to the generic query IR, not add another special system.

## Things I explicitly do not recommend

- Do not add embedded scripting or callbacks.
- Do not replace the DSL with behavior trees as the primary agent representation.
- Do not add profile inheritance.
- Do not keep `agents.visibility` as the authoritative observability model.
- Do not keep `tolerateRngDivergence` as a long-term semantic contract.
- Do not keep expanding the evaluator with one-off surface families.
- Do not use wall-clock search budgets if determinism matters.

## Required test plan

1. **Observer leak tests**  
   Hidden-information games must prove that policies cannot read opponent private data or deck order through any current, preview, aggregate, annotation, or history surface.

2. **Deterministic policy tests**  
   Same GameDef + state + seed + profile => same selected move, same distribution, same trace.

3. **Exact arithmetic tests**  
   Cross-platform / serialization tests proving score calculations are canonical.

4. **Preview contract tests**  
   Exact, enumerated, sampled, and unsupported preview modes must be distinguishable and goldened.

5. **Scope-consistency tests**  
   A consideration used in both `move` and `completion` scopes must behave identically where the available context overlaps.

6. **Capability/lint tests**  
   The compiler must warn on dead terms, constant terms, unreachable refs, always-unknown previews, unused params, and dominated terms.

7. **Conformance corpus**  
   At minimum:
   - perfect-information board game
   - hidden-information card game
   - stochastic game
   - asymmetric / phase-heavy game

## Migration recommendation

This should be a deliberate breaking change. I recommend a single schema-version bump and a full migration of owned specs in the same change.

Suggested order:
1. Move observability out of `agents`.
2. Introduce unified considerations and remove `completionScoreTerms`.
3. Introduce generic query IR and action tags/annotations.
4. Replace preview tolerance with explicit preview contracts.
5. Add transforms, tiers, and exact numeric arithmetic.
6. Add mixed strategies and search only after the above are stable.

## Bottom line

Your core bet was correct: a declarative, game-authored, compiled agent DSL is the right direction.

But the current system is still architecturally centered on "score fully completed legal moves from a masked world state." That is too narrow for the problem you actually have.

The DSL should become a declarative decision program over:
- shared observer projections,
- typed bounded queries,
- unified decision contexts,
- explicit preview/search contracts,
- exact arithmetic,
- and optional mixed-strategy output.

Make those changes and the system becomes a real general agent DSL. Keep extending the current design organically and it will calcify into a FITL-specific utility scorer with poker-shaped exceptions.
