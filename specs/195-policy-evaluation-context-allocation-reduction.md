# Spec 195 — Policy Evaluation Context Allocation Reduction

**Status**: PROPOSED
**Priority**: Medium-High — `PolicyEvaluationContext` construction is 3.4–5.7% of CPU self-time per regressed FITL workload at HEAD (`reports/fitl-perf-baseline-2026-05-24.md`), with high adjacent GC self-time across the same heavy workloads. The constructor self-time aggregates across **four** source-side construction sites; the dominant per-evaluation multipliers are `num_distinct_microturn_options × num_selector_items_referencing_them` (inner-selector fall-through) and `num_completion_options_scored` (per-option scoring), not per-candidate.
**Complexity**: S–M — engine change introducing a substructure-sharing wrapper on `PolicyEvaluationContext` and routing the inner-selector fall-through (P1 deliverable site) through it; must preserve Spec 189's structural `cacheBinding` contract and Foundation #11 immutability. Broadening to the two follow-on sites (`microturn-option-eval.ts:121`, `plan-proposal.ts:513`) is deferred to a Spec 195-FOLLOWUP unless P3 measurement demands it.
**Date**: 2026-05-24 (authored), 2026-05-25 (reassessed)
**Dependencies**:
- `archive/specs/189-policy-eval-context-cache-eligibility.md` (COMPLETED — established the structural `cacheBinding` requirement on `PolicyEvaluationContext` that this spec MUST preserve; any hoisting that bypasses `cacheBinding` re-opens the silent-degradation class Spec 189 closed; also enumerated all four src construction sites this reassessment audited against).
- `archive/specs/172-policy-eval-static-structure-caching.md` (COMPLETED — runtime-owned caching of `EncodedStateLayout` and feature tables; the per-evaluation cache discipline this spec works within. Spec 172's caching means the residual per-construction cost is field-default-initializations + `createPolicyRuntimeProviders` + the zoneId `Map` construction, not the static-layout build).
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — `plan-proposal.ts:513` is one of the four construction sites; deferred from P1 per the staged-scope decision in §4.1).
- `archive/specs/192-fitl-perf-profiling-methodology.md` (COMPLETED — produced the baseline that named this finding; supplied the `perf-baseline-trajectory-identity.test.ts` env-toggle gate cited in §6).

**Trigger report**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table, row 3 (`Allocator-reduction` category, heavy plan-primary lanes, 3.4–5.7% contribution + adjacent high GC self-time).

**Ticket namespace**: `195POLEVALLOC` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Reduce `PolicyEvaluationContext` allocator pressure on the inner-selector fall-through path by introducing a substructure-sharing wrapper, without leaking mutable state or breaking Spec 189's structural `cacheBinding` contract. Concretely:

1. **Extend the existing same-microturn-option fast path to cover the different-microturn-option case via shared heavy substructure.** The inner-selector call site at `policy-evaluation-core.ts:2020` (`evaluateSelectorItemExpr`) already short-circuits via `return this.evaluateCompiledExpr(...)` when the inner option matches the outer's current microturn option (lines 2026-2038). The fall-through at line 2040 — fired only when `microturnOption.key !== this.currentMicroturnOptionKey()` — currently constructs a fresh `PolicyEvaluationContext` even though `def`, `state`, `playerId`, `seatId`, `catalog`, `parameterValues`, `trustedMoveIndex`, and `cacheBinding` are all inherited unchanged from the outer. Only `completion.optionValue/optionIndex` and `selectorItemKey` actually vary. This spec routes the fall-through through a substructure-sharing wrapper that allocates only the per-inner-option private working state.
2. **Eliminate the per-fall-through full constructor cost** for the same-`cacheBinding` case (the only case observed in current code; future paths with binding-mismatch fall through to per-call construction). Heavy invariant substructure (encoded state, layout, runtime providers, zone-index map, `cacheBinding`) is inherited by reference, while semantic caches remain per-context when their keys do not encode all microturn-option fields.
3. **Preserve immutability and cache-binding eligibility.** No mutation of outer-context state by inner selector evaluation; `cacheBinding` is inherited directly (Spec 189's structural guarantee preserved by inheritance, not by re-resolution).

The structural guarantee: any code path that previously allocated a `PolicyEvaluationContext` continues to receive an equivalent evaluation surface (with the correct `cacheBinding`, layout, and runtime), but the heavy allocation itself is amortized across the inner-selector fall-through loop. The same substructure-sharing mechanism naturally extends to the two other inner-equivalent sites (`microturn-option-eval.ts:121`, `plan-proposal.ts:513`); their migration is deferred per §4.6.

## 2. Non-Goals

- **No relaxation of Spec 189's structural `cacheBinding` requirement.** Inner evaluations MUST honor the `cacheBinding` contract; any hoisting that bypasses it re-introduces the silent-degradation class Spec 189 closed (the PR #275 regression).
- **No relaxation of Foundation #11 immutability.** Outer-context state is read-only from the inner selector's perspective; the scoped-internal-mutation exception (Foundation #11) applies only to per-call private working state, never to caller-visible substructure.
- **No game-specific allocation patterns.** The allocator-reduction is generic policy infrastructure (Foundation #1); applies to any GameDef whose authored policies use nested selectors with per-microturn-option completion variants.
- **No change to caller-visible evaluation results.** Inner selector evaluation produces byte-identical outputs; only the allocation pattern changes.
- **No change to the `PolicyEvaluationContext` constructor's public signature** beyond what is required to support the inner-selector reuse path (and any change is additive — existing call sites continue to work).
- **No object pool / free-list pattern** as the default approach. Pooling adds complexity (lifecycle bugs, cross-evaluation pollution risk); the share-substructure approach is preferred unless P3 measurement shows insufficient headroom.
- **No P1 migration of the other three construction sites** (`policy-eval.ts:691` — outer, can't share; `microturn-option-eval.ts:121`, `plan-proposal.ts:513` — inner-equivalent, deferred to follow-up). P1 lands the mechanism at line 2040; broader application is gated on P3 measurement.

## 3. Context (verified against codebase, 2026-05-25)

- **`PolicyEvaluationContext` class** at `packages/engine/src/agents/policy-evaluation-core.ts:418`. Constructor at lines 450-479:
  ```ts
  constructor(
    private readonly input: CreatePolicyEvaluationContextInput,
    candidates: PolicyEvaluationCandidate[],
  ) {
    this.currentCandidates = candidates;
    this.activeState = input.state;
    const canonicalEncodedStateLayout = getPolicyEncodedStateLayout(input.def);
    const { runtime, preEncoded } = resolvePolicyEvalCacheBinding(input.cacheBinding);
    this.runtime = runtime;
    this.encodedStateLayout = preEncoded?.layout ?? canonicalEncodedStateLayout;
    this.usesCanonicalEncodedStateLayout = this.encodedStateLayout === canonicalEncodedStateLayout;
    this.encodedState = preEncoded?.encoded ?? this.resolveEncodedState(input.state);
    this.encodedZoneIndexById = new Map(
      this.encodedStateLayout.zoneIds.map((zoneId, index) => [String(zoneId), index]),
    );
    this.runtimeProviders = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: input.seatId,
      trustedMoveIndex: input.trustedMoveIndex,
      // 6 conditional spreads ...
      encodedStateLayout: this.encodedStateLayout,
      ...(this.encodedState === undefined ? {} : { encodedState: this.encodedState }),
    });
  }
  ```
  Per-construction allocation footprint:
  - **13 collection fields default-initialize at field-declaration time** (lines 419-431, 448): `rootStateFeatureCache`, `candidateFeatureCache`, `aggregateCache`, `selectorCache`, `strategyModuleActivationCache`, `strategyModuleEvaluationCache`, `guardrailWhenCache`, `turnShapeEvaluationCache`, `strategicConditionCache`, `relationshipCache`, `fallbackPolicyBytecodeCache` (WeakMap), `resolvedPreviewRefValues`, `schedulePartialsDuringValue` (array). Each is a fresh `Map`/`WeakMap`/array allocation per `new`.
  - **8 constructor-body assignments** (lines 454-462): `currentCandidates`, `activeState`, `runtime`, `encodedStateLayout`, `usesCanonicalEncodedStateLayout`, `encodedState`, `encodedZoneIndexById`, `runtimeProviders`.
  - **`getPolicyEncodedStateLayout(input.def)`** (line 456) — cached per-`def` by Spec 172, so the static-layout work is amortized.
  - **`resolvePolicyEvalCacheBinding(input.cacheBinding)`** (line 457) — O(1) discriminated-union switch, cheap per call but called per construction.
  - **`createPolicyRuntimeProviders(...)`** (line 463) — allocates multiple provider objects per call; no memoization. The provider closures capture `(def, state, playerId, seatId, encodedStateLayout, encodedState)` which are invariant within a single outer policy evaluation, making them structurally reusable across inner contexts.
  - **`new Map(zoneIds.map(...))`** (line 462) — O(zones) zone-index Map allocation per call.

- **Existing same-microturn-option fast path** at `packages/engine/src/agents/policy-evaluation-core.ts:2026-2038` (inside `evaluateSelectorItemExpr` at line 2020):
  ```ts
  if (
    microturnOption === undefined
    || this.input.completion === undefined
    || microturnOption.key === this.currentMicroturnOptionKey()
  ) {
    const previousSelectorItemKey = this.currentSelectorItemKey;
    this.currentSelectorItemKey = selectorItemKey;
    try {
      return this.evaluateCompiledExpr(expr, candidate);
    } finally {
      this.currentSelectorItemKey = previousSelectorItemKey;
    }
  }
  ```
  This already implements substructure reuse (reuses `this`) for the common case where the inner selector evaluates against the same microturn option as the outer. **The optimization this spec targets is the fall-through path** below.

- **Inner-selector fall-through construction site** at `packages/engine/src/agents/policy-evaluation-core.ts:2040` (immediately after the fast path above). The call chain reaching this site is: `evaluatePlannedSelector` (line 520) → `evaluateSelectorView` (line 1976) → external `evaluateSelector` invoking the `evaluateExpr` callback registered at line 2000 → `evaluateSelectorItemExpr` (line 2020) → `new PolicyEvaluationContext(...)` (line 2040). The fall-through fires only when `microturnOption.key !== this.currentMicroturnOptionKey()` (i.e., the inner selector evaluates against a *different* microturn option). All inherited fields (`def`, `state`, `playerId`, `seatId`, `catalog`, `parameterValues`, `trustedMoveIndex`, `cacheBinding`, `previewDependencies`, `traceLevel`, `selectorMicroturnOptions`) are passed unchanged from `this.input`; only `completion.optionValue/optionIndex` and `selectorItemKey` vary. The candidates list at line 2063 is `this.currentCandidates` — unchanged from the outer. Worst-case multiplier per outer policy evaluation is `num_distinct_microturn_options × num_selector_items_referencing_them`, bounded by completion-option count.

- **Outer construction site** at `packages/engine/src/agents/policy-eval.ts:691-703`:
  ```ts
  const evaluation = new PolicyEvaluationContext({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId,
    catalog,
    parameterValues: profile.params,
    trustedMoveIndex: input.trustedMoveIndex,
    // optional fields ...
  }, candidates);
  ```
  Called once per `evaluatePolicyMoveCore` invocation; context lives for the entire move evaluation. Cannot share substructure (it IS the outer).

- **Per-completion-option scoring construction site** at `packages/engine/src/agents/microturn-option-eval.ts:121` (inside completion-option scoring). Constructs per (completion request, optionValue, optionIndex) triple — likely the highest-volume site of the four when completion-option scoring is active. Inputs `def`, `state`, `playerId`, `seatId`, `catalog`, `parameterValues`, `cacheBinding` are invariant across calls within the same outer scope; only `completion.optionValue/optionIndex` and the per-option `{previewOption, lookupOption, scheduleOption, candidateParamOption}` capture maps vary. **Same substructure-sharing opportunity** as line 2040; deferred to Spec 195-FOLLOWUP per §4.6.

- **Plan-posture construction site** at `packages/engine/src/agents/plan-proposal.ts:513` (inside `evaluatePlanPosture`, introduced by Spec 186). Constructs per plan-posture evaluation. Inputs `def`, `state`, `playerId`, `seatId`, `catalog`, `parameterValues`, `cacheBinding` are invariant across plan-posture calls within the same outer scope; `previewPlan.resolvedRefs` varies per root candidate. **Same substructure-sharing opportunity**; deferred to Spec 195-FOLLOWUP per §4.6.

- **Profile evidence** (`reports/perf-baseline/parity-drive-8203b4d023.json`):
  - `PolicyEvaluationContext` constructor: 4.4s / 2.8% self-time; 6.9s / 4.4% total time (children).
  - High adjacent GC self-time (17.4s / 11.1% on `parity-drive`) correlates with allocator pressure; reducing per-evaluation allocations reduces both the constructor cost and the GC cost.
  - Combined across the five regressed workloads: 3.4–5.7% of self-time per the report's findings table. **This figure aggregates across all four construction sites**, not just line 2040.

- **Spec 189 structural `cacheBinding` contract** (`archive/specs/189-policy-eval-context-cache-eligibility.md` §1 Goal): `cacheBinding` is a required field on `CreatePolicyEvaluationContextInput`; passing the wrong binding (or none) silently bypasses the shared encoded-state and bytecode caches. The structural property must hold for any new inner-selector evaluation path this spec introduces. Spec 189 enumerated **4 src construction sites + 26 test construction sites** — this reassessment confirms the same enumeration.

## 4. Architecture

### 4.1 Inner-selector substructure-sharing wrapper

Introduce a scoped reuse path on `PolicyEvaluationContext` (or via a sibling factory) that, given an outer context and an inner-evaluation override (microturn option + selector item key), produces an inner evaluation surface that:

- **Reuses by reference** the outer context's `encodedState`, `encodedStateLayout`, `encodedZoneIndexById`, `runtime`, `cacheBinding`, and `runtimeProviders` (the substructure that is invariant across outer→inner within the same GameDef + GameState + cacheBinding scope).
- **Allocates only the per-inner-evaluation private working state** — the overridden `completion` (optionValue, optionIndex), the `selectorItemKey`, and any temporary score accumulator.
- **Cannot mutate** the outer-context substructure; the shared substructure is read-only from the inner-evaluation perspective (Foundation #11 corollary).
- **Honors `cacheBinding`** by inheriting the outer context's binding directly (Spec 189 structural guarantee preserved by inheritance, not by re-resolution).

Two implementation shapes are acceptable, chosen during P1 implementation:

- **Option A — `withInnerMicroturnOption(microturnOption, selectorItemKey)` method on `PolicyEvaluationContext`** that returns a lightweight wrapper sharing the outer's substructure by reference and overriding only the inner option and selector item key. The wrapper implements the same evaluation interface; inner selector code calls the same evaluation methods without knowing whether it has an outer or inner context. The method name follows the actual variance (microturn option + selector item key), not the unchanged candidates list.
- **Option B — Extract a `PolicyEvaluationScope` value object** that holds the outer context's heavy immutable substructure (encoded-state layout, zone-index map, runtime providers, `cacheBinding`); both outer and inner contexts hold a reference to the same scope; only the per-evaluation state (candidates, current option, selector item key) differs between them.

Option A is the smaller surface change and the default; Option B is preferred only if Spec 195-FOLLOWUP (multi-site application — §4.6) requires varying more than the inner option (e.g., the per-completion-option `{previewOption, lookupOption, scheduleOption, candidateParamOption}` capture maps at `microturn-option-eval.ts:121`, or the `previewPlan.resolvedRefs` at `plan-proposal.ts:513`). The decision lands during P1 prototyping; either way, the structural cache-binding contract is preserved.

### 4.2 Inner-evaluation private working state

Per Foundation #11's scoped-internal-mutation exception, any per-inner-evaluation mutable working state (e.g., a temporary score accumulator, the overridden `currentSelectorItemKey`) MUST be allocated fresh per inner evaluation and never leak to the outer context. The `withInnerMicroturnOption` wrapper (or `PolicyEvaluationScope`) holds the private state in a separate field, isolated from the outer's read-only substructure.

### 4.3 `cacheBinding` inheritance discipline

The inner context inherits the outer's `cacheBinding` directly — no re-resolution, no new `resolvePolicyEvalCacheBinding` call. This:

- Preserves Spec 189's structural guarantee (the binding is the same object; cache lookups hit the same caches).
- Eliminates the per-inner-call `resolvePolicyEvalCacheBinding` cost (cheap individually; sums at scale).
- Cannot silently bypass caching (if the outer binding is wrong, the inner inherits the wrong binding; the silent-degradation class is closed by Spec 189's compile-time requirement, not by re-resolution).

### 4.4 Recursive nesting bound

Per Foundation #10 bounded computation, the inner-selector recursion depth is already bounded by the existing `maxTriggerDepth` and selector-evaluation depth caps. This spec does not change those bounds; it only reduces per-level allocation cost.

### 4.5 Outer construction unchanged

The outer `PolicyEvaluationContext` constructor at `policy-eval.ts:691` remains as-is (Spec 189's `cacheBinding` requirement still gates it). The optimization targets the inner-loop fall-through case where the constructor's heavy work is redundant; the outer construction is necessary first-time work per outer policy evaluation.

### 4.6 Staged scope (P1 target + deferred follow-up sites)

P1 lands the substructure-sharing mechanism and migrates **one** call site: the inner-selector fall-through at `policy-evaluation-core.ts:2040`. This is the smallest demonstration site and keeps the ticket scope tight.

The same mechanism naturally extends to two other "inner-equivalent" sites that share the same allocator pattern (outer-scope-invariant substructure + small per-call variance):

- **`microturn-option-eval.ts:121`** — per (completion request, optionValue, optionIndex); likely the highest-volume site. Variance: `completion.optionValue/optionIndex` + per-option capture maps. Migration likely favors Option B (`PolicyEvaluationScope`) since multiple per-option fields vary.
- **`plan-proposal.ts:513`** — per plan-posture evaluation (Spec 186). Variance: `previewPlan.resolvedRefs`. Migration likely favors Option A or B.

These migrations are **deferred to Spec 195-FOLLOWUP**. The deferral is intentional per Foundation #15 architectural completeness: P1 establishes a generic mechanism (not a one-shot patch); follow-up sites can then be migrated incrementally. If P3 measurement on the line 2040 site alone falls short of the ≥5% target (§8 P3), the follow-up may be promoted to a P4 in this spec rather than a separate spec — decided at P3 evaluation time.

## 5. Data flow / Process

`evaluatePolicyMoveCore` → constructs outer `PolicyEvaluationContext` at `policy-eval.ts:691` (unchanged) → evaluates candidates → per candidate-scoped selector: outer context's `evaluatePlannedSelector` → `evaluateSelectorView` → external `evaluateSelector` invokes `evaluateExpr` callback → `evaluateSelectorItemExpr` at `policy-evaluation-core.ts:2020`:

- **Same-microturn-option case** (lines 2026-2038, unchanged): `return this.evaluateCompiledExpr(...)` — reuses `this` directly.
- **Different-microturn-option case** (line 2040, this spec's target): instead of `new PolicyEvaluationContext({...}, this.currentCandidates)`, call `this.withInnerMicroturnOption(microturnOption, selectorItemKey)` (Option A) or build an inner context referencing `this.scope` with overridden option/key (Option B) → inner evaluation runs against the shared substructure with its own private working state (`completion.optionValue/optionIndex`, `selectorItemKey`) → returns inner result → outer continues; inner wrapper becomes GC-eligible (lightweight allocation only — no Maps, no runtime providers, no zoneId Map).

## 6. Determinism and replay (Foundations #8, #11, #16)

The inner evaluation produces byte-identical results because it operates against the same encoded state, the same layout, the same runtime providers, and the same `cacheBinding`. Foundation #8 replay identity is preserved.

Foundation #11 immutability: the outer-context substructure is shared by reference but read-only from the inner perspective; the scoped-internal-mutation exception applies only to the inner's private working state, isolated from the outer.

**Primary determinism gate**: the existing replay-identity corpus at `packages/engine/test/determinism/` pins terminal state hashes across commits; any perturbation introduced by this spec's optimization surfaces there.

**Secondary signal**: Spec 192's `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` (env-toggle test — `ENGINE_PER_DECISION_PROFILE=1` on vs off) is a per-commit invariant; if Spec 195 changes inner evaluation results, the env-toggle property is unaffected (it remains an instrumentation-toggle test), but the underlying terminal hash drift would also surface in the determinism corpus alongside it.

## 7. Edge cases

- **Inner selector evaluating with a different `cacheBinding`** — not currently observable in source (the inner construction at line 2040 always inherits `this.input.cacheBinding`), but if a future caller passes a different binding, fall through to per-call construction. The structural guarantee (Spec 189) is preserved: the inner gets a context with its passed binding, just not via the share-substructure shortcut.
- **Inner selector evaluating against a different state snapshot, `playerId`, or `seatId`** — **no current code path exercises this**; the inner construction at line 2040 always passes `state: this.activeState`, `playerId: this.input.playerId`, `seatId: this.input.seatId`. Listed here as future-proofing: if a future caller introduces such a path, fall through to per-call construction (Option A) or accept it as a scope-override on the wrapper (Option B).
- **Concurrent inner evaluations** — the evaluation pipeline is single-threaded per policy evaluation; no concurrent-access concern. If future work introduces parallelism, the share-substructure path requires re-validation.
- **Inner evaluation throwing** — the inner wrapper becomes GC-eligible regardless of whether it returned normally or threw; no leak risk (no finalizer, no manual cleanup). The existing fall-through at line 2068 (`finally { context.dispose(); }`) is preserved for the per-call construction path; the wrapper path needs an analogous dispose discipline for its private working state.
- **Foundation #15 architectural completeness** — the fall-through paths (different `cacheBinding`, future state/scope variance) are explicitly handled, not silently defaulted; the fast path applies only to the safe case. The staged-scope decision (§4.6) is itself a F#15 commitment: generic mechanism over one-shot patch.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Inner-selector substructure-sharing wrapper (§4.1, §4.2, §4.3) | `withInnerMicroturnOption` (Option A) or `PolicyEvaluationScope` (Option B) introduced; inner construction site at `policy-evaluation-core.ts:2040` routed through reuse path for the same-`cacheBinding` case (the only case currently observed); fall-through to per-call construction for `cacheBinding`-mismatch case (§7); replay-identity corpus green (`packages/engine/test/determinism/`); Spec 189 `policy-eval-cache-binding-dedup.test.ts` witness remains green; Spec 192 `perf-baseline-trajectory-identity.test.ts` remains green; `pnpm -F @ludoforge/engine test` 100% pass | S–M |
| **P2** | Architectural-invariant test for outer-state isolation (§4.2) | New test `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` asserting inner evaluation cannot mutate outer-context caller-visible state (Foundation #11 corollary); `@test-class: architectural-invariant` | S |
| **P3** | Perf witness re-capture | Re-run Spec 192 baseline harness on `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`; record measured gain attributable to the line 2040 site alone; named gain target is **≥5% individual wall-clock reduction on the heavy plan-primary workloads** (matching the report's per-workload contribution estimate, with GC self-time reduction counted toward the total). If P3 measurement falls short, evaluate promoting the follow-on sites (`microturn-option-eval.ts:121`, `plan-proposal.ts:513`) per §4.6 to a P4 in this spec, OR opening Spec 195-FOLLOWUP if the broader scope warrants its own decomposition | S |

P1 lands the mechanism + the line 2040 migration. P2 proves the isolation guarantee. P3 measures the gain attributable to the P1 site alone; the staged-scope decision (§4.6) determines whether to broaden in this spec or a follow-up.

## 9. Test plan

- **Replay identity** (Foundation #8 proof, primary gate): existing `packages/engine/test/determinism/` corpus pins terminal state hashes across commits; covers this spec's optimization automatically.
- **Cache-binding witness** (Spec 189 protection): the existing architectural-invariant test at `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` must remain green; any drift signals the inner path is bypassing cache binding. Pinned witness counters (`buildEncodedStateLayoutCount`, `buildFeatureTableCount`, `buildExpressionFeatureTableCount`, `buildEncodedStateCount`) from `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (the static-build invariant) must also remain at expected steady-state values.
- **Architectural-invariant outer-state isolation** (new, Foundation #11 corollary): `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` — construct outer context, spawn inner via reuse path, attempt to observe outer state mutation via any path; assert no mutation observable. `@test-class: architectural-invariant`. Placed alongside the existing `policy-evaluation-context-constructor-invariant.test.ts` and `policy-eval-cache-binding-dedup.test.ts` per the established `test/architecture/` convention for PolicyEvaluationContext-level invariants.
- **Trajectory-identity env-toggle** (Spec 192 secondary signal): `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` must remain green — proves the env-toggle property is unaffected; the cross-commit determinism gate is the replay-identity corpus above.
- **Perf witness**: Spec 192 harness re-captures on the five regressed workloads; results checked into `reports/perf-baseline/`.

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | Allocator-reduction is generic policy infrastructure; no game-specific code introduced. Applies to any GameDef whose authored policies use nested selectors with per-microturn-option completion variants. |
| **#8** Determinism Is Sacred | Inner evaluation produces byte-identical results (same encoded state, layout, runtime, `cacheBinding`). Replay-identity corpus is the primary proof gate; Spec 192's trajectory-identity env-toggle test is a secondary signal. |
| **#10** Bounded Computation | Recursion depth unchanged; existing `maxTriggerDepth` and selector-evaluation depth caps still bound the inner-evaluation chain. |
| **#11** Immutability | Outer-context substructure shared by reference is read-only from the inner perspective; scoped-internal-mutation exception applies only to inner's private working state. Architectural-invariant test (§8 P2) proves isolation. |
| **#15** Architectural Completeness | Fall-through paths (different `cacheBinding`, future state/scope variance) are explicitly handled, not silently defaulted; the substructure-sharing mechanism is designed generically and lands incrementally per the staged-scope decision (§4.6) rather than as a one-shot patch at a single site. |
| **#16** Testing as Proof | Four proof surfaces (replay identity corpus, Spec 189 cache-binding witness, Spec 192 trajectory env-toggle, outer-state isolation invariant) cover the optimization. |
| **#20** Preview Signal Integrity | Inner selector evaluation produces the same preview-ref outputs (same `cacheBinding`, same runtime providers, same encoded state). No preview-status-boundary risk. |

## 11. Reassessment of source proposal (`reports/fitl-perf-baseline-2026-05-24.md`)

**Adopted**:
- Finding row 3 (`Allocator-reduction` category, 3.4–5.7% contribution, heavy plan-primary lanes) — adopted as the spec's central remediation target.
- Foundation-requirement set (#11 caller-visible immutability, #8 replay identity, #1 game-agnostic) — adopted verbatim.
- Goal sentence ("Hoist or reuse policy evaluation context allocations across inner evaluation loops without leaking mutable state") — adopted as the §1 Goal direction.

**Adopted with adjustment**:
- The report's framing ("hoist or reuse") is preserved; this spec commits specifically to the share-substructure approach (Option A or B) and explicitly defers object-pooling to a follow-up unless P3 measurement requires it. Pooling adds lifecycle-bug surface; share-substructure is the lower-risk default.

**Corrected** (during 2026-05-25 reassessment):
- The report's Foundation requirements list omits Spec 189. This spec adds Spec 189's structural `cacheBinding` contract as an explicit constraint (§2 Non-Goals, §4.3, §8 P1 acceptance) because any hoisting that re-resolves or bypasses `cacheBinding` re-opens the silent-degradation class Spec 189 closed. This is a load-bearing correction, not a soft preference.
- The original (2026-05-24) draft cited the inner construction site as `policy-evaluation-core.ts:2046` and described the call chain as `evaluatePlannedSelector → evaluateSelectionContext`. Reassessment confirmed: construction starts at line **2040** (line 2046 is mid-object-literal — the `parameterValues` field); the actual call chain is `evaluatePlannedSelector → evaluateSelectorView → (evaluateExpr callback) → evaluateSelectorItemExpr → new PolicyEvaluationContext` (`evaluateSelectionContext` does not exist in the codebase).
- The original draft framed the optimization as targeting "the common case — selectors operate within the same GameDef + GameState + cacheBinding scope". Reassessment confirmed: the same-scope common case is **already optimized** by the fast path at lines 2026-2038 (reuses `this` directly). The construction at line 2040 is the *fall-through* — fired only when the inner microturn option differs from the outer's. The optimization extends substructure sharing to this fall-through path; the method name `withInnerMicroturnOption` reflects the actual variance (microturn option + selector item key), correcting the misleading `withInnerCandidates` name in the original draft (the candidates list is unchanged across outer→inner).
- The original draft characterized the worst-case multiplier as `num_candidates × num_selectors × nesting_depth`. Reassessment confirmed: the actual multiplier is bounded by `num_distinct_microturn_options × num_selector_items_referencing_them` per outer evaluation (gated by the line 2026-2029 conditional), not by candidates.
- The original draft acknowledged only two construction sites (outer at `policy-eval.ts:691`, inner at `policy-evaluation-core.ts:2040`). Spec 189 enumerated **all four sites**, also including `microturn-option-eval.ts:121` (per-completion-option scoring) and `plan-proposal.ts:513` (plan-posture, Spec 186). The 3.4-5.7% constructor cost aggregates across all four; this spec now targets line 2040 as the P1 demonstration site and defers the two other inner-equivalent sites to Spec 195-FOLLOWUP per the staged-scope decision (§4.6).

**Deferred**:
- Object pool / free-list pattern for `PolicyEvaluationContext` — gated on P3 measurement showing insufficient headroom from §4.1's share-substructure approach.
- Outer-constructor cost reduction (the field-default-initializations, `createPolicyRuntimeProviders` cost) at `policy-eval.ts:691` — the outer is necessary first-time work; deferred to a separate follow-up.
- Migration of `microturn-option-eval.ts:121` and `plan-proposal.ts:513` to the shared substructure mechanism — deferred to Spec 195-FOLLOWUP unless promoted at P3 evaluation time (§4.6, §8 P3).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-25:

- [`archive/tickets/195POLEVACON-001.md`](../archive/tickets/195POLEVACON-001.md) — COMPLETED: Inner-selector substructure-sharing wrapper at `policy-evaluation-core.ts:2040` (covers §8 P1)
- [`tickets/195POLEVACON-002.md`](../tickets/195POLEVACON-002.md) — Outer-state isolation architectural-invariant test (covers §8 P2)

P3 (perf witness re-capture) intentionally not ticketed in this run — phase-gated on P1's measured gain per §8 and the reassessment's recommendation. Author the P3 ticket (and any §4.6 follow-on-site promotion) once 195POLEVACON-001 lands and real measurements are available.
