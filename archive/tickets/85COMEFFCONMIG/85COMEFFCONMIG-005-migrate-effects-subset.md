# 85COMEFFCONMIG-005: Replace fromEnvAndCursor in effects-subset.ts (2 call sites)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-subset.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-subset.ts` has 2 `fromEnvAndCursor` call sites in `applyEvaluateSubset`. Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext`.

## Assumption Reassessment (2026-03-26)

1. `applyEvaluateSubset` has 2 `fromEnvAndCursor` calls at lines ~43 and ~97 — confirmed
2. The resulting contexts are passed to eval functions accepting `ReadContext` — confirmed
3. The call sites do not use the same pattern:
   - the initial source/subset-size evaluation wants move-param-aware bindings and should use `mergeToEvalContext(env, cursor)`
   - the post-compute score evaluation already resolves bindings explicitly against the computed state and should use `mergeToReadContext(env, scoreCursor)`
4. There is no dedicated FITL/integration coverage for `evaluateSubset`; the strongest direct coverage is the existing kernel unit suite in `packages/engine/test/unit/kernel/evaluate-subset.test.ts`
5. The current ticket claim that no new tests are needed is too weak for this change: the migration changes context-construction plumbing on two distinct execution paths, so tests should explicitly lock down move-param-aware evaluation and post-compute score evaluation

## Architecture Check

1. `mergeToReadContext`/`mergeToEvalContext` are proven V8-safe
2. No game-specific logic (Foundation 1)
3. No shims — direct replacement (Foundation 9)
4. This change is architecturally beneficial over the current state because `effects-subset.ts` is still paying the compatibility-bridge cost of reconstructing a full `EffectContext` even though its downstream eval APIs are already expressed in terms of `ReadContext`

## What to Change

### 1. Replace both fromEnvAndCursor calls in applyEvaluateSubset

For each call site:
- Replace the initial `evalCtx` construction with `mergeToEvalContext(env, cursor)`
- Keep explicit `resolveEffectBindings(...)` for the score path, then build `scoreCtx` with `mergeToReadContext(env, scoreCursor)`
- Match the established split already used elsewhere: `mergeToEvalContext` when move params must be merged lazily, `mergeToReadContext` when the bindings payload is already finalized

### 2. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used

## Files to Touch

- `packages/engine/src/kernel/effects-subset.ts` (modify)
- `packages/engine/test/unit/kernel/evaluate-subset.test.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to eval functions
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. Targeted subset unit coverage: `packages/engine/test/unit/kernel/evaluate-subset.test.ts`
2. Relevant engine suite: `pnpm -F @ludoforge/engine test`
3. Workspace typecheck and lint: `pnpm turbo typecheck` and `pnpm turbo lint`

### Invariants

1. Downstream eval calls receive objects with all required `ReadContext` fields
2. Initial evaluation still merges `moveParams` into bindings
3. Post-compute score evaluation still reads the computed state plus explicitly resolved bindings
4. No new imports of `EffectContext` introduced
5. Determinism parity maintained
6. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. Strengthen `packages/engine/test/unit/kernel/evaluate-subset.test.ts` with a move-param-aware evaluation case for the initial `evalCtx`
2. Strengthen `packages/engine/test/unit/kernel/evaluate-subset.test.ts` with a post-compute score-evaluation case that depends on computed state plus resolved bindings

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-reporter=spec packages/engine/test/unit/kernel/evaluate-subset.test.ts` — direct coverage for the changed handler
2. `pnpm -F @ludoforge/engine test` — relevant engine regression coverage
3. `pnpm turbo typecheck` — verify type compatibility
4. `pnpm turbo lint` — no lint regressions

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Replaced the initial `fromEnvAndCursor` usage in `effects-subset.ts` with `mergeToEvalContext(env, cursor)`
  - Replaced the post-compute scoring context reconstruction with `mergeToReadContext(env, scoreCursor)` after explicit binding resolution
  - Strengthened `evaluateSubset` unit coverage for move-param-aware initial evaluation and post-compute score evaluation against computed state plus merged bindings
- Deviations from original plan:
  - The original ticket said no new tests were needed; in practice, two targeted unit tests were added because this migration changes context-construction plumbing on two distinct execution paths
  - The original acceptance text referenced FITL/e2e coverage that does not directly exist for `evaluateSubset`; validation was aligned to direct kernel coverage plus the full engine suite
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/evaluate-subset.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
