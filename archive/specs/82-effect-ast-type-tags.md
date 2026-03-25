# Spec 82 — Effect AST Type Tags

**Status**: ✅ COMPLETED
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
  // ... 31 more entries
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
effect dispatch to use numeric switch. Provide builder helpers that make
manual `_k` assignment unnecessary at construction sites.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: Tags are added by the generic
  compiler. No game-specific logic.
- **Foundation 4 (Schema Ownership)**: The `_k` field is a generic
  optimization — it applies uniformly to all effect kinds for all games.
  No per-game schema files introduced.
- **Foundation 5 (Determinism)**: `_k` is serialized in GameDef JSON,
  ensuring round-trip integrity without recovery passes.
- **Foundation 8 (Compiler-Kernel Boundary)**: The compiler adds tags
  (structural concern); the kernel uses them for dispatch (behavioral
  concern). Clean separation preserved.
- **Foundation 9 (No Backwards Compat)**: The old `for-in` dispatch is
  replaced, not wrapped. `_k` is a required field — no optional/shim
  path. Test fixtures are updated to include `_k` fields.
- **Foundation 10 (Architectural Completeness)**: Builder helpers,
  exhaustiveness assertions, and a tagging utility ensure comprehensive
  coverage. No construction site is left untagged.

## Design

### 1. Type Tag Constant

```typescript
// In types-ast.ts alongside VALUE_EXPR_TAG
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

**Naming convention**: Keys use camelCase matching `EffectKind` string
values (e.g., `EFFECT_KIND_TAG.setVar`, not `EFFECT_KIND_TAG.SET_VAR`).
This differs from `VALUE_EXPR_TAG` (which uses UPPER_CASE) because effect
kind strings are the canonical identifiers throughout the codebase —
matching them reduces cognitive overhead. Note: Spec 81 references must
use this same convention (e.g., `EFFECT_KIND_TAG.let`, not
`EFFECT_KIND_TAG.LET`).

### 2. Exhaustiveness Assertion

```typescript
// Compile-time: tag keys must exactly match EffectKind keys
const _exhaustiveCheck: Record<EffectKind, number> = EFFECT_KIND_TAG;

// CI test: tag count matches EffectKind count
assert.strictEqual(
  Object.keys(EFFECT_KIND_TAG).length,
  Object.keys(registry).length,
  'EFFECT_KIND_TAG must cover all EffectKind variants',
);

// CI test: tag values are contiguous 0..N-1
const tagValues = Object.values(EFFECT_KIND_TAG).sort((a, b) => a - b);
assert.deepStrictEqual(
  tagValues,
  Array.from({ length: tagValues.length }, (_, i) => i),
  'EFFECT_KIND_TAG values must be contiguous starting from 0',
);
```

### 3. EffectKindMap Type Modification

The existing `EffectKindMap` interface uses a double-keyed pattern where
each entry is `{ readonly [kindKey]: payload }`. Adding `_k` requires
each entry to also carry its tag. A helper type makes this clean:

```typescript
// Helper: inject _k into an EffectKindMap entry
type WithKindTag<K extends EffectKind> =
  EffectKindMap[K] & { readonly _k: typeof EFFECT_KIND_TAG[K] };

// Updated EffectAST union
export type EffectAST = { [K in EffectKind]: WithKindTag<K> }[EffectKind];
```

This preserves the existing `EffectKindMap` interface unchanged — each
entry still defines `{ readonly setVar: {...} }` etc. The `_k` field
is injected at the union level via intersection. This minimizes diff
churn on the 34-entry interface.

The `EffectOfKind<K>` helper type is updated accordingly:

```typescript
export type EffectOfKind<K extends EffectKind> = WithKindTag<K>;
```

### 4. Effect Builder Factory

A type-safe factory function eliminates manual `_k` assignment at every
construction site:

```typescript
// In a new file: effect-builders.ts (or in types-ast.ts)
export function makeEffect<K extends EffectKind>(
  kind: K,
  payload: EffectKindMap[K][K],
): WithKindTag<K> {
  return { _k: EFFECT_KIND_TAG[kind], [kind]: payload } as WithKindTag<K>;
}

// Usage in compiler:
// Before:
{ setVar: { var: varName, value: compiledValue } }

// After:
makeEffect('setVar', { var: varName, value: compiledValue })
```

The factory:
- Derives `_k` from the `kind` string automatically — no manual tag
- Provides full type safety — `payload` is narrowed to the correct variant
- Is a zero-cost abstraction at runtime (V8 inlines small functions)

All effect construction sites in `compile-effects-*.ts` (8 files) and
`ast-builders.ts` should migrate to `makeEffect()`. Direct `{ _k: ...,
kind: ... }` construction is permitted but discouraged.

### 5. Updated effectKindOf

```typescript
/** Reverse lookup: tag number → string kind name. */
const TAG_TO_KIND: readonly EffectKind[] = Object.entries(EFFECT_KIND_TAG)
  .sort(([, a], [, b]) => a - b)
  .map(([k]) => k as EffectKind);

export function effectKindOf(effect: EffectAST): EffectKind {
  return TAG_TO_KIND[(effect as { readonly _k: EffectKindTag })._k];
}
```

### 6. Updated Effect Dispatch

The existing typed registry is **preserved** for handler definitions (it
provides per-variant type safety via the mapped type). A parallel dispatch
array provides O(1) lookup by `_k`:

```typescript
// In effect-dispatch.ts

// Build dispatch array from the typed registry (one-time at module load)
const dispatchTable: readonly ((
  effect: EffectAST, env: EffectEnv, cursor: EffectCursor,
  budget: EffectBudgetState, applyBatch: ApplyEffectsWithBudget,
) => EffectResult)[] = TAG_TO_KIND.map(kind => registry[kind] as any);

const applyEffectWithBudget = (effect, env, cursor, budget) => {
  const tag = (effect as { readonly _k: EffectKindTag })._k;
  consumeEffectBudget(budget, TAG_TO_KIND[tag]);
  const handler = dispatchTable[tag];
  if (!handler) {
    throw effectNotImplementedError(TAG_TO_KIND[tag], { effect });
  }
  // ... profiler, invoke handler, normalize result (unchanged)
};
```

This approach:
- **Preserves type safety**: Registry definition still uses `EffectHandler<K>`
- **Enables jump table**: V8 optimizes array-index dispatch
- **Single source of truth**: Dispatch array is derived from registry + tags

### 7. tagEffectAsts Recovery/Migration Helper

A structural tagging helper for test fixtures and validation:

```typescript
// In a new file: tag-effect-asts.ts (mirrors tag-value-exprs.ts)

/** Infer _k tag from the property key of an EffectAST-shaped object. */
function classifyEffectTag(obj: Record<string, unknown>): EffectKindTag | null {
  for (const key in obj) {
    if (key === '_k') continue;
    if (key in EFFECT_KIND_TAG) {
      return EFFECT_KIND_TAG[key as EffectKind];
    }
  }
  return null;
}

/** Recursively walk a structure and add _k tags to EffectAST-shaped objects. */
export function tagEffectAsts<T>(obj: T): T { /* recursive walk */ }
```

**Use cases:**
- **Test migration**: Existing test fixtures that construct EffectAST
  literals by hand can use `tagEffectAsts(fixture)` to add `_k` fields.
  This eases migration — tests don't all need to switch to `makeEffect()`
  immediately.
- **Validation**: A CI test can verify that `tagEffectAsts(compiledGameDef)`
  produces the same `_k` values as the compiler assigned — catching any
  tag/key mismatch.
- **Not needed at runtime boundaries**: Since `_k` is serialized in GameDef
  JSON (see Serialization section), no runtime recovery pass is needed.
  This is strictly a development/test utility.

### 8. Compiler Changes

Every effect construction site in `packages/engine/src/cnl/compile-effects-*.ts`
migrates to `makeEffect()`:

```typescript
// Before:
{ setVar: { var: varName, value: compiledValue } }

// After:
makeEffect('setVar', { var: varName, value: compiledValue })
```

Similarly, `packages/engine/src/kernel/ast-builders.ts` (if it exists) or
any kernel code that constructs EffectAST nodes for lifecycle effects,
trigger effects, or test fixtures must use `makeEffect()` or include `_k`.

### 9. Schema / Serialization

The `_k` field **is serialized** in GameDef JSON as a required integer.

**Rationale** (per Foundations analysis):
- **Foundation 5**: Round-trip integrity without recovery passes.
- **Foundation 9**: No tagging shim needed at deserialization boundaries.
- **Foundation 10**: Architecturally complete — the type says `_k` is
  required, the serialized form includes it.

The JSON schema in `schemas-ast.ts` adds `_k` as a required integer field
on each effect object. `assertValidatedGameDef` validates its presence.

Worker transfer via Comlink's `structuredClone` preserves `_k` automatically.

**Note on `_t` divergence**: The `ValueExpr` `_t` tag currently uses a
post-deserialization tagging pass (`tagValueExprs`). This is arguably
technical debt (per Foundation 9). Aligning `_t` with this spec's
serialize-always approach is out of scope but recommended for a future
cleanup spec.

## Files Modified

| File(s) | Change |
|---------|--------|
| `types-ast.ts` | Add `EFFECT_KIND_TAG` constant, `EffectKindTag` type, `WithKindTag<K>` helper, update `EffectAST` and `EffectOfKind` |
| `effect-builders.ts` (new) | `makeEffect<K>()` factory function |
| `effect-registry.ts` | Replace `effectKindOf` with tag-based lookup; add `TAG_TO_KIND` array |
| `effect-dispatch.ts` | Add `dispatchTable` array; use `effect._k` for dispatch |
| `tag-effect-asts.ts` (new) | `tagEffectAsts()` structural tagging helper |
| `compile-effects-*.ts` (8 files) | Migrate to `makeEffect()` |
| `ast-builders.ts` | Migrate to `makeEffect()` |
| `schemas-ast.ts` | Add required `_k` integer field to effect JSON schema |
| Test fixtures | Add `_k` via `makeEffect()` or `tagEffectAsts()` |

## Estimated Impact

- **Interpreter**: 1–2% improvement from eliminating for-in + enabling
  jump-table dispatch (~150K dispatches per game)
- **Spec 81 compiler**: Faster codegen dispatch during compilation;
  simpler code generation using numeric tags
- **Consistency**: Aligns with proven ValueExpr pattern
- **Developer ergonomics**: `makeEffect()` is shorter and less error-prone
  than manual `{ _k: EFFECT_KIND_TAG.setVar, setVar: {...} }` construction

## Risks

1. **Wide file touch**: ~15 files modified. **Mitigation**: `makeEffect()`
   factory makes each migration site a simple function call change. Low
   risk of logic errors.
2. **Test fixture churn**: Many tests create EffectAST literals that need
   `_k`. **Mitigation**: `tagEffectAsts(fixture)` can bulk-add tags to
   existing test fixtures, allowing incremental migration to `makeEffect()`.
3. **Exhaustiveness drift**: New effect kinds added without updating
   `EFFECT_KIND_TAG`. **Mitigation**: Compile-time `satisfies` check +
   CI test assert tag count == registry count.

## Testing Plan

1. **All existing tests pass**: No behavioral change — only dispatch
   mechanism changes.
2. **Exhaustiveness test**: Assert `EFFECT_KIND_TAG` keys === `EffectKind`
   keys (via the `satisfies` check and runtime assertion).
3. **Contiguity test**: Assert tag values are contiguous 0..N-1.
4. **Tag consistency test**: For every EffectAST node in compiled GameDefs
   (Texas Hold'em, FITL), assert `_k` matches the property key via
   `tagEffectAsts` comparison.
5. **Performance benchmark**: Verify effect dispatch is equal or faster.
6. **Round-trip test**: Serialize and deserialize a GameDef, verify `_k`
   fields are preserved.
7. **makeEffect type safety test**: Verify that `makeEffect('setVar', { wrong: 'payload' })`
   produces a compile-time type error.

## Outcome

- **Completion date**: 2026-03-25
- **What changed**: All 7 tickets (82EFFASTTYPTAG-001 through 007) implemented across the series. Added `EFFECT_KIND_TAG` constant and `EffectKindTag` type to `types-ast.ts`, `WithKindTag<K>` helper type, updated `EffectAST` union. Created `effect-builders.ts` with `makeEffect()` factory, `tag-effect-asts.ts` with structural tagger, updated `effect-registry.ts` with `TAG_TO_KIND` and tag-based `effectKindOf`. Updated `effect-dispatch.ts` with `dispatchTable` array for O(1) numeric dispatch. Migrated all compiler effect construction sites (8 `compile-effects-*.ts` files) and `ast-builders.ts` to `makeEffect()`. Added `_k` to JSON schemas. Updated all test fixtures. Created CI invariant tests.
- **Deviations**: Tag consistency CI tests use a custom walker instead of `tagEffectAsts` comparison due to `ValueExpr`/`EffectAST` `if`-key collision in the tagger.
- **Verification**: Full engine test suite passes (4782 tests). Full runner test suite passes. Typecheck and lint clean.
