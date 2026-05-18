# Spec 181 — Structured Strategy Policy Layer Phase 0/1: Audit Probe Harness and First-Class Selectors

**Status**: PROPOSED
**Priority**: High — closes the two-month FITL/ARVN authoring pain documented in `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` and `reports/ai-agent-overhaul-proposal.md` by adding the missing "middle layer" between flat considerations and policy intent, and by short-cutting the 15-seed tournament feedback loop.
**Complexity**: M–L — two independently mergeable phases. Phase 0 (probe harness) is S–M and unblocks fast iteration on everything that follows. Phase 1 (selectors) is M–L and is the load-bearing expressiveness fix.
**Date**: 2026-05-18
**Dependencies**:
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (named role primitives `currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind`, outer-preview availability modes, per-seat trace matrix — substrate for selector quality components)
- `archive/specs/162-preview-signal-integrity.md` (Foundation #20 — preview-derived selector components must declare explicit fallback)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry pattern — selector cost classes follow the same shape)
- `archive/specs/122-cross-seat-victory-aggregation.md` (`seatAgg`, `$seat`, `over: opponents` IR — selectors may consume these but do not replace them)
- `archive/specs/121-two-phase-policy-evaluation.md` (phase1/phase2 scoring — selector refs become available to existing considerations)
- `archive/specs/113-preview-state-policy-surface.md` (per-seat preview surface — substrate for quality components)
- `archive/specs/105-explicit-preview-contracts.md` (preview fallback contract — selector components inherit)
- `archive/specs/104-unified-decision-context-considerations.md` (consideration scoping — selectors honor `scopes: [move, microturn]`)

**Trigger reports**:
- `reports/ai-agent-overhaul-proposal.md` (external ChatGPT-Pro deep-research proposal reassessed by this spec — see §12)
- `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (original pain witness — Phase 0 encodes its property form)

**Ticket namespace**: `181STRPOLLAY` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Two architectural upgrades that, taken together, give profile authors a way to express strategy as named, inspectable units and shorten the iteration loop from days (15-seed tournaments) to seconds (deterministic property assertions over curated states):

1. **Audit probe harness (Phase 0).** A deterministic test runner that loads a probe spec — `(game, profile, seat, stateBinding, decisionBinding, assertions)` — drives the kernel/agent to the bound decision, and evaluates property-form assertions over the selected candidate, trace, and preview status. Probes live alongside the existing `policy-profile-quality/` corpus. Default severity is profile-quality warning; architectural-invariant probes can hard-gate per Foundation #16 and the Appendix.

2. **First-class selectors (Phase 1).** A new compiled IR primitive that ranks a finite collection of entities, microturn options, candidate params, or a bounded product (origin/destination, piece/target) by a quality expression with named components. Selectors expose generic refs (`selector.<id>.selected.{quality,rank,components}`, `selector.<id>.impactSatisfied`) that any existing consideration, condition, or aggregate can consume. The kernel does not learn any game semantics: zones, tokens, cards, players, and game-authored finite collections are bound by id; quality components are expressions over already-existing state, preview, lookup, and standing-role refs.

The proposal's higher-level layers — strategic modules (composition), guardrails with severity tiers (separate negative-evidence layer), turn-shape evaluators, and the evolution-loop overhaul — are deferred to named follow-on specs (§11). Each of those layers depends on selectors as its primary input surface, so selectors must land first.

## 2. Non-Goals

- **No strategic-module IR in this spec.** The proposal's `strategyModules:` block is a useful composition layer but adds no expressive power without selectors underneath. Deferred to Spec 182.
- **No guardrail severity tiers.** Today the only negative-evidence mechanism is binary `pruningRules`. Adding `prune | demote | warn | auditOnly` is a real gap and worth its own spec; deferred to Spec 183.
- **No turn-shape evaluators.** Bounded chain summaries that reuse existing preview need named objectives to evaluate against; that grammar belongs with modules. Deferred to Spec 184.
- **No evolution-loop changes.** Acceptance-criteria composite, weight-soup lint, and quality-diversity archive are evolution-pipeline concerns, not engine concerns. Deferred to Spec 185.
- **No runtime planner.** MCTS, HTN, GOAP, and runtime behavior-tree ticking are explicitly out — they would violate Foundation #10 (bounded computation) and Foundation #18 (constructibility). The proposal correctly rejects them and so does this spec.
- **No game-specific engine logic.** Selectors operate on game-authored collection ids (`zones`, `tokens`, `cards`, `players`, any game-declared finite collection) and standing-role primitives from Spec 180. The engine does not learn "Govern", "Train", "ARVN", or any other FITL concept.
- **No new cap-class tier.** Selectors with preview-derived components reuse Spec 164's `standard256`/`deep1024` registry; preview-free selectors compile to `state` / `candidate` / `microturn` cost classes.
- **No raw-effect shortcut.** Quality components that depend on projected state must consume already-existing preview refs. A selector MUST NOT trigger a separate preview drive of its own; if a needed projected value is not already published as a preview ref, the author writes a preview ref first and the selector consumes it.
- **No new cookbook migration of ARVN.** This spec ships exactly one ARVN consideration rewritten to use a selector as conformance proof. A broader cookbook + profile-migration spec is deferred (likely part of Spec 182).
- **No FOUNDATIONS.md amendment.** §10 documents alignment; the existing principles cover the proposed primitives.

## 3. Context (verified against codebase)

### 3.1 The expressiveness gap

`data/games/fire-in-the-lake/92-agents.md` shows the current ARVN profile as a flat list of action-tag-weighted considerations plus scalar state/candidate features. Every iteration that found a strategic gap (target quality, pair evaluation, set-level chooseNStep intelligence) required either a new feature ref or a new code primitive in `packages/engine/src/agents/*`. The May-17 report (`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) showed the limit case: ARVN selected Govern 75% of decisions across 15 seeds (159 main-phase decisions) and NVA projected margin was 100% uniform across candidates, so even where preview was honest the policy could not use it to discriminate. There is no first-class "rank these targets by these components" primitive; authors emulate one by stacking scalar terms, which the proposal correctly characterises as utility-soup.

Inspecting `packages/engine/src/cnl/compile-agents.ts` and `packages/engine/src/contracts/policy-contract.ts` confirms `AGENT_POLICY_LIBRARY_BUCKETS` covers `stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `considerations`, `tieBreakers`, `strategicConditions`. No `selectors` bucket. No collection-ranking IR. `packages/engine/src/agents/policy-standing-roles.ts` (Spec 180) gives generic role tokens but no way to rank arbitrary collections.

### 3.2 The feedback-loop gap

`packages/engine/test/policy-profile-quality/` is a strong corpus, but every test is a full-game tournament or seed-driven simulation: `arvn-evolved-convergence.test.ts`, `fitl-variant-all-baselines-convergence.test.ts`, `fitl-spec-143-*.test.ts`. The trigger report itself had to write an ad-hoc aggregation script to produce the per-seat readyRefStats table that diagnosed the original bug. There is no harness that says "drive policy P on state S to decision D and assert property X about the selected candidate, in <100 ms"; every regression-witness loop today is "rerun the 15-seed tournament and squint at the trace bundle".

### 3.3 What spec-180 just landed

Spec 180 (`archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md`, COMPLETED 2026-05-17) shipped:
- named role primitives (`currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind`) usable inside `seatAgg.over` and as standalone refs,
- explicit author-facing `availability` modes on `seatAgg`,
- per-candidate × per-seat trace matrix in `previewUsage`,
- bounded ordinary-operation standing projection,
- a Foundation #20 extension for the outer-preview seat-aggregate path.

This is the load-bearing substrate for selector quality components that depend on opponent-aware evidence. Selector authoring of the shape "rank zones by leader-denial × self-gain × objective-pressure" is now expressible *as quality components*; what is missing is the bounded ranking primitive that turns those components into a comparable, traceable per-candidate decision.

### 3.4 What ChatGPT-Pro's proposal got right and wrong

Right: diagnosis of utility-soup as the failure mode; identification of selectors as the missing middle layer; insistence on game-agnostic primitives, bounded products with `maxPairs`, explicit preview fallback, separate negative-evidence layer, deterministic property-based probes over curated states; explicit rejection of MCTS/HTN/GOAP/runtime BTs.

Wrong or stale: the proposal cites "non-archived spec-179" as already pointing toward generic standing roles. Spec-179 is archived/DEFERRED; the live substrate is spec-180 (just completed). The proposal also describes the evolution loop as mutating "numeric weights only"; in fact `.claude/skills/improve-loop` + `campaigns/fitl-arvn-agent-evolution/program.md` already mutate YAML structure (new conditions, new pruning rules, new aggregates). The proposal's "structure first" recommendation is a re-ordering of an already-structural loop, not the introduction of structural mutation. These corrections do not change the architectural recommendations but they do change which specs are deferred vs. already complete.

## 4. Architecture — Phase 0: Audit Probe Harness

### 4.1 Probe directory and runner

Probes live under `packages/engine/test/policy-profile-quality/probes/<game>/`. Each probe is a TypeScript module that exports one or more `Probe` objects via a small declarative API. A single `<game>.probes.test.ts` per-game test file iterates the probe set; per-probe failures emit `POLICY_PROFILE_QUALITY_REGRESSION` warnings consistent with the Appendix unless `severity: 'architecturalInvariant'` is set, in which case the test fails normally and gates CI.

A probe shape (illustrative):

```ts
defineProbe({
  id: 'arvn-action-distribution-not-dominated',
  game: 'fire-in-the-lake',
  profile: 'arvn-evolved',
  seat: 'ARVN',
  stateBinding: {
    scenario: 'fitl-default',
    seedRange: { start: 1000, end: 1014 },        // 15 seeds
    decisionFilter: { phase: 'main' },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',                          // collect across all matched decisions
  },
  assertions: [
    {
      kind: 'actionFamilyDistributionBelow',
      family: 'any',                              // strongest action family by tag-set
      threshold: 0.60,                            // no single family exceeds 60%
      windowMinDecisions: 100,
    },
    {
      kind: 'selectedNotByReason',
      reason: 'tiebreakAfterPreviewNoSignal',
      maxRate: 0.10,
    },
  ],
  severity: 'profileQuality',
  tags: ['action-distribution', 'arvn-evolved'],
});
```

`stateBinding` accepts `seed` or `seedRange`, plus optional `replayPrefix` (replay a known decision prefix to reach a target state cheaply) and optional `expectedStateHash` (probe pinning). `decisionBinding.occurrence` accepts `first` | `every` | `nth` for cases where a probe targets one specific decision vs. an aggregate over many.

### 4.2 Assertion library (initial set)

| Assertion kind | Purpose |
| --- | --- |
| `selectedCandidateHasTag` / `lacksTag` | Selected action must (not) carry a given action tag |
| `selectedCandidateRankWithinTopK` | Selected candidate's score rank ≤ K under default scoring |
| `selectedTargetSatisfiesSelector` | Selected candidate's primary target satisfies a named selector (requires Phase 1) |
| `selectedSeatTargetMatchesRole` | Selected candidate targets the seat resolved by a named standing role (consumes Spec 180) |
| `previewRefStatusIn` | Named preview ref's status is in `{ready, unavailableWithFallback, ...}` |
| `selectedNotByReason` | Selected candidate's `selectedBy` reason is not the given value above a max rate |
| `actionFamilyDistributionBelow` | Over a window of decisions, no single action family exceeds threshold |
| `traceContainsField` | Trace exposes the named field with non-empty value |
| `traceHasAdvisory` / `lacksAdvisory` | Named advisory is present / absent in trace |
| `guardrailFired` / `notFired` | (Reserved; activates when Spec 183 lands) |

The library is intentionally minimal; subsequent specs can extend it.

### 4.3 Runner contract

The probe runner uses the existing kernel/agent path with no preview shortcut: it calls `applyPublishedDecision` for replay prefixes, drives the bound profile through real `pickInnerDecision`/`scoreCandidate` code paths, and inspects the resulting `PolicyAgentDecisionTrace`. No private engine APIs, no policy fixtures that bypass the canonical scoring pipeline. Determinism is per Foundation #8: same probe definition + same engine version + same kernel + same seed = bit-identical assertion outcomes.

### 4.4 Failure semantics

Profile-quality probes emit `POLICY_PROFILE_QUALITY_REGRESSION` summary entries; the test reports the count and surfaces the offending probe id in a non-blocking CI summary. Architectural-invariant probes (e.g., "every published candidate is constructible at its microturn scope") fail the test normally. The distinction matches the existing Appendix and avoids re-introducing the dual-duty anti-pattern Specs 136/139 closed.

## 5. Architecture — Phase 1: First-Class Selectors

### 5.1 New library bucket

`AGENT_POLICY_LIBRARY_BUCKETS` gains a new entry: `selectors`. Compiled selector defs live alongside `stateFeatures`, `candidateFeatures`, etc.; they participate in the dependency-cycle check already implemented in `compile-agents.ts:2431`.

### 5.2 Compiled IR shape

```ts
type SelectorDef = {
  readonly id: SelectorId;                       // branded string
  readonly scopes: ReadonlyArray<'move' | 'microturn'>;
  readonly source: SelectorSource;
  readonly where?: BoolExpr;
  readonly quality?: QualitySpec;
  readonly minImpact?: BoolExpr;
  readonly result: ResultSpec;
  readonly costClass: SelectorCostClass;          // derived; recorded for reproducibility
};

type SelectorSource =
  | { kind: 'collection'; collection: CollectionRef; key?: KeyBinding }
  | { kind: 'product';    left: CollectionRef; right: CollectionRef; maxPairs: number }
  | { kind: 'microturnOptions' }                 // ranks the current chooseOne/chooseNStep options
  | { kind: 'candidateParams'; param: CandidateParamRef };

type CollectionRef =
  | { kind: 'zones' }
  | { kind: 'tokens'; tokenType?: TokenTypeId }
  | { kind: 'cards';  deck?: DeckRef }
  | { kind: 'players' }
  | { kind: 'authoredFinite'; collectionId: GameAuthoredCollectionId };

type QualitySpec = {
  readonly components: ReadonlyArray<QualityComponent>;
  readonly order: 'qualityDesc' | 'qualityAsc';
};

type QualityComponent = {
  readonly id: ComponentId;
  readonly value: NumericExpr;                   // may reference state/candidate/preview/lookup/standing refs
  readonly weight: number;
  readonly previewFallback?: PreviewFallbackPolicy; // mandatory when value transitively depends on preview refs
};

type ResultSpec = {
  readonly maxItems: number;                     // mandatory; ≤ MAX_SELECTOR_RESULT_ITEMS
  readonly order: ReadonlyArray<'qualityDesc' | 'qualityAsc' | 'stableKeyAsc' | 'stableKeyDesc'>;
  readonly onEmpty: 'noContribution' | 'traceAndNoContribution' | 'demote';
};

type SelectorCostClass = 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly';
```

`MAX_SELECTOR_RESULT_ITEMS` is a kernel constant (initial value 32). `maxPairs` is per-product mandatory and capped by `MAX_SELECTOR_PRODUCT_PAIRS` (initial value 256). Both caps are statically named per Foundation #10's cap-class clause and recorded in the compiled artifact metadata so replay can assert which cap was active.

### 5.3 Generic refs exposed by a selector

| Ref | Type | Available in scope |
| --- | --- | --- |
| `selector.<id>.selected.matches` | boolean | any |
| `selector.<id>.selected.key` | string (stable) | any |
| `selector.<id>.selected.quality` | number | any |
| `selector.<id>.selected.rank` | number (1-based) | any |
| `selector.<id>.selected.component.<componentId>` | number | any |
| `selector.<id>.impactSatisfied` | boolean | any |
| `selector.<id>.candidate.<key>.quality` | number | candidate iteration only |
| `selector.<id>.size` | number | any |

Refs are resolved by the existing `policy-evaluation-core.ts` ref-resolution pipeline; selectors slot in alongside features, aggregates, and standing roles.

### 5.4 Cost-class derivation and enforcement

The compiler derives `costClass` from the deepest dependency in `quality.components[*].value`, `where`, `minImpact`:

- `auditOnly` if the selector is referenced only by audit-mode trace producers (reserved for future use).
- `preview` if any component transitively reads a preview ref.
- `microturn` if the selector binds to `microturnOptions` or its source is iterated per-microturn.
- `candidate` if any component reads candidate-scoped refs.
- `state` otherwise.

Preview-cost selectors MUST consume already-published preview refs; the runtime MUST NOT trigger an additional preview drive on behalf of a selector. Compiler error `SELECTOR_REQUIRES_UNREGISTERED_PREVIEW_REF` fires when a preview ref read by a component is not part of the profile's declared preview drives.

### 5.5 Compiler diagnostics (initial set)

Scoped to the new bucket; integrated into the existing `cnl/compiler-diagnostic-codes.ts` registry:

| Diagnostic code | Trigger |
| --- | --- |
| `CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN` | `source.collection` or `source.authoredFinite.collectionId` not resolvable |
| `CNL_COMPILER_AGENT_SELECTOR_SOURCE_NOT_FINITE` | Source has no compile-time-known finite cardinality |
| `CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MISSING_MAXPAIRS` | Product source omits `maxPairs` |
| `CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MAXPAIRS_EXCEEDS_CAP` | `maxPairs` > `MAX_SELECTOR_PRODUCT_PAIRS` |
| `CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP` | `result.maxItems` missing or > `MAX_SELECTOR_RESULT_ITEMS` |
| `CNL_COMPILER_AGENT_SELECTOR_ONEMPTY_MISSING` | `result.onEmpty` not set |
| `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK` | Component reads a preview ref without `previewFallback` (matches Foundation #20) |
| `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_NONDETERMINISTIC_ORDER` | `result.order` lacks a deterministic tie-breaker |
| `CNL_COMPILER_AGENT_SELECTOR_REF_UNKNOWN` | Selector references unknown collection/feature/role |
| `CNL_COMPILER_AGENT_SELECTOR_BINDING_TYPE_MISMATCH` | `key.from` type does not match selector source type (e.g., binding `microturn.option.value` of non-`ZoneId` shape to a zone selector) |
| `CNL_COMPILER_AGENT_SELECTOR_REQUIRES_UNREGISTERED_PREVIEW_REF` | Component depends on a preview ref that no declared drive will publish |
| `CNL_COMPILER_AGENT_SELECTOR_DEPENDENCY_CYCLE` | Selector refers to itself transitively |
| `CNL_COMPILER_AGENT_SELECTOR_COST_CLASS_EXCEEDS_LIMIT` | Derived cost class exceeds the profile's declared `selector.maxCostClass` |

### 5.6 Runtime evaluation

A selector is resolved at most once per `(decisionId, candidateId-if-candidate-scoped)` and cached for the rest of that decision. Caching is keyed by the deterministic input set (state hash, candidate hash, preview ref status snapshot) and invalidated automatically by the existing `policy-eval.ts` per-decision lifecycle. Trace integration: the selected candidate's selector contribution lands in `PolicyAgentDecisionTrace` as a sibling of existing consideration trace under a new `selectors` field, capped at top-K selected entries per selector.

## 6. Data flow

```
                                                       per-candidate consideration scoring
                                                                       │
profile YAML  ─► compile-agents.ts ─► AgentPolicyLibrary               ▼
                                          │                ┌─►  selector.<id>.selected.* refs
                                          │                │      │
                                          │   evaluateSelector()    ├─► consumed by considerations / aggregates / conditions
                                          │   per (decision, scope) │
                                          ▼                │      │
                       PolicyEvaluationCore ───────────────┘      ▼
                                                                consideration weights + selector contributions
                                                                                 │
                                                                                 ▼
                                                                  pickInnerDecision / scoreCandidate
                                                                                 │
                                                                                 ▼
                                                                          published decision + trace
```

Selectors evaluate during the existing two-phase policy evaluation (Spec 121). Phase 1 (state-cost) selectors evaluate once per decision; phase 2 (candidate / microturn / preview cost) selectors evaluate per candidate. Existing considerations gain selector refs as new inputs without any change to consideration scoring code; the new layer is purely additive at the IR level.

## 7. Edge cases

- **Empty selector source after `where`**: Honor `result.onEmpty`. `noContribution` zeroes downstream selector refs (returning `undefined` for `selector.<id>.selected.quality`, satisfying Foundation #20's "unavailable preview refs must not silently coerce" via the new `previewFallback` on each component). `traceAndNoContribution` additionally emits a `POLICY_SELECTOR_EMPTY` trace entry. `demote` applies a configurable penalty to candidates whose `where` clause matches but no selector item survives.
- **All components unavailable**: `selector.<id>.selected.matches` is `false`; `selector.<id>.impactSatisfied` is `false`. Considerations consuming these refs must declare their own fallback (same posture as existing preview refs).
- **Pair-selector bounded truncation**: When the product would exceed `maxPairs`, the compiler emits a hard error at the cap; at runtime, the product is materialised in stable order (`left.stableKeyAsc, right.stableKeyAsc`) and truncated at `maxPairs`. Truncation emits a `POLICY_SELECTOR_PRODUCT_TRUNCATED` advisory the first time it fires per `(decisionId, selectorId)`.
- **Heterogeneous microturn option types**: `kind: 'microturnOptions'` requires the runtime option type to be uniform across the current option set. If options are heterogeneous (e.g., chooseOne with mixed `ZoneId`/`CardId` payloads), compiler error `SELECTOR_BINDING_TYPE_MISMATCH` fires when the selector tries to interpret `microturn.option.value` as a fixed type. Authors can declare per-payload-shape selectors and union them inside a consideration.
- **Selector inside chooseNStep continuation**: A microturn-scoped selector evaluates against the *currently published* option set at each beam node; cached results from prior beam nodes are not reused across continuation steps (correctness over cost). This is bounded by Spec 161's beam width × Spec 164's depth cap.
- **Stable ordering with float quality**: Per Foundation #8, all numeric ops are exact integers. Quality is computed as integer-weighted sums; ties break by `result.order[1..]`, with `stableKeyAsc` as a mandatory final tie-breaker (compiler enforces).
- **Selector referenced only inside a pruning rule**: Cost class is forced to `candidate` minimum so the selector evaluates before pruning decides; selectors used only for pruning are still cached for downstream consumption.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance criteria | Effort |
| --- | --- | --- | --- |
| **Phase 0** — Audit probe harness | `packages/engine/test/policy-profile-quality/probes/` runner; `defineProbe` API; assertion library §4.2; one game-agnostic probes test file per game with probes; documentation entry in `docs/agent-dsl-cookbook.md` | (a) Runner ships and is invoked by `pnpm turbo test` automatically; (b) at least the ARVN action-distribution probe encoded in §4.1 ships against the existing `arvn-evolved` profile; (c) at least one architectural-invariant probe (e.g., "every published candidate is constructible") ships and gates CI; (d) determinism test: probe re-runs produce bit-identical assertion outcomes; (e) probe runner overhead < 200 ms per probe at default trace level. | S–M |
| **Phase 1** — First-class selectors | New `selectors` library bucket; compiled IR §5.2; runtime evaluation §5.6; compiler diagnostics §5.5; trace integration; cookbook entry | (a) All §5.5 diagnostic codes have at least one positive-trigger test in `packages/engine/test/cnl/`; (b) conformance: one zone-collection selector test against FITL, one card-collection selector test against Texas Hold'em, one declared-product (origin/destination) selector test against a fixture game (Foundation #16 game-family coverage); (c) one ARVN consideration is migrated to use a selector and the Phase 0 ARVN distribution probe still passes (or improves) — migration is the smallest one that removes a target-quality flat term; (d) cost-class enforcement test asserts compiler rejects selectors whose derived cost class exceeds the profile's declared limit; (e) replay determinism: a selector-using profile produces bit-identical decisions across two runs at the same seed. | M–L |

Each phase is independently mergeable. Phase 0 ships first because Phase 1's conformance tests (criterion (c)) consume the probe harness.

## 9. Test plan

- **Compiler diagnostic coverage**: One test per §5.5 diagnostic code in `packages/engine/test/cnl/agent-selector-diagnostics.test.ts`.
- **Runtime determinism**: Replay test in `packages/engine/test/determinism/` asserting that a profile using a non-trivial selector produces bit-identical decision streams across two runs.
- **Selector cost-class enforcement**: Test asserting that the compiler-derived cost class matches an expected value per fixture profile, and that profiles declaring a lower `selector.maxCostClass` reject higher-class selectors.
- **Probe runner replay-prefix correctness**: Test that `stateBinding.replayPrefix` reaches the same state hash as a fresh run of the same decision prefix.
- **Conformance corpus per Foundation #16**: Selector usage tested across FITL (asymmetric, hidden-info, area-control), Texas Hold'em (hidden-info, stochastic), and a fixture game (perfect-info).
- **ARVN profile migration**: The migrated consideration is exercised by an `arvn-evolved` integration test that asserts the new selector produces the same or better score for at least one regression-witness seed.
- **Trace shape**: Test that the new `selectors` field in `PolicyAgentDecisionTrace` honors the top-K cap and stable ordering.
- **Probe-runner negative tests**: A probe whose assertion is intentionally violated must emit `POLICY_PROFILE_QUALITY_REGRESSION` and surface in the test summary.

## 10. Foundation alignment

| Foundation | How the design respects it |
| --- | --- |
| **#1 Engine Agnosticism** | Selectors operate on game-authored collection ids (`zones`, `tokens`, `cards`, `players`, `authoredFinite`). The kernel learns no game semantics; FITL/ARVN tags and standing-role roles are profile data. Probe assertions live in `policy-profile-quality/probes/<game>/` which is per-game test data, not engine code. |
| **#2 Evolution-First Design** | The new `selectors` library bucket is YAML-authorable inside GameSpecDoc agent definitions. Selector defs are part of evolution's mutation surface; no new artifact outside YAML carries selector configuration. |
| **#5 One Rules Protocol** | Selectors rank candidates from the existing published legal frontier; they never create or hide actions. Microturn-bound selectors operate on `microturn.options` produced by the same kernel pipeline that serves human clients and simulator agents. |
| **#7 Specs Are Data** | All selector IR is declarative. No `eval`, no embedded scripts, no runtime callbacks. Quality components are NumericExpr nodes already validated by the compiler. |
| **#8 Determinism Is Sacred** | Selector evaluation is pure; quality is integer arithmetic; ordering requires deterministic tie-breakers; cache keys are state/preview-status snapshots. Probe runner re-runs are bit-identical. |
| **#10 Bounded Computation** | `maxItems`, `maxPairs` mandatory; selector cost class derived and recorded; preview-cost selectors must consume registered preview drives (no implicit expansion). Per Spec 164's cap-class clause, `MAX_SELECTOR_RESULT_ITEMS` and `MAX_SELECTOR_PRODUCT_PAIRS` are statically named in compiled artifact metadata. |
| **#16 Testing as Proof** | Conformance corpus spans three game families per Phase 1 acceptance (c). Probe harness itself is a Foundation #16 facility (architectural-invariant probes proven, profile-quality probes observed). |
| **#18 Constructibility Is Part of Legality** | Selectors do not introduce new constructibility paths; they rank what the kernel publishes. An architectural-invariant probe in Phase 0 asserts that selector use does not change the published candidate set. |
| **#20 Preview Signal Integrity** | Quality components reading preview refs MUST declare `previewFallback`; the compiler enforces. Selector `result.onEmpty` makes "no item satisfies the impact criterion" a distinct outcome rather than silent zero. The new layer cannot pretend bounded preview is ready preview. |

**No FOUNDATIONS.md amendment proposed.** The existing principles cover the new primitives. Spec 180 already extended Foundation #20 for the standing-role substrate this work consumes.

## 11. Out of scope (named follow-on specs)

- **Spec 182 — Strategic Modules**. Composition layer that groups `(activation conditions, applicable scopes, selectors, scoreGroups, fallback)` into named modules with trace labels. Adds priority bands if traces from the selector cookbook show flat selector ranking obscures intent. Dependency: requires Phase 1 selectors as input surface. Includes the broader cookbook migration the proposal contemplates.
- **Spec 183 — Guardrails with severity tiers**. Separate negative-evidence layer with `prune | demote | warn | auditOnly`. `prune` requires `safe: true` + `onAllPruned` per the proposal §6.4. Most guardrail predicates need selector outputs (`target failed selector minimum quality`, `selected origin loses more value than destination gains`), so this depends on Spec 181 Phase 1.
- **Spec 184 — Turn-shape evaluators**. Bounded summaries over already-existing inner-preview drives, with named objectives. Depends on Spec 182 modules (for the objective declarations) and Spec 181 Phase 0 (for property-form probes that validate them).
- **Spec 185 — Evolution-loop overhaul**. Acceptance composite (margin + win-rate + audit-probe score − blunder/no-signal/fallback/complexity/performance penalties), weight-soup lint diagnostics, MAP-Elites-style quality-diversity archive over behavior descriptors. Lives outside the engine in the campaign runner; depends on probe harness and selector trace surface for its new metrics.

## 12. Reassessment of source proposal

Per-recommendation disposition table for `reports/ai-agent-overhaul-proposal.md`. The proposal is architecturally sound and FOUNDATIONS-aligned; corrections are factual rather than directional.

| Proposal section / recommendation | Disposition | Notes |
| --- | --- | --- |
| §1 Hybrid architecture (keep scoring; add modules, selectors, guardrails, probes, structure-first evolution) | **Adopted with adjustment** — adopt selectors + probes in this spec; defer modules, guardrails, structure-first evolution to Specs 182, 183, 185. The proposal's own Stage ordering already supports this split. |
| §2 Diagnosis of failure mode (utility-soup, low-information preview, mixed action/target/mode choice, weak guardrails, sparse tournament margin, weak strategic trace) | **Adopted** — verified against `data/games/fire-in-the-lake/92-agents.md`, the May-17 report, and policy-eval source. Diagnosis is correct. |
| §3 Research synthesis (utility AI as leaf; BTs as modularity lesson only; HTN as authoring metaphor only; reject MCTS/GOAP runtime; quality-diversity for evolution) | **Adopted** — Foundation #10 and #18 already foreclose runtime planners; the proposal's rejections match this repo's constraints exactly. |
| §4 Structured Strategy Policy Layer stack (signals / selectors / modules / guardrails / turn-shape / probes / trace) | **Adopted with adjustment** — this spec ships signals (already present), selectors, and probes. Modules, guardrails, turn-shape deferred (§11). The trace contract extension lands incrementally per layer rather than in one block. |
| §5 Alternatives considered (flat + lint only / BT replacement / HTN / GOAP / MCTS / audit-traces-only / game-specific / structured) | **Adopted** — rejections match this spec's non-goals (§2). |
| §6.1 Strategic modules | **Deferred to Spec 182** — empty wrappers without selectors. Cleaner once Phase 1 selectors are live in profile YAML. |
| §6.2 Selectors | **Adopted as Phase 1** — see §5 of this spec. |
| §6.3 Pair selectors | **Adopted as Phase 1** — covered by `SelectorSource.product` with mandatory `maxPairs`. Conformance test (Phase 1 acceptance (b)) explicitly includes a product selector. |
| §6.4 Guardrails | **Deferred to Spec 183** — needs selector outputs as primary input. |
| §6.5 Turn-shape evaluators | **Deferred to Spec 184** — needs module-declared objectives. |
| §7 Target / microturn / turn-shape handling (incl. §7.5 chooseOne, §7.6 chooseNStep set-level primitives) | **Adopted with adjustment** — §7.1–§7.4 (target ranking, impact-vs-quality split, source-safety-vs-destination-value, no-impact handling) addressed by selector design (§5). §7.5 (chooseOne option metadata) already covered by existing chooseOne inner-preview. §7.6 set-level primitives (coverage, redundancy, diversity, completionValue, removeValue, marginalGain) deferred to Spec 182's set-level scoring module — selectors expose the per-option ranking those primitives compose over. |
| §8 Guardrails and anti-blunder system | **Deferred to Spec 183**. |
| §9 Policy audit harness | **Adopted as Phase 0** — see §4 of this spec. §9.4 anti-overfit guidance (property assertions over exact-action, holdout probes) baked into Phase 0 assertion library. |
| §10 Strategy trace and explanation contract | **Adopted with adjustment** — trace contract extends incrementally per layer. Phase 1 ships the selector trace surface (§5.6); module/guardrail/turn-shape trace lands with their respective specs. The proposal's top-K caps and interned-id discipline are honored. |
| §11 Evolution-loop changes (structure-first mutation order, composite acceptance, quality-diversity archive) | **Deferred to Spec 185** — corrects the proposal's stale "weights only" framing: `.claude/skills/improve-loop` already mutates structure. Re-ordering, composite acceptance, MAP-Elites archive are real improvements but belong in the evolution-pipeline spec. |
| §12 Validator and compiler requirements | **Adopted incrementally** — Phase 1 ships the selector subset (§5.5). Module/guardrail diagnostic codes land with Specs 182/183. Cost-class registry already exists (Spec 164). |
| §13 Performance model and benchmark gates | **Adopted as guidance** — Phase 1 acceptance includes a determinism gate; per-phase performance gates (the 5%/10%/2× thresholds) are operationalized as part of the evolution-loop spec (Spec 185) rather than baked here. |
| §14 FITL/ARVN application example | **Adopted as conformance work** — Phase 1 acceptance (c) requires one ARVN consideration migration. Full ARVN cookbook migration deferred to Spec 182. |
| §15 Cross-game sanity check | **Adopted** — Phase 1 conformance (Foundation #16) requires FITL + Texas Hold'em + fixture-game coverage. |
| §16 Risks and mitigations | **Adopted** — bounds on selector items/products, preview reuse, demote-default-over-prune, holdout probes, summary trace defaults, generic standing-vector reasoning all encoded in §5/§4/§7. |
| §17 Staged implementation roadmap (Stages 1–8) | **Adopted with re-ordering**: Phase 0 ≈ proposal Stage 2 (audit probe harness). Phase 1 ≈ proposal Stage 3 (selectors). Stage 1 (lint + trace grouping) absorbed into Spec 182/183 — without modules/guardrails, grouping has nothing to group around. Stages 4–8 deferred (§11). |
| §18 Open questions | **Resolved**: (1) probes live as TS-based test data under `policy-profile-quality/probes/`, not in GameSpec; (2) modules use grouped utility sum (deferred); (3) selector ranks emitted as top-K only per Phase 1 §5.3; (4) split decided per Spec 182; (5) generated probes treated as draft; (6) MCTS/rollout deferred indefinitely; (7) **agreed** — probe harness + lint-equivalent (selector cost diagnostics) ship before new scoring semantics. |
| **Factual correction**: "non-archived spec-179 remediation already points in this direction" | **Corrected** — Spec 179 is archived/DEFERRED. The live substrate is Spec 180 (COMPLETED 2026-05-17), which shipped `currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind` role primitives, outer-preview availability modes, per-seat trace matrix, and a Foundation #20 extension. This spec depends on Spec 180. |
| **Factual correction**: "evolution loop mutates numeric weights only" | **Corrected** — `.claude/skills/improve-loop` + `campaigns/fitl-arvn-agent-evolution/program.md` already mutate YAML structure (conditions, pruning rules, aggregates). The proposal's "structure first" is a re-ordering of the existing structural loop, not the introduction of structural mutation. Spec 185 owns the formal ordering. |
| **FOUNDATIONS.md amendments** | **None proposed** — existing #1, #2, #5, #7, #8, #10, #16, #18, #20 cover the proposed primitives. Spec 180 already extended #20 for the standing-role substrate. |

---

## Notes for ticket decomposition

- Phase 0 should decompose cleanly into: probe runner (one ticket), assertion library (one or two tickets by group), ARVN distribution probe (one ticket), architectural-invariant probe (one ticket), CI integration (one ticket).
- Phase 1 should decompose into: compiler bucket + diagnostics (one or two tickets), runtime evaluator (one ticket), trace integration (one ticket), conformance tests per game (one ticket each), ARVN consideration migration (one ticket).
- Phase 0 tickets land before Phase 1 begins; within each phase, ticket ordering follows declared dependencies.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-18 (namespace `181STRSTRPOL`; spec originally suggested `181STRPOLLAY` — user-supplied namespace authoritative):

- [`archive/tickets/181STRSTRPOL-001.md`](../archive/tickets/181STRSTRPOL-001.md) — Phase 0 — Probe runner scaffold + replay-prefix integration (covers §4.1, §4.3)
- [`archive/tickets/181STRSTRPOL-002.md`](../archive/tickets/181STRSTRPOL-002.md) — Phase 0 — Probe assertion library (covers §4.2)
- [`archive/tickets/181STRSTRPOL-003.md`](../archive/tickets/181STRSTRPOL-003.md) — Phase 0 — ARVN action-distribution probe (75%-Govern witness) (covers §4.1 exemplar + §8 Phase 0 acceptance (b))
- [`archive/tickets/181STRSTRPOL-004.md`](../archive/tickets/181STRSTRPOL-004.md) — Phase 0 — Architectural-invariant constructibility probe (covers §8 Phase 0 acceptance (c))
- [`archive/tickets/181STRSTRPOL-005.md`](../archive/tickets/181STRSTRPOL-005.md) — Phase 0 — CI/profile-quality integration + per-probe overhead budget (covers §8 Phase 0 acceptance (a), (e), with profile-quality probes kept out of the default blocking lane per the Foundations Appendix)
- [`archive/tickets/181STRSTRPOL-006.md`](../archive/tickets/181STRSTRPOL-006.md) — Phase 1 — Selector compiled IR, library bucket, compiler diagnostics (covers §5.1–§5.5)
- [`archive/tickets/181STRSTRPOL-007.md`](../archive/tickets/181STRSTRPOL-007.md) — Phase 1 — Runtime selector evaluation + caching (covers §5.6, §6, §7)
- [`archive/tickets/181STRSTRPOL-008.md`](../archive/tickets/181STRSTRPOL-008.md) — Phase 1 — Trace integration (`selectors` field on PolicyAgentDecisionTrace) (covers §5.6 trace surface)
- [`tickets/181STRSTRPOL-009.md`](../tickets/181STRSTRPOL-009.md) — Phase 1 — Conformance test: FITL zone-collection selector (covers §8 Phase 1 acceptance (b) zone-collection)
- [`tickets/181STRSTRPOL-010.md`](../tickets/181STRSTRPOL-010.md) — Phase 1 — Conformance test: Texas Hold'em card-collection selector (covers §8 Phase 1 acceptance (b) card-collection)
- [`tickets/181STRSTRPOL-011.md`](../tickets/181STRSTRPOL-011.md) — Phase 1 — Conformance test: fixture-game declared-product selector (covers §8 Phase 1 acceptance (b) declared-product)
- [`tickets/181STRSTRPOL-012.md`](../tickets/181STRSTRPOL-012.md) — Phase 1 — ARVN consideration migration + Phase 0 probe rerun (covers §8 Phase 1 acceptance (c))
- [`archive/tickets/181STRSTRPOL-013.md`](../archive/tickets/181STRSTRPOL-013.md) — Phase 0 follow-up — Reduce ARVN probe overhead below soft budget (split from 005 after the budget gate surfaced a measured 797.43 ms/decision soft overrun on the final rerun)
