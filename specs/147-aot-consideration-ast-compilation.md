# Spec 147: Ahead-Of-Time Compilation Of Consideration AST Trees

**Status**: PROPOSED
**Priority**: P2 (compounds with Spec 146; addresses ~10% of the post-fitl-preview-perf-campaign profile concentrated in interpretive AST evaluation; not a hard prerequisite for spec-146 nor for any specific shipping campaign)
**Complexity**: L (compiler-side AST→closure-tree compilation, kernel-side runtime path that consumes compiled closures, GameDef schema addition for the compiled artifact, fixture migration of every shipped agent profile; no GameSpecDoc YAML change)
**Dependencies**:
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the consideration evaluation surface this spec optimizes.
- Spec 15 [gamespec-agent-policy-ir] — defines the consideration / candidate-feature / state-feature IR that this spec compiles.
- Foundation 1 (Engine Agnosticism) — the compiled closure trees remain game-agnostic; no per-game branches.
- Foundation 7 (Specs Are Data) — the compiled artifact is still data (a DAG of typed closure descriptors), not embedded code; the kernel materializes closures at runtime.
- Foundation 13 (Artifact Identity) — the compiled artifact is part of `GameDef.agents.compiled` and is hashed into `gameDefHash`.

**Source**:
- V8 sampling profile from `campaigns/fitl-preview-perf/musings.md` "Re-profile after exp-015": `resolveRef` (5.7%), `evalCondition` (3.0%), `fnv1a64` (2.4%, partially related), `evalQuery` (1.0%), `buildTokenStateIndex` (1.9%) — collectively ~10-13% of total CPU is in interpretive AST evaluation across the kernel's expression / condition / query evaluators.
- Bottom-up call graph: `resolveRef` accounts for 64% of `ArrayTimSort` callers (pre-exp-015) — a distributed cost across many evaluator paths.
- Cumulative-FITL-perf global lessons: "FITL kernel computation functions (`resolveRef`, `evalCondition`, `foldTokenFilterExpr`, `matchesScalarMembership`) are at a V8 JIT optimization ceiling. ANY modification — WeakMap caching (+7.7%), fast-path branching (+3.8%), short-circuit evaluation (test failures) — causes hidden class deoptimization. The ONLY safe optimization pattern is removing WORK at the orchestration level (skipping calls entirely), not modifying how calls behave."
- The orchestration-level skipping the lessons recommend is exactly what AOT compilation enables: a per-AST-node closure tree replaces the per-evaluation switch dispatch, eliminating both the dispatch cost and the hidden-class polymorphism that V8 cannot resolve in interpretive evaluation.
- Post-Spec-146 handoff from `archive/tickets/146DRIVE-005.md` (2026-04-26): durable production-profile hard-target probe still misses `25600 ms` (`--runs 1` sample `27012.48 ms`; CPU-profile sample `28019.62 ms`, `candidateBudget=465`). Fresh V8 profile shows top self-time in `fnv1a64` 17.68%, GC 11.28%, kernel `resolveRef` 6.09%, `buildTokenStateIndex` 4.71%, `evalCondition` 4.09%, and bottom-up dominance through `policy-evaluation-core:evaluateExpr` / `resolveRef` plus preview-surface resolution. 146DRIVE-005 therefore assigns the next large implementation owner to this spec rather than another narrow Spec 146 drive patch.

## Brainstorm Context

**Original framing.** Agent policy considerations in LudoForge are evaluated via an AST interpreter: each `evaluateExpr(expr, candidate)` call branches on `expr.kind`, dispatches to a per-kind handler, recurses into children, and resolves leaf refs via `resolveRef(expr.ref, ctx)`. The interpreter is correct, generic, and game-agnostic. It is also ~10-13% of CPU on the FITL preview-perf benchmark, concentrated in the fnctional dispatch chain (`evaluateExpr` → `resolveRef` → `evalCondition` → ...).

V8's JIT optimizes hot interpreter loops poorly when the dispatch is over a large `kind` discriminant union. Each AST node sees a different shape on each invocation; inline caches go megamorphic; hidden-class profiles diverge. The result is the ceiling documented across multiple FITL perf campaigns: micro-optimizations to the evaluators themselves cause regression, not improvement.

**Motivation.** AOT compilation of the AST to a tree of typed closures eliminates the dispatch and resolves the inline-cache problem:

- Each AST node compiles to a closure of fixed shape (e.g., `(ctx) => number` for a numeric expression). V8 monomorphizes per-call-site.
- Constant ref resolution (e.g., `ref: feature.selfMargin` where `selfMargin` is a state feature) baked into the closure as a direct property access. No `resolveRef` switch.
- Recursion through closures, not through `evaluateExpr` re-entry. V8 inlines aggressively along the closure call chain when each closure is monomorphic.

**Motivation, part two.** Spec 120 (which the global lessons reference as "partially addressed") covered closure-compilation for one narrow path (compiled token-filter predicates in `kernel/condition-compiler.ts`). This spec generalizes the pattern to the consideration / candidate-feature / state-feature evaluator surface that policy agents exercise on every move-scope evaluation.

**Prior art surveyed.**
- **TAG / OpenSpiel forward models** generally use direct compilation of agent policies into JIT-friendly forms (TAG via Java JIT on lambda-based action evaluators; OpenSpiel via tensor-graph compilation when GPU-backed). Neither runs an AST interpreter on hot evaluation paths.
- **MTGJSON / TaPL-style game-rule interpreters** that DO ship AST interpreters (e.g., XMage's rule engine) document the exact same V8/JVM JIT ceiling — and resolve it with rule-DSL→bytecode compilation pipelines.
- **`kernel/condition-compiler.ts`** in this codebase: already compiles `ConditionAST` into `CompiledConditionPredicate` closures for `legalChoices` evaluation. Demonstrates the pattern is workable in this kernel; this spec extends to the policy evaluator surface.

The shared pattern: when an AST is evaluated millions of times per game, compile it to closures. The kernel's existing condition-compiler shows the design fits within F#1 / F#7.

**Synthesis.** Add an AOT compilation pass to the agent compiler (`packages/engine/src/cnl/compile-agents.ts`) that converts each `AgentPolicyExpr` into a `CompiledPolicyExpr` — a closure-tree where each node is a typed `(ctx, candidate) => PolicyValue` function. Persist the compiled tree alongside the existing IR in `GameDef.agents.compiled` (a new field). The agent runtime (`packages/engine/src/agents/policy-evaluation-core.ts`) consumes compiled closures when present, falling back to the existing AST interpreter when not (the fallback exists only during incremental migration; the final state is compiled-everywhere).

The compiled closure tree is **data**, not code (F#7): each closure is constructed at runtime from a typed descriptor, not from `eval` or `Function`. The descriptor is a `kind`-tagged union the compiler emits; the kernel materializes closures via a fixed factory table. Determinism is preserved — the same descriptor produces the same closure with the same numeric semantics.

**Alternatives explicitly considered (and rejected).**
- **Cache `resolveRef` results per (state, ref) pair.** Tried in prior FITL perf campaigns (per global lessons): WeakMap caching caused +7.7% V8 deopt because adding the cache field changed the hot-path object shape. Rejected — V8-deopt-empirical.
- **Inline `resolveRef` into `evaluateExpr` switch handlers.** Increases function size; V8 stops inlining. Rejected — proven to deopt in `texas-perf-optimization-2/exp-014`.
- **Use `Function` constructor / `eval` to JIT closures from string.** Violates F#7 (Specs Are Data). Rejected.
- **GPU-tensor evaluation.** Out of scope; FITL is a small-state board game, not RL training. Rejected.
- **Defer to V8's eventual smarter inlining.** No timeline; the ceiling has been observed across 3+ kernel versions. Rejected — design accepts the ceiling as architectural.

**User constraints reflected.** F#1 (Engine Agnosticism — closures are constructed from generic descriptors, no game-specific code), F#7 (Specs Are Data — descriptors are typed JSON-serializable values, runtime materializes closures via a fixed factory), F#8 (Determinism — closure semantics are pure functions of their descriptors), F#13 (Artifact Identity — the compiled tree contributes to `gameDefHash`), F#15 (Architectural Completeness — addresses the V8 ceiling root cause, not a workaround), F#16 (Testing as Proof — equivalence between interpreted and compiled paths is proven by a conformance test on the existing AGE corpus).

## Overview

Add a closure-tree compilation pass and runtime path. The pass is invoked by the existing `compileAgents` step (one new module, `cnl/compile-agent-considerations.ts`). The runtime is gated by feature flag `gameDef.agents.compiledEvaluators` (initially default false, flipped to true once the conformance corpus passes).

A consideration like:
```yaml
preferProjectedSelfMargin:
  scopes: [move]
  weight: { param: projectedMarginWeight }
  value:
    ref: feature.projectedSelfMargin
```
compiles into a typed closure tree:
```ts
{
  weight: { kind: 'param', read: (ctx) => ctx.params.projectedMarginWeight },
  value: { kind: 'stateFeature', featureId: 'projectedSelfMargin', read: (ctx) => ctx.evaluation.evaluateStateFeature('projectedSelfMargin') },
}
```
The runtime calls `weight.read(ctx) * value.read(ctx)` directly. No AST traversal, no switch dispatch, no `resolveRef` lookup — the closure baked in the lookup at compile time.

## Problem Statement

### Defect class: interpretive evaluator hot path

`policy-evaluation-core.ts:evaluateExpr` is a 100+-line switch over `expr.kind` with 14+ cases. Each call to `evaluateConsideration` recurses through the AST via this switch. Per the bottom-up profile, `resolveRef` (called from `case 'ref'`) plus `evalCondition` and friends collectively account for ~10-13% of FITL preview-perf CPU.

Per-call cost is dominated by:
- Switch dispatch on `expr.kind`.
- Array spread / `.map()` chains in handler bodies.
- `resolveRef` switch dispatch on `ref.kind` (14-way) for every leaf.
- V8 inline-cache misses because each AST node may have a different shape.

The cumulative-FITL-perf global lesson confirms that direct optimizations of these handlers cause regression. The kernel evaluators are at a JIT ceiling; orchestration-level skipping is the only safe pattern, and the orchestration-level skip available is "compile once, evaluate as closures forever after".

### Why this fits within Foundation 7

The compiled closure tree is **data**, not code. Each closure is constructed at runtime from a typed descriptor:

```ts
type CompiledPolicyExpr =
  | { kind: 'literal'; value: number | boolean | string }
  | { kind: 'param'; paramId: string }
  | { kind: 'stateFeature'; featureId: string }
  | { kind: 'candidateFeature'; featureId: string }
  | { kind: 'previewSurface'; ref: CompiledPreviewSurfaceRef }
  | { kind: 'op'; op: 'add' | 'mul' | 'div' | ...; args: readonly CompiledPolicyExpr[] }
  | ...;
```

The kernel materializes a closure via a fixed factory:

```ts
function buildClosure(expr: CompiledPolicyExpr): (ctx: Ctx) => PolicyValue {
  switch (expr.kind) {
    case 'literal': return () => expr.value;
    case 'param': return (ctx) => ctx.params[expr.paramId];
    case 'stateFeature': return (ctx) => ctx.evaluation.evaluateStateFeature(expr.featureId);
    ...
  }
}
```

The factory is generic, finite, and game-agnostic. The runtime never `eval`s anything. F#7 is preserved.

## Design

### D1. Compiled IR (in `kernel/types-core.ts` or a new `agents/compiled-policy-types.ts`)

```ts
export type CompiledPolicyExpr =
  | { readonly kind: 'literal'; readonly value: number | boolean | string | null }
  | { readonly kind: 'param'; readonly paramId: string }
  | { readonly kind: 'stateFeature'; readonly featureId: string }
  | { readonly kind: 'candidateFeature'; readonly featureId: string }
  | { readonly kind: 'previewStateFeature'; readonly featureId: string }
  | { readonly kind: 'previewSurface'; readonly ref: CompiledPreviewSurfaceRef }
  | { readonly kind: 'currentSurface'; readonly ref: CompiledCurrentSurfaceRef }
  | { readonly kind: 'seatIntrinsic'; readonly intrinsic: string }
  | { readonly kind: 'turnIntrinsic'; readonly intrinsic: string }
  | { readonly kind: 'candidateIntrinsic'; readonly intrinsic: string }
  | { readonly kind: 'candidateParam'; readonly paramId: string }
  | { readonly kind: 'candidateTag'; readonly tagName: string }
  | { readonly kind: 'op'; readonly op: PolicyOp; readonly args: readonly CompiledPolicyExpr[] }
  | { readonly kind: 'aggregate'; readonly aggregateId: string }
  | { readonly kind: 'zoneProp'; readonly zone: CompiledPolicyExpr | string; readonly prop: string }
  | { readonly kind: 'zoneTokenAgg'; readonly aggOp: 'sum' | 'count' | 'min' | 'max'; readonly owner: AgentPolicyZoneTokenAggOwner; readonly zone: CompiledPolicyExpr | string; readonly prop: string }
  | ...;

export interface CompiledPolicyConsideration {
  readonly id: string;
  readonly scopes: readonly AgentPolicyScope[];
  readonly when?: CompiledPolicyExpr;
  readonly weight: CompiledPolicyExpr;
  readonly value: CompiledPolicyExpr;
  readonly clamp?: { readonly min?: number; readonly max?: number };
  readonly unknownAs?: number;
}
```

### D2. Compilation pass (in `cnl/compile-agent-considerations.ts`)

```ts
export const compileAgentConsiderations = (
  catalog: AgentPolicyCatalog,
): CompiledAgentPolicyCatalog => { ... };
```

Pure function: walks every `AgentPolicyExpr` in `catalog.library.{considerations,stateFeatures,candidateFeatures,candidateAggregates,strategicConditions}` and emits a `CompiledPolicyExpr` mirror. Compilation is referentially transparent — same input AST → byte-identical compiled tree.

### D3. Runtime closure factory (in `agents/compiled-policy-runtime.ts`)

```ts
export const buildPolicyExprClosure = (
  expr: CompiledPolicyExpr,
  context: PolicyClosureContext,
): (candidate: PolicyEvaluationCandidate | undefined) => PolicyValue;
```

The factory is a switch over `CompiledPolicyExpr.kind` that returns a closure capturing the relevant context. Closures are built once per `PolicyEvaluationContext` (existing class), cached on the context, and reused across candidates within the same outer microturn. Each closure is small (≤10 lines), monomorphic at construction time, and inlinable by V8.

### D4. Runtime integration

`PolicyEvaluationContext.evaluateConsideration` (in `agents/policy-evaluation-core.ts`) becomes a thin shim:

```ts
evaluateConsideration(considerations, considerationId, candidate, onContribution?) {
  const compiled = this.input.compiledCatalog?.considerations[considerationId];
  if (compiled !== undefined) {
    return this.evaluateCompiledConsideration(compiled, candidate, onContribution);
  }
  // Existing AST-interpreter path retained as fallback during incremental migration.
  return this.evaluateAstConsideration(considerations, considerationId, candidate, onContribution);
}
```

Once the conformance corpus passes, the AST-interpreter fallback is deleted (per F#14 — no compatibility shims).

### D5. Equivalence proof (F#16)

A test in `packages/engine/test/integration/agents/compiled-evaluator-equivalence.test.ts` asserts that for every consideration / state-feature / candidate-feature in every shipped GameSpec, the compiled and interpreted paths produce identical `PolicyValue` for a corpus of `(state, candidate)` inputs drawn from the existing perf-test fixtures. CI blocks if the two paths diverge.

### D6. ABI compatibility & gameDefHash

The compiled tree is added as `GameDef.agents.compiled` (new optional field; once migration completes, becomes required). The hash contribution is canonical-serialized as part of `gameDefHash` per F#13. Existing fixture artifacts (`packages/engine/test/fixtures/`) are migrated in the same change per F#14.

## Acceptance Criteria

1. **Performance**: `previewOn_totalMs_ms` on the spec-145 perf corpus drops by ≥6% relative to the post-spec-146 baseline (i.e., addresses ~half the documented ~10-13% interpretive cost). Combined with Spec 146 the cumulative win is expected to bring previewOn under the 25.6s hard target.
2. **Equivalence**: Compiled and interpreted paths produce identical `PolicyValue` for every consideration on every input in the existing AGE conformance corpus. CI-enforced.
3. **Determinism**: `gameDefHash` is canonically reproducible across compiles (same GameSpec → same compiled tree → same hash).
4. **Full gate**: `pnpm turbo test` passes.
5. **Profile evidence**: `resolveRef` self-time drops by ≥50% (it's no longer on the hot evaluator path; compiled closures bypass it).

## Risks

- **Migration cost**: Every shipped agent profile must round-trip through the new compilation pipeline. Mitigated by automating fixture regeneration via `sync-fixtures.sh` and gating on the equivalence test.
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

- [`tickets/147AOTCON-001.md`](../tickets/147AOTCON-001.md) — Add compiled policy expression descriptors and equivalence scaffold.
