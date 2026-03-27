# 85COMEFFCONMIG-008: Replace fromEnvAndCursor in effects-choice.ts (8 call sites)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-choice.ts
**Deps**: 85COMEFFCONMIG-001, 85COMEFFCONMIG-002

## Problem

`effects-choice.ts` has 8 `fromEnvAndCursor` call sites across choice handler functions (`applyChooseOne`, `applyChooseN`, and related helpers). Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext`.

This is the second-largest migration file (8 sites) and depends on both -001 (widened scoped-var signatures) and -002 (widened `resolveChoiceDecisionPlayer`).

## Assumption Reassessment (2026-03-26)

1. 8 `fromEnvAndCursor` call sites at lines ~604, 723, 961, 1109, 1198, 1291, 1350, 1419 — confirmed
2. All 8 call sites are the same structural shape: `resolveChoiceBindings(env, cursor)` followed by `fromEnvAndCursor(env, { ...cursor, bindings: resolvedBindings })`. There are no remaining direct `fromEnvAndCursor(env, cursor)` sites in this file.
3. `resolveChoiceBindings` is not equivalent to shared `resolveEffectBindings` / `mergeToEvalContext`: it also materializes templated binding-key aliases via `resolveBindingTemplate(bindingKey, cursor.bindings)`. That choice-specific behavior is still required by current `effects-choice.ts` semantics.
4. Downstream consumers at these sites are `resolveChoiceDecisionPlayer`, `evalQuery`, `evalCondition`, `evalValue`, and marker-rule helpers. Those reads are `ReadContext`-only.
5. Two of the 8 sites (`applyChooseOne`, `applyChooseN`) also feed `resolveTraceProvenance`. `mergeToReadContext` intentionally omits `effectPath`, so trace provenance must be built from an explicit env/cursor pick (or a file-local helper), not by reusing the narrowed eval context object.
6. `resolvePrioritizedTierEntries` currently still accepts `EffectContext` even though it only delegates to `evalQuery`; if this file is being touched for migration anyway, that helper should be narrowed in the same ticket instead of carrying forward unnecessary context coupling.
7. Ticket `85COMEFFCONMIG-002` narrowed `resolveChoiceDecisionPlayer` to `ReadContext` without migrating any runtime call sites; this ticket still owns all 8 `fromEnvAndCursor` replacements in `effects-choice.ts`.

## Architecture Check

1. `mergeToReadContext`/`mergeToEvalContext` proven V8-safe in `effects-control.ts`
2. `resolveChoiceDecisionPlayer` already widened to `ReadContext` in -002
3. The shared `resolveEffectBindings` helper is not a drop-in replacement here because `effects-choice.ts` still needs choice-specific templated binding-key alias materialization
4. No game-specific logic (Foundation 1)
5. No shims (Foundation 9)

## Coordination Note

`85COMEFFCONMIG-002` is complete and archived. Its work is already reflected in the codebase, so this ticket should treat `resolveChoiceDecisionPlayer` as a `ReadContext` consumer and avoid redoing that helper cleanup while migrating the 8 remaining `fromEnvAndCursor` call sites.

If `effects-choice.ts` needs tiny env/cursor trace picks during migration, keep them file-local here. Do not extract a shared cross-file provenance helper from this ticket; that series-end decision remains owned by `85COMEFFCONMIG-010` once the final duplicated surface is visible across `effects-resource.ts`, `effects-choice.ts`, and `effects-token.ts`.

## What to Change

### 1. Replace 8 fromEnvAndCursor call sites with narrowed read-context construction

All 8 call sites are the same resolved-bindings pattern:
- `resolveChoiceBindings(env, cursor)`
- then reconstructing a full `EffectContext` only to satisfy `ReadContext` consumers

Replace that pattern with a narrowed `ReadContext` build based on the resolved bindings:
- `mergeToReadContext(env, { ...cursor, bindings: resolvedBindings })`
- or a tiny file-local helper that does exactly that, if it materially reduces duplication across the 8 sites

For the 2 trace-emitting choice handlers:
- stop passing the narrowed eval context to `resolveTraceProvenance`
- instead build provenance from the minimal env/cursor fields needed (`state`, optional `traceContext`, optional `effectPath`), mirroring the pattern already used in `effects-control.ts`

### 2. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`
- Remove `EffectContext` from imports if no longer used in the file
- Keep `EffectContext` if still referenced in handler function signatures (which take `env: EffectEnv, cursor: EffectCursor`)

### Note

This ticket is the right place to finish file-local helper cleanup in `effects-choice.ts`, not just the 8 call sites. Any internal helper that still accepts `EffectContext` while only using `ReadContext`-level fields should be narrowed during the same edit for architectural completeness.

`resolveChoiceBindings` should not be deleted just to force reuse of the generic helper surface. It encodes choice-specific templated binding-key alias semantics that the shared helper does not currently provide. If a cleaner general abstraction becomes obvious during implementation, surface it explicitly; otherwise keep that behavior local and migrate only the unnecessary full-context reconstruction.

Keep any trace/provenance cleanup local to `effects-choice.ts`. If this migration exposes repeated env/cursor trace builders or repeated inline trace picks that seem shareable, make that duplication explicit but defer the cross-file extraction decision to `85COMEFFCONMIG-010`.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to `resolveChoiceDecisionPlayer` signature (done in -002)
- Any changes to `scoped-var-runtime-access.ts` (done in -001)
- Any changes to other effect handler files
- Changes to `evalQuery`, `evalCondition`, or other eval function signatures
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing chooseOne/chooseN tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising choice mechanics (event cards, operations with choices)
3. Texas Hold'em tests exercising betting choices
4. Determinism tests pass

### Invariants

1. All 8 downstream call chains receive objects with required `ReadContext` fields
2. `resolveChoiceDecisionPlayer` receives `ReadContext` (not `EffectContext`)
3. Choice-specific templated binding-key alias resolution remains intact after the migration
4. Trace provenance for `chooseOne` / `chooseN` preserves the current `effectPath` values
5. Determinism parity maintained
6. Zero `fromEnvAndCursor` references remain in this file
7. Choice resolution produces identical decisions for same seed + same actions

## Test Plan

### New/Modified Tests

1. Add or strengthen a unit test that proves choice evaluation still sees templated binding-key aliases after the migration
2. Add or strengthen a unit test that proves `chooseOne` / `chooseN` decision traces keep their expected provenance `effectPath`

### Commands

1. `pnpm turbo typecheck` — verify type compatibility across all 8 sites
2. Targeted engine unit tests covering `effects-choice.ts` and legal choice traces
3. `pnpm -F @ludoforge/engine test:e2e` — ensure broader choice flows still pass
4. `pnpm turbo test` — full suite passes
5. `pnpm turbo lint` — no lint regressions

## Outcome

- Completion date: 2026-03-27
- Actual changes:
  - Replaced all 8 `fromEnvAndCursor` call sites in `packages/engine/src/kernel/effects-choice.ts`
  - Narrowed `resolvePrioritizedTierEntries` from `EffectContext` to `ReadContext`
  - Added a file-local `mergeChoiceToReadContext` helper so the choice-specific templated binding-key alias behavior stays intact without reconstructing full `EffectContext`
  - Added a file-local provenance helper so `chooseOne` / `chooseN` decision traces keep the existing `effectPath` values after the narrower eval-context migration
  - Strengthened unit coverage for choice binding aliases and decision-trace provenance
- Deviations from original plan:
  - The ticket originally assumed the shared `mergeToEvalContext` path might be usable directly; the implementation kept choice-local binding alias resolution because that behavior is not provided by the generic helper surface
  - The implementation introduced tiny file-local helpers rather than repeating the same narrowed merge/provenance picks at all 8 sites
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck`
  - `node --test dist/test/unit/effects-choice.test.js dist/test/unit/kernel/legal-choices.test.js`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo test`
  - `pnpm turbo lint`
