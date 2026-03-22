# Spec 76 — ValueExpr Type-Tag Discriminants

**Status**: PROPOSED
**Dependencies**: None
**Blocked by**: None
**Enables**: Spec 79 (Compiled Effect Path Redesign) benefits from faster value evaluation

## Problem

`evalValue` consumes **35.7% of CPU** (post-optimization profiling, 20 games).
The function dispatches on `ValueExpr` type using a chain of sequential
property-membership checks:

```typescript
if ('scalarArray' in expr) return expr.scalarArray;
if ('ref' in expr) return resolveRef(expr, ctx);
if (!Array.isArray(expr) && 'concat' in expr) { ... }
if ('if' in expr) { ... }
if ('aggregate' in expr) { ... }
if (!('op' in expr)) return expr;
// arithmetic ops
```

Each `'key' in expr` check is a property existence test. With ~2M evalValue
calls per 50 games and 6+ checks per call (average 3 before matching), this
is ~6M property-existence tests in the hot path.

Meanwhile, the other two major AST types already use faster dispatch:
- **ConditionAST** uses `switch(cond.op)` — V8 compiles this to a jump table
- **EffectAST** uses `for-in` first-key extraction via `effectKindOf`

ValueExpr is the only major AST type without a fast dispatch mechanism.

### Profiling evidence

Microbenchmark (500K dispatches):
```
if-in chain:   3.05ms per 100K
for-in switch: 0.93ms per 100K
Speedup: 3.27x
```

Exp-014 attempted to inline the handlers INTO evalValue (switch + inline
validation). This caused V8 JIT deoptimization because the function body
became too large for V8 to inline. The lesson: **change the dispatch
mechanism, not the function size.**

## Objective

Add a numeric type-tag discriminant `_t` to all non-primitive `ValueExpr`
variants. The compiler assigns tags during GameDef compilation. The kernel
uses `switch(expr._t)` for O(1) dispatch.

**Target**: 5-15% reduction in evalValue self-time (depending on what
fraction of evalValue's 35.7% is dispatch overhead vs. actual computation).

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: Tags are generic — they discriminate
  AST node types, not game-specific constructs. Every game benefits.
- **Foundation 4 (Schema Ownership)**: The `_t` field is added to the generic
  `ValueExpr` union, not a per-game schema.
- **Foundation 8 (Compiler-Kernel Boundary)**: The compiler assigns `_t`
  (structural classification). The kernel consumes `_t` (behavioral dispatch).
  Clean separation.
- **Foundation 9 (No Backwards Compatibility)**: All consumers updated in the
  same change. No fallback dispatch path needed.
- **Foundation 10 (Architectural Completeness)**: Exhaustive switch with throw
  on unknown tags — no silent fallback that could mask compiler bugs.
- **Foundation 12 (Branded Types)**: `VALUE_EXPR_TAG` constants and
  `ValueExprTag` type provide compile-time safety for tag values.

## Design

### Tag values

```typescript
// In types-ast.ts:
export const VALUE_EXPR_TAG = {
  SCALAR_ARRAY: 1,
  REF: 2,
  CONCAT: 3,
  IF: 4,
  AGGREGATE: 5,
  OP: 6,
} as const;

export type ValueExprTag = typeof VALUE_EXPR_TAG[keyof typeof VALUE_EXPR_TAG];
```

Primitive ValueExpr variants (`number`, `boolean`, `string`) are pre-filtered
by `typeof` and never reach the `switch`. They do NOT get tags.

### ValueExpr type changes

```typescript
// Before:
| { readonly scalarArray: ScalarArrayValue }
| Reference
| { readonly op: ...; readonly left: ValueExpr; readonly right: ValueExpr }
| { readonly aggregate: { ... } }
| { readonly concat: readonly ValueExpr[] }
| { readonly if: { readonly when: ConditionAST; ... } }

// After — each variant adds readonly _t: number:
| { readonly _t: 1; readonly scalarArray: ScalarArrayValue }
| (Reference & { readonly _t: 2 })
| { readonly _t: 6; readonly op: ...; readonly left: ValueExpr; readonly right: ValueExpr }
| { readonly _t: 5; readonly aggregate: { ... } }
| { readonly _t: 3; readonly concat: readonly ValueExpr[] }
| { readonly _t: 4; readonly if: { readonly when: ConditionAST; ... } }
```

### Compiler changes

The `lowerValueNode()` function in `compile-conditions-values.ts` is the
primary ValueExpr factory. Each variant receives its `_t` tag inline at
construction time — no separate tree-walking pass needed.

Injection points:
- `lowerValueNode()` — assigns `_t` for scalarArray, op, concat, if variants
- `lowerReference()` — assigns `_t: VALUE_EXPR_TAG.REF` on all Reference objects
- `lowerAggregate()` — assigns `_t: VALUE_EXPR_TAG.AGGREGATE` on aggregate objects

This approach is simpler than a post-compilation pass: impossible to miss a
node, no second AST traversal, zero runtime cost.

### evalValue changes

```typescript
export function evalValue(expr: ValueExpr, ctx: ReadContext): ScalarValue | ScalarArrayValue {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }
  switch ((expr as { readonly _t: ValueExprTag })._t) {
    case VALUE_EXPR_TAG.SCALAR_ARRAY: return (expr as { readonly scalarArray: ScalarArrayValue }).scalarArray;
    case VALUE_EXPR_TAG.REF: return resolveRef(expr as Reference, ctx);
    case VALUE_EXPR_TAG.CONCAT: return evalConcat(expr, ctx);
    case VALUE_EXPR_TAG.IF: { const ifExpr = (expr as any).if; return evalCondition(ifExpr.when, ctx) ? evalValue(ifExpr.then, ctx) : evalValue(ifExpr.else, ctx); }
    case VALUE_EXPR_TAG.AGGREGATE: return evalAggregate(expr, ctx);
    case VALUE_EXPR_TAG.OP: return evalArithmetic(expr, ctx);
    default: {
      const _exhaustive: never = (expr as { readonly _t: ValueExprTag })._t as never;
      throw new Error(`Unknown ValueExpr tag: ${(expr as any)._t}`);
    }
  }
}
```

The handler bodies (`evalConcat`, `evalAggregate`, `evalArithmetic`) are
extracted into separate functions to keep `evalValue` small (critical for
V8 inlining — lesson from exp-014).

The `default` case uses an exhaustive check that throws on unknown tags.
If `_t` is missing or invalid, it's a compiler bug that should fail loudly
(Foundation 8: the compiler guarantees structure).

### JSON Schema changes

The GameDef JSON schema adds `_t` as a required integer field on all
non-primitive ValueExpr variants. This is a schema-breaking change — old
GameDef JSON files must be re-compiled.

### isNumericValueExpr update

`isNumericValueExpr()` in `numeric-value-expr.ts` uses the same
property-discrimination chain (`'scalarArray' in expr`, `'ref' in expr`,
etc.). Update it to dispatch on `_t` instead:

```typescript
export function isNumericValueExpr(expr: ValueExpr): expr is NumericValueExpr {
  if (typeof expr === 'number') return true;
  if (typeof expr === 'boolean' || typeof expr === 'string') return false;
  switch ((expr as { readonly _t: ValueExprTag })._t) {
    case VALUE_EXPR_TAG.SCALAR_ARRAY: return false;
    case VALUE_EXPR_TAG.CONCAT: return false;
    case VALUE_EXPR_TAG.REF: return true;
    case VALUE_EXPR_TAG.AGGREGATE: return true;
    case VALUE_EXPR_TAG.IF:
      return isNumericValueExpr((expr as any).if.then) && isNumericValueExpr((expr as any).if.else);
    case VALUE_EXPR_TAG.OP:
      return isNumericValueExpr((expr as any).left) && isNumericValueExpr((expr as any).right);
    default: {
      const _exhaustive: never = (expr as { readonly _t: ValueExprTag })._t as never;
      throw new Error(`Unknown ValueExpr tag: ${(expr as any)._t}`);
    }
  }
}
```

Consistency benefit: all ValueExpr dispatch paths use the same `_t`
mechanism. Minor speedup for compile-time calls.

## Scope

### Files affected

- `packages/engine/src/kernel/types-ast.ts` — ValueExpr type union + `VALUE_EXPR_TAG` constants
- `packages/engine/src/kernel/eval-value.ts` — switch dispatch + extract handler functions
- `packages/engine/src/kernel/numeric-value-expr.ts` — `isNumericValueExpr()` switch on `_t`
- `packages/engine/src/kernel/eval-condition.ts` — remove dead profiler code (opportunistic)
- `packages/engine/src/cnl/compile-conditions-values.ts` — inline `_t` assignment in `lowerValueNode()`, `lowerReference()`, `lowerAggregate()`
- `packages/engine/schemas/gamedef.schema.json` — add `_t` field to non-primitive ValueExpr variants
- `packages/engine/test/` — update test fixtures that create ValueExpr objects
- `packages/engine/src/kernel/effect-compiler-codegen.ts` — add `_t: VALUE_EXPR_TAG.REF` to Reference objects created by `compileValueAccessor()`

### Files NOT affected

- GameSpecDoc YAML (tags are assigned during compilation, not authored)
- Runner (reads GameState, not ValueExpr)
- Agent policy evaluation (reads through evalValue, transparent)

## Testing

- **Determinism**: Same seed + same actions = identical state hash (existing determinism tests)
- **Golden tests**: Re-compile all game specs, verify identical GameDef JSON (modulo `_t` fields)
- **Property tests**: Random play for N turns with tag dispatch vs. fallback dispatch — identical results
- **Performance**: Benchmark before/after on Texas Hold'em corpus

## Risks

- **V8 switch optimization**: V8 should compile `switch` on small integers to a jump table, but this depends on V8's heuristics. If V8 falls back to if-else chain internally, the gain would be smaller.
- **Schema migration**: All cached/serialized GameDef JSON becomes invalid. This is acceptable per Foundation 9 (no backwards compatibility).

## Future Work

These are separate concerns that may deserve their own specs if post-implementation profiling shows bottlenecks:

- **Reference sub-tags**: Reference has 15 string-keyed sub-variants (`ref: 'gvar' | 'pvar' | ...`). Adding numeric sub-tags could speed up `resolveRef()` dispatch. Profile after `_t` implementation to determine if this is worthwhile.
- **EffectAST tags**: EffectAST uses `effectKindOf` with `for-in` first-key extraction, which is reasonably fast. Adding `_t` to EffectAST's 20+ variants would make `effectKindOf` a direct property access. Profile separately to justify the scope.
