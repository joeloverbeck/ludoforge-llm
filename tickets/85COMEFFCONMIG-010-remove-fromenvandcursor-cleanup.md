# 85COMEFFCONMIG-010: Remove fromEnvAndCursor and cleanup stale imports

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts and references
**Deps**: 85COMEFFCONMIG-003, 85COMEFFCONMIG-004, 85COMEFFCONMIG-005, 85COMEFFCONMIG-006, 85COMEFFCONMIG-007, 85COMEFFCONMIG-008, 85COMEFFCONMIG-009

## Problem

After tickets -003 through -009 replace all 28 `fromEnvAndCursor` call sites, the function itself becomes dead code. Per Foundation 9 (No Backwards Compatibility), dead code must be removed — not deprecated, not commented out.

## Assumption Reassessment (2026-03-27)

1. `fromEnvAndCursor` is exported from `effect-context.ts` at lines ~252-253 — confirmed
2. Archived tickets `85COMEFFCONMIG-003`, `85COMEFFCONMIG-004`, `85COMEFFCONMIG-005`, and `85COMEFFCONMIG-006` are already complete; active tickets `85COMEFFCONMIG-007` through `85COMEFFCONMIG-009` still own the remaining handler-local migrations
3. After the remaining handler tickets land, zero legitimate runtime call sites should remain — verify with `rg "fromEnvAndCursor" packages/engine/`
4. `effect-compiler-runtime.ts` still has a comment referencing `fromEnvAndCursor` — confirmed in current source
5. No `compat()` helper is currently present in `effect-context.ts`; keep this as a verification checkpoint rather than an expected edit
6. Existing migration tickets already defer any cross-file provenance-helper decision to this ticket, so this is the explicit series-end owner for deciding whether that extraction is warranted
7. Archived ticket `85COMEFFCONMIG-006` confirms one concrete post-migration duplication shape already exists: `effects-var.ts` now carries a local narrow var-trace context/builder instead of any shared helper
8. Active tickets `85COMEFFCONMIG-007` and `85COMEFFCONMIG-009` already expect local inline picks or local trace builders, and `85COMEFFCONMIG-008` may expose similar trace/provenance duplication depending on the final call-site audit
9. The right decision boundary for this ticket is therefore not "extract something because duplication exists somewhere"; it is "reassess the final migrated set and only extract a helper if at least two files share a stable, semantically identical env/cursor trace shape"
10. The ideal architectural endpoint is not merely "no callers"; it is "no compatibility bridge left behind once the migration is complete" (Foundations 9 and 10)

## Architecture Check

1. Dead code removal aligns with Foundation 9 (No Backwards Compatibility)
2. Completes the Spec 77 migration — Foundation 10 (Architectural Completeness)
3. No shims, no deprecation markers — clean removal
4. Shared provenance-helper extraction, if duplication remains after -003 through -009, is cleaner here than in any single migration ticket because it can be done once against the final post-migration surface
5. This ticket is the architectural completion step for the series: per-file tickets keep local changes narrow, and this ticket owns the final delete-or-extract decisions that should only be made against the fully migrated codebase
6. Any extracted helper must be justified by a stable repeated contract across files, not by superficial similarity. A helper that papers over materially different trace semantics would violate Foundation 10 by hiding, rather than resolving, architectural differences.

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
- Use the completed `85COMEFFCONMIG-006` outcome plus the final `85COMEFFCONMIG-007` through `85COMEFFCONMIG-009` implementations as the concrete audit set; do not speculate from the pre-migration ticket text once the files are available
- If the duplication is real across multiple files, extract a shared helper in the kernel layer with a narrow contract based on `EffectEnv` + `EffectCursor`
- Update migrated handlers to consume the shared helper instead of keeping file-local provenance builders
- Do not reintroduce broad `EffectContext` plumbing while doing this; the helper must preserve the narrow env/cursor architecture established by the migration
- Prefer one of two outcomes only:
  - extract a helper because the same env/cursor-to-trace shape truly repeats across files
  - keep local helpers/picks because the repeated code is only superficially similar or diverges by trace payload semantics
- If the duplication does not justify a shared helper after reassessment, document that conclusion in the completed ticket outcome and keep the local picks/helpers; do not force an abstraction that is weaker than the final concrete call surface

### 7. Series-end architecture check

- Reassess whether any remaining helper signatures, comments, or tiny adapters still preserve `EffectContext`-shaped plumbing out of historical convenience rather than current need
- Remove or narrow them in the same change when the owner is clear and the contract can be expressed cleanly with `ReadContext`, `EffectEnv` + `EffectCursor`, or explicit small picks
- Do not broaden this into unrelated refactoring outside the effect-context migration surface

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
7. If no shared provenance helper is extracted, that is an explicit post-migration design decision rather than an accidental omission

## Test Plan

### New/Modified Tests

1. No new tests needed — removal of dead code
2. If helper extraction touches trace plumbing, strengthen existing trace tests only where needed to prove provenance/event parity remains unchanged

### Commands

1. `pnpm turbo typecheck` — verify no broken references
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
4. `rg "fromEnvAndCursor" packages/engine/` — confirms zero results
