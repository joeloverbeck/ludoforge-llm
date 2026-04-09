# 120WIDCOMEXP-004: Widen token filter compiler — dynamic ValueExpr predicates

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/token-filter-compiler.ts`, `packages/engine/src/kernel/token-filter.ts`
**Deps**: `archive/tickets/120WIDCOMEXP-001.md`

## Problem

`tryCompileTokenFilter` compiles predicate operators (`eq`, `neq`, `in`, `notIn`) only when predicate values are literals. When a predicate uses a dynamic `ValueExpr` value (e.g., a binding reference like `{ _t: 2, ref: 'binding', name: '$faction' }`), the entire filter falls back to the interpreter. Since `tryCompileValueExpr` already compiles binding references (and ticket 001 adds more reference types), the token filter compiler can compose compiled value accessors with field accessors to produce fully compiled predicates for dynamic values.

## Assumption Reassessment (2026-04-09)

1. `tryCompileTokenFilter` is in `packages/engine/src/kernel/token-filter-compiler.ts` at line 152 — confirmed.
2. Current predicate compilation handles `in`/`notIn` (lines 70-130) and `eq`/`neq` (lines 136-149) with literal values only — confirmed.
3. The live dynamic token-filter path is in `eval-query.ts`: `applyTokenFilter(...)` calls `filterTokensByExpr(...)` with a `resolvePredicateValue(value, ctx)` callback plus an optional field resolver for `tokenZone` / `zoneProp`. The runtime already centers dynamic predicate resolution on `ReadContext`, not on raw `(state, activePlayer, bindings)` argument plumbing.
4. `resolvePredicateValue(...)` handles predicate-specific runtime references like `grantContext` and `capturedSequenceZones` in addition to the general `evalValue(...)` fallback. `tryCompileValueExpr(...)` alone does not own that entire surface.
5. `CompiledTokenFilterFn` type signature is currently `(token: Token) => boolean`. To compile dynamic predicate values cleanly, the canonical compiled filter surface should widen to `token + ReadContext` rather than inventing a parallel raw-arg contract.
6. The current `matchesTokenFilterExpr(...)` compiled fast path is intentionally limited to literal resolution (`resolveValue === resolveLiteralTokenFilterValue`) and no overlay. The clean live integration point for dynamic compiled filters is a context-aware runtime helper used by `eval-query.ts`, while generic resolver-driven helpers continue to fall back to the interpreter.

## Architecture Check

1. The live runtime already carries a `ReadContext` object for dynamic predicate value resolution, so the correct compiled token-filter surface is `token + ReadContext`, not a raw `(state, activePlayer, bindings, snapshot?)` bundle.
2. Predicate-value compilation must preserve `resolvePredicateValue(...)` semantics, not just `evalValue(...)`. That means compiled support can compose `tryCompileValueExpr(...)` for general value expressions while still handling predicate-specific reference kinds (`grantContext`, `capturedSequenceZones`) directly.
3. Rather than hijacking arbitrary caller-provided resolver callbacks, add a context-aware token-filter runtime helper for the real production path in `eval-query.ts`. Generic resolver-based helpers remain available and keep their interpreter fallback semantics.
4. `tokenZone` and `zoneProp` field selectors remain non-compilable in this ticket. If a filter needs runtime field-resolution callbacks or overlay-driven token interpretation, it should continue to fall back to the interpreter.
5. No game-specific logic — composes generic value accessors, generic predicate matching, and existing `ReadContext` runtime surfaces.

## What to Change

### 1. Extend compiled token filter signature

Update `CompiledTokenFilterFn` to accept `(token, ctx?)`. Update the token-filter cache and the context-aware runtime call site(s) accordingly.

### 2. Add dynamic value compilation to predicate handlers

In `token-filter-compiler.ts`, when a predicate's value is not a literal:
- Handle predicate-specific runtime reference kinds needed by `resolvePredicateValue(...)`
- Otherwise attempt `tryCompileValueExpr(predicate.value)`
- If a compiled predicate-value accessor is available, compose it with the field accessor and `matchesResolvedPredicate(...)`
- If no compilable predicate-value accessor exists, return `null` for the entire filter

### 3. Add a context-aware runtime fast path

In `token-filter.ts`, add a context-aware helper used by `eval-query.ts` that:
- Looks up a compiled token filter
- Uses the compiled path when no overlay-driven token interpretation is active and the filter shape is compiler-owned
- Falls back to the existing interpreter path otherwise

Keep the generic `matchesTokenFilterExpr(...)` resolver-callback entry point correct for arbitrary custom resolvers; do not silently reinterpret caller-provided resolver semantics.

### 4. Parity tests

- Filter with `eq` predicate using a binding value — compiled matches interpreter
- Filter with `in` predicate using a dynamic set — compiled matches interpreter
- Filter with predicate-only runtime references (`grantContext` or `capturedSequenceZones`) — compiled matches interpreter
- Filter with non-compilable dynamic value — returns `null`, falls back to interpreter
- Existing literal-value filters continue to work unchanged

## Files to Touch

- `packages/engine/src/kernel/token-filter-compiler.ts` (modify)
- `packages/engine/src/kernel/compiled-token-filter-cache.ts` (modify — update cached type)
- `packages/engine/src/kernel/token-filter.ts` (modify — update guard and call site)
- `packages/engine/src/kernel/eval-query.ts` (modify — use context-aware compiled token-filter path)
- `packages/engine/test/unit/kernel/token-filter-compiler.test.ts` (modify — add parity tests)
- `packages/engine/test/unit/token-filter.test.ts` (modify — runtime helper parity/fallback tests as needed)
- `packages/engine/test/unit/kernel/compiled-token-filter-cache.test.ts` (modify — updated compiled filter contract)

## Out of Scope

- New value expression reference types (ticket 001)
- Condition compiler changes (ticket 003)
- Application site integration (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. Parity test: `eq` predicate with binding value — compiled matches interpreter
2. Parity test: `in` predicate with dynamic array value — compiled matches interpreter
3. Parity test: `neq` predicate with gvar value — compiled matches interpreter
4. Parity test: predicate-only runtime references like `grantContext` or `capturedSequenceZones` match interpreter semantics when compiled
5. Null-return test: predicate with non-compilable value returns `null`
6. Regression test: literal-value filters continue to compile and produce correct results
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `tryCompileTokenFilter` returns `null` for any filter it cannot fully compile — no partial compilation
2. Compiled token filters produce identical boolean results to interpreter path for all inputs (Foundation 8)
3. Generic resolver-based token-filter helpers preserve interpreter semantics for arbitrary custom resolvers; the compiled dynamic fast path is used only through the context-aware runtime helper
4. Existing literal-value compiled filters are not regressed

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-compiler.test.ts` — parity tests for dynamic value predicates + regression tests for literal values
2. `packages/engine/test/unit/token-filter.test.ts` — context-aware runtime helper parity and generic-resolver fallback tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-compiler.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/token-filter.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test`

## Outcome

- Completed: 2026-04-09
- Implemented a `ReadContext`-aware compiled token-filter path by widening `CompiledTokenFilterFn`, compiling dynamic predicate values in `token-filter-compiler.ts`, adding context-aware runtime helpers in `token-filter.ts`, and routing `eval-query.ts` through that live helper surface.
- Added parity and fallback coverage in `token-filter-compiler.test.ts`, `token-filter.test.ts`, `token-filter-compilation.test.ts`, and `eval-query.test.ts`. Post-review, added `compiled-token-filter-cache.test.ts` coverage to prove cached dynamic filters preserve the same `ReadContext`-aware behavior.
- Deviations from original plan:
  - The stale raw `(state, activePlayer, bindings, snapshot?)` contract was replaced with the live `token + ReadContext` boundary before implementation.
  - `compiled-token-filter-cache.ts` did not require a textual source edit because the widened callable type flowed through the existing cache surface unchanged.
  - Verification surfaced a stale `eval-query` expectation: missing binding-backed token-filter values correctly raise `MISSING_BINDING`, not `MISSING_VAR`.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-compiler.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/token-filter.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/token-filter-compilation.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/eval-query.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compiled-token-filter-cache.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
