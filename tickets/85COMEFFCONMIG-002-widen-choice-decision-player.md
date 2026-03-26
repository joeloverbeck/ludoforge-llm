# 85COMEFFCONMIG-002: Widen resolveChoiceDecisionPlayer signature to ReadContext

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-choice.ts
**Deps**: Spec 85

## Problem

`resolveChoiceDecisionPlayer` in `effects-choice.ts` accepts `EffectContext` but only calls `resolveSinglePlayerSel(chooser, evalCtx)` which accepts `ReadContext`. This forces the 8 call sites in `effects-choice.ts` to construct a full `EffectContext` via `fromEnvAndCursor` when a `ReadContext` would suffice.

## Assumption Reassessment (2026-03-26)

1. `resolveChoiceDecisionPlayer` is an internal (non-exported) function — confirmed
2. It only calls `resolveSinglePlayerSel` which accepts `ReadContext` — confirmed
3. Error context construction uses only the passed-in primitive parameters (`effectType`, `bind`, `decisionId`), not context fields — confirmed

## Architecture Check

1. Type widening is compile-time only — V8 hidden class shapes identical at runtime
2. Internal function, no external API change
3. No backwards-compatibility shim needed (Foundation 9)

## What to Change

### 1. Widen parameter type

Change `resolveChoiceDecisionPlayer`:
- Parameter: `evalCtx: EffectContext` -> `evalCtx: ReadContext`
- No other changes needed — `resolveSinglePlayerSel` already accepts `ReadContext`

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)

## Out of Scope

- The 8 `fromEnvAndCursor` call sites in `effects-choice.ts` — those are replaced in ticket -008
- Any changes to `resolveSinglePlayerSel` signature
- Any changes to other effect handler files
- Any changes to `effect-context.ts`

## Acceptance Criteria

### Tests That Must Pass

1. All existing choice effect tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising chooseOne and chooseN
3. TypeScript strict mode confirms the function body is compatible with `ReadContext`

### Invariants

1. V8 hidden class shapes unchanged — same runtime objects at call sites
2. `resolveChoiceDecisionPlayer` remains internal (non-exported)
3. Determinism parity — same seed + same actions = identical stateHash

## Test Plan

### New/Modified Tests

1. No new tests needed — type-level-only change

### Commands

1. `pnpm turbo typecheck` — verify signature compatibility
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
