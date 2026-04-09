# 120WIDCOMEXP-004: Widen token filter compiler — dynamic ValueExpr predicates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/token-filter-compiler.ts`, `packages/engine/src/kernel/token-filter.ts`
**Deps**: `archive/tickets/120WIDCOMEXP-001.md`

## Problem

`tryCompileTokenFilter` compiles predicate operators (`eq`, `neq`, `in`, `notIn`) only when predicate values are literals. When a predicate uses a dynamic `ValueExpr` value (e.g., a binding reference like `{ _t: 2, ref: 'binding', name: '$faction' }`), the entire filter falls back to the interpreter. Since `tryCompileValueExpr` already compiles binding references (and ticket 001 adds more reference types), the token filter compiler can compose compiled value accessors with field accessors to produce fully compiled predicates for dynamic values.

## Assumption Reassessment (2026-04-09)

1. `tryCompileTokenFilter` is in `packages/engine/src/kernel/token-filter-compiler.ts` at line 152 — confirmed.
2. Current predicate compilation handles `in`/`notIn` (lines 70-130) and `eq`/`neq` (lines 136-149) with literal values only — confirmed.
3. `matchesTokenFilterExpr` in `token-filter.ts` (line 96) guards compiled path with `resolveValue === resolveLiteralTokenFilterValue && overlay === undefined` — confirmed. This guard must be updated to allow compiled filters with dynamic values.
4. `tryCompileValueExpr` already compiles `binding` references — a filter like `{ op: 'eq', prop: 'faction', value: { _t: 2, ref: 'binding', name: '$faction' } }` can compile today if the filter compiler attempts it.
5. `CompiledTokenFilterFn` type signature: `(token: Token) => boolean` — this does NOT include `state`, `activePlayer`, `bindings`, `snapshot`. Dynamic value accessors need these parameters. The compiled token filter signature must be extended or a new type introduced.

## Architecture Check

1. The key design decision is the compiled token filter signature. Current `CompiledTokenFilterFn` is `(token: Token) => boolean`. Dynamic value accessors need `(state, activePlayer, bindings, snapshot?)`. Two options:
   - (a) Widen `CompiledTokenFilterFn` to `(token, state, activePlayer, bindings, snapshot?) => boolean` — breaking change to existing call sites
   - (b) Introduce `CompiledDynamicTokenFilterFn` with the wider signature, keep `CompiledTokenFilterFn` for literal-only filters — no breaking changes but two parallel types
   
   Option (a) is preferred per Foundation 14 (no backwards compat) — update all call sites in the same change.
2. The guard in `matchesTokenFilterExpr` (`resolveValue === resolveLiteralTokenFilterValue`) must be relaxed to allow the compiled path when a dynamic-aware compiled filter exists.
3. No game-specific logic — composes generic value accessors with field accessors.

## What to Change

### 1. Extend compiled token filter signature

Update `CompiledTokenFilterFn` (or introduce a replacement) to accept `(token, state, activePlayer, bindings, snapshot?)`. Update `compiled-token-filter-cache.ts` and all call sites to pass the additional arguments.

### 2. Add dynamic value compilation to predicate handlers

In `token-filter-compiler.ts`, when a predicate's value is not a literal, attempt `tryCompileValueExpr(predicate.value)`. If it returns a compiled accessor, compose it with the field accessor to produce a fully compiled predicate. If `tryCompileValueExpr` returns `null`, return `null` for the entire filter.

### 3. Update `matchesTokenFilterExpr` guard

In `token-filter.ts`, relax the `resolveValue === resolveLiteralTokenFilterValue` guard to also allow the compiled path for filters with dynamic values. Pass the required arguments (`state`, `activePlayer`, `bindings`, `snapshot`) to the compiled filter function. These arguments must be available at the call site — verify all callers of `matchesTokenFilterExpr` have access to them or can obtain them.

### 4. Parity tests

- Filter with `eq` predicate using a binding value — compiled matches interpreter
- Filter with `in` predicate using a dynamic set — compiled matches interpreter
- Filter with non-compilable dynamic value — returns `null`, falls back to interpreter
- Existing literal-value filters continue to work unchanged

## Files to Touch

- `packages/engine/src/kernel/token-filter-compiler.ts` (modify)
- `packages/engine/src/kernel/compiled-token-filter-cache.ts` (modify — update cached type)
- `packages/engine/src/kernel/token-filter.ts` (modify — update guard and call site)
- `packages/engine/test/kernel/token-filter-compiler.test.ts` (modify — add parity tests)

## Out of Scope

- New value expression reference types (ticket 001)
- Condition compiler changes (ticket 003)
- Application site integration (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. Parity test: `eq` predicate with binding value — compiled matches interpreter
2. Parity test: `in` predicate with dynamic array value — compiled matches interpreter
3. Parity test: `neq` predicate with gvar value — compiled matches interpreter
4. Null-return test: predicate with non-compilable value returns `null`
5. Regression test: literal-value filters continue to compile and produce correct results
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `tryCompileTokenFilter` returns `null` for any filter it cannot fully compile — no partial compilation
2. Compiled token filters produce identical boolean results to interpreter path for all inputs (Foundation 8)
3. Existing literal-value compiled filters are not regressed

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/token-filter-compiler.test.ts` — parity tests for dynamic value predicates + regression tests for literal values

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="token-filter"`
2. `pnpm turbo test`
