# 82EFFASTTYPTAG-004: Compiler and AST Builder Migration to makeEffect

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — 9 compiler files + `ast-builders.ts`
**Deps**: 82EFFASTTYPTAG-001, 82EFFASTTYPTAG-002 (needs types + `makeEffect`)

## Problem

All effect construction sites in the compiler (`compile-effects-*.ts`) and
kernel (`ast-builders.ts`) produce raw `{ kind: payload }` objects without
`_k`. With `EffectAST` now requiring `_k`, these must migrate to
`makeEffect()`.

## Assumption Reassessment (2026-03-25)

1. `ast-builders.ts` has `buildEffect()` (lines 10-12) and 34 convenience
   builders (lines 18-51). All construct `{ [kind]: payload }` without `_k`.
   Confirmed.
2. Compiler effect lowering files (8 files under `packages/engine/src/cnl/`):
   - `compile-effects-core.ts` — main dispatch
   - `compile-effects-var.ts` — setVar, addVar, setActivePlayer, transferVar
   - `compile-effects-token.ts` — moveToken, moveAll, draw, reveal, etc.
   - `compile-effects-flow.ts` — if, forEach, reduce, let, markers, phases
   - `compile-effects-choice.ts` — chooseOne, chooseN, distributeTokens
   - `compile-effects-free-op.ts` — grantFreeOperation
   - `compile-effects-binding-scope.ts` — binding scope management
   - `compile-effects-utils.ts` — utility functions
   - `compile-effects-types.ts` — type definitions
   Confirmed.
3. Each lowering function returns an `EffectAST` literal like
   `{ setVar: { var: ..., value: ... } }`. These are the sites to migrate.

## Architecture Check

1. `makeEffect('setVar', { var, value })` replaces
   `{ setVar: { var, value } }` — mechanical transformation with no logic
   change.
2. `ast-builders.ts` convenience builders (e.g., `setVar(payload)`) should
   call `makeEffect()` internally, preserving the same public API.
3. No backwards-compat shims. Direct `{ kind: payload }` construction
   without `_k` will be a type error after ticket 001.

## What to Change

### 1. Update `ast-builders.ts`

- Change `buildEffect()` to use `makeEffect()` internally.
- Update all 34 convenience builders to return `WithKindTag<K>` via
  `makeEffect()`.
- Update `EffectPayload<K>` type if needed for compatibility.

### 2. Migrate `compile-effects-var.ts`

Replace all effect literals in `lowerSetVarEffect()`, `lowerAddVarEffect()`,
`lowerSetActivePlayerEffect()`, `lowerTransferVarEffect()` with
`makeEffect()` calls.

### 3. Migrate `compile-effects-token.ts`

Replace all effect literals in `lowerMoveTokenEffect()`,
`lowerMoveAllEffect()`, `lowerMoveTokenAdjacentEffect()`,
`lowerDrawEffect()`, `lowerRevealEffect()`, `lowerConcealEffect()`,
`lowerShuffleEffect()`, `lowerCreateTokenEffect()`,
`lowerDestroyTokenEffect()`, `lowerSetTokenPropEffect()`.

### 4. Migrate `compile-effects-flow.ts`

Replace all effect literals in `lowerIfEffect()`, `lowerForEachEffect()`,
`lowerReduceEffect()`, `lowerRemoveByPriorityEffect()`, `lowerLetEffect()`,
`lowerBindValueEffect()`, `lowerEvaluateSubsetEffect()`,
`lowerRollRandomEffect()`, and marker/phase effect lowerers.

### 5. Migrate `compile-effects-choice.ts`

Replace all effect literals in `lowerChooseOneEffect()`,
`lowerChooseNEffect()`, `lowerDistributeTokensEffects()`.

### 6. Migrate `compile-effects-free-op.ts`

Replace all effect literals in `lowerGrantFreeOperationEffect()`.

### 7. Migrate `compile-effects-core.ts`

If `lowerEffectNode()` itself constructs any EffectAST literals (e.g., for
wrapping or default effects), migrate those too.

### 8. Migrate `compile-effects-utils.ts`

If any utility functions construct EffectAST literals, migrate those.

## Files to Touch

- `packages/engine/src/kernel/ast-builders.ts` (modify)
- `packages/engine/src/cnl/compile-effects-core.ts` (modify)
- `packages/engine/src/cnl/compile-effects-var.ts` (modify)
- `packages/engine/src/cnl/compile-effects-token.ts` (modify)
- `packages/engine/src/cnl/compile-effects-flow.ts` (modify)
- `packages/engine/src/cnl/compile-effects-choice.ts` (modify)
- `packages/engine/src/cnl/compile-effects-free-op.ts` (modify)
- `packages/engine/src/cnl/compile-effects-utils.ts` (modify, if needed)
- `packages/engine/src/cnl/compile-effects-types.ts` (modify, if needed)

## Out of Scope

- Type definitions in `types-ast.ts` — ticket 001
- `makeEffect()` and `tagEffectAsts()` creation — ticket 002
- Dispatch/registry changes — ticket 003
- Schema changes — ticket 005
- Test fixture migration — ticket 006
- CI tests — ticket 007
- Changing compiler logic or behavior — only the construction syntax changes
- Changes to `compile-conditions.ts` or `compile-value-exprs.ts`
- Changes to runtime effect handler implementations

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` compiles without type errors (this is
   the critical gate — all construction sites must include `_k`).
2. `pnpm -F @ludoforge/engine test` — all existing compiler and integration
   tests pass (compiled GameDefs now include `_k` fields).
3. E2E: `pnpm -F @ludoforge/engine test:e2e` — full pipeline tests pass
   (FITL and Texas Hold'em compile → run → verify).
4. Existing suite: `pnpm turbo test`

### Invariants

1. Every `EffectAST` constructed by the compiler includes a correct `_k` tag.
2. No logic changes — only construction syntax changes.
3. `ast-builders.ts` convenience builders preserve their existing public API
   signatures (callers don't need to change).
4. Compiled GameDef JSON now includes `_k` fields on all effect nodes.

## Test Plan

### New/Modified Tests

1. No new test files. Existing compiler tests validate that the compiled
   output is behaviorally correct. Golden tests may need updating if they
   compare exact JSON structure (see ticket 006).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo typecheck`
