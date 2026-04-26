# Spec 147: Ahead-Of-Time Compilation Of Consideration AST Trees

**Status**: PROPOSED
**Priority**: P2 (compounds with Spec 146; addresses ~10% of the post-fitl-preview-perf-campaign profile concentrated in interpretive AST evaluation; not a hard prerequisite for spec-146 nor for any specific shipping campaign)
**Complexity**: L (compiler-side AST→closure-tree compilation, kernel-side runtime path that consumes compiled closures, GameDef schema addition for the compiled artifact, fixture migration of every shipped agent profile; no GameSpecDoc YAML change)
**Dependencies**:
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the consideration evaluation surface this spec optimizes.
- Spec 15 [fitl-foundation-scope-and-engine-gaps] (archived) — defines the consideration / candidate-feature / state-feature IR that this spec compiles.
- Foundation 1 (Engine Agnosticism) — the compiled closure trees remain game-agnostic; no per-game branches.
- Foundation 7 (Specs Are Data) — the compiled artifact is still data (a DAG of typed closure descriptors), not embedded code; the kernel materializes closures at runtime.
- Foundation 13 (Artifact Identity) — the compiled artifact is added under `GameDef.agents` and is fingerprinted into the existing `AgentPolicyCatalog.catalogFingerprint` (computed by `fingerprintPolicyIr` in `agents/policy-ir.ts`); no new hash mechanism is introduced.

**Source**:
- V8 sampling profile from `archive/tickets/146DRIVE-005.md:124-129` (post-Spec-146 baseline, 2026-04-26): top aggregated self-time samples are `fnv1a64` 17.68%, garbage collector 11.28%, kernel `resolveRef` 6.09%, `buildTokenStateIndex` 4.71%, `evalCondition` 4.09%, `evalValue` 2.89%, `evaluateVia` 2.78%, `canonicalizeHashValue` 2.74%, `digestDecisionStackFrame` 1.08%. `policy-evaluation-core:evaluateExpr` and `resolveRef` collectively dominate the policy side; the agent-side interpretive AST evaluation accounts for roughly the `resolveRef` + `evalCondition` + adjacent self-time samples (≈10-13% of CPU when surface-resolution paths reached via `evaluateExpr` are included).
- Cumulative-FITL-perf global lessons: "FITL kernel computation functions (`resolveRef`, `evalCondition`, `foldTokenFilterExpr`, `matchesScalarMembership`) are at a V8 JIT optimization ceiling. ANY modification — WeakMap caching (+7.7%), fast-path branching (+3.8%), short-circuit evaluation (test failures) — causes hidden class deoptimization. The ONLY safe optimization pattern is removing WORK at the orchestration level (skipping calls entirely), not modifying how calls behave."
- The orchestration-level skipping the lessons recommend is exactly what AOT compilation enables: a per-AST-node closure tree replaces the per-evaluation switch dispatch, eliminating both the dispatch cost and the hidden-class polymorphism that V8 cannot resolve in interpretive evaluation.
- Post-Spec-146 handoff from `archive/tickets/146DRIVE-005.md` (2026-04-26): durable production-profile hard-target probe still misses `25600 ms` (`--runs 1` sample `27012.48 ms`; CPU-profile sample `28019.62 ms`, `candidateBudget=465`). The Outcome section explicitly assigns the next large implementation owner to this spec rather than another narrow Spec 146 drive patch.

## Brainstorm Context

**Original framing.** Agent policy considerations in LudoForge are evaluated via an AST interpreter: each `evaluateExpr(expr, candidate)` call branches on `expr.kind`, dispatches to a per-kind handler, recurses into children, and resolves leaf refs via `resolveRef(expr.ref, ctx)`. The interpreter is correct, generic, and game-agnostic. It is also ~10-13% of CPU on the FITL preview-perf benchmark, concentrated in the functional dispatch chain (`evaluateExpr` → `resolveRef` → `evalCondition` → ...).

V8's JIT optimizes hot interpreter loops poorly when the dispatch is over a large `kind` discriminant union. Each AST node sees a different shape on each invocation; inline caches go megamorphic; hidden-class profiles diverge. The result is the ceiling documented across multiple FITL perf campaigns: micro-optimizations to the evaluators themselves cause regression, not improvement.

**Motivation.** AOT compilation of the AST to a tree of typed closures eliminates the dispatch and resolves the inline-cache problem:

- Each AST node compiles to a closure of fixed shape (e.g., `(ctx) => number` for a numeric expression). V8 monomorphizes per-call-site.
- Constant ref resolution (e.g., `ref: feature.selfMargin` where `selfMargin` is a state feature) baked into the closure as a direct property access. No `resolveRef` switch.
- Recursion through closures, not through `evaluateExpr` re-entry. V8 inlines aggressively along the closure call chain when each closure is monomorphic.

**Motivation, part two.** Spec 120 [widen-compiled-expression-coverage] (archived) covered closure-compilation for one narrow path (compiled token-filter / condition predicates in `kernel/condition-compiler.ts`). That precedent demonstrates V8-monomorphizable closures are workable in this kernel; this spec generalizes to the consideration / candidate-feature / state-feature evaluator surface that policy agents exercise on every move-scope evaluation, and adds a serializable descriptor layer that the existing condition compiler does not have (see "Prior art surveyed" below).

**Prior art surveyed.**
- **TAG / OpenSpiel forward models** generally use direct compilation of agent policies into JIT-friendly forms (TAG via Java JIT on lambda-based action evaluators; OpenSpiel via tensor-graph compilation when GPU-backed). Neither runs an AST interpreter on hot evaluation paths.
- **MTGJSON / TaPL-style game-rule interpreters** that DO ship AST interpreters (e.g., XMage's rule engine) document the exact same V8/JVM JIT ceiling — and resolve it with rule-DSL→bytecode compilation pipelines.
- **`kernel/condition-compiler.ts`** in this codebase: `tryCompileCondition` / `tryCompileValueExpr` walk a `ConditionAST` / `ValueExpr` and **return closures directly** (`CompiledConditionPredicate`, `CompiledConditionValueAccessor`) — there is no intermediate descriptor representation. This proves V8 monomorphizes the closure shape well, but the artifact is not JSON-serializable and not part of `catalogFingerprint`. Spec 147 keeps the closure-shape lesson and adds a typed descriptor layer above it so the compiled tree can round-trip through `GameDef` and contribute to `catalogFingerprint` per F#7 / F#13.

The shared pattern: when an AST is evaluated millions of times per game, compile it to closures. The kernel's existing condition-compiler validates the closure step; Spec 147 introduces the descriptor step on top so the compiled artifact stays inside the data plane.

**Synthesis.** Add an AOT lowering pass to the agent compiler (extend `packages/engine/src/cnl/compile-agents.ts`'s `lowerAgents` pipeline, or attach a sibling `cnl/lower-agent-considerations.ts` invoked from it) that converts each `AgentPolicyExpr` into a `CompiledPolicyExpr` descriptor tree. Each descriptor is a typed JSON-serializable record; the agent runtime (`packages/engine/src/agents/policy-evaluation-core.ts`) materializes a closure-tree from those descriptors at the start of each `PolicyEvaluationContext` and reuses it across candidates. Persist the compiled descriptor tree alongside the existing IR in `GameDef.agents.compiled` (a new optional field on `AgentPolicyCatalog`). During incremental migration the runtime falls back to the existing AST interpreter when `compiled` is absent; once the conformance corpus passes, the AST-interpreter path and the optional flag are deleted in the same change as the fixture migration (F#14).

The compiled descriptor tree is **data**, not code (F#7): each descriptor is a `kind`-tagged record the compiler emits; the kernel materializes closures via a fixed factory table at runtime. No `eval`, no `Function`. Determinism is preserved — the same `AgentPolicyExpr` produces the same descriptor tree, and `fingerprintPolicyIr` already canonicalizes the surrounding catalog.

**Alternatives explicitly considered (and rejected).**
- **Cache `resolveRef` results per (state, ref) pair.** Tried in prior FITL perf campaigns (per global lessons): WeakMap caching caused +7.7% V8 deopt because adding the cache field changed the hot-path object shape. Rejected — V8-deopt-empirical.
- **Inline `resolveRef` into `evaluateExpr` switch handlers.** Increases function size; V8 stops inlining. Rejected — covered by the cumulative-FITL-perf global lesson on the kernel-evaluator JIT ceiling cited under Source.
- **Use `Function` constructor / `eval` to JIT closures from string.** Violates F#7 (Specs Are Data). Rejected.
- **GPU-tensor evaluation.** Out of scope; FITL is a small-state board game, not RL training. Rejected.
- **Defer to V8's eventual smarter inlining.** No timeline; the ceiling has been observed across 3+ kernel versions. Rejected — design accepts the ceiling as architectural.

**User constraints reflected.** F#1 (Engine Agnosticism — closures are constructed from generic descriptors, no game-specific code), F#7 (Specs Are Data — descriptors are typed JSON-serializable values, runtime materializes closures via a fixed factory), F#8 (Determinism — closure semantics are pure functions of their descriptors), F#13 (Artifact Identity — the compiled tree contributes to the existing `AgentPolicyCatalog.catalogFingerprint` via `fingerprintPolicyIr`), F#15 (Architectural Completeness — addresses the V8 ceiling root cause, not a workaround), F#16 (Testing as Proof — equivalence between interpreted and compiled paths is proven by a conformance test modeled on `packages/engine/test/integration/compiled-condition-equivalence.test.ts`).

## Overview

Add a descriptor-tree lowering pass plus a runtime closure-materialization path. The pass is invoked by the existing `lowerAgents` step in `cnl/compile-agents.ts` (one new sibling module, `cnl/lower-agent-considerations.ts`, or an internal addition to `AgentLibraryCompiler`). The runtime path is selected by the presence of `GameDef.agents.compiled` — present means use compiled descriptors; absent means fall back to the existing AST interpreter. The optional/fallback shape exists only inside the migration: once the conformance corpus passes, the AST interpreter, the optional marker, and the field's optionality are removed in the same change as the fixture regeneration (per F#14).

A consideration like:
```yaml
preferProjectedSelfMargin:
  scopes: [move]
  weight: { param: projectedMarginWeight }
  value:
    ref: feature.projectedSelfMargin
```
lowers into a `CompiledPolicyConsideration` descriptor:
```ts
{
  id: 'preferProjectedSelfMargin',
  scopes: ['move'],
  weight: { kind: 'param', id: 'projectedMarginWeight' },
  value: { kind: 'ref', ref: { kind: 'library', refKind: 'stateFeature', id: 'projectedSelfMargin' } },
}
```
At runtime, `buildPolicyExprClosure` (D3) walks the descriptor once per `PolicyEvaluationContext` and produces two monomorphic closures. The runtime then calls `weight() * value()` directly per candidate. No AST traversal, no `expr.kind` switch, no `resolveRef` switch — the dispatch decisions are baked into the closure shape at materialization time.

## Problem Statement

### Defect class: interpretive evaluator hot path

`packages/engine/src/agents/policy-evaluation-core.ts:evaluateExpr` (lines 446–562, 117 lines) is a switch over `expr.kind` with **10 top-level cases** (`literal`, `param`, `ref`, `op`, `zoneProp`, `zoneTokenAgg`, `globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg`, `seatAgg`) plus a nested switch with **22 `op` operators** under `case 'op'` (32 total dispatch arms). Each call to `evaluateConsideration` (lines 407–444) hits this switch up to three times per consideration — once each for `when`, `weight`, and `value` — and recurses through child expressions via `evaluateExprList`. Per the post-Spec-146 bottom-up profile, `resolveRef` plus `evalCondition` and adjacent paths collectively account for ~10-13% of FITL preview-perf CPU.

Per-call cost is dominated by:
- Switch dispatch on `expr.kind` (10 outer + 22 inner-op arms).
- Array spread / `.map()` chains in handler bodies (`evaluateExprList`).
- `resolveRef` switch dispatch on `ref.kind` (13 distinct case labels at `policy-evaluation-core.ts:781–823`; `currentSurface` and `previewSurface` share a single fall-through arm into `resolveSurfaceRef`) for every leaf reference.
- V8 inline-cache misses because each AST node may have a different shape.

The cumulative-FITL-perf global lesson confirms that direct optimizations of these handlers cause regression. The kernel evaluators are at a JIT ceiling; orchestration-level skipping is the only safe pattern, and the orchestration-level skip available is "compile once, evaluate as closures forever after".

### Why this fits within Foundation 7

The compiled descriptor tree is **data**, not code. Each descriptor is a JSON-serializable record; the runtime constructs closures from it at the start of each `PolicyEvaluationContext`:

```ts
// Sketch — full union in D1.
type CompiledPolicyExpr =
  | { kind: 'literal'; value: number | boolean | string | null }
  | { kind: 'param'; id: string }
  | { kind: 'ref'; ref: CompiledAgentPolicyRef }   // already defined in kernel/types-core.ts
  | { kind: 'op'; op: AgentPolicyOperator; args: readonly CompiledPolicyExpr[] }
  // … plus zoneProp, zoneTokenAgg, globalTokenAgg, globalZoneAgg, adjacentTokenAgg, seatAgg
  ;
```

The kernel materializes a closure via a fixed factory:

```ts
function buildClosure(expr: CompiledPolicyExpr): (candidate: PolicyEvaluationCandidate | undefined) => PolicyValue {
  switch (expr.kind) {
    case 'literal': return () => expr.value === null ? undefined : expr.value;
    case 'param':   return () => ctx.input.parameterValues[expr.id];
    case 'ref':     return buildRefClosure(expr.ref);
    // … one arm per CompiledPolicyExpr.kind
  }
}
```

The factory is generic, finite, and game-agnostic. The runtime never `eval`s anything. The compiled tree is fingerprinted as part of the existing `AgentPolicyCatalog.catalogFingerprint` (computed by `fingerprintPolicyIr`). F#7 is preserved.

Note: `kernel/condition-compiler.ts` already returns closures directly, but its closures are not JSON-serializable and not part of `catalogFingerprint`. Spec 147's descriptor layer is what makes the agent-side compiled artifact data rather than code.

## Design

### D1. Compiled IR (in `kernel/types-core.ts`, near the existing `Compiled*` agent types)

The compiled union mirrors every existing `AgentPolicyExpr.kind` (`kernel/types-core.ts:451`). Reference families flatten through the existing `CompiledAgentPolicyRef` (`types-core.ts:381`), which already covers `library` (with `refKind` ∈ `'stateFeature' | 'candidateFeature' | 'aggregate' | 'previewStateFeature'`), `currentSurface`, `previewSurface`, `seatIntrinsic`, `turnIntrinsic`, `candidateIntrinsic`, `candidateParam`, `decisionIntrinsic`, `optionIntrinsic`, `strategicCondition`, `candidateTag`, `candidateTags`, and `contextKind`.

```ts
export type CompiledPolicyExpr =
  | { readonly kind: 'literal'; readonly value: AgentPolicyLiteral }
  | { readonly kind: 'param'; readonly id: string }
  | { readonly kind: 'ref'; readonly ref: CompiledAgentPolicyRef }
  | { readonly kind: 'op'; readonly op: AgentPolicyOperator; readonly args: readonly CompiledPolicyExpr[] }
  | { readonly kind: 'zoneProp'; readonly zone: CompiledPolicyExpr | string; readonly prop: string }
  | { readonly kind: 'zoneTokenAgg'; readonly zone: AgentPolicyZoneSource; readonly owner: AgentPolicyZoneTokenAggOwner; readonly prop: string; readonly aggOp: AgentPolicyZoneTokenAggOp }
  | { readonly kind: 'globalTokenAgg'; readonly tokenFilter?: AgentPolicyTokenFilter; readonly aggOp: AgentPolicyZoneTokenAggOp; readonly prop?: string; readonly zoneFilter?: AgentPolicyZoneFilter; readonly zoneScope: AgentPolicyZoneScope }
  | { readonly kind: 'globalZoneAgg'; readonly source: AgentPolicyZoneAggSource; readonly field: string; readonly aggOp: AgentPolicyZoneTokenAggOp; readonly zoneFilter?: AgentPolicyZoneFilter; readonly zoneScope: AgentPolicyZoneScope }
  | { readonly kind: 'adjacentTokenAgg'; readonly anchorZone: AgentPolicyZoneSource; readonly tokenFilter?: AgentPolicyTokenFilter; readonly aggOp: AgentPolicyZoneTokenAggOp; readonly prop?: string }
  | { readonly kind: 'seatAgg'; readonly over: 'opponents' | 'all' | readonly string[]; readonly expr: CompiledPolicyExpr; readonly aggOp: AgentPolicyZoneTokenAggOp };
```

The compiled consideration mirrors the already-exported `CompiledAgentConsideration` (`kernel/types-core.ts:672`); the only delta is that `when` / `weight` / `value` carry `CompiledPolicyExpr` rather than `AgentPolicyExpr`:

```ts
export interface CompiledPolicyConsideration {
  readonly id: string;
  readonly scopes: readonly ('move' | 'completion')[];
  readonly when?: CompiledPolicyExpr;
  readonly weight: CompiledPolicyExpr;
  readonly value: CompiledPolicyExpr;
  readonly clamp?: { readonly min?: number; readonly max?: number };
  readonly unknownAs?: number;
}
```

The compiled tree is attached as an optional `compiled` field on `AgentPolicyCatalog` (alongside the existing `library`, `profiles`, `bindingsBySeat`, `catalogFingerprint`). Once the conformance corpus passes, the optional marker and the AST-bearing `library` shape are migrated together (F#14).

### D2. Lowering pass (in `cnl/lower-agent-considerations.ts`, invoked from `lowerAgents`)

```ts
export const lowerAgentConsiderations = (
  library: CompiledAgentLibraryIndex,
): AgentPolicyCatalog['compiled'] => { ... };
```

Pure function: walks every `AgentPolicyExpr` reachable from `library.{considerations,stateFeatures,candidateFeatures,aggregates,strategicConditions}` and emits a `CompiledPolicyExpr` mirror per node. Compilation is referentially transparent — same input AST → byte-identical descriptor tree. The pass is invoked from `lowerAgents` in `cnl/compile-agents.ts:80` after `library` is built and before `catalogFingerprint` is computed, so `fingerprintPolicyIr` covers the compiled tree automatically.

### D3. Runtime closure factory (in `agents/compiled-policy-runtime.ts`)

```ts
export const buildPolicyExprClosure = (
  expr: CompiledPolicyExpr,
  context: PolicyEvaluationContext,
): (candidate: PolicyEvaluationCandidate | undefined) => PolicyValue;
```

The factory is a switch over `CompiledPolicyExpr.kind` (one arm per descriptor variant from D1). Each arm returns a small closure that captures `context` and reads from the existing `PolicyEvaluationContext` providers (`runtimeProviders.intrinsics`, `runtimeProviders.candidates`, `runtimeProviders.completion`, `evaluateStateFeature`, `evaluateAggregate`, `resolveSurfaceRef`, etc.). Closures are built once per `PolicyEvaluationContext`, cached on the context, and reused across candidates within the same outer microturn. Each closure is small (≤10 lines), monomorphic at construction time, and inlinable by V8.

### D4. Runtime integration

`PolicyEvaluationContext.evaluateConsideration` (in `agents/policy-evaluation-core.ts:407`) becomes a thin dispatcher during migration:

```ts
evaluateConsideration(considerations, considerationId, candidate, onContribution?) {
  const compiled = this.input.def.agents?.compiled?.considerations[considerationId];
  if (compiled !== undefined) {
    return this.evaluateCompiledConsideration(compiled, candidate, onContribution);
  }
  // Existing AST-interpreter path retained only until the conformance corpus passes.
  return this.evaluateAstConsideration(considerations, considerationId, candidate, onContribution);
}
```

Once the conformance corpus passes, the AST-interpreter path, the optional marker on `compiled`, and `evaluateExpr` itself are removed in the same change as the fixture migration (per F#14 — migrate all owned artifacts in the same change; no permanent shims).

### D5. Equivalence proof and determinism invariant (F#16)

Two integration tests, both modeled on the existing `packages/engine/test/integration/compiled-condition-equivalence.test.ts` pattern (which uses `test/helpers/compiled-condition-production-helpers.ts` to build a deterministic state corpus and compiled samples):

1. `packages/engine/test/integration/agents/compiled-evaluator-equivalence.test.ts` — for every production-reachable policy carrier and expression kind in every shipped GameSpec (FITL + Texas Hold'em), asserts identical `PolicyValue` between the AST interpreter and the compiled-descriptor closure path over a `(state, candidate)` corpus drawn from the same fixture sources used by the existing perf and policy-summary tests. Descriptor kinds absent from current production policy data are covered by generic synthetic expression parity samples rather than artificial GameSpecDoc policy churn. A new helper `test/helpers/compiled-policy-production-helpers.ts` provides the parallel scaffolding.
2. `packages/engine/test/integration/agents/compiled-policy-determinism.test.ts` — compiles the FITL and Texas catalogs twice and asserts byte-identical `compiled` descriptor trees and identical `catalogFingerprint` values, proving the lowering pass is referentially transparent (F#8 + F#16).

CI blocks if either test fails.

### D6. ABI compatibility & catalog fingerprint

The compiled tree is added as a new optional `compiled` field on `AgentPolicyCatalog` (`kernel/types-core.ts:750`). It contributes to `catalogFingerprint` automatically because `fingerprintPolicyIr` (`agents/policy-ir.ts:3`) hashes the catalog object verbatim and the lowering pass runs before the fingerprint is computed (`cnl/compile-agents.ts:117`). No new hash mechanism is introduced. The schema artifacts (`packages/engine/schemas/GameDef.schema.json`) are regenerated in the same change.

The four repository-owned golden fixtures are migrated in the same change per F#14:

- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json`
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json`

Other `GameDef` consumers are unaffected because adding an optional field to a structurally typed interface does not break any existing reader.

## Acceptance Criteria

1. **Performance**: `previewOn_totalMs_ms` on the spec-145 perf corpus drops by ≥6% relative to the post-spec-146 baseline measured by `pnpm -F @ludoforge/engine measure:preview-hard-target` (i.e., addresses ~half the documented ~10-13% interpretive cost). Combined with Spec 146 the cumulative win is expected to bring `previewOn` under the 25.6s hard target.
2. **Equivalence**: The compiled-descriptor closure path and the AST interpreter return identical `PolicyValue` for every production-reachable policy carrier and expression kind in FITL and Texas Hold'em over the deterministic state corpus built by `compiled-policy-production-helpers.ts` (D5.1). Production-absent descriptor kinds are covered by generic synthetic expression parity samples. CI-enforced.
3. **Determinism**: `catalogFingerprint` is canonically reproducible across compiles for both FITL and Texas (same GameSpec → byte-identical `compiled` tree → identical fingerprint), proven by `compiled-policy-determinism.test.ts` (D5.2).
4. **Full gate**: `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`, and `pnpm turbo schema:artifacts` all pass.
5. **Profile evidence**: A `--cpu-prof` run of `pnpm -F @ludoforge/engine measure:preview-hard-target` shows `resolveRef` self-time dropping by ≥50% relative to the 6.09% baseline recorded in `archive/tickets/146DRIVE-005.md:124-129`. The same script is the methodology gate; pre/post profiles are kept under `/tmp/146drive-profile-*` (or equivalent) and referenced in the implementation ticket.

## Risks

- **Migration cost**: Four golden fixtures (`fitl-policy-catalog.golden.json`, `texas-policy-catalog.golden.json`, `fitl-policy-summary.golden.json`, `texas-policy-summary.golden.json`) must be regenerated in the same change as the lowering pass lands and the AST fallback is removed. Mitigated by automating fixture regeneration via the existing `sync-fixtures.sh` workflow and by gating on the equivalence test (D5.1) before the fixtures are accepted.
- **Compiled-tree size**: Closures are small but numerous. Estimate: <2× the size of the current AST IR. Acceptable.
- **V8 closure deopt for the factory**: If the factory function itself becomes too large, V8 may stop inlining it. Mitigated by keeping each `case` body to ≤10 lines and using a switch (not a Map) for kind dispatch — V8 monomorphizes switches well.
- **Per-context closure-build cost**: ~50-100 closures per outer microturn × 50 microturns = 2500-5000 closures per benchmark. Mitigated by closure-tree caching at the catalog level (compile once per GameDef, materialize once per `PolicyEvaluationContext`, reuse across candidates).

## Out Of Scope

- Spec 146 (scoped-draft-state preview drive).
- Spec 148 (integer-interned identifiers).
- AOT compilation of `evalCondition` ASTs in the kernel's effect-tree application (the spec narrows to agent policy considerations).
- Removal of `policy-evaluation-core.ts:evaluateExpr` until the conformance corpus passes (F#14 still applies — final removal happens in the same change as the corpus-passing migration).
- Performance tuning of the closure factory itself (assumed to be the small-fast path V8 inlines well — to be validated, not optimized further).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-04-26:

- [`archive/tickets/147AOTCON-001.md`](../archive/tickets/147AOTCON-001.md) — Add compiled policy expression descriptors and equivalence scaffold (covers D1 minimum surface, D2 lowering scaffold, D3 runtime materialization scaffold, D5.1 equivalence scaffold).
- [`archive/tickets/147AOTCON-002.md`](../archive/tickets/147AOTCON-002.md) — Extend compiled policy descriptors to full `AgentPolicyExpr` coverage and add determinism invariant (covers D1 full union, D2 full lowering coverage, D3 full factory coverage, D5.2 determinism invariant).
- [`tickets/147AOTCON-003.md`](../tickets/147AOTCON-003.md) — Enable compiled policy path as default, delete AST interpreter, regenerate fixtures, re-measure hard-target (covers D4 runtime collapse, D6 fixture migration, Acceptance Criteria 1 & 5).

## Follow-On Tickets

Namespace: `147AOTCON`

Anticipated decomposition (final ordering and granularity owned by `/spec-to-tickets`):

1. **147AOTCON-001** — Already exists. Adds the descriptor types (D1 minimum surface), the lowering scaffold (D2), the runtime materialization scaffold (D3) for the first supported expression families, and the equivalence test scaffold (D5.1) without enabling the compiled path as default.
2. **147AOTCON-002** — Extend descriptor coverage to every `AgentPolicyExpr.kind` (`zoneProp`, `zoneTokenAgg`, `globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg`, `seatAgg`) and every operator under `op`, plus the determinism invariant test (D5.2).
3. **147AOTCON-003** — Enable the compiled path as default, delete the AST interpreter (`evaluateExpr`, the AST-bearing `library` shape that's no longer needed), regenerate the four golden fixtures (D6), and re-measure the hard-target profile (Acceptance Criterion 5).
