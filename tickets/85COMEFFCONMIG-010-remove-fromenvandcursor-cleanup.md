# 85COMEFFCONMIG-010: Remove fromEnvAndCursor and cleanup stale imports

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts and references
**Deps**: 85COMEFFCONMIG-003, 85COMEFFCONMIG-004, 85COMEFFCONMIG-005, 85COMEFFCONMIG-006, 85COMEFFCONMIG-007, 85COMEFFCONMIG-008, 85COMEFFCONMIG-009

## Problem

After tickets -003 through -009 replace all 28 `fromEnvAndCursor` call sites, the function itself becomes dead code. Per Foundation 9 (No Backwards Compatibility), dead code must be removed — not deprecated, not commented out.

## Assumption Reassessment (2026-03-26)

1. `fromEnvAndCursor` is exported from `effect-context.ts` at lines ~252-253 — confirmed
2. After -003 through -009, zero call sites should remain — verify by grep
3. Check whether `effect-compiler-runtime.ts` has a comment referencing `fromEnvAndCursor` — spec says yes
4. Check whether a `compat()` function exists — exploration found none, but verify at implementation time
5. Check whether any test files import `fromEnvAndCursor` directly — must also be cleaned up

## Architecture Check

1. Dead code removal aligns with Foundation 9 (No Backwards Compatibility)
2. Completes the Spec 77 migration — Foundation 10 (Architectural Completeness)
3. No shims, no deprecation markers — clean removal

## What to Change

### 1. Remove fromEnvAndCursor from effect-context.ts

- Delete the `fromEnvAndCursor` function definition
- Remove its export from the module

### 2. Remove stale EffectContext imports from effect handler files

For each of the 7 handler files (-003 through -009), check whether `EffectContext` is still imported. If it's only used in the now-removed `fromEnvAndCursor` call and not in function signatures (handlers take `env: EffectEnv, cursor: EffectCursor`), remove the import.

Files to check:
- `effects-binding.ts`
- `effects-reveal.ts`
- `effects-subset.ts`
- `effects-var.ts`
- `effects-resource.ts`
- `effects-choice.ts`
- `effects-token.ts`

### 3. Update comment in effect-compiler-runtime.ts

Remove or update any comment that references `fromEnvAndCursor` as part of the migration path.

### 4. Remove compat() if it exists and is unused

If a `compat()` adapter exists in `effect-context.ts`, verify it has no remaining callers and remove it.

### 5. Final verification grep

Run `grep -r "fromEnvAndCursor" packages/engine/` to confirm zero remaining references in source AND test files.

### Note

This cleanup ticket should also verify whether any file-local helper signatures or `EffectContext`-indexed type aliases remain broader than necessary after -003 through -009. If a handler no longer needs `EffectContext` after its migration, remove the stale broad typing in the same cleanup rather than leaving it as historical residue.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify — remove function)
- `packages/engine/src/kernel/effects-binding.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-reveal.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-subset.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-var.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-resource.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-choice.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effects-token.ts` (modify — remove stale import, if applicable)
- `packages/engine/src/kernel/effect-compiler-runtime.ts` (modify — update comment, if applicable)

## Out of Scope

- Any changes to `mergeToReadContext` or `mergeToEvalContext` — these remain
- Any changes to `EffectEnv` or `EffectCursor` interfaces
- Any changes to `ReadContext` interface
- Performance benchmarking
- Any changes to eval function signatures

## Acceptance Criteria

### Tests That Must Pass

1. Full test suite: `pnpm turbo test`
2. Typecheck: `pnpm turbo typecheck` — confirms no remaining references to removed function
3. Lint: `pnpm turbo lint` — no unused import warnings

### Invariants

1. Zero references to `fromEnvAndCursor` in the entire `packages/engine/` tree (source + tests)
2. `mergeToReadContext` and `mergeToEvalContext` remain available and unchanged
3. `EffectContext` type remains available for any code that still needs it (e.g., type annotations in scope boundaries)
4. Determinism parity maintained
5. Spec 77 migration is architecturally complete

## Test Plan

### New/Modified Tests

1. No new tests needed — removal of dead code

### Commands

1. `pnpm turbo typecheck` — verify no broken references
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
4. `grep -r "fromEnvAndCursor" packages/engine/` — confirms zero results
