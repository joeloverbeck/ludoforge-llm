# 85COMEFFCONMIG-010: Remove fromEnvAndCursor and finish trace-bridge cleanup

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context/trace bridge cleanup
**Deps**: Historical only — handler migration tickets `85COMEFFCONMIG-003` through `85COMEFFCONMIG-009` are already reflected in the current codebase

## Problem

The original version of this ticket assumed the handler-local `fromEnvAndCursor` migration was still in progress. That assumption is now stale in the current worktree.

As of 2026-03-27:

- production handler call sites are already gone
- `fromEnvAndCursor` remains only as dead bridge code in `effect-context.ts`
- `effect-compiler-runtime.ts` still contains a stale migration comment referencing `fromEnvAndCursor`
- the migrated codebase now has a clear post-migration architectural question: repeated env/cursor-to-trace-context object construction appears in multiple files and should be reassessed against the final concrete code, not the pre-migration plan

Per Foundations 9 and 10, the cleanup ticket should now remove the dead compatibility bridge and make one explicit design decision about the repeated trace-context bridge surface: either extract a narrow shared helper because the shape is stable across files, or keep the local helpers because the similarities are only superficial.

## Assumption Reassessment (2026-03-27)

1. `fromEnvAndCursor` is still exported from `packages/engine/src/kernel/effect-context.ts` — confirmed.
2. There are no remaining `fromEnvAndCursor` production call sites in `packages/engine/`; the only live source references are the function definition, one nearby explanatory comment, and a stale comment in `effect-compiler-runtime.ts` — confirmed via `rg`.
3. The previous ticket text was wrong to treat `85COMEFFCONMIG-007` through `85COMEFFCONMIG-009` as pending blockers for runtime cleanup. Their code changes are already present in this worktree, regardless of where the archival files currently live.
4. The 7 handler files listed in the older ticket no longer need a broad stale-import sweep for `fromEnvAndCursor`; any remaining `EffectContext` imports now need to be judged by actual current usage, not by migration-era assumptions.
5. `effects-choice.ts` still legitimately imports `EffectContext`, but only for `def`-indexed type references. That import is not stale.
6. `trace-provenance.ts` and `var-change-trace.ts` still intentionally use `Pick<EffectContext, ...>` contracts. Those are narrow enough to remain valid unless a cleaner env/cursor-native bridge is extracted.
7. Repeated post-migration trace bridge shapes now exist in multiple places:
   - provenance-only shape: `{ state, traceContext?, effectPath? }`
   - trace-emission shape: `{ collector, state, traceContext?, effectPath? }`
8. That duplication is no longer hypothetical. It appears in `effects-control.ts`, `effects-reveal.ts`, `effects-choice.ts`, `effects-var.ts`, `effects-resource.ts`, and multiple sites in `effects-token.ts`.
9. The right architectural question is therefore no longer "are there still runtime callers?" but "should the repeated narrow trace bridge be centralized now that the final env/cursor architecture is stable?"
10. The ideal endpoint is:
    - no `fromEnvAndCursor`
    - no stale commentary describing it as part of the supported architecture
    - one explicit, narrow, intentional story for env/cursor-to-trace plumbing

## Architecture Check

1. Removing `fromEnvAndCursor` is unambiguously better than the current architecture. It is dead compatibility code and keeping it would violate Foundation 9.
2. The handler migration already proved that eval/runtime boundaries no longer need full merged `EffectContext` reconstruction. Keeping the bridge behind "just in case" semantics would leave historical residue in a supposedly completed migration.
3. A shared trace bridge helper is architecturally justified if and only if it preserves the current narrow contracts:
   - provenance helper based on `EffectEnv` + `EffectCursor`
   - trace-emission helper based on `EffectEnv` + `EffectCursor`
   - no resurrection of full merged-context plumbing
4. In the current codebase, the repeated trace bridge shape is stable enough across multiple files that extracting narrow shared helpers is likely the cleaner long-term architecture. It reduces drift, codifies the post-migration boundary in one place, and keeps future handler work from re-inventing the same inline object shape.
5. The extraction should live alongside the existing env/cursor bridge helpers in `effect-context.ts`, because this module already owns the decomposition and recomposition boundary between broad `EffectContext` and narrow env/cursor derivatives.
6. The extraction must stay minimal. Do not turn it into a generic adapter layer or reintroduce merged `EffectContext` construction through a different name.

## What to Change

### 1. Remove the dead compatibility bridge

- Delete `fromEnvAndCursor` from `packages/engine/src/kernel/effect-context.ts`
- Remove any comments that describe it as an active compatibility path

### 2. Replace stale migration commentary

- Update `packages/engine/src/kernel/effect-compiler-runtime.ts`
- The comment on `buildEffectEnvFromCompiledCtx()` should describe the current architecture directly, without mentioning `fromEnvAndCursor`

### 3. Centralize the stable narrow trace bridge

- Reassess the repeated env/cursor trace-object construction against the live codebase
- If the repeated shapes are still identical after code inspection, extract shared narrow helpers in `effect-context.ts`
- Prefer two explicit helpers over one over-general abstraction:
  - one for provenance consumers
  - one for trace-emission consumers
- Update local file helpers or inline object construction in migrated handlers to use the new shared helpers where this improves clarity without broadening contracts

### 4. Remove only genuinely stale imports and local glue

- Re-check the migrated handler files and supporting trace modules
- Remove imports or local helpers only when the current file no longer needs them after the cleanup
- Do not remove legitimate `EffectContext` type references that still express the narrowest useful contract

### 5. Final verification grep

- Run `rg "fromEnvAndCursor" packages/engine/`
- Expected result after completion: zero matches in production code and tests

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts`
- `packages/engine/src/kernel/effect-compiler-runtime.ts`
- `packages/engine/src/kernel/effects-control.ts` if shared trace helper extraction replaces the local provenance helper
- `packages/engine/src/kernel/effects-reveal.ts` if shared trace helper extraction replaces the local provenance helper
- `packages/engine/src/kernel/effects-choice.ts` if shared trace helper extraction replaces the local provenance helper
- `packages/engine/src/kernel/effects-var.ts` if shared trace helper extraction replaces the local var-trace builder
- `packages/engine/src/kernel/effects-resource.ts` if shared trace helper extraction replaces the local trace builders
- `packages/engine/src/kernel/effects-token.ts` if shared trace helper extraction replaces repeated inline trace-context objects
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` and/or other targeted trace tests as needed to prove the narrowed architecture

## Out of Scope

- Reintroducing any compatibility alias for `fromEnvAndCursor`
- Changing `EffectEnv`, `EffectCursor`, or `ReadContext` semantics beyond the narrow shared-helper extraction needed here
- Performance benchmarking
- Unrelated handler refactors outside the effect-context migration surface

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

### Invariants

1. `packages/engine/` contains zero references to `fromEnvAndCursor`
2. `mergeToReadContext` and `mergeToEvalContext` remain unchanged
3. No new compatibility adapter replaces the removed helper
4. Any extracted trace helper is based on `EffectEnv` + `EffectCursor`, not on reconstructing full `EffectContext`
5. If trace helper extraction occurs, provenance and var-change trace behavior remain unchanged
6. The completed ticket documents whether the repeated trace bridge was centralized or intentionally left local

## Test Plan

### New/Modified Tests

1. Strengthen module-surface or contract tests around `effect-context.ts` so the removed helper stays removed
2. If shared trace helpers are extracted, add or update a focused test that proves they preserve the current optional-field and provenance behavior

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo test`
3. `pnpm turbo lint`
4. `rg "fromEnvAndCursor" packages/engine/`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - removed the dead `fromEnvAndCursor` bridge from `packages/engine/src/kernel/effect-context.ts`
  - added narrow shared trace bridge helpers in `effect-context.ts` for provenance and trace-emission consumers
  - updated `effects-control.ts`, `effects-reveal.ts`, `effects-choice.ts`, `effects-var.ts`, `effects-resource.ts`, and `effects-token.ts` to use the shared helpers instead of repeating local env/cursor trace object construction
  - updated the stale migration comment in `effect-compiler-runtime.ts`
  - strengthened `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` to keep the legacy bridge removed and to prove the new trace helpers preserve optional-field behavior
- Deviations from original plan:
  - no stale import sweep across all originally listed handler files was needed; the migration-era assumptions were already obsolete in the live codebase
  - instead of only deleting dead code, this ticket also centralized the now-stable trace bridge shape because the final post-migration architecture justified that extraction
- Verification results:
  - targeted engine tests passed:
    - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js packages/engine/dist/test/unit/resource-transfer-trace.test.js packages/engine/dist/test/unit/trace-contract.test.js`
    - `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/effects-choice.test.js packages/engine/dist/test/unit/effects-reveal.test.js packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/transfer-var.test.js`
  - required repo-wide checks passed:
    - `pnpm turbo typecheck`
    - `pnpm turbo lint`
    - `pnpm turbo test`
  - `rg "fromEnvAndCursor" packages/engine/` returns zero matches
