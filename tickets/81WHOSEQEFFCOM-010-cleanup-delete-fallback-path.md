# 81WHOSEQEFFCOM-010: Cleanup — delete fallback path, assert 100% coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — effect-compiler.ts, effect-compiler-codegen.ts, effect-compiler-patterns.ts
**Deps**: 81WHOSEQEFFCOM-001 through 009 (all lifecycle types compilable)

## Problem

Once all 33 lifecycle effect types have compiled closures (tickets 001-009), the fallback path (`createFallbackFragment`, `fallbackBatch` accumulation in `compileFragmentList`) is dead code. Per Foundation 9 (No Backwards Compatibility), this dead code must be deleted — no shim, no alias, no deprecated fallback path. Additionally, CI-level assertions must enforce 100% coverage ratio for all lifecycle effect sequences.

## Assumption Reassessment (2026-03-25)

1. `createFallbackFragment` is in `effect-compiler.ts` (~177 lines) — wraps uncompiled effects for interpreted execution via `applyEffectsWithBudgetState`.
2. `compileFragmentList` in `effect-compiler.ts` accumulates uncompilable effects into `fallbackBatch` arrays, then creates fallback fragments for each batch.
3. `computeCoverageRatio` in `effect-compiler-patterns.ts` tracks compilation coverage percentage.
4. `composeFragments` in `effect-compiler.ts` chains fragments — currently handles both compiled and fallback fragments uniformly.
5. `grantFreeOperation` (tag 22) is explicitly excluded from lifecycle compilation. A runtime assertion must verify it never appears in lifecycle effect sequences.
6. The interpreter (`applyEffects` pipeline) remains needed for: (a) action effects (including `grantFreeOperation`), (b) verification mode dual execution.

## Architecture Check

1. Deleting `createFallbackFragment` removes the ability for lifecycle sequences to fall back to the interpreter. This is correct — all 33 lifecycle types are compilable after tickets 001-009.
2. The `fallbackBatch` accumulation logic in `compileFragmentList` becomes unreachable. Delete it.
3. `composeFragments` simplifies: no fallback-related branching.
4. A runtime assertion in `compileFragmentList` or `classifyEffect` ensures `grantFreeOperation` is never encountered in lifecycle effect sequences. If encountered, throw an error (this would indicate a bug in the phase/lifecycle classification).
5. CI assertion: `coverageRatio === 1.0` for all compiled lifecycle sequences in both FITL and Texas Hold'em.

## What to Change

### 1. Delete `createFallbackFragment`

In `effect-compiler.ts`, remove the `createFallbackFragment` function entirely. Remove all imports and references to it.

### 2. Delete `fallbackBatch` accumulation in `compileFragmentList`

In `effect-compiler.ts`, remove the batch accumulation logic that groups uncompilable effects for fallback fragment creation. After this change, `compileFragmentList` should assert that `classifyEffect` returns non-null for every effect node it encounters (except `grantFreeOperation`, which should never appear in lifecycle sequences).

### 3. Add runtime assertion for `grantFreeOperation`

In `classifyEffect` or `compileFragmentList`, when `_k === EFFECT_KIND_TAG.grantFreeOperation` is encountered during lifecycle compilation, throw a descriptive error: `grantFreeOperation` is an action-context effect and must not appear in lifecycle effect sequences.

### 4. Add CI-level coverage ratio assertion

In the test suite (not in production code), assert that `coverageRatio === 1.0` for every lifecycle effect sequence in both FITL and Texas Hold'em compiled GameDefs.

### 5. Simplify `composeFragments`

Remove any fallback-related branching or special handling in `composeFragments`. All fragments are now compiled closures.

### 6. Update `computeCoverageRatio` or remove if no longer needed

If coverage ratio tracking is only useful during the transition, consider removing `computeCoverageRatio` and the `coverageRatio` field from `CompiledEffectSequence`. If kept for observability, ensure it always returns 1.0 after this cleanup.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler.ts` (modify — delete fallback path)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify — remove fallback-related imports/code if any)
- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify — add runtime assertion for grantFreeOperation)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify — optionally remove `coverageRatio` field)

## Out of Scope

- Deleting the interpreter itself — it remains for action effects and verification mode
- Compiling action effects or `grantFreeOperation` (future spec)
- Performance benchmarking (separate task)
- Refactoring `composeFragments` beyond removing fallback branching
- Modifying `phase-lifecycle.ts` verification mode

## Acceptance Criteria

### Tests That Must Pass

1. `createFallbackFragment` is deleted — no references remain in the codebase (grep verification)
2. `fallbackBatch` accumulation code is deleted from `compileFragmentList`
3. Runtime assertion: `grantFreeOperation` encountered in lifecycle compilation throws a descriptive error
4. CI assertion: `coverageRatio === 1.0` for all lifecycle effect sequences in FITL compiled GameDef
5. CI assertion: `coverageRatio === 1.0` for all lifecycle effect sequences in Texas Hold'em compiled GameDef
6. Property test: random-play 1000 games with `verifyCompiledEffects: true` — zero divergences
7. All existing golden trace tests pass unchanged
8. All existing parity tests pass unchanged
9. Existing suite: `pnpm turbo test`
10. Existing suite: `pnpm turbo typecheck`

### Invariants

1. No `createFallbackFragment` function or import exists anywhere in the codebase
2. No `fallbackBatch` variable or accumulation logic exists in `compileFragmentList`
3. `classifyEffect` returns non-null for every `_k` tag except `grantFreeOperation` (tag 22)
4. `grantFreeOperation` in lifecycle context causes a runtime error, not a silent fallback
5. The interpreter (`applyEffects`) remains functional for action effects and verification mode
6. Every `CompiledEffectSequence` has `coverageRatio: 1.0` (or the field is removed)
7. All FITL and Texas Hold'em lifecycle sequences execute as pure compiled closure chains with zero interpreter fallback

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Add test asserting `grantFreeOperation` in lifecycle sequence throws error
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Add coverage ratio assertion test for FITL and Texas Hold'em GameDefs
3. `packages/engine/test/integration/` or `packages/engine/test/e2e/` — Property test: 1000 random-play games with `verifyCompiledEffects: true`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `grep -r "createFallbackFragment" packages/engine/src/` — must return zero results
5. `grep -r "fallbackBatch" packages/engine/src/` — must return zero results
