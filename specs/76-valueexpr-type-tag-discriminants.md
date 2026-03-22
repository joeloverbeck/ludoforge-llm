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

In the CNL compiler output pipeline (after `compileGameSpecToGameDef`), a
tree-walking pass adds `_t` to all ValueExpr nodes in:
- Action effects and cost expressions
- Phase lifecycle effects (onEnter, onExit)
- Trigger effects
- Terminal conditions
- Action preconditions
- Parameter domain expressions

This pass runs ONCE during compilation — zero runtime cost.

### evalValue changes

```typescript
export function evalValue(expr: ValueExpr, ctx: ReadContext): ScalarValue | ScalarArrayValue {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }
  switch ((expr as { readonly _t: number })._t) {
    case 1: return (expr as { readonly scalarArray: ScalarArrayValue }).scalarArray;
    case 2: return resolveRef(expr as Reference, ctx);
    case 3: return evalConcat(expr, ctx);
    case 4: { const ifExpr = (expr as any).if; return evalCondition(ifExpr.when, ctx) ? evalValue(ifExpr.then, ctx) : evalValue(ifExpr.else, ctx); }
    case 5: return evalAggregate(expr, ctx);
    case 6: return evalArithmetic(expr, ctx);
    default: return expr;
  }
}
```

The handler bodies (`evalConcat`, `evalAggregate`, `evalArithmetic`) are
extracted into separate functions to keep `evalValue` small (critical for
V8 inlining — lesson from exp-014).

### JSON Schema changes

The GameDef JSON schema adds `_t` as a required integer field on all
non-primitive ValueExpr variants. This is a schema-breaking change — old
GameDef JSON files must be re-compiled.

### EffectAST tags (optional extension)

EffectAST already uses `effectKindOf` with `for-in` first-key extraction,
which is reasonably fast. Adding `_t` to EffectAST nodes is an optional
extension that would make `effectKindOf` a direct property access instead
of `for-in` iteration. This can be deferred or included based on profiling.

## Scope

### Files affected

- `packages/engine/src/kernel/types-ast.ts` — ValueExpr type + tag constants
- `packages/engine/src/kernel/eval-value.ts` — switch dispatch + extract handlers
- `packages/engine/src/kernel/eval-condition.ts` — remove dead profiler code (opportunistic)
- `packages/engine/src/cnl/compiler.ts` (or post-compilation pass) — tag assignment
- `packages/engine/schemas/gamedef.schema.json` — add `_t` field
- `packages/engine/test/` — update test fixtures that create ValueExpr objects
- `packages/engine/src/kernel/effect-compiler-codegen.ts` — compiled effects that create ValueExpr

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
