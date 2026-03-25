# 82EFFASTTYPTAG-003: Tag-Based Effect Dispatch and effectKindOf Update

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/effect-registry.ts`, `effect-dispatch.ts`
**Deps**: 82EFFASTTYPTAG-001 (needs `EFFECT_KIND_TAG`, `EffectKindTag`)

## Problem

`effectKindOf()` uses `for-in` to extract the discriminant key, and
`applyEffectWithBudget` does a string-keyed registry lookup. With `_k` tags
available, both can use O(1) numeric dispatch via `TAG_TO_KIND` array and
an index-based dispatch table.

## Assumption Reassessment (2026-03-25)

1. `effectKindOf` at `effect-registry.ts:93-97` uses `for-in` on the effect
   object. Confirmed.
2. `applyEffectWithBudget` at `effect-dispatch.ts:47-73` calls
   `effectKindOf(effect)` then does `registry[kind]` lookup. Confirmed.
3. The registry object (`effect-registry.ts:56-91`) is a `Record<EffectKind,
   EffectHandler<K>>` with 34 entries. Confirmed.
4. `EffectHandler<K>` type at `effect-dispatch.ts:46-52` takes
   `EffectKindMap[K]` as first arg. With ticket 001, this becomes
   `WithKindTag<K>` which extends `EffectKindMap[K]`, so the handler
   signature remains compatible.

## Architecture Check

1. The typed `registry` object is preserved for handler definitions (provides
   per-variant type safety). The `dispatchTable` array is derived from it —
   single source of truth.
2. `TAG_TO_KIND` reverse lookup array is derived from `EFFECT_KIND_TAG` —
   stays in sync automatically.
3. No backwards-compat shims. `effectKindOf` now reads `_k` instead of
   using `for-in`.

## What to Change

### 1. Add `TAG_TO_KIND` array to `effect-registry.ts`

```typescript
import { EFFECT_KIND_TAG, type EffectKind, type EffectKindTag } from './types-ast.js';

export const TAG_TO_KIND: readonly EffectKind[] = Object.entries(EFFECT_KIND_TAG)
  .sort(([, a], [, b]) => a - b)
  .map(([k]) => k as EffectKind);
```

### 2. Update `effectKindOf` to tag-based lookup

```typescript
export function effectKindOf(effect: EffectAST): EffectKind {
  return TAG_TO_KIND[(effect as { readonly _k: EffectKindTag })._k];
}
```

### 3. Add `dispatchTable` array to `effect-dispatch.ts`

Build a dispatch array from registry + TAG_TO_KIND at module load time.
Update `applyEffectWithBudget` to use `dispatchTable[tag]` instead of
`registry[kind]`.

```typescript
const dispatchTable: readonly EffectHandlerFn[] = TAG_TO_KIND.map(
  kind => registry[kind] as EffectHandlerFn,
);
```

Update `applyEffectWithBudget`:
```typescript
const tag = (effect as { readonly _k: EffectKindTag })._k;
const kind = TAG_TO_KIND[tag];
consumeEffectBudget(budget, kind);
const handler = dispatchTable[tag];
// ... rest unchanged
```

## Files to Touch

- `packages/engine/src/kernel/effect-registry.ts` (modify)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify)

## Out of Scope

- Type definitions (`types-ast.ts`) — ticket 001
- Builder factory / tagger — ticket 002
- Compiler migration — ticket 004
- Schema changes — ticket 005
- Test fixture migration — ticket 006
- Performance benchmarking (informational only, not gated)
- Changes to individual effect handler functions
- Changes to the `EffectRegistry` type or handler signatures

## Acceptance Criteria

### Tests That Must Pass

1. All existing effect tests pass unchanged — dispatch is functionally
   identical, only the lookup mechanism changes.
2. `effectKindOf(makeEffect('setVar', {...}))` returns `'setVar'`.
3. `effectKindOf(makeEffect('forEach', {...}))` returns `'forEach'`.
4. `TAG_TO_KIND` has exactly 34 entries matching `EFFECT_KIND_TAG` keys.
5. `TAG_TO_KIND[EFFECT_KIND_TAG.setVar]` === `'setVar'` for every kind.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `effectKindOf` remains a pure function with no side effects.
2. `dispatchTable` is derived from `registry` — adding a new handler to
   `registry` without a corresponding `EFFECT_KIND_TAG` entry produces a
   compile-time error (via ticket 001's exhaustiveness check).
3. No mutation of state, no behavioral changes to effect execution.
4. The typed `registry` object remains the single source of truth for
   handler definitions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-registry.test.ts` (new or extend
   existing) — `TAG_TO_KIND` consistency, `effectKindOf` with tagged effects.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
