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
6. The migrated files are likely to end with repeated env/cursor trace-provenance builders or repeated `{ collector, state, traceContext, effectPath }` picks; if that duplication is present, this cleanup ticket is the right place to centralize it because all remaining migrations will already be complete

## Architecture Check

1. Dead code removal aligns with Foundation 9 (No Backwards Compatibility)
2. Completes the Spec 77 migration — Foundation 10 (Architectural Completeness)
3. No shims, no deprecation markers — clean removal
4. Shared provenance-helper extraction, if duplication remains after -003 through -009, is cleaner here than in any single migration ticket because it can be done once against the final post-migration surface

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

### 6. Consolidate duplicated env/cursor trace helpers if they remain

- Reassess the migrated handler files for repeated helpers or repeated inline objects that only exist to supply:
  - `resolveTraceProvenance({ state, traceContext?, effectPath? })`
  - `emitVarChangeTraceIfChanged({ collector, state, traceContext?, effectPath? }, ...)`
- If the duplication is real across multiple files, extract a shared helper in the kernel layer with a narrow contract based on `EffectEnv` + `EffectCursor`
- Update migrated handlers to consume the shared helper instead of keeping file-local provenance builders
- Do not reintroduce broad `EffectContext` plumbing while doing this; the helper must preserve the narrow env/cursor architecture established by the migration

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
- `packages/engine/src/kernel/trace-provenance.ts` (modify only if shared provenance helper extraction is warranted)
- `packages/engine/src/kernel/var-change-trace.ts` (modify only if shared trace-pick helper extraction is warranted)

## Out of Scope

- Any changes to `mergeToReadContext` or `mergeToEvalContext` — these remain
- Any changes to `EffectEnv` or `EffectCursor` interfaces
- Any changes to `ReadContext` interface
- Performance benchmarking
- Any changes to eval function signatures
- Any new backwards-compatibility adapter around the removed helper

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
6. If shared provenance-helper extraction is performed, it is based on `EffectEnv` + `EffectCursor` rather than resurrecting full merged-context plumbing

## Test Plan

### New/Modified Tests

1. No new tests needed — removal of dead code
2. If helper extraction touches trace plumbing, strengthen existing trace tests only where needed to prove provenance/event parity remains unchanged

### Commands

1. `pnpm turbo typecheck` — verify no broken references
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
4. `grep -r "fromEnvAndCursor" packages/engine/` — confirms zero results
