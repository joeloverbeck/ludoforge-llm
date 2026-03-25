# 82EFFASTTYPTAG-002: makeEffect Builder Factory and tagEffectAsts Utility

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — two new files in `packages/engine/src/kernel/`
**Deps**: 82EFFASTTYPTAG-001 (needs `EFFECT_KIND_TAG`, `WithKindTag`, updated `EffectAST`)

## Problem

With `_k` required on `EffectAST`, every construction site must include the
tag. A `makeEffect()` factory automates this. A `tagEffectAsts()` utility
allows bulk migration of existing test fixtures without rewriting every
literal.

## Assumption Reassessment (2026-03-25)

1. `buildEffect()` in `ast-builders.ts` (lines 10-12) constructs effects as
   `{ [kind]: payload }` without `_k`. It must be updated or replaced.
2. `tag-value-exprs.ts` provides the reference pattern for structural tagging
   (`tagValueExpr`, `tagValueExprChildren`, `tagConditionValueExprs`).
3. Effects can nest: `if.then`, `if.else`, `forEach.effects`, `reduce.effects`,
   `removeByPriority.effects`, `let.effects`, `evaluateSubset.effects`,
   `chooseOne.effects`, `chooseN.effects`, `grantFreeOperation` (various
   nested effect arrays in the payload). The tagger must recurse into all of
   these.

## Architecture Check

1. `makeEffect()` is the idiomatic construction API going forward — derives
   `_k` from the kind string, provides full type safety.
2. `tagEffectAsts()` is a dev/test utility only — not used at runtime
   boundaries (since `_k` is serialized in GameDef JSON).
3. No backwards-compat shims. `buildEffect()` in `ast-builders.ts` will be
   updated to use `makeEffect()` internally (ticket 004).

## What to Change

### 1. New file: `effect-builders.ts`

```typescript
import type { EffectKind, EffectKindMap, WithKindTag } from './types-ast.js';
import { EFFECT_KIND_TAG } from './types-ast.js';

export function makeEffect<K extends EffectKind>(
  kind: K,
  payload: EffectKindMap[K][K],
): WithKindTag<K> {
  return { _k: EFFECT_KIND_TAG[kind], [kind]: payload } as WithKindTag<K>;
}
```

Export from `kernel/index.ts`.

### 2. New file: `tag-effect-asts.ts`

Structural tagger that:
- Detects EffectAST-shaped objects (single property key matching an
  `EFFECT_KIND_TAG` key).
- Injects `_k` based on the detected key.
- Recursively walks into nested effect arrays (`then`, `else`, `effects`,
  etc.) and nested structures (arrays, plain objects).
- Skips objects that already have a correct `_k`.
- Mirrors the pattern of `tag-value-exprs.ts`.

Export from `kernel/index.ts`.

## Files to Touch

- `packages/engine/src/kernel/effect-builders.ts` (new)
- `packages/engine/src/kernel/tag-effect-asts.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)

## Out of Scope

- Updating `ast-builders.ts` to use `makeEffect()` (ticket 004)
- Updating compiler `compile-effects-*.ts` files (ticket 004)
- Updating `effectKindOf` or dispatch (ticket 003)
- Schema changes (ticket 005)
- Migrating test fixtures to use `tagEffectAsts()` (ticket 006)
- Changes to `tag-value-exprs.ts`
- Changes to `ValueExpr` or `_t` tagging

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `makeEffect('setVar', { scope: 'global', var: 'x', value: 1 })`
   returns `{ _k: 0, setVar: { scope: 'global', var: 'x', value: 1 } }`.
2. **Unit test**: `makeEffect('if', { cond, then: [...], else: [...] })` returns
   an object with `_k: 28` and the correct payload.
3. **Unit test**: `tagEffectAsts({ setVar: { scope: 'global', var: 'x', value: 1 } })`
   adds `_k: 0`.
4. **Unit test**: `tagEffectAsts` recursively tags nested effects inside `if.then`,
   `forEach.effects`, `let.effects`, etc.
5. **Unit test**: `tagEffectAsts` is idempotent — running it twice produces the
   same result.
6. **Unit test**: `tagEffectAsts` does not modify non-effect objects.
7. **Type safety**: `makeEffect('setVar', { wrong: 'payload' })` produces a
   compile-time error (verified by a `// @ts-expect-error` test line).

### Invariants

1. `makeEffect()` always produces an object where `_k === EFFECT_KIND_TAG[kind]`.
2. `tagEffectAsts()` assigns `_k` values consistent with `EFFECT_KIND_TAG`.
3. Neither function mutates its input — both return new objects.
4. No runtime behavioral changes to effect execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-builders.test.ts` (new) — covers
   `makeEffect` for representative effect kinds + type safety.
2. `packages/engine/test/unit/tag-effect-asts.test.ts` (new) — covers
   structural tagging, recursion, idempotency, non-effect passthrough.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/effect-builders.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/tag-effect-asts.test.ts`
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-25
- **What changed**:
  - Exported `WithKindTag` from `types-ast.ts` (was non-exported local alias)
  - Created `packages/engine/src/kernel/effect-builders.ts` with `makeEffect<K>()` factory
  - Created `packages/engine/src/kernel/tag-effect-asts.ts` with `tagEffectAsts()` structural tagger
  - Added exports to `packages/engine/src/kernel/index.ts`
  - Created `packages/engine/test/unit/effect-builders.test.ts` (8 tests)
  - Created `packages/engine/test/unit/tag-effect-asts.test.ts` (20 tests)
- **Deviations**:
  - `makeEffect` uses `EffectPayloadOf<K>` helper type instead of `EffectKindMap[K][K]` for the payload parameter — TS cannot resolve the self-indexed generic access directly
  - Cast through `unknown` in `makeEffect` return (`as unknown as WithKindTag<K>`) required for the same generic limitation
  - Test `OptionsQuery` values use `{ query: 'zones' }` instead of the ticket's `{ domain: 'zone', zoneId: 'deck' }` which doesn't match the actual `OptionsQuery` type
- **Verification**: 28/28 tests pass (8 makeEffect + 20 tagEffectAsts). New source files typecheck cleanly. Full build blocked by pre-existing type errors from ticket 001 (tickets 003-006 will resolve).
