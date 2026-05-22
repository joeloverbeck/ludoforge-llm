# Spec 189 — PolicyEvaluationContext Cache-Eligibility Is Structural, Not Opt-In Per Call Site

**Status**: 📋 PROPOSED
**Priority**: Medium — closes a silent-degradation class that already cost one CI regression (PR #275 / Spec 188). Not user-facing; bounded engine refactor.
**Complexity**: Option-dependent — Option C is S (lint/grep guard only, no migration). Options A/B change the `PolicyEvaluationContext` constructor input contract and therefore ripple to **all 4 src construction sites + 26 test construction sites** (several routed through shared test helpers), plus a guard test; Option A is M–L. No DSL, schema, or data changes.
**Date**: 2026-05-22
**Dependencies**:
- `archive/specs/172-*` (the preview-drive static/encoded-state rebuild dedup guarantee this protects — witness `172POLEVASTA-001`)
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (introduced `plan-proposal.ts` and its posture-evaluation context site)

**Trigger**: `reports/ci-failures-pr-275-*` is not written (single-cluster fix), but the regression that prompted this spec is commit `ded6d281f` on PR #275: `evaluatePlanPosture` constructed a `PolicyEvaluationContext` without threading `GameDefRuntime`, silently bypassing the shared encoded-state and bytecode caches. Dormant until Spec 188 lit the path; caught only by a downstream perf witness (`duplicateEncodedStateRebuilds` 0 → 102, `buildExpressionFeatureTable` 2 → 104).

**Ticket namespace**: `POLEVALCACHE` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Make the cache-eligibility of a `PolicyEvaluationContext` a **structural property of how it is constructed**, so that a construction site cannot silently fall back to uncached, per-context rebuilds by forgetting to pass a field.

Today three fields independently gate caching, and all three are optional on `CreatePolicyEvaluationContextInput`:

- `runtime?: GameDefRuntime` — when present (and the layout is canonical), `resolveEncodedState` uses `runtime.policyEncodedStateCache` and `resolvePolicyBytecodeCache` uses `runtime.policyBytecodeCache`.
- `encodedState?` / `encodedStateLayout?` — when absent, the constructor calls `resolveEncodedState(input.state)`, which builds directly via `tryBuildEncodedState` when `runtime` is undefined.

Omitting `runtime` produces **no error, no lint failure, no type error**. The context still returns correct values — it just rebuilds encoded state per construction (a cache *miss* the witness counts as a duplicate) and recompiles policy bytecode in a throwaway per-context `fallbackPolicyBytecodeCache`. The defect surfaces only several layers downstream, as a perf-witness count regression.

This spec converts that opt-in into a contract a caller cannot accidentally violate.

## 2. Non-Goals

- **No behavioral change to evaluation results.** The caches are pure memoizations producing byte-identical encoded state (same `tryBuildEncodedState` builder) and identical bytecode. Determinism (Foundation #8) is unchanged — this is purely about *which cache* is consulted, not *what is computed*.
- **No removal of the uncached path.** Some callers legitimately have no runtime (isolated unit tests, ad-hoc evaluation). The uncached path must remain reachable, but only **explicitly**, never by silent omission.
- **No new caches.** This reuses `runtime.policyEncodedStateCache`, `runtime.policyEncodedStateProjectionCache`, and `runtime.policyBytecodeCache` exactly as they exist (`kernel/gamedef-runtime.ts`).
- **No game-specific logic.** This is a generic agent-layer construction contract (Foundation #1).

## 3. Context (verified against codebase, 2026-05-22)

### 3.1 The gating logic

`PolicyEvaluationContext` constructor (`packages/engine/src/agents/policy-evaluation-core.ts`):

```ts
this.encodedStateLayout = input.encodedStateLayout ?? canonicalEncodedStateLayout;          // ~457
this.usesCanonicalEncodedStateLayout = this.encodedStateLayout === canonicalEncodedStateLayout; // ~458
this.encodedState = input.encodedState ?? this.resolveEncodedState(input.state);            // ~459
```

```ts
private resolveEncodedState(state: GameState): EncodedState | undefined {
  if (this.input.runtime !== undefined && this.usesCanonicalEncodedStateLayout) {
    return resolvePolicyEncodedState(this.input.runtime, state, this.encodedStateLayout, tryBuildEncodedState);
  }
  return tryBuildEncodedState(state, this.encodedStateLayout); // uncached, direct build
}

private resolvePolicyBytecodeCache(): WeakMap<CompiledPolicyExpr, PolicyBytecode> {
  if (this.input.runtime !== undefined && this.usesCanonicalEncodedStateLayout) {
    return this.input.runtime.policyBytecodeCache; // shared
  }
  return this.fallbackPolicyBytecodeCache; // per-context, discarded on dispose()
}
```

Both cache decisions hinge on the same predicate: `runtime !== undefined && usesCanonicalEncodedStateLayout`.

### 3.2 The four construction sites (verified)

| Site | Threads `runtime`? | Status |
|------|--------------------|--------|
| `policy-eval.ts:~691` (main per-microturn eval) | yes (+ `encodedView.layout`/`encoded`) | correct |
| `microturn-option-eval.ts:~121` (option projection) | yes | correct |
| `policy-evaluation-core.ts:~2044` (spawned selector-item context) | yes (+ `encodedState`) | correct |
| `plan-proposal.ts:~508` (`evaluatePlanPosture`) | **no** (until `ded6d281f`) | was the outlier |

Three of four sites threaded `runtime`; the fourth did not, and nothing flagged it. The site pre-dated Spec 188 but was dormant — `evaluatePlanPosture` returns early when `template.postureHook === undefined`, and no profile carried a posture hook until Spec 188 added them to all four FITL profiles.

### 3.3 Why it was caught only downstream

The only guard is the convergence-witness `172POLEVASTA-001` (`packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts`), which runs a 4-profile preview-drive workload and asserts `duplicateEncodedStateRebuilds === 0` plus a first-touch static-rebuild budget. It is a heavy perf-lane test, not a unit test, and it asserts an *aggregate* count — so it localizes "something rebuilt too much" but not "which call site." This is the detection-distance characteristic of a silent opt-in degradation.

## 4. Architecture

The fix is to make cache participation derivable from a single required input, so the predicate cannot be half-satisfied by accident. Three candidate shapes (decide during ticket decomposition; §1-3-1 recommendation below):

### 4.1 Option A — Required cache handle (recommended)

Replace the three independent optional fields with a single discriminated input that the type system forces every caller to resolve:

```ts
type PolicyEvalCacheBinding =
  // canonical layout, shared caches; optionally carries a precomputed encoded state
  | { readonly kind: 'runtime'; readonly runtime: GameDefRuntime; readonly preEncoded?: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState } }
  | { readonly kind: 'isolated' }                                       // explicit uncached (tests/ad-hoc)
  | { readonly kind: 'preEncoded'; readonly layout: EncodedStateLayout; readonly encoded: EncodedState };
```

A caller that has a runtime passes `{ kind: 'runtime', runtime }`; a caller that genuinely has none must write `{ kind: 'isolated' }` — explicit, greppable, and reviewable. Omission becomes a type error. Internal layout/encodedState fields are derived from the binding, not threaded separately.

**Orthogonality constraint (verified)**: the three current fields gate *independently*, not exclusively. Two of the four src sites (`policy-eval.ts:~691` main eval, `policy-evaluation-core.ts:~2044` selector-item) pass `runtime` **and** a precomputed `encodedState`+`encodedStateLayout` simultaneously: the explicit `encodedState` short-circuits encoded-state resolution (constructor line ~459), while `runtime` still selects the shared `policyBytecodeCache`. A naive 3-way *mutually exclusive* union cannot express this combination, so the `runtime` variant must optionally carry the precomputed `{ layout, encoded }` (as shown above) rather than forcing a choice between `runtime` and `preEncoded`.

### 4.2 Option B — Helper factory that derives caches from `state`

Provide `createPolicyEvaluationContextForRuntime(runtime, { def, state, ... })` that always threads `runtime` + canonical layout, and reserve the raw constructor for the explicit-isolated case. Mirrors the Step 10 "`state → state` instead of `runtime → runtime`" architectural shape: callers pass what they have (a runtime), not the derived caches.

### 4.3 Option C — Lint/grep guard only (minimal)

Keep the optional fields but add a test (or ESLint rule) asserting every `new PolicyEvaluationContext({...})` in `src/agents/` either passes `runtime` or carries an explicit `// eslint-disable`/comment marker justifying the uncached path. Cheapest, but preserves the silent-omission failure mode — only adds a tripwire.

**1-3-1 recommendation**: **Option A**. It eliminates the failure mode at the type level (Foundation #15, Architectural Completeness) rather than guarding against it after the fact. Note that Option A must accommodate the orthogonal precomputed-encoded-state field (see §4.1 orthogonality constraint), which adds modeling surface and migration churn across the 4 src + 26 test construction sites. Option B is a good intermediate if A's discriminated-union churn is judged too large — and it naturally preserves the orthogonal fields (the helper threads `runtime` while leaving precomputed `encodedState` as an ordinary input), avoiding the union-shape complexity entirely. Option C does not close the gap; reserve it only as a stopgap.

## 5. Determinism and replay (Foundations #8, #16)

No replay or hash impact. Encoded state from the cache is byte-identical to the direct build (identical builder). Bytecode from the shared cache is identical to the per-context build (same `compilePolicyBytecode` inputs). The existing determinism corpus and `172POLEVASTA-001` witness are the proof; this spec strengthens them by making the cached path mandatory where a runtime exists.

## 6. Test plan

- **Architectural-invariant test** (new): assert that constructing a `PolicyEvaluationContext` with a runtime binding and the same `state` twice produces exactly one `buildEncodedState` and one bytecode compile per unique expr (distill the duplicate-rebuild half of `172POLEVASTA-001` into a small, fast unit test that does not need the full 4-profile perf workload).
- **Migration**: all four src construction sites compile against the new contract; the `plan-proposal.ts` posture site is covered by the existing `172POLEVASTA-001` witness, which must still pass at `duplicateEncodedStateRebuilds === 0`.
- **Migration scope (test sites)**: under a constructor-contract change (Options A/B), all **26 test construction sites** of `new PolicyEvaluationContext` migrate to the new binding, several through shared helpers (`test/helpers/compiled-policy-production-helpers.ts`, `test/architecture/lookup-refs-projected/projected-lookup-runtime-test-helpers.ts`, `test/unit/agents/strategy-module-test-fixtures.ts`). Under Option C, no test migration is required. This migration is part of the same change (Foundation #14 — no compatibility shims).
- **Negative**: an explicit `isolated` binding still evaluates correctly (uncached) — guards that the uncached path remains reachable.

## 7. Foundation alignment

- **#8 Determinism Is Sacred** — pure memoization, byte-identical results; no ambient-state dependence introduced.
- **#10 Bounded Computation** — fewer redundant rebuilds; strictly reduces work.
- **#15 Architectural Completeness** — converts a silently-degradable opt-in into a contract the type system enforces.

## 8. Out of scope

- Auditing whether other engine constructors share this opt-in-cache shape (e.g., projection caches). If found during decomposition, file as siblings, not in this spec.
- Any change to the perf-lane sharding or the witness budget beyond what the distilled unit test in §6 supersedes.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-22:

- [`archive/tickets/189POLEVALCACHE-001.md`](../archive/tickets/189POLEVALCACHE-001.md) — Make cache-eligibility structural via required `PolicyEvalCacheBinding` (atomic cut: union + constructor contract + all 4 src + 26 test construction sites) (covers §4 Option A, §6 migration)
- [`tickets/189POLEVALCACHE-002.md`](../tickets/189POLEVALCACHE-002.md) — Distilled cache-dedup architectural-invariant test + isolated-binding negative test (covers §6 test plan)

## Outcome

_Pending._
