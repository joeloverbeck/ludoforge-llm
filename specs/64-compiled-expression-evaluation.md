# Spec 64 — Compiled Expression Evaluation

## Status

Proposed

## Dependencies

- **Should follow Spec 63 (Scoped Draft State)**: The interpreter's overhead profile will change after Spec 63 eliminates allocation pressure. The compilation targets (resolveRef, evalCondition, foldTokenFilterExpr) may shift in relative importance. Profiling after Spec 63 should guide which expressions to compile first.
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

## FOUNDATIONS Alignment

Foundation 12 (Compiler-Kernel Validation Boundary):
> "The compiler validates everything knowable from the spec alone."

The structure of conditions, value expressions, and token filters is fully knowable at compile time. The compiler already validates them. Extending the compiler to ALSO generate optimized evaluation functions is a natural extension of Foundation 12 — moving work from runtime to compile time.

Foundation 7 (Specs Are Data, Not Code):
> "No eval, embedded scripts, runtime callbacks, plugin hooks, or arbitrary code generation inside GameSpecDoc, GameDef, visual config, or experiment artifacts."

This spec does NOT violate Foundation 7. The compilation happens in the BUILD pipeline (compiler → GameDef), not at runtime. The generated functions are part of the compiled `GameDef` artifact, not embedded in the spec. No `eval` or `Function()` is used — the compiler generates JS source that is bundled with the engine.

Foundation 15 (Architectural Completeness):
> "Solutions address root causes, not symptoms."

The root cause is interpretive dispatch overhead. The solution is AOT compilation.

## Prior Art and Risk

The existing `effect-compiler.ts` infrastructure compiles lifecycle effects to direct JS functions. A prior performance campaign (texas-perf-optimization-2) found that **compiled effects were 12-16% slower than the optimized interpreter** after interpreter optimizations. The lesson:

> "V8 JIT optimizes the interpreter pattern very aggressively. Compiled alternatives need V8-aware design (stable hidden classes, monomorphic call sites, inlineable function sizes)."

This spec MUST address the V8 deopt risk explicitly. The compiled functions must:
1. Have stable, monomorphic hidden classes
2. Be small enough for V8 to inline (~60 lines max)
3. Not create polymorphic call sites by mixing compiled and interpreted paths
4. Be benchmarked against the interpreter BEFORE adoption

## Proposed Design

### Phase 1: Token Filter Compilation (highest impact per expression)

Token filters have the simplest structure and the clearest compilation path:

```yaml
# GameSpec filter
filter:
  op: and
  args:
    - { prop: faction, op: eq, value: VC }
    - { prop: type, op: in, value: [troops, base] }
```

Compiled to:
```typescript
// Generated at compile time, stored in GameDef
const filter_0x1a2b = (token: Token): boolean =>
  token.props.faction === 'VC'
  && (token.props.type === 'troops' || token.props.type === 'base');
```

This eliminates:
- `foldTokenFilterExpr` tree traversal (4.63%)
- `matchesResolvedPredicate` dispatch (object allocation per predicate)
- `matchesScalarMembership` normalization (per `in` predicate)
- Path tracking arrays (never used for valid compiled specs)

### Phase 2: Condition Compilation

Condition ASTs compile to direct boolean functions:

```yaml
# GameSpec condition
when:
  op: '>'
  left:
    aggregate:
      op: count
      query:
        query: tokensInZone
        zone: $zone
        filter: { prop: faction, op: eq, value: VC }
  right: 0
```

Compiled to a function that directly queries zone tokens and counts, without AST interpretation.

### Phase 3: Value Expression Compilation

Value expressions (numeric computations, references) compile to direct accessor functions. `resolveRef` dispatch is replaced by direct field access.

### Storage in GameDef

Compiled functions are stored alongside their AST sources in the `GameDef`:

```typescript
interface CompiledTokenFilter {
  readonly ast: TokenFilterExpr;           // preserved for debugging/replay
  readonly evaluate: (token: Token) => boolean;  // compiled fast path
}
```

The kernel checks for `evaluate` and falls back to `foldTokenFilterExpr(ast, ...)` when absent. This makes compilation optional and preserves backwards compatibility during the migration.

### V8-Aware Compilation Strategy

1. **One function per filter/condition**: Each compiled function is small (~5-20 lines) and inlineable by V8.
2. **Monomorphic token access**: All compiled functions access `token.props.X` — same hidden class, same inline cache.
3. **No mixed dispatch**: A compiled filter NEVER calls the interpreter. If any sub-expression can't be compiled (e.g., runtime-dependent reference), the ENTIRE filter falls back to the interpreter.
4. **Static compilation only**: Only expressions whose structure is fully determined at compile time are compiled. Dynamic expressions (binding-dependent, state-dependent) use the interpreter.

## Scope

### Mutable
- `packages/engine/src/cnl/` — new compilation pass for filters/conditions/values
- `packages/engine/src/kernel/token-filter.ts` — check for compiled fast path
- `packages/engine/src/kernel/eval-condition.ts` — check for compiled fast path
- `packages/engine/src/kernel/eval-value.ts` — check for compiled fast path
- `packages/engine/src/kernel/types-core.ts` — add compiled function fields to AST node types
- New file: `packages/engine/src/cnl/compile-expressions.ts`
- All golden fixtures (GameDef shape changes)

### Immutable
- Game spec data (`data/games/*`) — specs unchanged
- `docs/FOUNDATIONS.md`

## Testing Strategy

1. **Equivalence test**: For every compiled expression, verify `compiled(input) === interpreter(input)` across a test corpus.
2. **Benchmark gate**: Compiled path must be faster than interpreter on the FITL 3-seed benchmark. **This is a hard requirement.** If compiled is slower, the spec is rejected (learning from the prior campaign).
3. **Fallback test**: When compiled functions are absent, the interpreter path produces identical results.
4. **Determinism test**: Compiled execution produces identical game traces (Foundation 8).

## Expected Impact

Phase 1 (filters): 3-5% reduction. Phase 2 (conditions): 3-5%. Phase 3 (values): 3-5%. Combined: 8-15% reduction, but ONLY if V8 deopt is avoided. The benchmark gate ensures no regression.
