# 64COMEXPEVA-001: Token filter compiler and cache infrastructure

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel modules for token filter compilation
**Deps**: `specs/64-compiled-expression-evaluation.md`

## Problem

`foldTokenFilterExpr` consumes 4.63% of CPU during FITL simulations. It walks the token filter AST tree, creates path-tracking arrays, intermediate `args` arrays for AND/OR, and dispatches through a visitor pattern — all per-token, per-filter, per-query. Token filters are entirely uncompiled today despite condition compilation infrastructure already existing (`condition-compiler.ts`, `compiled-condition-cache.ts`).

## Assumption Reassessment (2026-04-03)

1. `TokenFilterExpr` type exists at `packages/engine/src/kernel/types-ast.ts:248-252` — union of predicate, and/or/not nodes. Verified.
2. `TokenFilterPredicate` has `prop`, `op`, `value` fields with optional `field` for zoneProp lookups. Verified.
3. `condition-compiler.ts` pattern: `tryCompileCondition()` returns `CompiledConditionPredicate | null`, null for non-compilable. Verified at lines 8-20 and 212-271.
4. `compiled-condition-cache.ts` pattern: WeakMap keyed on stable array reference (`ActionPipelineDef[]`). Verified at lines 24-28.
5. Token filter predicates use `eq`, `neq`, `in`, `notIn` operators with literal scalar values in most FITL cases. Verified — 2287 single predicates, 1378 AND filters in compiled FITL GameDef.

## Architecture Check

1. Follows the established kernel compilation pattern: `tryCompile*()` returns compiled function or `null`, cached via WeakMap. No new architectural patterns introduced.
2. No game-specific logic — token filter compilation is generic, applicable to any game's filters.
3. Foundation 7: Compiled functions stored in runtime cache (WeakMap), NOT in GameDef. GameDef contains only immutable AST nodes.
4. No backwards-compatibility shims — `null` return means interpreter path runs unchanged.

## What to Change

### 1. Create `token-filter-compiler.ts`

New file: `packages/engine/src/kernel/token-filter-compiler.ts`

Define types and compilation function:

```typescript
export type CompiledTokenFilterFn = (token: Token) => boolean;

export function tryCompileTokenFilter(expr: TokenFilterExpr): CompiledTokenFilterFn | null
```

Compilation rules:
- **Predicate `eq`**: `(token) => resolveTokenFilterFieldValue(token, pred) === pred.value`
- **Predicate `neq`**: same with `!==`
- **Predicate `in`**: `(token) => SET.has(resolveTokenFilterFieldValue(token, pred))` where SET is a pre-built Set from `pred.value` array
- **Predicate `notIn`**: negated `in`
- **`and`**: short-circuit `&&` of recursively compiled args. If ANY arg is non-compilable, return `null` for entire expression.
- **`or`**: short-circuit `||` of recursively compiled args. Same null rule.
- **`not`**: `!compiled(token)` of recursively compiled arg.
- **Non-compilable** (return `null`): predicates with `field.kind === 'zoneProp'`, predicates referencing bindings (`$variable` in value), overlay-dependent filters.

Field value resolution for compiled predicates: for simple `prop` fields, inline `token.props[prop]` access. For `field.kind === 'prop'`, same. For `field.kind === 'tokenId'`, use `token.id`. For `field.kind === 'tokenZone'`, use `token.zone`.

### 2. Create `compiled-token-filter-cache.ts`

New file: `packages/engine/src/kernel/compiled-token-filter-cache.ts`

```typescript
const cache = new WeakMap<TokenFilterExpr, CompiledTokenFilterFn | null>();

export function getCompiledTokenFilter(expr: TokenFilterExpr): CompiledTokenFilterFn | null {
  if (cache.has(expr)) return cache.get(expr)!;
  const compiled = tryCompileTokenFilter(expr);
  cache.set(expr, compiled);
  return compiled;
}
```

WeakMap keyed on the `TokenFilterExpr` reference. Since filter expressions come from the compiled GameDef (stable references), the cache hit rate should be near 100% after warm-up.

## Files to Touch

- `packages/engine/src/kernel/token-filter-compiler.ts` (new)
- `packages/engine/src/kernel/compiled-token-filter-cache.ts` (new)

## Out of Scope

- Integration into `matchesTokenFilterExpr` (ticket 002)
- Condition compiler changes (ticket 004)
- Profiling (ticket 003)
- Compiling filters with binding references or zoneProp fields
- Modifying `TokenFilterExpr` type definition
- Modifying `foldTokenFilterExpr`

## Acceptance Criteria

### Tests That Must Pass

1. `tryCompileTokenFilter` returns a function for `{ prop: 'faction', op: 'eq', value: 'VC' }` that correctly matches/rejects tokens
2. `tryCompileTokenFilter` returns a function for `{ op: 'and', args: [{prop: 'faction', op: 'eq', value: 'VC'}, {prop: 'type', op: 'in', value: ['troops', 'base']}] }` with short-circuit behavior
3. `tryCompileTokenFilter` returns `null` for filters with `field.kind === 'zoneProp'`
4. `tryCompileTokenFilter` returns `null` for filters with binding-reference values
5. Compiled function produces identical results to `matchesTokenFilterExpr` for a corpus of 20+ filter shapes from the FITL GameDef
6. Cache returns same function reference on second call with same expr reference
7. Existing suite: `pnpm turbo test`

### Invariants

1. Compiled functions NEVER stored in GameDef (Foundation 7)
2. `tryCompileTokenFilter` returns `null` rather than producing incorrect results for edge cases
3. No new fields added to `TokenFilterExpr` or any AST type
4. No game-specific logic in the compiler

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-compiler.test.ts` (new) — unit tests for all compilable/non-compilable expression shapes
2. `packages/engine/test/unit/kernel/compiled-token-filter-cache.test.ts` (new) — cache hit/miss behavior

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`

## Outcome

- Completion date: 2026-04-03
- What actually changed:
  - added `packages/engine/src/kernel/token-filter-compiler.ts` with conservative token-filter compilation for token-local predicate shapes only;
  - added `packages/engine/src/kernel/compiled-token-filter-cache.ts` with WeakMap caching by stable `TokenFilterExpr` reference;
  - exported the new compiler/cache surface from `packages/engine/src/kernel/index.ts`;
  - added unit coverage for compilable and non-compilable shapes plus FITL production-corpus parity and cache behavior.
- Deviations from original plan:
  - the ticket text assumed `field.kind === 'tokenZone'` could compile via `token.zone`, but the live `Token` type has no zone field and token-zone resolution still depends on external runtime context; that case was left on the fallback path alongside `zoneProp`;
  - verification used the existing engine package test surface (`packages/engine/test/unit/...`) rather than introducing new path conventions beyond the touched feature area.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test "dist/test/unit/kernel/token-filter-compiler.test.js" "dist/test/unit/kernel/compiled-token-filter-cache.test.js" "dist/test/unit/token-filter.test.js" "dist/test/unit/kernel/condition-compiler.test.js" "dist/test/unit/kernel/compiled-condition-cache.test.js"`
  - `pnpm -F @ludoforge/engine test`
