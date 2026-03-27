# 85COMEFFCONMIG-002: Widen resolveChoiceDecisionPlayer signature to ReadContext

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-choice.ts
**Deps**: `archive/specs/85-complete-effect-context-migration.md`

## Problem

`resolveChoiceDecisionPlayer` in `effects-choice.ts` accepts `EffectContext` but only calls `resolveSinglePlayerSel(chooser, evalCtx)` which accepts `ReadContext`.

That mismatch overstates the helper's needs and obscures the real migration boundary: the 8 `fromEnvAndCursor` constructions in `effects-choice.ts` are owned by ticket `85COMEFFCONMIG-008`, while this ticket is only about narrowing the helper's contract to the context shape it actually consumes.

## Assumption Reassessment (2026-03-26)

1. `resolveChoiceDecisionPlayer` is an internal (non-exported) function — confirmed
2. It only calls `resolveSinglePlayerSel` which accepts `ReadContext` — confirmed
3. Error context construction uses only the passed-in primitive parameters (`effectType`, `bind`, `decisionId`), not context fields — confirmed
4. `effects-choice.ts` still has 8 `fromEnvAndCursor` call sites, but only 2 of them flow into `resolveChoiceDecisionPlayer` (`applyChooseOne`, `applyChooseN`) — confirmed
5. Ticket `85COMEFFCONMIG-008` already exists to remove the 8 `fromEnvAndCursor` sites in `effects-choice.ts` — confirmed

## Architecture Check

1. Narrowing this helper to `ReadContext` is the cleaner contract because it states the selector-only dependency directly instead of leaking `EffectContext`
2. This is still a compile-time-only change — runtime object shapes and V8 hidden classes are unchanged
3. Internal function, no external API change
4. No backwards-compatibility shim needed (Foundation 9)
5. The broader architectural win in `effects-choice.ts` remains ticket `85COMEFFCONMIG-008`; doing that work here would duplicate ticket scope instead of improving design

## What to Change

### 1. Widen parameter type

Change `resolveChoiceDecisionPlayer`:
- Parameter: `evalCtx: EffectContext` -> `evalCtx: ReadContext`
- No other changes needed — `resolveSinglePlayerSel` already accepts `ReadContext`
- Keep all `fromEnvAndCursor` call sites in `effects-choice.ts` unchanged here; they are addressed by ticket `85COMEFFCONMIG-008`

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)

## Out of Scope

- Replacing the 8 `fromEnvAndCursor` call sites in `effects-choice.ts` — those are replaced in ticket `85COMEFFCONMIG-008`
- Any changes to `resolveSinglePlayerSel` signature
- Any changes to other effect handler files
- Any changes to `effect-context.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Engine tests covering choice ownership and chooser resolution remain green: `pnpm -F @ludoforge/engine test`
2. TypeScript strict mode confirms the helper body is compatible with `ReadContext`
3. Workspace lint/typecheck remain green for the touched file set

### Invariants

1. V8 hidden class shapes unchanged — same runtime objects at call sites
2. `resolveChoiceDecisionPlayer` remains internal (non-exported)
3. Determinism parity — same seed + same actions = identical stateHash

## Test Plan

### New/Modified Tests

1. No new tests needed — type-level-only change

### Commands

1. `pnpm -F @ludoforge/engine test` — run the relevant engine suite that already covers chooseOne/chooseN ownership and pending-decision behavior
2. `pnpm turbo typecheck` — verify signature compatibility
3. `pnpm turbo lint` — no lint regressions

## Outcome

- Completion date: 2026-03-26
- What actually changed: corrected the ticket assumptions to match the live codebase, then narrowed `resolveChoiceDecisionPlayer` from `EffectContext` to `ReadContext` in `packages/engine/src/kernel/effects-choice.ts`
- Deviations from original plan: no runtime call-site migration was done here; the 8 `fromEnvAndCursor` sites in `effects-choice.ts` remain correctly scoped to ticket `85COMEFFCONMIG-008`
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
  - An earlier parallel test run failed because `pnpm turbo typecheck` rebuilt and cleaned `packages/engine/dist` while the engine test runner was reading from it; rerunning the engine suite sequentially passed cleanly
