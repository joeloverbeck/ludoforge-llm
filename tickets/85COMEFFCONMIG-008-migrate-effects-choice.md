# 85COMEFFCONMIG-008: Replace fromEnvAndCursor in effects-choice.ts (8 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-choice.ts
**Deps**: 85COMEFFCONMIG-001, 85COMEFFCONMIG-002

## Problem

`effects-choice.ts` has 8 `fromEnvAndCursor` call sites across choice handler functions (`applyChooseOne`, `applyChooseN`, and related helpers). Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext`.

This is the second-largest migration file (8 sites) and depends on both -001 (widened scoped-var signatures) and -002 (widened `resolveChoiceDecisionPlayer`).

## Assumption Reassessment (2026-03-26)

1. 8 `fromEnvAndCursor` call sites at lines ~604, 723, 961, 1109, 1198, 1291, 1350, 1419 — confirmed
2. Results are passed to: `resolveChoiceDecisionPlayer` (completed in archived ticket `85COMEFFCONMIG-002`), `evalQuery`, `evalCondition`, `evalValue`, `resolveRef` — all accept `ReadContext`
3. Some call sites use resolved bindings (`resolveChoiceBindings`) — these need `mergeToReadContext(env, evalCursor)` pattern
4. Check whether any call site passes the context to trace functions — if so, inline pick objects needed
5. `resolvePrioritizedTierEntries` currently still accepts `EffectContext` even though it only delegates to `evalQuery`; if this file is being touched for migration anyway, that helper should be narrowed in the same ticket instead of carrying forward unnecessary context coupling
6. Ticket `85COMEFFCONMIG-002` narrowed `resolveChoiceDecisionPlayer` to `ReadContext` without migrating any runtime call sites; this ticket still owns all 8 `fromEnvAndCursor` replacements in `effects-choice.ts`

## Architecture Check

1. `mergeToReadContext`/`mergeToEvalContext` proven V8-safe in `effects-control.ts`
2. `resolveChoiceDecisionPlayer` already widened to `ReadContext` in -002
3. No game-specific logic (Foundation 1)
4. No shims (Foundation 9)

## Coordination Note

`85COMEFFCONMIG-002` is complete and archived. Its work is already reflected in the codebase, so this ticket should treat `resolveChoiceDecisionPlayer` as a `ReadContext` consumer and avoid redoing that helper cleanup while migrating the 8 remaining `fromEnvAndCursor` call sites.

## What to Change

### 1. Replace 8 fromEnvAndCursor call sites

For each of the 8 call sites, determine the pattern:
- **Resolved bindings pattern**: Where `resolveChoiceBindings(env, cursor)` is called first, then `fromEnvAndCursor(env, { ...cursor, bindings: resolvedBindings })` — replace with `mergeToReadContext(env, { ...cursor, bindings: resolvedBindings })`
- **Direct pattern**: Where `fromEnvAndCursor(env, cursor)` is called directly — replace with `mergeToReadContext(env, cursor)` or `mergeToEvalContext(env, cursor)`
- **Trace pattern**: If any call site passes context to trace functions — use inline pick object

### 2. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used in the file
- Keep `EffectContext` if still referenced in handler function signatures (which take `env: EffectEnv, cursor: EffectCursor`)

### Note

This ticket is the right place to finish file-local helper cleanup in `effects-choice.ts`, not just the 8 call sites. Any internal helper that still accepts `EffectContext` while only using `ReadContext`-level fields should be narrowed during the same edit for architectural completeness.

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
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file
5. Choice resolution produces identical decisions for same seed + same actions

## Test Plan

### New/Modified Tests

1. No new tests needed — identical observable behavior

### Commands

1. `pnpm turbo typecheck` — verify type compatibility across all 8 sites
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
