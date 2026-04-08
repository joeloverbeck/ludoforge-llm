# 120CHOVALRES-002: Convert 32 throw sites in effects-choice.ts and integrate with PartialEffectResult

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel choice effect handlers, effect dispatch
**Deps**: `archive/tickets/120CHOVALRES-001.md`

## Problem

`effects-choice.ts` contains 32 sites that `throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, ...)`. These throws are used as control flow — caught by the viability probe and apply-move callers. Converting them to result types eliminates throw-for-control-flow, enabling callers to handle validation failures without try/catch (F15).

## Assumption Reassessment (2026-04-07)

1. Exactly 32 throw sites exist in `effects-choice.ts` for `CHOICE_RUNTIME_VALIDATION_FAILED` — confirmed via grep.
2. The throw function is `effectRuntimeError()` (not `createEffectRuntimeError`) in `effect-error.ts:225-278` — confirmed.
3. Exported choice handlers (`applyChooseOne`, `applyChooseN`, `applyRollRandom`, `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyShiftGlobalMarker`, `applyFlipGlobalMarker`) all return `PartialEffectResult` — confirmed.
4. `PartialEffectResult` is defined in `effect-context.ts` and the `EffectHandler` signature in `effect-registry.ts:45` returns `PartialEffectResult` — confirmed.
5. `effect-dispatch.ts` contains the actual dispatch logic (not `effects.ts`, which is a 1-line barrel re-export) — confirmed.
6. Choice handlers are registered in `effect-registry.ts:74-75` — confirmed.
7. Internal functions that throw include `normalizeChooseNSelectionValues`, `resolveMarkerLattice`, `resolveGlobalMarkerLattice`, `resolveChoiceDecisionPlayer` — confirmed.

## Architecture Check

1. Converting throws to returns follows the pattern established by Spec 119 for `evalCondition`/`evalQuery`.
2. The `PartialEffectResult` integration must be decided: either extend with a validation-failed variant or wrap at the dispatch boundary. Both are valid; the choice determines how far the result type propagates.
3. No game-specific logic — all changes are in the generic choice effect subsystem.
4. No backwards-compatibility shims — all 32 sites are converted in this ticket.

## What to Change

### 1. Convert internal validation functions

Change internal functions that currently throw to return `ChoiceValidationResult`:

```typescript
// BEFORE
throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, message, { ... })

// AFTER
return choiceValidationFailed(message, { ... })
```

Functions to convert: `normalizeChooseNSelectionValues`, `resolveMarkerLattice`, `resolveGlobalMarkerLattice`, `resolveChoiceDecisionPlayer`, and inline throw sites within the exported handlers.

### 2. Update internal function return types

Each converted function's return type changes to include `ChoiceValidationResult`. Callers within `effects-choice.ts` must check `result.outcome` before proceeding.

### 3. Integrate with PartialEffectResult

Decide and implement the integration strategy:

- **(a) Extend PartialEffectResult** with a `choiceValidationFailed` variant so that choice handlers can return validation failure through the existing dispatch contract.
- **(b) Wrap at dispatch boundary** — internal functions return `ChoiceValidationResult`, but the top-level handler converts failure to a thrown error or a new `PartialEffectResult` variant before returning to the dispatcher.

The chosen strategy must allow the probe path (`doesCompletedProbeMoveChangeGameplayState`) to observe validation failures without catching exceptions.

### 4. Update effect-dispatch.ts

If strategy (a) is chosen, `effect-dispatch.ts` must handle the new `PartialEffectResult` variant and propagate it to callers. If strategy (b), the dispatch layer may need minimal changes.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify) — 32 throw→return conversions + return type changes
- `packages/engine/src/kernel/effect-context.ts` (modify) — extend `PartialEffectResult` if strategy (a)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify) — handle new result variant
- `packages/engine/src/kernel/effect-registry.ts` (modify) — update `EffectHandler` type if needed

## Out of Scope

- Catch site migrations in `choose-n-option-resolution.ts` — that is ticket 003
- Catch site migrations in `free-operation-viability.ts` and `apply-move.ts` — that is ticket 004
- Deleting `hasTransportLikeStateChangeFallback` — that is ticket 004
- Changes to the compile-time choice validation pipeline

## Acceptance Criteria

### Tests That Must Pass

1. `grep -rn "throw.*CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/effects-choice.ts` returns zero hits.
2. All existing choice-related tests pass without modification (the throw→return is internal; external behavior is preserved via catch sites that still exist in 003/004).
3. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. Zero `throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, ...)` statements remain in `effects-choice.ts`.
2. All choice handler return types are compatible with the dispatch contract.
3. F8 Determinism: same inputs produce same results (result type is deterministic).
4. F11 Immutability: all result objects are readonly.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effects-choice.test.ts` (modify or new) — verify that validation failures produce result objects (not throws) for representative cases: invalid selection encoding, cardinality mismatch, duplicate selection, invalid marker lattice value.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects-choice"`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Completed: 2026-04-08
- What changed:
  - Converted the `effects-choice.ts` `CHOICE_RUNTIME_VALIDATION_FAILED` throw-for-control-flow sites to `ChoiceValidationResult`/`choiceValidationError` returns through `PartialEffectResult`.
  - Updated shared helpers in `value-membership.ts` and `choose-n-cardinality.ts` so internal choice validation can return typed failures instead of throwing.
  - Added direct handler regression coverage in `packages/engine/test/unit/effects-choice.test.ts` for representative validation failures.
- Deviations from original plan:
  - The `PartialEffectResult` integration path was already resolved in live code before this ticket landed: `effect-context.ts` already exposed `choiceValidationError`, and `effect-dispatch.ts` already rethrew it to preserve pre-existing caller behavior for the follow-up tickets. No additional edits were needed there.
  - The named unit test path in the ticket had moved; the active coverage lives in `packages/engine/test/unit/effects-choice.test.ts`.
  - The ticket's example focused test command ran the full engine package suite under the current Node test-runner setup instead of only the named slice.
- Verification:
  - `grep -rn "throw.*CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/effects-choice.ts`
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects-choice"` (passed; exercised the full engine package suite, 733 passing tests)
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
