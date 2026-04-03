# 64COMEXPEVA-002: Integrate compiled token filters into kernel evaluation path

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter.ts evaluation path
**Deps**: `tickets/64COMEXPEVA-001.md`, `specs/64-compiled-expression-evaluation.md`

## Problem

The token filter compiler (001) produces compiled functions, but they are not yet used during game execution. `matchesTokenFilterExpr` in `token-filter.ts` still always calls `foldTokenFilterExpr`. This ticket integrates the compiled fast path.

## Assumption Reassessment (2026-04-03)

1. `matchesTokenFilterExpr` at `token-filter.ts:88-105` is the sole entry point for token filter evaluation in the kernel. Verified — called from `filterTokensByExpr` and `token-view.ts`.
2. The function wraps `foldTokenFilterExpr` in a try/catch for traversal error mapping. Verified.
3. The existing `evaluateCompiledPredicate` pattern in `pipeline-viability-policy.ts:62-72` (check cache → call compiled → fall back to interpreter) is the established integration pattern. Verified.
4. `matchesTokenFilterExpr` receives optional `resolveValue`, `overlay`, and `resolveField` parameters. Compiled filters only work when `resolveValue` is the default literal resolver and `overlay` is undefined. Verified.

## Architecture Check

1. Follows the established `evaluateCompiledPredicate` pattern: check cache before interpreter. No new patterns.
2. Compiled and interpreted paths are called from DIFFERENT branches (cache-hit vs. cache-miss), not mixed within the same call — avoids V8 polymorphic deoptimization.
3. No game-specific logic. No EffectCursor changes. No type changes.

## What to Change

### 1. Add compiled fast path to `matchesTokenFilterExpr`

In `packages/engine/src/kernel/token-filter.ts`, add a cache check before the `foldTokenFilterExpr` call:

```typescript
import { getCompiledTokenFilter } from './compiled-token-filter-cache.js';

export function matchesTokenFilterExpr(token, expr, resolveValue, overlay, resolveField) {
  // Compiled fast path: only when using default resolver and no overlay
  if (resolveValue === resolveLiteralTokenFilterValue && overlay === undefined && resolveField === undefined) {
    const compiled = getCompiledTokenFilter(expr);
    if (compiled !== null) {
      return compiled(token);
    }
  }
  // Existing interpreter path (unchanged)
  try {
    return foldTokenFilterExpr(expr, { ... });
  } catch (error) {
    return mapTokenFilterTraversalToTypeMismatch(error);
  }
}
```

The guard (`resolveValue === resolveLiteralTokenFilterValue && overlay === undefined`) ensures compiled filters are only used when the evaluation context is static — no dynamic value resolution or free-operation overlays.

### 2. Add equivalence integration test

Create a test that compiles the FITL GameDef, extracts all token filter expressions, and verifies that the compiled path produces identical results to the interpreter for every token in the initial game state.

## Files to Touch

- `packages/engine/src/kernel/token-filter.ts` (modify — add compiled fast path)

## Out of Scope

- Modifying `foldTokenFilterExpr` in `token-filter-expr-utils.ts`
- Modifying `filterTokensByExpr`
- Condition compiler changes (ticket 004)
- Profiling (ticket 003)

## Acceptance Criteria

### Tests That Must Pass

1. FITL equivalence: for every token filter in the compiled FITL GameDef, `compiled(token) === interpreter(token)` for all tokens in the initial state
2. Fallback: when `resolveValue` is a custom resolver (not the default), the interpreter path is used even if a compiled version exists
3. Fallback: when `overlay` is provided, the interpreter path is used
4. All existing token filter tests pass unchanged
5. FITL playbook golden replay produces identical traces
6. Existing suite: `pnpm turbo test`

### Invariants

1. Determinism: compiled and interpreted paths produce identical boolean results for the same token + filter (Foundation 8)
2. No behavioral change: game traces are identical with and without the compiled fast path
3. `foldTokenFilterExpr` is not modified — the interpreter path is unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/token-filter-compilation.test.ts` (new) — FITL equivalence test across all compiled filters and tokens
2. `packages/engine/test/unit/kernel/token-filter.test.ts` (modify) — add test verifying fallback when custom resolveValue or overlay is provided

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
