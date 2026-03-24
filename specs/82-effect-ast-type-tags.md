# Spec 82 — Effect AST Type Tags

**Status**: Draft
**Dependencies**: None (standalone)
**Enables**: Spec 81 (Whole-Sequence Effect Compilation) — the compiler can use
numeric tags for faster codegen dispatch. Also improves interpreter dispatch.

## Problem

`EffectAST` nodes are discriminated by their single property key:

```typescript
type EffectAST =
  | { readonly setVar: { ... } }
  | { readonly addVar: { ... } }
  | { readonly if: { ... } }
  | { readonly let: { ... } }
  | ...;
```

The `effectKindOf` function extracts the key using `for-in`:

```typescript
export function effectKindOf(effect: EffectAST): EffectKind {
  for (const key in effect) return key as EffectKind;
  return Object.keys(effect)[0] as EffectKind;
}
```

The effect registry is a string-keyed object:

```typescript
export const registry: EffectRegistry = {
  setVar: applySetVar,
  if: applyIf,
  let: applyLet,
  // ... 27 more entries
};
```

V8 optimizes `for-in` on single-key objects well, and string-keyed property
access is fast. However, the codebase already uses a superior pattern for
`ValueExpr` nodes: a numeric `_t` type tag with `switch` dispatch:

```typescript
export const VALUE_EXPR_TAG = { SCALAR_ARRAY: 1, REF: 2, CONCAT: 3, IF: 4, AGGREGATE: 5, OP: 6 } as const;

export function evalValue(expr: ValueExpr, ctx: ReadContext) {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') return expr;
  switch ((expr as { readonly _t: ValueExprTag })._t) {
    case VALUE_EXPR_TAG.SCALAR_ARRAY: return ...;
    case VALUE_EXPR_TAG.REF: return resolveRef(...);
    // ...
  }
}
```

Numeric `switch` enables V8's **jump table optimization** — O(1) dispatch
regardless of the number of cases. String-based `for-in` + property lookup
is O(1) amortized but has higher constant overhead (iterator protocol,
string hashing, hash-table probe).

With ~150K effect dispatches per game, the overhead difference is small but
measurable. More importantly, aligning EffectAST with ValueExpr's pattern:

1. **Consistency**: Both AST types use the same numeric-tag pattern.
2. **Enables Spec 81**: The whole-sequence compiler can use `switch
   (effect._k)` for fast codegen dispatch, avoiding string comparisons.
3. **Future-proofs**: As effect types grow, numeric switch scales better
   than string-based dispatch.

## Objective

Add a numeric `_k: EffectKindTag` field to every `EffectAST` node. Update
the compiler to set the tag during effect construction. Update the kernel's
effect dispatch to use numeric switch.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: Tags are added by the generic
  compiler. No game-specific logic.
- **Foundation 4 (Schema Ownership)**: The `_k` field is an internal
  optimization detail, not a public schema contract. It is not serialized
  to GameDef JSON — it's computed at compilation time.
- **Foundation 8 (Compiler-Kernel Boundary)**: The compiler adds tags
  (structural concern); the kernel uses them for dispatch (behavioral
  concern). Clean separation preserved.
- **Foundation 9 (No Backwards Compat)**: The old `for-in` dispatch is
  replaced, not wrapped. Test fixtures are updated to include `_k` fields.

## Design

### 1. Type Tag Enum

```typescript
// In types.ts or a new effect-kind-tag.ts
export const EFFECT_KIND_TAG = {
  setVar: 0,
  addVar: 1,
  setActivePlayer: 2,
  transferVar: 3,
  moveToken: 4,
  moveAll: 5,
  moveTokenAdjacent: 6,
  draw: 7,
  shuffle: 8,
  createToken: 9,
  destroyToken: 10,
  setTokenProp: 11,
  reveal: 12,
  conceal: 13,
  bindValue: 14,
  chooseOne: 15,
  chooseN: 16,
  setMarker: 17,
  shiftMarker: 18,
  setGlobalMarker: 19,
  flipGlobalMarker: 20,
  shiftGlobalMarker: 21,
  grantFreeOperation: 22,
  gotoPhaseExact: 23,
  advancePhase: 24,
  pushInterruptPhase: 25,
  popInterruptPhase: 26,
  rollRandom: 27,
  if: 28,
  forEach: 29,
  reduce: 30,
  removeByPriority: 31,
  let: 32,
  evaluateSubset: 33,
} as const;

export type EffectKindTag = typeof EFFECT_KIND_TAG[keyof typeof EFFECT_KIND_TAG];
```

### 2. EffectAST Type Modification

Each variant of the EffectAST union gains a `_k` field:

```typescript
type EffectAST =
  | { readonly _k: 0; readonly setVar: { ... } }
  | { readonly _k: 1; readonly addVar: { ... } }
  | { readonly _k: 28; readonly if: { ... } }
  | { readonly _k: 32; readonly let: { ... } }
  | ...;
```

The `_k` field is a compile-time constant per variant. It is NOT optional —
every EffectAST node must have it.

### 3. Updated effectKindOf

```typescript
/** Reverse lookup: tag number → string kind name. */
const TAG_TO_KIND: readonly EffectKind[] = Object.entries(EFFECT_KIND_TAG)
  .sort(([, a], [, b]) => a - b)
  .map(([k]) => k as EffectKind);

export function effectKindOf(effect: EffectAST): EffectKind {
  return TAG_TO_KIND[effect._k]!;
}
```

### 4. Updated Effect Dispatch

```typescript
// In effect-dispatch.ts
const handlers: readonly ((
  effect: EffectAST, env: EffectEnv, cursor: EffectCursor,
  budget: EffectBudgetState, applyBatch: ApplyEffectsWithBudget,
) => EffectResult)[] = [
  applySetVar,     // 0
  applyAddVar,     // 1
  // ... indexed by EFFECT_KIND_TAG value
];

const applyEffectWithBudget = (effect, env, cursor, budget) => {
  consumeEffectBudget(budget, effectKindOf(effect));
  const handler = handlers[effect._k];
  // ...
};
```

### 5. Compiler Changes

Every effect construction site in `packages/engine/src/cnl/compile-effects-*.ts`
must add the `_k` field:

```typescript
// Before:
{ setVar: { var: varName, value: compiledValue } }

// After:
{ _k: EFFECT_KIND_TAG.setVar, setVar: { var: varName, value: compiledValue } }
```

Similarly, `packages/engine/src/kernel/ast-builders.ts` (if it exists) or
any kernel code that constructs EffectAST nodes for lifecycle effects,
trigger effects, or test fixtures must include `_k`.

### 6. Schema / Serialization

The `_k` field is **not serialized** to GameDef JSON. It is computed during
compilation (`runGameSpecStagesFromBundle`) and is present only in the
in-memory `GameDef` object. If GameDef is serialized and deserialized (e.g.,
for worker transfer), a post-deserialization pass adds `_k` fields.

Alternatively, `_k` can be included in the JSON schema as an optional integer
field. The `assertValidatedGameDef` function ensures it is present.

## Files Modified

| File(s) | Change |
|---------|--------|
| `types-ast.ts` | Add `_k` field to EffectAST union |
| `types.ts` | Export `EFFECT_KIND_TAG` constant |
| `effect-registry.ts` | Replace string-keyed registry with array; update `effectKindOf` |
| `effect-dispatch.ts` | Use `handlers[effect._k]` instead of `registry[kind]` |
| `compile-effects-*.ts` (8 files) | Add `_k` during effect construction |
| `ast-builders.ts` | Add `_k` to effect builder functions |
| Test fixtures | Add `_k` to hand-crafted EffectAST literals |
| `schemas-ast.ts` | Add optional `_k` integer field to JSON schema |

## Estimated Impact

- **Interpreter**: 1–2% improvement from eliminating for-in + enabling
  jump-table dispatch (~150K dispatches per game)
- **Spec 81 compiler**: Faster codegen dispatch during compilation;
  simpler code generation using numeric tags
- **Consistency**: Aligns with proven ValueExpr pattern

## Risks

1. **Wide file touch**: ~15 files modified. **Mitigation**: Mechanical
   changes — each site adds one field. Low risk of logic errors.
2. **Test fixture churn**: Many tests create EffectAST literals that need
   `_k`. **Mitigation**: A helper function `withTag(effect)` can compute
   `_k` from the existing property key, easing migration.
3. **Serialization gap**: If GameDef JSON is loaded without `_k` fields
   (e.g., from a pre-Spec-82 file), the kernel fails. **Mitigation**:
   `assertValidatedGameDef` adds tags on-the-fly if missing.

## Testing Plan

1. **All existing tests pass**: No behavioral change — only dispatch
   mechanism changes.
2. **Tag consistency test**: For every EffectAST node in compiled GameDefs
   (Texas Hold'em, FITL), assert `_k` matches the property key.
3. **Performance benchmark**: Verify effect dispatch is equal or faster.
4. **Round-trip test**: Serialize and deserialize a GameDef, verify `_k`
   fields are correctly restored.
