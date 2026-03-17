# Spec 64 (Revised) — Cost-Aware MCTS for Expensive-Transition Games

**Source basis**: original Spec 64, `mcts-fitl-performance-analysis.md`, and `mcts-optimization-technical-context-for-external-research.md`.

**Depends on**: Spec 63 (runtime move classification)

**Tickets**: Decomposed into 64MCTSPEROPT-001 through 64MCTSPEROPT-016 (see `tickets/` folder)

## 0. Problem Statement

### 0.1 FITL Exposes the Real Bottleneck

FITL is slow because `legalChoicesEvaluate()` dominates search cost. The measured bottleneck is move classification/materialization, not UCT bookkeeping and not `applyMove()`. Hybrid rollouts are catastrophically bad on this workload because they multiply the number of classification calls. Pending operations also starve: after 50 iterations, core FITL actions such as rally, march, and attack still receive zero visits.

### 0.2 Goal

Make MCTS viable for complex games under realistic turn budgets, with FITL as the stress test:

- Background / turn-time play: roughly 10–30 seconds per decision
- Human-facing bounded-latency play: always return within budget, even if that requires falling back to a shallower search policy than full MCTS

### 0.3 Non-Goals

- Do not promise pure MCTS at ~600 ms on FITL.
- Do not delete rollout support for all games just because FITL cannot afford it.
- Do not ship a “faster” search that weakens legality or availability checks.
- Do not overfit the engine to FITL-specific rules or heuristics.

## 1. Corrections to the Previous Draft

### 1.1 Removing Rollout Modes Entirely Is the Wrong Abstraction Boundary

The prior draft overfits FITL. `legacy` and `hybrid` are bad defaults for expensive-transition games, but they remain valid tools for games with cheap state transitions and weak heuristics. (Note: `DEFAULT_MCTS_CONFIG` currently uses `rolloutMode: 'hybrid'` as its default, while all four presets override to `'direct'` — this inconsistency is worth resolving.) The right change is to modularize rollout-based leaf evaluation and make direct/heuristic evaluation the default for expensive games, not to delete rollout support from the engine.

### 1.2 Replacing Broken Presets with “One Default Config” Is Also Wrong

The old preset names (`fast`, `default`, `strong`, `background`) are misleading, but the concept of named operating profiles is still useful. Product surfaces and CI need stable, budget-oriented profiles. Replace the old preset system with a small set of budget profiles (`interactive`, `turn`, `background`, `analysis`) backed by ordinary `MctsConfig`, rather than forcing every caller to hand-tune raw parameters.

### 1.3 Raw `legalMoves()` Membership Is Not a Sound Availability Test

The previous draft assumes that an existing child is available if its `moveKey` appears in the raw `legalMoves()` output. That shortcut is unsafe. `legalChoicesEvaluate()` can still classify a raw move as `illegal`, `pending`, or `pendingStochastic`, so move-key presence alone is not a proof that an already-expanded child is legal in the current sampled world.

Lazy selection must remain sound:
- known-compatible classification status can prove availability
- raw move-key presence can only prove “possibly available”
- unknown statuses must be classified on demand before a child is selected or expanded

### 1.4 Incremental Classification Without Ordering Still Starves Pending Moves

The prior draft says “classify one candidate at a time and stop at the first ready/pending move.” That is not enough. FITL’s root includes many near-duplicate ready variants, so a naive ordered scan can still spend the entire budget on `event` / resource-transfer variants while never touching pending operations. The fix is not just lazy classification. The fix is lazy classification plus action-family widening and explicit pending/family coverage rules.

### 1.5 Exact Best-Candidate Expansion Is Incompatible with Lazy Classification

The current expansion priority prefers the highest one-step heuristic candidate. If implemented exactly, that requires classifying and often applying too many unexpanded moves. That defeats the purpose of going lazy. The corrected design therefore changes expansion semantics:

- use a cheap ordering policy to build a frontier
- classify candidates on demand
- only run one-step `applyMove() + evaluate()` on a small shortlist
- treat exact global argmax expansion as an optional exhaustive policy for cheap games only

### 1.6 Root Parallelization Must Preserve Determinism

Parallel workers may not race against wall-clock budgets if determinism is required. Parallel search must split a fixed iteration budget up front, fork the RNG deterministically, and merge results in stable key order. “Run for 30 seconds on 4 workers and merge whatever finished” is not deterministic enough for the engine’s guarantees.

### 1.7 The Old Performance Targets Are Too Confident

`~150 ms/iteration` is a stretch target, not a contract. The acceptance criteria must focus first on soundness and call-count reduction, then on measured runtime improvements. FITL can still surface a different bottleneck once selection stops reclassifying everything.

## 2. Design Principles

1. Reduce the number of expensive kernel calls before micro-optimizing them.
2. Preserve correctness under sampled worlds and hidden information.
3. Widen over action families before concrete variants when branching explodes.
4. Use wall-clock budget as the primary product-facing control; use iteration count as a secondary cap and a deterministic testing aid.
5. Keep rollout and direct evaluation as pluggable strategies, not hard-coded modes scattered across the search core.
6. Measure every phase before deleting code or claiming victory.

## 3. Revised Architecture

### 3.1 Make Leaf Evaluation a Strategy, Not a Global Rollout Switch

Replace the current top-level rollout switch with a leaf-evaluation strategy:

    type LeafEvaluator =
      | { type: 'heuristic' }
      | {
          type: 'rollout'
          maxSimulationDepth: number
          policy: 'random' | 'epsilonGreedy' | 'mast'
          epsilon?: number
          candidateSample?: number
          mastWarmUpThreshold?: number
          templateCompletionsPerVisit?: number
        }
      | { type: 'auto' }

`auto` chooses the cheaper direct/heuristic path when the measured transition/classification cost is high, and may still choose rollout evaluation for small or cheap games. FITL profiles will default to `heuristic`.

This keeps the engine game-agnostic, cleans up config, and avoids deleting functionality that may still be correct and useful elsewhere.

### 3.2 Keep Profiles, but Make Them Budget-Oriented

Replace `fast` / `default` / `strong` / `background` with a small profile layer:

- `interactive`: very small budget, direct evaluation only, aggressive fallback
- `turn`: a few seconds, direct evaluation, lazy classification, family widening
- `background`: 10–30 seconds, direct evaluation by default, optional deterministic parallelism
- `analysis`: larger budgets, may opt into rollout evaluation on cheap games

Profiles are thin wrappers over `MctsConfig`. Raw config remains supported for internal experiments and tests.

**Codebase note**: The existing preset system uses `MctsPreset` type (`'fast' | 'default' | 'strong' | 'background'`) and `MCTS_PRESETS` map (not `PRESET_CONFIGS`) in `config.ts`. The new budget profiles replace these types and the map.

### 3.3 Replace Whole-State Move Classification with Incremental Per-Move Classification

The current cache entry:

    interface CachedStateInfo {
      terminal?: TerminalResult | null
      legalMoves?: readonly Move[]
      rewards?: readonly number[]
      moveClassification?: MoveClassification
    }

is too coarse for lazy search. Replace it with an incremental structure that supports partial population:

    type ClassificationStatus =
      | 'unknown'
      | 'ready'
      | 'pending'
      | 'illegal'
      | 'pendingStochastic'

    interface CachedLegalMoveInfo {
      move: Move
      moveKey: MoveKey
      familyKey?: string          // optional in Phase 2; populated once familyKey() lands in Phase 3
      status: ClassificationStatus
      oneStepHeuristic?: readonly number[] | null
    }

    interface CachedClassificationEntry {
      infos: readonly CachedLegalMoveInfo[]
      nextUnclassifiedCursor: number
      exhaustiveScanComplete: boolean
    }

Implementation detail: use compact arrays / enums instead of object-heavy maps if necessary, but the semantics above must hold.

Key requirements:

- `legalMoves()` is still cached once per state
- `moveKey` and `familyKey` are computed once per cached move, not rebuilt every visit
- classification status is stored per move, not all-or-nothing
- classification can advance incrementally across revisits
- cache size remains bounded by the existing entry cap or an LRU
- **deduplication must be preserved**: the current `classifyMovesForSearch()` in `materialization.ts` deduplicates ready moves by `moveKey` and pending moves by `actionId` (or `canonicalMoveKey` when params differ). The incremental cache must maintain this invariant — multiple raw moves may map to the same `moveKey`, and only one entry per `moveKey` should appear in the cached infos

### 3.4 Add `familyKey()` / `abstractMoveKey()` for Search Control

Introduce a coarse family key used only for widening and diversity control. The default family key should be based on `actionId` and, if needed, a light parameter-shape signature. It is intentionally coarser than `moveKey`.

Examples of intended behavior:
- `vcTransferResources{amount:1}` and `vcTransferResources{amount:5}` should usually share a family
- a pending `rally` root should have its own family
- the family key is a search-control key, not a semantic equivalence proof

This is what prevents high-cardinality ready variants from crowding out strategically distinct action families.

**Codebase note**: The kernel already has `resolveTurnFlowActionClass()` in `packages/engine/src/kernel/turn-flow-action-class.ts` (Spec 63), which classifies moves into `operation | limitedOperation | specialActivity | operationPlusSpecialActivity | event | pass`. This `TurnFlowActionClass` is a natural ingredient for `familyKey()` — it already captures the operation/event/pass distinction and should be considered as a coarse grouping signal when available.

### 3.5 Sound Availability Checking

Selection must distinguish three cases for each existing child:

1. **Known available**
   - The current state’s cached classification already marks the child’s `moveKey` as compatible (`ready` for state children, `pending` for decision roots, or another explicitly supported status). Note: `pending` status in the cache corresponds to `legalChoicesEvaluate()` returning `{ kind: ‘pending’ }`.

2. **Unknown**
   - The child’s `moveKey` appears in raw `legalMoves()` but has not yet been classified in this state.

3. **Known unavailable**
   - The current state’s cached classification marks the child incompatible, or the move is absent from raw `legalMoves()`.

Rules:
- Only “known available” children may be scored by UCT/ISUCT.
- “Unknown” children must be classified on demand before they can be selected.
- Raw move-key presence alone never upgrades a child from unknown to available.
- `pendingStochastic` must not be silently treated as ordinary `pending`.

This preserves correctness while still avoiding whole-state full classification.

### 3.6 Replace Exhaustive Expansion with Ordered Lazy Expansion

At a widened node, expansion becomes:

    1. Get cached legal-move infos for the state.
    2. Compute which families and children are already represented.
    3. Build an ordered frontier of unexpanded candidates.
    4. Classify frontier candidates on demand until:
       - one compatible candidate is found, or
       - the shortlist budget is exhausted, or
       - the frontier is exhausted.
    5. For ready candidates, run one-step apply+evaluate only on a small shortlist.
    6. Expand the best shortlisted candidate.

Important consequences:
- no full classify-all sweep on revisits
- no full one-step-evaluate-all sweep on high-branching nodes
- exact global best-candidate expansion becomes a policy used only when branching is small or cost is low

### 3.7 Action-Family Widening and Pending Coverage

This is the missing piece that the previous draft did not solve.

At the root and optionally at shallow depths:
- widen over families first, then over concrete move variants
- cap concrete siblings per family until all families have had a chance to appear
- reserve at least one early expansion slot for a pending family if any pending families exist
- do not allow one high-cardinality ready family to consume the whole early widening budget

Suggested policy:
- family-first widening at depth 0 and depth 1
- plain move-level widening below that unless profiling says otherwise
- if family cardinality is small, fall back to ordinary move-level behavior

The goal is simple: FITL’s core operations must stop getting zero visits.

### 3.8 Add Cheap Ordering Priors Before Expensive Evaluation

Ordered lazy expansion needs a cheap frontier order. The ordering policy must be game-agnostic and cheap. Candidate ordering can combine:

- family coverage gap
- previous root-best / transposition hint
- family-level win-rate or heuristic prior from prior visits
- terminal/proven-result information if already known
- stable PRNG tie-break

Only the top few candidates from that cheap frontier should pay for one-step `applyMove() + evaluate()`. Otherwise `applyMove()` simply becomes the next bottleneck after materialization is removed.

### 3.9 Instrument and Cache Decision-Node Discovery

Once pending moves finally receive visits, `legalChoicesDiscover()` is likely to become much more important. The old spec ignored that.

Add diagnostics now:
- `decisionDiscoverCallCount`
- `decisionDiscoverTimeMs`
- `decisionDiscoverCacheHits`
- per-depth option counts for decision nodes

Add caching where sound:
- key by `DecisionKey` from Spec 62 (`packages/engine/src/kernel/decision-scope.ts`) as the appropriate cache key component — it uniquely identifies decision instances within a move tree via iteration path + counters, replacing the vague `(stateHash, partialMoveKey, decisionBinding)` tuple
- do not cross-cache hidden-info states without a valid determinized hash
- keep the cache bounded like the other state-info entries

**Codebase note**: `LegalChoicesRuntimeOptions` now supports `chainCompoundSA: boolean` (Spec 62/63 work) for chaining compound special-activity decisions incrementally. Lazy classification should leverage this option when handling compound special activities, since it controls whether the kernel chains SA decisions or returns `pending` at the first decision point.

This is a required part of the new plan, not an afterthought.

### 3.10 Add a Kernel-Side Classification Optimization Track

Search-side laziness reduces how often classification runs. It does not reduce the `~1 s` cost of each classification call. The plan therefore needs a parallel kernel-side track aimed at `legalChoicesEvaluate()` and `legalChoicesDiscover()` themselves.

Add subphase diagnostics inside classification/discovery:
- runtime binding construction
- choice-target enumeration
- AST predicate evaluation
- pipeline validation / cost checking
- template completion if applicable

Likely game-agnostic optimizations:
- compile decision plans / AST predicates once at game-load
- memoize repeated predicate results within the same state
- build per-state query indexes that both `legalMoves()` and classification can reuse
- avoid repeated action-definition lookup and repeated canonicalization work

This work is lower priority than eliminating redundant calls, but it is too important to leave out of the spec.

### 3.11 Budget-Driven Search with Explicit Fallbacks

The engine needs to return a move inside human-facing budgets even when full MCTS is not feasible.

Add a budget/fallback layer:
- `timeLimitMs` is the primary public control
- `iterations` remains as a hard cap and a deterministic-test control
- if the measured per-iteration cost makes the requested budget unrealistic, the agent degrades gracefully

Fallback policies should be explicit:
- `none`
- `policyOnly`
- `sampledOnePly`
- `flatMonteCarlo` over a small shortlist

The fallback must reuse the same family-ordering logic as MCTS so behavior stays coherent across budgets.

### 3.12 Tune Direct-Mode Evaluation Signal

Once direct/heuristic evaluation becomes the default for expensive games, `heuristicTemperature`, `heuristicBackupAlpha`, `minIterations`, and root stop thresholds become more important.

The previous draft ignored this. It should not.

Required work:
- add diagnostics for raw-score spread and post-sigmoid reward spread
- retune `heuristicTemperature` for direct mode so rewards are not crushed toward 0.5
- lower `minIterations` and root-stop thresholds for low-budget profiles
- keep these settings profile-specific rather than one-size-fits-all

### 3.13 Deterministic Root Parallelization

Parallelization remains optional and comes late.

Requirements:
- split a fixed total iteration budget across workers before the search starts
- fork RNGs deterministically
- merge root results by stable `moveKey` order
- merge visits, availability, and reward totals; do not pretend the merged result is a reusable full tree
- if a caller demands strict determinism, do not use time-budget racing across workers

Parallel search is an accelerator, not a substitute for fixing the core algorithm.

## 4. Phases

### Phase 1 — Already Landed

Keep the existing shipped work:
- root/state classification caching
- direct evaluation as the FITL-safe default
- diagnostics for classification cache hits

Before any new phase starts, record fresh S1 and S3 baselines with the Phase 1 branch as the comparison point.

### Phase 2 — Sound Lazy Classification and Shortlisted Expansion

This is the real next step. It should happen before large cleanup work.

Work items:
- replace whole-state `MoveClassification` caching with incremental per-move caching
- cache `moveKey` and `familyKey` alongside `legalMoves()`
- implement sound availability checking
- implement ordered lazy expansion
- limit one-step candidate evaluation to a shortlist
- add differential tests: exhaustive path versus lazy path on the same state corpus
- add memory accounting / cache bounds for the richer state-info entries

Expected outcome:
- whole-state classify-all sweeps disappear on revisits
- materialization call count drops sharply
- no legality regressions

### Phase 3 — Family Widening, Pending Coverage, and Budget Profiles

Work items:
- add `familyKey()` and family-first widening at root / shallow depths
- add pending-family coverage rules
- replace old presets with budget profiles, not with “one config”
- add explicit fallback policies for very small budgets
- retune direct-mode evaluation signal and root-stop thresholds
- add tests that pending families receive visits in the FITL stress scenarios

Expected outcome:
- pending FITL operations stop starving
- human-facing profiles always return inside budget
- search behavior becomes robust under limited iterations

### Phase 4 — Decision Discovery and Classification Hotspot Optimization

Work items:
- add `legalChoicesDiscover()` diagnostics and caching
- add subphase diagnostics inside `legalChoicesEvaluate()` / discovery
- implement compiled decision-plan / predicate caches
- add per-state query indexes if diagnostics justify them
- benchmark whether classifier cost drops enough to matter after Phase 2 and 3

Expected outcome:
- reduced cost per classification/discovery call
- better visibility into the next real bottleneck after lazy search lands

### Phase 5 — Modular Cleanup

Cleanup is now safe, because the architecture is clearer.

Work items:
- extract leaf evaluators into separate modules
- move rollout-specific config under rollout-only types
- move `resolveDecisionBoundary()` to a non-rollout module
- deprecate old preset names
- remove only code that is truly unreachable after modularization

Important:
- do not delete rollout or MAST just because FITL defaults away from them
- do remove dead top-level config fields once they are moved under strategy-specific config objects

### Phase 6 — Optional Deterministic Parallel Search

Only start this after Phase 2–4 metrics show that single-threaded search is sound and measurably better.

Work items:
- implement fixed-iteration root parallelism
- add determinism tests for repeated runs with the same seed and worker count
- add broad wall-clock benchmarks for background profile only

Expected outcome:
- faster background decisions
- no change to deterministic single-thread behavior

## 5. Configuration Changes

The top-level config should become cleaner by moving strategy-specific knobs under strategy objects, not by deleting capabilities.

Target shape:

    interface MctsConfig {
      iterations: number
      minIterations?: number
      timeLimitMs?: number
      explorationConstant: number
      maxSimulationDepth: number
      progressiveWideningK: number
      progressiveWideningAlpha: number
      solverMode: 'off' | 'perfectInfoDeterministic2P'
      compressForcedSequences?: boolean
      classificationPolicy?: 'auto' | 'exhaustive' | 'lazy'
      leafEvaluator?: LeafEvaluator
      wideningMode?: 'move' | 'familyThenMove'
      pendingFamilyQuotaRoot?: number
      maxVariantsPerFamilyBeforeCoverage?: number
      heuristicTemperature?: number
      heuristicBackupAlpha?: number
      decisionWideningCap?: number
      decisionDepthMultiplier?: number
      enableStateInfoCache?: boolean
      maxStateInfoCacheEntries?: number
      rootStopConfidenceDelta?: number
      rootStopMinVisits?: number
      fallbackPolicy?: 'none' | 'policyOnly' | 'sampledOnePly' | 'flatMonteCarlo'
      parallelWorkers?: number
      diagnostics?: boolean
      visitor?: MctsSearchVisitor
    }

Notes:
- `classificationPolicy: auto` should use exhaustive behavior only when branching is small and measured classification cost is cheap.
- `wideningMode: familyThenMove` should be the default for expensive/high-branching games.
- rollout-specific fields move under `leafEvaluator: { type: 'rollout', ... }`.
- if `templateCompletionsPerVisit` is rollout-only in the codebase, move it under rollout config too. If not, audit its surviving callers before removal.
- `maxSimulationDepth` remains top-level as a general depth cap (used by both rollout and decision tree exploration bounds). The `rollout` variant of `LeafEvaluator` includes its own `maxSimulationDepth` which, when specified, overrides the top-level value during rollout evaluation only.
- `progressiveWideningK` (default 2.0) and `progressiveWideningAlpha` (default 0.5) are existing required fields — they must not be dropped.
- `solverMode` (`'off' | 'perfectInfoDeterministic2P'`) is an existing field controlling solver integration — must not be dropped.
- `compressForcedSequences` controls 1-move sequence compression during selection/simulation — must not be dropped.

## 6. Verification

### 6.1 Correctness Gates

1. Differential corpus:
   - On existing FITL stress scenarios (S1 — T1 VC Burning Bonze, S3 — T2 NVA Trucks) from `reports/mcts-fitl-performance-analysis.md`, plus any additional scenarios added during development, exhaustive classification and lazy classification must produce the same per-move statuses. A cheap/simple game scenario for MCTS does not yet exist and should be created as part of Phase 2 testing.

2. Availability soundness:
   - No child may be selected unless it is “known available” in the current state.
   - Add tests covering `illegal`, `pending`, and `pendingStochastic` classifications.

3. Hidden-info safety:
   - No cross-world classification reuse without a valid state/determinization hash.

4. Parallel determinism:
   - Fixed-iteration parallel search must be repeatable for a fixed seed and worker count.

### 6.2 Performance Gates

CI should not rely on 20–45 minute workflows as the canonical proof of health. Replace them with:

- a deterministic profiler workflow using fixed iterations and diagnostics assertions
- a competence workflow using budget profiles
- optional longer-running nightly analysis jobs

Required metrics:
- `materializeCallCount / iteration` drops materially versus the Phase 1 baseline
- selection no longer performs full-state classify-all sweeps on revisits under lazy mode
- `decisionDiscoverTimeMs` is exposed before pending coverage is relied on
- at least one pending family receives visits in the FITL stress scenarios
- wall-clock runtime improves, but CI gates should prefer relative call-count reductions and broad upper bounds over brittle tight timing thresholds

### 6.3 Standard Validation

After each phase:

    pnpm turbo build
    pnpm turbo test
    pnpm turbo lint
    pnpm turbo typecheck

## 7. Key Files

| File | Change |
|---|---|
| `config.ts` | Replace old preset semantics with budget profiles; move rollout options under strategy config; add classification/fallback/family-widening config |
| `state-cache.ts` | Incremental per-move classification cache; cached move infos; memory bounds |
| `move-key.ts` | `familyKey()` / `abstractMoveKey()` support |
| `search.ts` | Sound lazy selection, ordered lazy expansion, family widening, fallback entry points |
| `materialization.ts` | On-demand classification helpers; shortlist support |
| `decision-boundary.ts` | **NEW FILE** — New home for `resolveDecisionBoundary()` |
| `diagnostics.ts` | Decision discovery metrics, classification subphase metrics, family-coverage metrics |
| `rollout.ts` | Keep as optional leaf evaluator module, not a hard-coded default |
| `mast.ts` | Keep only behind rollout evaluator; do not load for direct profiles |
| `mcts-agent.ts` | Budget profile resolution, fallback policy, optional parallel wiring |
| `parallel.ts` | **NEW FILE** — Fixed-iteration deterministic root parallelism |
| `.github/workflows/engine-mcts-fitl-fast.yml` | Update preset name when profiles change |
| `.github/workflows/engine-mcts-fitl-default.yml` | Update preset name when profiles change |
| `.github/workflows/engine-mcts-fitl-strong.yml` | Update preset name when profiles change |
| `.github/workflows/engine-mcts-e2e-fast.yml` | Update preset name when profiles change |
| `.github/workflows/engine-mcts-e2e-default.yml` | Update preset name when profiles change |
| `.github/workflows/engine-mcts-e2e-strong.yml` | Update preset name when profiles change |

## 8. Risks and Mitigations

### 8.1 Family Widening Can Hide Important Variants

Risk:
- Grouping by family can underexplore cases where parameter values matter a lot.

Mitigation:
- use family-first widening only at shallow depths or high-cardinality nodes
- allow automatic fallback to ordinary move-level widening when family counts are small
- benchmark at least one cheap/simple game alongside FITL

### 8.2 Lazy Expansion Changes Search Semantics

Risk:
- The search will no longer compute an exact best unexpanded candidate by full exhaustive ranking.

Mitigation:
- keep an exhaustive policy for cheap games
- differential-test lazy vs exhaustive on recorded state corpora
- use shortlist evaluation rather than purely random frontier order

### 8.3 Decision Discovery May Become the New Bottleneck

Risk:
- Once pending moves finally get visits, `legalChoicesDiscover()` may absorb the time savings.

Mitigation:
- instrument and cache it as part of the main plan, not later

### 8.4 Direct Mode Quality Can Regress

Risk:
- Faster search is useless if the direct heuristic signal is too flat or too weak.

Mitigation:
- retune temperature / backup parameters
- keep rollout evaluation available for cheap games
- preserve competence tests, not just runtime tests

## 9. Optional Follow-Ons

These are explicitly outside the critical path, but they fit the same direction and may become high value after the core work lands:

- Subtree reuse between consecutive decisions in the same match
- Exact-state transposition reuse beyond the current state-info cache
- Observation-hash / information-set caching for hidden-information games
- Optional search metadata in compiled game definitions to help family grouping without hard-coding game-specific logic

## 10. Summary

The original draft correctly identifies redundant classification as the central waste, but it overreaches in three places: it deletes rollout support too aggressively, it uses an unsafe availability shortcut, and it still does not truly solve pending-move starvation. The corrected plan keeps the good part — lazy, cached, on-demand classification — and adds the missing pieces:

- sound availability semantics
- family-first widening and pending coverage
- shortlist-based expansion instead of exact exhaustive ranking
- budget profiles plus explicit fallbacks
- classifier/discovery hotspot instrumentation
- deterministic parallelism only after the single-threaded core is fixed

That is the path that is both faster and still faithful to the engine’s constraints.