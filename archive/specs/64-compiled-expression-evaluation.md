# Spec 64 — Compiled Expression Evaluation

## Status

🚫 NOT IMPLEMENTED

## Dependencies

- **Soft dependency on Spec 63 (Profile-Gated Spread Reduction Audit)**: Spec 63 targets 1-3% improvement from remaining spread overhead in apply-move.ts. The interpreter's allocation profile may shift slightly after Spec 63, but this is guidance, not blocking — token filter compilation (Phase 1 here) targets interpretive dispatch overhead, not allocation overhead.
- **Independent of Spec 65 (Integer-Interned IDs)**: Can be implemented before or after. If Spec 65 lands first, compiled expressions can use integer comparisons directly.

## Problem

The kernel interprets condition, value, and token-filter AST nodes at runtime by walking tree structures, dispatching on `op`/`ref` fields, and creating intermediate objects for each node. CPU profiling of FITL simulations shows:

| JS Function | % of CPU | Role |
|-------------|----------|------|
| `resolveRef` | 7.88% (4 JIT variants) | Reference resolution dispatch |
| `evalCondition` | 6.40% (2 JIT variants) | Condition tree evaluation |
| `foldTokenFilterExpr` | 4.63% | Token filter tree traversal |
| **Total** | **~19%** | Interpretive AST evaluation |

These functions are called millions of times per game. Each call walks the AST, performs type dispatch (`if ('ref' in node) ... else if ('op' in node) ...`), and creates intermediate objects. The dispatch overhead alone is significant — V8's inline caches become megamorphic because the same function processes many different node shapes.

## Codebase Status

A compiled condition system **already exists** and is partially integrated:

- **`packages/engine/src/kernel/condition-compiler.ts`** (271 lines): `tryCompileCondition()` compiles `ConditionAST` subtrees to `CompiledConditionPredicate` functions. `tryCompileValueExpr()` compiles simple value expressions (gvar, pvar, binding refs, zone count aggregates). Returns `null` for non-compilable expressions (conservative fallback).
- **`packages/engine/src/kernel/compiled-condition-cache.ts`** (62 lines): `getCompiledPipelinePredicates()` — WeakMap-based cache keyed on `ActionPipelineDef[]`. Built on first access, reused for identical pipeline arrays.
- **`packages/engine/src/kernel/pipeline-viability-policy.ts:62-72`**: `evaluateCompiledPredicate()` checks the cache, calls the compiled function if available, falls back to `evalActionPipelinePredicate()` (the interpreter) if not.

**Current coverage**: Pipeline legality and cost-validation predicates only. Comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), boolean logic (`and`, `or`, `not`), direct reference access (`gvar`, `pvar`, binding), and zone count aggregates.

**NOT covered**: Token filter expressions (entirely interpreted via `foldTokenFilterExpr`), general condition evaluation in `eval-condition.ts` (action preconditions, trigger conditions), and complex value expressions (aggregates with queries, spatial conditions).

The existing compiled effects system (`effect-compiler.ts`, `effect-compiler-codegen.ts`) stores compiled functions in `GameDefRuntime.compiledLifecycleEffects`, NOT in `GameDef`. This separation is required by Foundation 7.

## FOUNDATIONS Alignment

Foundation 12 (Compiler-Kernel Validation Boundary):
> "The compiler validates everything knowable from the spec alone."

The structure of conditions, value expressions, and token filters is fully knowable at compile time. The compiler already validates them. Extending the compiler to ALSO generate optimized evaluation functions is a natural extension of Foundation 12 — moving work from runtime to compile time.

Foundation 7 (Specs Are Data, Not Code):
> "No eval, embedded scripts, runtime callbacks, plugin hooks, or arbitrary code generation inside GameSpecDoc, GameDef, visual config, or experiment artifacts."

Compiled functions MUST NOT be stored in `GameDef`. They live in runtime caches (`WeakMap` on stable AST references) or `GameDefRuntime`, following the established pattern from `compiled-condition-cache.ts` and `effect-compiler.ts`. `GameDef` contains only immutable AST nodes. No `eval()` or `Function()` is used.

Foundation 15 (Architectural Completeness):
> "Solutions address root causes, not symptoms."

The root cause is interpretive dispatch overhead. The solution extends the existing compilation infrastructure (`condition-compiler.ts`) to cover more expression types, rather than building a parallel system.

## Prior Art and Risk

The existing `effect-compiler.ts` compiles lifecycle effects to direct JS functions. A prior performance campaign (texas-perf-optimization-2) found that **compiled effects were 12-16% slower than the optimized interpreter** after interpreter optimizations. The lesson:

> "V8 JIT optimizes the interpreter pattern very aggressively. Compiled alternatives need V8-aware design (stable hidden classes, monomorphic call sites, inlineable function sizes)."

This spec MUST address the V8 deopt risk explicitly. The compiled functions must:
1. Have stable, monomorphic hidden classes
2. Be small enough for V8 to inline (~60 lines max)
3. Not create polymorphic call sites by mixing compiled and interpreted paths within the same call site
4. Be benchmarked against the interpreter BEFORE adoption — profiling gate per phase

The existing `evaluateCompiledPredicate` pattern (check cache → call compiled → fall back to interpreter) is proven to work without V8 deopt because the compiled and interpreted paths are called from DIFFERENT call sites, not mixed within the same call.

## Proposed Design

### Phase 1: Token Filter Compilation (NEW — primary deliverable)

Token filters are entirely uncompiled and have the simplest structure. This is the highest marginal-impact phase.

**Architecture**: Create `tryCompileTokenFilter()` parallel to `tryCompileCondition()`, and `CompiledTokenFilterCache` parallel to `compiled-condition-cache.ts`:

```typescript
// New file: packages/engine/src/kernel/token-filter-compiler.ts
export type CompiledTokenFilterPredicate = (token: Token) => boolean;

export function tryCompileTokenFilter(
  expr: TokenFilterExpr,
): CompiledTokenFilterPredicate | null {
  // Compile static filters (prop eq/neq/in with literal values)
  // Return null for dynamic filters (binding-dependent, zone-prop)
}
```

```typescript
// New file: packages/engine/src/kernel/compiled-token-filter-cache.ts
// WeakMap<TokenFilterExpr reference, CompiledTokenFilterPredicate | null>
```

**Integration**: In `matchesTokenFilterExpr` (token-filter.ts), check the cache before calling `foldTokenFilterExpr`:

```typescript
export function matchesTokenFilterExpr(token, expr, ...) {
  const compiled = getCompiledTokenFilter(expr);
  if (compiled !== null) {
    return compiled(token);
  }
  // Existing fold path (unchanged)
  return foldTokenFilterExpr(expr, { ... });
}
```

**Compilable filters** (most FITL filters):
- `{ prop: X, op: eq, value: LITERAL }` → `token.props.X === LITERAL`
- `{ prop: X, op: in, value: [A, B] }` → `token.props.X === A || token.props.X === B`
- `{ op: and, args: [...compilable] }` → `compiled_0(token) && compiled_1(token)` (short-circuit)
- `{ op: or, args: [...compilable] }` → `compiled_0(token) || compiled_1(token)`
- `{ op: not, arg: compilable }` → `!compiled(token)`

**Non-compilable filters** (fall back to interpreter):
- Filters referencing bindings (`$variable`)
- Zone-prop field lookups (`field.kind === 'zoneProp'`)
- Overlay-dependent filters (free operation context)

**Profiling gate**: Run `perf` after implementation. If `foldTokenFilterExpr` CPU doesn't drop by ≥2%, revert.

### Phase 2: Extend Condition/Value Compiler Coverage (INCREMENTAL)

The existing `condition-compiler.ts` and `compiled-condition-cache.ts` cover pipeline predicates only. This phase extends coverage to general condition evaluation sites.

**What to extend**:
1. Integrate `evaluateCompiledPredicate` pattern into `eval-condition.ts` — the general condition evaluator used by action preconditions, trigger conditions, etc.
2. Extend `tryCompileValueExpr` to handle more value expression types (currently handles refs and zone counts; extend to arithmetic, coalesce, simple aggregates).
3. Extend `tryCompileCondition` to handle spatial conditions, marker state checks, and other common FITL patterns.

**What NOT to extend**:
- Expressions with runtime-dependent bindings (these require the interpreter's dynamic context)
- Aggregate expressions with complex queries (too large for V8 inlining)

**Profiling gate**: Run `perf` after implementation. If `evalCondition` + `resolveRef` CPU doesn't drop by ≥2%, revert.

### V8-Aware Compilation Strategy

1. **One function per filter/condition**: Each compiled function is small (~5-20 lines) and inlineable by V8.
2. **Monomorphic token access**: All compiled token filter functions access `token.props.X` — same hidden class, same inline cache.
3. **Per-expression fallback**: Compiled and interpreted paths are called from different call sites (cache-lookup level). A compiled filter NEVER calls the interpreter internally. If any sub-expression can't be compiled, the ENTIRE expression falls back to the interpreter.
4. **Static compilation only**: Only expressions whose structure is fully determined at compile time are compiled. Dynamic expressions (binding-dependent, state-dependent) use the interpreter.

## Scope

### Mutable
- New file: `packages/engine/src/kernel/token-filter-compiler.ts` — Phase 1
- New file: `packages/engine/src/kernel/compiled-token-filter-cache.ts` — Phase 1
- `packages/engine/src/kernel/token-filter.ts` — Phase 1 integration (check compiled cache)
- `packages/engine/src/kernel/condition-compiler.ts` — Phase 2 (extend coverage)
- `packages/engine/src/kernel/compiled-condition-cache.ts` — Phase 2 (extend integration)
- `packages/engine/src/kernel/eval-condition.ts` — Phase 2 (integrate compiled check)
- `packages/engine/src/cnl/compile-expressions.ts` — optional, if compiler-time pre-analysis aids runtime compilation

### Immutable
- `packages/engine/src/kernel/types-core.ts` — NO AST type changes; compiled functions live in runtime caches, not on AST nodes
- `packages/engine/src/kernel/types-ast.ts` — NO changes
- Game spec data (`data/games/*`) — specs unchanged
- `docs/FOUNDATIONS.md`
- `packages/engine/src/kernel/effect-compiler.ts` — existing, not modified

## Testing Strategy

1. **Equivalence test**: For every compiled expression, verify `compiled(input) === interpreter(input)` across a test corpus spanning all compilable expression shapes.
2. **Benchmark gate per phase**: Compiled path must be faster than interpreter on the FITL 3-seed benchmark. **This is a hard requirement.** If compiled is slower, the phase is reverted (learning from the prior campaign).
3. **Fallback test**: When compiled functions return `null` (non-compilable), the interpreter path produces identical results.
4. **Determinism test**: Compiled execution produces identical game traces (Foundation 8).
5. **Profiling gate**: `perf` before and after each phase. If target function CPU doesn't drop by ≥2%, revert.

## Expected Impact

Phase 1 (token filters): 3-5% reduction — entirely uncompiled today, high call frequency. Phase 2 (conditions/values): 1-3% — extending existing coverage to more call sites. Combined: 4-8% reduction, with profiling gates ensuring no regression.

## Resolution (2026-04-03)

Phase 1 infrastructure and integration landed through archived tickets `64COMEXPEVA-001` and `64COMEXPEVA-002`, but the Phase 1 profiling gate in `64COMEXPEVA-003` did not justify continuing the series. The measured `foldTokenFilterExpr` CPU share moved from `4.63%` to `4.53%`, while the 3-seed benchmark improved from `115150ms` to `113544.62ms`. That wall-clock gain was real but the profiler delta was too small to support the spec's planned Phase 2 expansion, so tickets `64COMEXPEVA-004` and `64COMEXPEVA-005` were closed as not actionable and this spec was archived without full implementation.
