# 85COMEFFCONMIG-003: Replace fromEnvAndCursor in effects-binding.ts (1 call site)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-binding.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-binding.ts` has 1 `fromEnvAndCursor` call site in `applyBindValue`. This constructs a full `EffectContext` (~30 field spread) even though the downstream call is only `evalValue()`. The handler also precomputes resolved bindings and may allocate a temporary `evalCursor` solely to feed those bindings into `fromEnvAndCursor`.

The original ticket scope was therefore slightly off. The cleanest local architecture is not "preserve the current plumbing and swap in `mergeToReadContext`"; it is to collapse the handler onto `mergeToEvalContext(env, cursor)`, which already encapsulates the exact "resolve effect bindings, then build a `ReadContext` for eval" pattern.

## Assumption Reassessment (2026-03-26)

1. `applyBindValue` has exactly 1 `fromEnvAndCursor` call site — confirmed
2. The resulting `evalCtx` is passed only to `evalValue()`, which accepts `ReadContext` — confirmed
3. `applyBindValue` currently performs a local `resolveEffectBindings()` call and may build a temporary `evalCursor` only to feed `fromEnvAndCursor` — confirmed
4. The handler returns exported bindings based on `cursor.bindings`, not on the merged move-param view used for eval. That behavior is intentional and must remain unchanged — confirmed
5. `mergeToEvalContext()` already exists in `effect-context.ts` and matches this handler's needs more directly than `mergeToReadContext()` — confirmed

## Architecture Check

1. `mergeToEvalContext` is already used in `effects-control.ts` for the same "resolve bindings + build eval context" pattern
2. No game-specific logic (Foundation 1)
3. No shims — direct replacement (Foundation 9)
4. Cleaner architecture here means deleting duplicated local binding-resolution plumbing rather than preserving it under a different helper call (Foundation 10)

## What to Change

### 1. Replace fromEnvAndCursor with mergeToEvalContext

In `applyBindValue`:
- Remove the local `resolveEffectBindings()` / `evalCursor` plumbing
- Replace the full-context reconstruction with `const evalCtx = mergeToEvalContext(env, cursor)`
- Update import: remove `fromEnvAndCursor` and `resolveEffectBindings`, add `mergeToEvalContext`
- Preserve the existing result contract: bound values are added to `cursor.bindings`, not to a move-param-expanded binding map

## Files to Touch

- `packages/engine/src/kernel/effects-binding.ts` (modify)
- `packages/engine/test/unit/bind-value.test.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to `evalValue` or other eval functions
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. Binding-effect tests continue to pass
2. Determinism tests pass (same seed + same actions = identical stateHash)
3. TypeScript strict mode confirms `mergeToEvalContext` return type satisfies `evalValue`
4. `applyBindValue` no longer reconstructs a full `EffectContext`

### Invariants

1. `mergeToEvalContext` preserves the existing evaluation surface, including move-parameter visibility during value evaluation
2. No new imports of `EffectContext` introduced
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. Strengthen `bind-value.test.ts` with coverage proving `bindValue` can evaluate against move-parameter-backed bindings after the helper swap

### Commands

1. `pnpm turbo typecheck` — verify type compatibility
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="bindValue effect"` — targeted binding regression check
3. `pnpm turbo test` — full suite passes
4. `pnpm turbo lint` — no lint regressions

## Outcome

The ticket was corrected before implementation. The original plan proposed retaining local binding-resolution plumbing and swapping in `mergeToReadContext`, but the cleaner architecture was to remove that duplicate plumbing entirely and use the existing shared `mergeToEvalContext(env, cursor)` helper.

Actual changes:
- `applyBindValue` now evaluates through `mergeToEvalContext(env, cursor)` and no longer reconstructs a full `EffectContext`
- `bind-value.test.ts` now explicitly proves that move params remain visible during bind-value evaluation without leaking those move params into exported bindings
