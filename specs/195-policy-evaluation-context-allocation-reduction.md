# Spec 195 — Policy Evaluation Context Allocation Reduction

**Status**: PROPOSED
**Priority**: Medium-High — `PolicyEvaluationContext` construction is 3.4–5.7% of CPU self-time per regressed FITL workload at HEAD (`reports/fitl-perf-baseline-2026-05-24.md`), with high adjacent GC self-time across the same heavy workloads. The construction is hot because it occurs per-outer-policy-evaluation AND per-nested-selector-evaluation, multiplied by `num_candidates × num_selectors × nesting_depth`.
**Complexity**: S–M — engine change at the `PolicyEvaluationContext` constructor and its inner-selector-evaluation call site; must preserve Spec 189's structural `cacheBinding` contract and Foundation #11 immutability.
**Date**: 2026-05-24
**Dependencies**:
- `archive/specs/189-policy-eval-context-cache-eligibility.md` (COMPLETED — established the structural `cacheBinding` requirement on `PolicyEvaluationContext` that this spec MUST preserve; any hoisting that bypasses `cacheBinding` re-opens the silent-degradation class Spec 189 closed).
- `archive/specs/172-*` (preview-drive static rebuild dedup — the per-evaluation cache discipline this spec works within).
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — `plan-proposal.ts` is one of the construction sites this spec optimizes).
- `archive/specs/192-fitl-perf-profiling-methodology.md` (COMPLETED — produced the baseline that named this finding).

**Trigger report**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table, row 3 (`Allocator-reduction` category, heavy plan-primary lanes, 3.4–5.7% contribution + adjacent high GC self-time).

**Ticket namespace**: `195POLEVALLOC` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Hoist or reuse `PolicyEvaluationContext` allocations across inner evaluation loops without leaking mutable state or breaking Spec 189's structural `cacheBinding` contract. Concretely:

1. **Share heavy immutable substructure across nested selector evaluations.** The outer `PolicyEvaluationContext` already holds the encoded-state layout, zone-index map, runtime providers, and `cacheBinding`. Nested selector evaluations (`evaluatePlannedSelector` → `evaluateSelectionContext` recursion) currently spawn a fresh `PolicyEvaluationContext` per call (line 2046 in `policy-evaluation-core.ts`); this spec routes them through the outer context's substructure via reference, allocating only the candidate-scoped binding for the inner evaluation.
2. **Eliminate the per-selector full constructor cost** in the inner-loop case where the inner context's encoded state, layout, runtime, and cache-binding are identical to the outer context's (the common case — selectors operate within the same GameDef + GameState + cacheBinding scope).
3. **Preserve immutability and cache-binding eligibility.** No mutation of outer-context state by inner selector evaluation; `cacheBinding` remains structural per Spec 189 (inner evaluation cannot bypass it).

The structural guarantee: any code path that previously allocated a `PolicyEvaluationContext` continues to receive an equivalent context (with the correct `cacheBinding`, layout, and runtime), but the allocation itself is amortized across the inner loop.

## 2. Non-Goals

- **No relaxation of Spec 189's structural `cacheBinding` requirement.** Inner evaluations MUST honor the `cacheBinding` contract; any hoisting that bypasses it re-introduces the silent-degradation class Spec 189 closed (the PR #275 regression).
- **No relaxation of Foundation #11 immutability.** Outer-context state is read-only from the inner selector's perspective; the scoped-internal-mutation exception (Foundation #11) applies only to per-call private working state, never to caller-visible substructure.
- **No game-specific allocation patterns.** The allocator-reduction is generic policy infrastructure (Foundation #1); applies to any GameDef whose authored policies use nested selectors.
- **No change to caller-visible evaluation results.** Inner selector evaluation produces byte-identical outputs; only the allocation pattern changes.
- **No change to the `PolicyEvaluationContext` constructor's public signature** beyond what is required to support the inner-selector reuse path (and any change is additive — existing call sites continue to work).
- **No object pool / free-list pattern** as the default approach. Pooling adds complexity (lifecycle bugs, cross-evaluation pollution risk); the share-substructure approach is preferred unless P3 measurement shows insufficient headroom.

## 3. Context (verified against codebase, 2026-05-24)

- **`PolicyEvaluationContext` constructor** at `packages/engine/src/agents/policy-evaluation-core.ts:450-479`:
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
      // 10+ optional spreads ...
      encodedStateLayout: this.encodedStateLayout,
      ...(this.encodedState === undefined ? {} : { encodedState: this.encodedState }),
    });
  }
  ```
  - 13 instance fields initialized.
  - `Map` construction over zone IDs (O(zones)).
  - `createPolicyRuntimeProviders` allocates runtime providers per call.
  - `resolvePolicyEvalCacheBinding` resolves the structural binding (Spec 189).

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
  Called once per `evaluatePolicyMoveCore` invocation; context lives for the entire move evaluation.

- **Inner (nested) construction site** at `packages/engine/src/agents/policy-evaluation-core.ts:2046` (inside `evaluatePlannedSelector` → `evaluateSelectionContext`): a new context is spawned per inner selector evaluation. In the candidate-scoped selector case, this happens **per active candidate** within the inner loop; the worst case is `num_candidates × num_selectors × nesting_depth` constructions per outer policy evaluation.

- **Profile evidence** (`reports/perf-baseline/parity-drive-8203b4d023.json`):
  - `PolicyEvaluationContext` constructor: 4.4s / 2.8% self-time; 6.9s / 4.4% total time (children).
  - High adjacent GC self-time (17.4s / 11.1% on `parity-drive`) correlates with allocator pressure; reducing per-evaluation allocations reduces both the constructor cost and the GC cost.
  - Combined across the five regressed workloads: 3.4–5.7% of self-time per the report's findings table.

- **Spec 189 structural `cacheBinding` contract** (`archive/specs/189-policy-eval-context-cache-eligibility.md` §1 Goal): `cacheBinding` is a required field on `CreatePolicyEvaluationContextInput`; passing the wrong binding (or none) silently bypasses the shared encoded-state and bytecode caches. The structural property must hold for any new inner-selector evaluation path this spec introduces.

- **`runtimeProviders`** at `createPolicyRuntimeProviders`: allocates fresh runtime provider objects per call. Many providers are pure functions over `(def, state, playerId, seatId, encodedStateLayout, encodedState)`; for an inner selector evaluating within the same outer scope, the provider set is identical and can be reused by reference.

## 4. Architecture

### 4.1 Inner-selector context-reuse path

Introduce a scoped reuse path on `PolicyEvaluationContext` (or via a sibling factory) that, given an outer context and an inner-evaluation scope override (candidates, bindings), produces an inner evaluation surface that:

- **Reuses by reference** the outer context's `encodedState`, `encodedStateLayout`, `encodedZoneIndexById`, `runtime`, `cacheBinding`, and `runtimeProviders` (the substructure that is invariant across outer→inner within the same GameDef + GameState scope).
- **Allocates only the candidate-scoped binding** — the inner candidates list and any per-inner-evaluation private working state.
- **Cannot mutate** the outer-context substructure; the shared substructure is read-only from the inner-evaluation perspective (Foundation #11 corollary).
- **Honors `cacheBinding`** by inheriting the outer context's binding directly (Spec 189 structural guarantee preserved by inheritance, not by re-resolution).

Two implementation shapes are acceptable, chosen during P1 implementation:

- **Option A — `withInnerCandidates(candidates)` method on `PolicyEvaluationContext`** that returns a lightweight wrapper sharing the outer's substructure by reference and overriding only the candidates list. The wrapper implements the same evaluation interface; inner selector code calls the same evaluation methods without knowing whether it has an outer or inner context.
- **Option B — Extract a `PolicyEvaluationScope` value object** that holds the outer context's heavy immutable substructure (encoded-state layout, zone-index map, runtime providers, `cacheBinding`); both outer and inner contexts hold a reference to the same scope; only the per-evaluation state (candidates, current binding) differs between them.

Option A is the smaller surface change and the default; Option B is preferred only if the inner evaluation needs to vary more than just candidates (e.g., player/seat scope changes that the current `PolicyEvaluationContext` shape doesn't cleanly accommodate via wrapper). The decision lands during P1 prototyping; either way, the structural cache-binding contract is preserved.

### 4.2 Inner-evaluation private working state

Per Foundation #11's scoped-internal-mutation exception, any per-inner-evaluation mutable working state (e.g., a temporary score accumulator) MUST be allocated fresh per inner evaluation and never leak to the outer context. The `withInnerCandidates` wrapper (or `PolicyEvaluationScope`) holds the private state in a separate field, isolated from the outer's read-only substructure.

### 4.3 `cacheBinding` inheritance discipline

The inner context inherits the outer's `cacheBinding` directly — no re-resolution, no new `resolvePolicyEvalCacheBinding` call. This:

- Preserves Spec 189's structural guarantee (the binding is the same object; cache lookups hit the same caches).
- Eliminates the per-inner-call `resolvePolicyEvalCacheBinding` cost.
- Cannot silently bypass caching (if the outer binding is wrong, the inner inherits the wrong binding; the silent-degradation class is closed by Spec 189's compile-time requirement, not by re-resolution).

### 4.4 Recursive nesting bound

Per Foundation #10 bounded computation, the inner-selector recursion depth is already bounded by the existing `maxTriggerDepth` and selector-evaluation depth caps. This spec does not change those bounds; it only reduces per-level allocation cost.

### 4.5 Outer construction unchanged

The outer `PolicyEvaluationContext` constructor remains as-is (Spec 189's `cacheBinding` requirement still gates it). The optimization targets the inner-loop case where the constructor's heavy work is redundant; the outer construction is necessary first-time work per outer policy evaluation.

## 5. Data flow / Process

`evaluatePolicyMoveCore` → constructs outer `PolicyEvaluationContext` (unchanged) → evaluates candidates → per candidate-scoped selector: outer context's `evaluatePlannedSelector` → instead of `new PolicyEvaluationContext({...}, innerCandidates)`, call `outer.withInnerCandidates(innerCandidates)` (Option A) or build an inner context referencing `outer.scope` (Option B) → inner evaluation runs against the shared substructure with its own private working state → returns inner result → outer continues; inner context becomes GC-eligible (lightweight allocation only).

## 6. Determinism and replay (Foundations #8, #11, #16)

The inner evaluation produces byte-identical results because it operates against the same encoded state, the same layout, the same runtime providers, and the same `cacheBinding`. Foundation #8 replay identity is preserved.

Foundation #11 immutability: the outer-context substructure is shared by reference but read-only from the inner perspective; the scoped-internal-mutation exception applies only to the inner's private working state, isolated from the outer.

The Spec 192 trajectory-identity test (per-decision instrumentation flag on vs off) covers this spec automatically: if the optimization perturbs inner evaluation results, the terminal state hash diverges.

## 7. Edge cases

- **Inner selector evaluating against a different state snapshot** — if the inner selector legitimately needs a different `state` than the outer (e.g., a hypothetical-state evaluation), the share-substructure path does NOT apply; fall through to the existing per-call construction. This is detected at the call site by inspecting the inner evaluation's input.
- **Inner selector evaluating with a different `playerId`/`seatId`** — same handling: if the inner scope differs, fall through to per-call construction (Option A); or accept it as a scope-override on the wrapper (Option B). The performance gain applies to the common same-scope case.
- **`cacheBinding` mismatch between outer and inner** — if the inner caller passes a different `cacheBinding`, fall through to per-call construction. The structural guarantee (Spec 189) is preserved: the inner gets a context with its passed binding, just not via the share-substructure shortcut.
- **Concurrent inner evaluations** — the evaluation pipeline is single-threaded per policy evaluation; no concurrent-access concern. If future work introduces parallelism, the share-substructure path requires re-validation.
- **Inner evaluation throwing** — the inner context becomes GC-eligible regardless of whether it returned normally or threw; no leak risk (no finalizer, no manual cleanup).
- **Foundation #15 architectural completeness** — the fall-through paths (different state, different scope, different `cacheBinding`) are explicitly handled, not silently defaulted; the fast path applies only to the safe case.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Inner-selector context-reuse path (§4.1, §4.2, §4.3) | `withInnerCandidates` (Option A) or `PolicyEvaluationScope` (Option B) introduced; inner construction site at `policy-evaluation-core.ts:2046` routed through reuse path for the same-scope case; fall-through to per-call construction for scope-mismatch cases (§7); replay-identity test (Spec 192) green on five regressed workloads; Spec 189 `POLEVALCACHE` cache-binding witness remains green; `pnpm -F @ludoforge/engine test` 100% pass | S–M |
| **P2** | Architectural-invariant test for outer-state isolation (§4.2) | New test asserting inner evaluation cannot mutate outer-context caller-visible state (Foundation #11 corollary); `@test-class: architectural-invariant` | S |
| **P3** | Perf witness re-capture | Re-run Spec 192 baseline harness on `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`; record measured gain; named gain target is **≥5% individual wall-clock reduction on the heavy plan-primary workloads** (matching the report's per-workload contribution estimate, with GC self-time reduction counted toward the total) | S |

P1 lands the share-substructure path. P2 proves the isolation guarantee. P3 measures the gain. If P3's measured gain falls short, evaluate the Allocator-reduction category's remaining options (pooling, constructor-cost reduction in outer construction) in a follow-up spec; do not retrofit pooling in this spec.

## 9. Test plan

- **Replay identity** (Foundation #8 proof): existing `packages/engine/test/determinism/` and Spec 192 trajectory-identity test cover the optimization automatically.
- **Cache-binding witness** (Spec 189 protection): the `POLEVALCACHE` witness (e.g., `duplicateEncodedStateRebuilds`, `buildExpressionFeatureTable` counters from PR #275 analysis) must remain at expected steady-state values; any drift signals the inner path is bypassing cache binding. Concrete witness identifiers and pass thresholds are pinned during P1 implementation against the current `POLEVALCACHE` test surface.
- **Architectural-invariant outer-state isolation** (new, Foundation #11 corollary): `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` — construct outer context, spawn inner via reuse path, attempt to observe outer state mutation via any path; assert no mutation observable. `@test-class: architectural-invariant`.
- **Perf witness**: Spec 192 harness re-captures on the five regressed workloads; results checked into `reports/perf-baseline/`.

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | Allocator-reduction is generic policy infrastructure; no game-specific code introduced. Applies to any GameDef whose authored policies use nested selectors. |
| **#8** Determinism Is Sacred | Inner evaluation produces byte-identical results (same encoded state, layout, runtime, `cacheBinding`). Replay-identity corpus + Spec 192 trajectory-identity test are the proof gates. |
| **#10** Bounded Computation | Recursion depth unchanged; existing `maxTriggerDepth` and selector-evaluation depth caps still bound the inner-evaluation chain. |
| **#11** Immutability | Outer-context substructure shared by reference is read-only from the inner perspective; scoped-internal-mutation exception applies only to inner's private working state. Architectural-invariant test (§8 P2) proves isolation. |
| **#15** Architectural Completeness | Fall-through paths (different state/scope/cacheBinding) are explicitly handled, not silently defaulted; structural guarantee preserved. |
| **#16** Testing as Proof | Three proof surfaces (replay identity, Spec 189 cache-binding witness, outer-state isolation invariant) cover the optimization. |
| **#20** Preview Signal Integrity | Inner selector evaluation produces the same preview-ref outputs (same `cacheBinding`, same runtime providers, same encoded state). No preview-status-boundary risk. |

## 11. Reassessment of source proposal (`reports/fitl-perf-baseline-2026-05-24.md`)

**Adopted**:
- Finding row 3 (`Allocator-reduction` category, 3.4–5.7% contribution, heavy plan-primary lanes) — adopted as the spec's central remediation target.
- Foundation-requirement set (#11 caller-visible immutability, #8 replay identity, #1 game-agnostic) — adopted verbatim.
- Goal sentence ("Hoist or reuse policy evaluation context allocations across inner evaluation loops without leaking mutable state") — adopted as the §1 Goal.

**Adopted with adjustment**:
- The report's framing ("hoist or reuse") is preserved; this spec commits specifically to the share-substructure approach (Option A or B) and explicitly defers object-pooling to a follow-up unless P3 measurement requires it. Pooling adds lifecycle-bug surface; share-substructure is the lower-risk default.
- The report cites the constructor self-time but does not name the dominant call site. This spec identifies the inner-selector spawn at `policy-evaluation-core.ts:2046` as the primary multiplier (`num_candidates × num_selectors × nesting_depth`) and targets it specifically.

**Corrected**:
- The report's Foundation requirements list omits Spec 189. This spec adds Spec 189's structural `cacheBinding` contract as an explicit constraint (§2 Non-Goals, §4.3, §8 P1 acceptance) because any hoisting that re-resolves or bypasses `cacheBinding` re-opens the silent-degradation class Spec 189 closed. This is a load-bearing correction, not a soft preference.

**Deferred**:
- Object pool / free-list pattern for `PolicyEvaluationContext` — gated on P3 measurement showing insufficient headroom from §4.1's share-substructure approach.
- Outer-constructor cost reduction (the 13-field initialization, `createPolicyRuntimeProviders` cost) — deferred to a follow-up; this spec targets the inner-loop multiplier, which is the dominant attribution.
