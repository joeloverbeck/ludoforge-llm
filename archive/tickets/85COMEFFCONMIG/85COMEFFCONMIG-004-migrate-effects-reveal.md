# 85COMEFFCONMIG-004: Replace fromEnvAndCursor in effects-reveal.ts (2 call sites)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-reveal.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-reveal.ts` still has 2 `fromEnvAndCursor` call sites in `applyConceal` and `applyReveal`. They reconstruct a full `EffectContext` even though the handlers split into two narrower needs:

1. selector/filter evaluation, which only needs `ReadContext` with resolved bindings
2. trace provenance emission, which only needs a small `{ state, traceContext?, effectPath? }` object

Keeping those concerns fused forces the file to pay the full-context reconstruction cost and obscures the cleaner architecture established in `effects-control.ts`.

## Assumption Reassessment (2026-03-26)

1. `applyConceal` has 1 `fromEnvAndCursor` call at line ~41 — confirmed
2. `applyReveal` has 1 `fromEnvAndCursor` call at line ~140 — confirmed
3. Both handlers call `resolveEffectBindings` before building the merged context, so `mergeToEvalContext`, not bare `mergeToReadContext`, is the correct replacement — confirmed
4. Both handlers also call `resolveTraceProvenance`; provenance should be built from a minimal inline pick object rather than by reconstructing full `EffectContext` — confirmed
5. The parent Spec 85 document is broader than current reality: `effects-binding.ts` is already migrated, and `scoped-var-runtime-access.ts` already accepts `ReadContext` plus `mode` — confirmed
6. The repo already has focused reveal/conceal unit coverage in `packages/engine/test/unit/effects-reveal.test.ts` plus integration coverage, so this ticket should strengthen targeted tests if the migration relies on an uncovered invariant — confirmed

## Architecture Check

1. `mergeToEvalContext` is already proven in `effects-control.ts` for the same "resolved bindings + `ReadContext`" use case
2. Trace provenance already accepts `Pick<EffectContext, 'state' | 'traceContext' | 'effectPath'>`, so reveal/conceal can pass a purpose-built minimal object without widening runtime contracts
3. No game-specific logic (Foundation 1)
4. No shims or aliases; replace the full-context reconstruction directly (Foundation 9)
5. Preferred architecture for this file: use the narrowest runtime object for each concern instead of a shared "do everything" merged object

## What to Change

### 1. Replace full-context reconstruction in `applyConceal`

- Replace `fromEnvAndCursor(...)` with `mergeToEvalContext(...)`
- Keep trace provenance separate via a minimal inline object built from `cursor.state`, `env.traceContext`, and `cursor.effectPath`

### 2. Replace full-context reconstruction in `applyReveal`

- Same pattern as `applyConceal`

### 3. Update imports

- Remove `fromEnvAndCursor`
- Add `mergeToEvalContext`
- Do not introduce any new `EffectContext` dependency in this file

## Files to Touch

- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify only if needed to lock down migration invariants)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to eval functions
- Performance benchmarking
- Broader Spec 85 migration cleanup outside `effects-reveal.ts`

## Acceptance Criteria

### Tests That Must Pass

1. All existing reveal/conceal effect tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising reveal/conceal mechanics
3. Determinism tests pass

### Invariants

1. Evaluation inside reveal/conceal uses `mergeToEvalContext`, preserving move-param-aware binding resolution
2. Trace provenance in this file is built from a minimal context object, not a reconstructed full `EffectContext`
3. No new imports of `EffectContext` introduced
4. Determinism parity maintained
5. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. Keep existing reveal/conceal behavior tests green
2. Add or strengthen a focused test if needed to prove the migration preserves:
   - move-param-aware binding resolution in reveal/conceal selectors
   - trace provenance including `effectPath` when tracing is enabled

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern=\"effects reveal|effects conceal\"` or equivalent targeted reveal/conceal run
2. `pnpm turbo typecheck` — verify type compatibility
3. `pnpm turbo lint` — no lint regressions
4. `pnpm turbo test` — broad regression and determinism coverage

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - `packages/engine/src/kernel/effects-reveal.ts` now uses `mergeToEvalContext` for reveal/conceal evaluation and a minimal provenance helper for trace emission instead of reconstructing full `EffectContext`
  - `packages/engine/test/unit/effects-reveal.test.ts` was strengthened to cover move-param-backed zone binding resolution plus trace provenance propagation of custom `traceContext` and `effectPath`
- Deviations from original plan:
  - The ticket was corrected before implementation because `mergeToReadContext` was too weak for this file's binding-resolution needs; `mergeToEvalContext` is the correct architectural target here
  - New tests were added instead of relying solely on pre-existing coverage because this refactor depends on two concrete invariants that were not asserted directly
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
  - `pnpm turbo test` passed
