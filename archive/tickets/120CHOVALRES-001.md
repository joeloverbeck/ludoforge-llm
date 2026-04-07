# 120CHOVALRES-001: Define ChoiceValidationResult type and factory helpers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel result type infrastructure
**Deps**: `archive/specs/119-eval-result-returning-migration.md`

## Problem

The choice validation pipeline in `effects-choice.ts` communicates errors by throwing `CHOICE_RUNTIME_VALIDATION_FAILED`. To convert these to result types (matching the `EvalConditionResult`/`EvalQueryResult` pattern from Spec 119), the result type and factory helpers must exist first.

## Assumption Reassessment (2026-04-07)

1. `EvalConditionResult` and `EvalQueryResult` exist in `packages/engine/src/kernel/eval-result.ts` with `outcome: 'success' | 'error'` discriminant — confirmed.
2. `evalSuccess<T>()` factory exists in the same file — confirmed.
3. No type named `ChoiceValidationResult` or `ChoiceValidationError` exists in the codebase — confirmed via grep.
4. `CHOICE_RUNTIME_VALIDATION_FAILED` is a valid `EffectRuntimeReason` string used in `effect-error.ts` — confirmed.

## Architecture Check

1. Follows the established result type pattern from Spec 119 (`outcome: 'success' | 'error'` discriminant), ensuring consistency across the kernel's result type family.
2. No game-specific logic — the type is a generic kernel infrastructure type.
3. No backwards-compatibility shims — this is new infrastructure, not a migration.

## What to Change

### 1. Create ChoiceValidationResult type

Define the result type following the `EvalConditionResult` pattern:

```typescript
export type ChoiceValidationResult<T> =
  | { readonly outcome: 'success'; readonly value: T }
  | { readonly outcome: 'error'; readonly error: ChoiceValidationError }

export type ChoiceValidationError = {
  readonly code: 'CHOICE_RUNTIME_VALIDATION_FAILED'
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}
```

### 2. Create factory helpers

```typescript
export const choiceValidationSuccess = <T>(value: T): ChoiceValidationResult<T> =>
  ({ outcome: 'success', value })

export const choiceValidationFailed = (
  message: string,
  context?: Readonly<Record<string, unknown>>,
): ChoiceValidationResult<never> =>
  ({ outcome: 'error', error: { code: 'CHOICE_RUNTIME_VALIDATION_FAILED', message, context } })
```

### 3. Decide placement

Place in `packages/engine/src/kernel/eval-result.ts` (extending the existing result type module) or in a new `packages/engine/src/kernel/choice-validation-result.ts`. The former keeps the result type family co-located; the latter keeps `eval-result.ts` focused on eval results.

## Files to Touch

- `packages/engine/src/kernel/eval-result.ts` (modify) — or new `packages/engine/src/kernel/choice-validation-result.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify) — export new types if in a new file

## Out of Scope

- Converting any throw sites — that is ticket 002
- Changes to `PartialEffectResult` or effect handler signatures
- Changes to `choose-n-option-resolution.ts`, `free-operation-viability.ts`, or `apply-move.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Type-level: `ChoiceValidationResult<boolean>` accepts both success and error variants (compile-time check via typecheck).
2. Factory: `choiceValidationSuccess(42)` produces `{ outcome: 'success', value: 42 }`.
3. Factory: `choiceValidationFailed('msg')` produces `{ outcome: 'error', error: { code: 'CHOICE_RUNTIME_VALIDATION_FAILED', message: 'msg' } }`.
4. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. The `outcome` discriminant uses `'success' | 'error'`, matching `EvalConditionResult`/`EvalQueryResult`.
2. All fields are `readonly` (F11 Immutability).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-validation-result.test.ts` (new) — factory helper correctness and type shape verification.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "choice-validation-result"`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

**Completed**: 2026-04-07

**What changed**:
- New file `packages/engine/src/kernel/choice-validation-result.ts` — `ChoiceValidationResult<T>`, `ChoiceValidationError`, `choiceValidationSuccess()`, `choiceValidationFailed()`.
- `packages/engine/src/kernel/index.ts` — added re-export.
- New test `packages/engine/test/unit/kernel/choice-validation-result.test.ts` — 7 tests.

**Deviations**: Placed in a dedicated file (`choice-validation-result.ts`) instead of extending `eval-result.ts`, to keep each module focused. Used `...(context !== undefined ? { context } : {})` spread pattern for `exactOptionalPropertyTypes` compliance.

**Verification**: Build clean, typecheck clean (3/3 packages), 738/738 engine tests pass, dedicated test 7/7 pass.
