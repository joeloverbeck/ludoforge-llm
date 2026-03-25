# 81WHOSEQEFFCOM-001: Rewrite classifyEffect to switch dispatch on `_k` tags

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — effect-compiler-patterns.ts
**Deps**: Spec 82 (completed — `_k` tags on all EffectAST nodes)

## Problem

`classifyEffect` in `effect-compiler-patterns.ts` uses a chain of `??` matchers (`matchSetVar(node) ?? matchAddVar(node) ?? ...`) — a linear probe that must be extended for each new compiled type. With Spec 82's `_k` discriminant tags, this can become O(1) `switch(effect._k)` dispatch. This is the foundational change that all subsequent tickets depend on.

## Assumption Reassessment (2026-03-25)

1. `classifyEffect` is in `packages/engine/src/kernel/effect-compiler-patterns.ts` and returns `PatternDescriptor | null`. Verified.
2. `EFFECT_KIND_TAG` is defined in `packages/engine/src/kernel/types-ast.ts` with 34 tags (0-33). Verified.
3. All EffectAST nodes carry `_k` tags after Spec 82. Verified.
4. `walkEffects` in the same file also traverses the AST and should use `_k` for consistency.
5. The `PatternDescriptor` union type currently covers: `SetVarPattern`, `AddVarPattern`, `IfPattern`, `ForEachPlayersPattern`, `GotoPhaseExactPattern`.

## Architecture Check

1. `switch(effect._k)` is the idiomatic way to dispatch on a numeric discriminant — O(1) via V8 jump table vs O(n) matcher chain.
2. This is a behavior-preserving refactor: same inputs → same outputs. New `_k` cases initially return `null` (not-yet-compiled).
3. `grantFreeOperation` (tag 22) explicitly returns `null` with a comment documenting deferral to future action-effect compilation spec.
4. No backwards-compatibility shim needed (Foundation 9).

## What to Change

### 1. Rewrite `classifyEffect` to `switch(effect._k)`

In `effect-compiler-patterns.ts`, replace the `??` chain with a `switch` statement on `effect._k`. Each already-compiled tag dispatches to its existing `match*` function. All other lifecycle tags return `null` (stub for future tickets). `grantFreeOperation` (tag 22) returns `null` with a deferral comment.

### 2. Update `walkEffects` to use `_k` for structural traversal

Replace any kind-sniffing in `walkEffects` with `switch(effect._k)` so nested effect bodies (`then`, `else`, `effects`, `in`, `compute`) are found via the tag, not by probing object keys.

### 3. Extend `PatternDescriptor` union type comment

Add a block comment listing all 34 tags and their compilation status (compiled / stub / deferred) as a roadmap for subsequent tickets.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)

## Out of Scope

- Adding new pattern descriptors or match functions for not-yet-compiled types (tickets 002-009)
- Changing `effect-compiler-codegen.ts` or `effect-compiler.ts`
- Modifying the `CompiledEffectFragment` type or `composeFragments`
- Deleting `createFallbackFragment` (ticket 010)
- Any changes to interpreter effect handlers

## Acceptance Criteria

### Tests That Must Pass

1. All existing `effect-compiler-patterns.test.ts` tests pass unchanged (behavior-preserving refactor)
2. All existing `effect-compiler-codegen.test.ts` tests pass unchanged
3. All existing `effect-compiler.test.ts` tests pass unchanged
4. All existing `effect-compiler-verification.test.ts` tests pass unchanged
5. New test: `classifyEffect` returns the same `PatternDescriptor` for all 5 already-compiled types as before the refactor
6. New test: `classifyEffect` returns `null` for every not-yet-compiled `_k` tag
7. New test: `walkEffects` correctly traverses nested bodies for all effect types that have them
8. Existing suite: `pnpm turbo test`
9. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `classifyEffect` output is identical for all inputs — this is a pure refactor
2. `computeCoverageRatio` returns the same values as before for any effect sequence
3. No new pattern descriptors are introduced — only the dispatch mechanism changes
4. `grantFreeOperation` always returns `null` from `classifyEffect`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add switch-dispatch-specific tests: one per already-compiled tag confirming correct descriptor type, one per not-yet-compiled tag confirming `null`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
