# 64COMEXPEVA-004: Extend condition/value compiler coverage to general evaluation sites

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel condition-compiler and eval-condition integration
**Deps**: `tickets/64COMEXPEVA-003.md`, `specs/64-compiled-expression-evaluation.md`

## Problem

The existing condition compiler (`condition-compiler.ts`) only covers pipeline legality/cost-validation predicates via `evaluateCompiledPredicate` in `pipeline-viability-policy.ts`. Action preconditions (`action.pre`), trigger conditions, and general `evalCondition` call sites still go through the interpreter — contributing to the 6.40% CPU from `evalCondition` and 7.88% from `resolveRef`.

This ticket is **conditional on 64COMEXPEVA-003**: only proceed if the Phase 1 profiling gate passes.

## Assumption Reassessment (2026-04-03)

1. `condition-compiler.ts` exists with `tryCompileCondition()` and `tryCompileValueExpr()`. Verified at lines 8-20 and 212-271.
2. `compiled-condition-cache.ts` caches compiled predicates via WeakMap keyed on `ActionPipelineDef[]`. Verified at lines 24-28.
3. `evaluateCompiledPredicate` at `pipeline-viability-policy.ts:62-72` is the only integration point — the general `evalCondition` in `eval-condition.ts` does NOT check for compiled versions. Verified.
4. `tryCompileValueExpr` currently handles: `gvar`, `pvar`, binding refs, zone count aggregates. Does NOT handle: arithmetic (`+`, `-`, `*`), `coalesce`, `if/then/else`, complex aggregates with queries. Verified.
5. `evalCondition` at `eval-condition.ts` is called from action precondition evaluation, trigger condition checking, and general kernel condition evaluation — many more sites than pipeline predicates alone. Verified.

## Architecture Check

1. Extends existing infrastructure (`condition-compiler.ts`, `compiled-condition-cache.ts`) rather than creating parallel systems (Foundation 15).
2. No game-specific logic — condition compilation is generic.
3. Foundation 7: Compiled functions remain in runtime caches, not GameDef.
4. Fallback pattern preserved: `tryCompileCondition` returns `null` for non-compilable expressions → interpreter runs unchanged.

## What to Change

### 1. Extend `tryCompileValueExpr` coverage

In `packages/engine/src/kernel/condition-compiler.ts`, add compilation for:
- **Arithmetic** (`+`, `-`, `*`): compile to direct JS arithmetic on compiled sub-expressions
- **`coalesce`**: compile to `compiled_a ?? compiled_b`
- **`if/then/else`**: compile to `compiled_cond ? compiled_then : compiled_else`

Return `null` for complex aggregates with queries (too large for V8 inlining), spatial conditions, and any expression referencing runtime-dependent bindings.

### 2. Extend `tryCompileCondition` coverage

Add compilation for:
- **Marker state checks**: `{ op: '==', left: { ref: 'markerState', ... }, right: 'value' }` — common in FITL for support/opposition checks
- **`adjacentTo` spatial conditions**: if both zone refs are static, compile to a direct adjacency graph lookup

Return `null` for complex spatial conditions requiring runtime zone resolution.

### 3. Integrate compiled condition check into `eval-condition.ts`

Add a compiled-condition cache lookup at the top of `evalCondition`:

```typescript
import { getCompiledCondition } from './compiled-condition-integration.js';

export function evalCondition(condition, ctx) {
  if (typeof condition === 'boolean') return condition;
  const compiled = getCompiledCondition(condition);
  if (compiled !== undefined) {
    return compiled(ctx.state, ctx.activePlayer, ctx.bindings);
  }
  // Existing interpreter path (unchanged)
  ...
}
```

Create a new cache module `compiled-condition-integration.ts` that builds a WeakMap cache for general condition evaluation (separate from the pipeline-specific cache in `compiled-condition-cache.ts`, since the keying strategy differs — general conditions are keyed on individual `ConditionAST` references, not pipeline arrays).

### 4. Extend the compiled condition cache

In `packages/engine/src/kernel/compiled-condition-cache.ts`, extend or create a parallel cache for general conditions keyed on `ConditionAST` references rather than `ActionPipelineDef[]`.

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify — extend tryCompileCondition and tryCompileValueExpr)
- `packages/engine/src/kernel/eval-condition.ts` (modify — add compiled fast path)
- `packages/engine/src/kernel/compiled-condition-integration.ts` (new — general condition cache)

## Out of Scope

- Token filter compiler changes (completed in 001-002)
- Modifying `resolveRef` directly
- Compiling aggregate expressions with complex queries
- Compiling binding-dependent conditions
- Modifying `effect-compiler.ts` or `effect-compiler-codegen.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Extended `tryCompileValueExpr` handles arithmetic, coalesce, if/then/else with correct results
2. Extended `tryCompileCondition` handles marker state checks with correct results
3. `tryCompileCondition` returns `null` for complex spatial conditions
4. General `evalCondition` uses compiled path when available, falls back to interpreter otherwise
5. Compiled and interpreted paths produce identical results for all compilable condition shapes
6. FITL playbook golden replay produces identical traces
7. Existing suite: `pnpm turbo test`

### Invariants

1. Determinism: compiled conditions produce identical boolean results to interpreter (Foundation 8)
2. Compiled functions in runtime caches only, not GameDef (Foundation 7)
3. `null` return for non-compilable expressions — never produce incorrect results
4. No new fields on EffectCursor, GameDefRuntime, or GameState
5. No game-specific logic in the compiler

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify) — add tests for newly compilable expression types
2. `packages/engine/test/unit/kernel/compiled-condition-integration.test.ts` (new) — test general evalCondition compiled path

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
