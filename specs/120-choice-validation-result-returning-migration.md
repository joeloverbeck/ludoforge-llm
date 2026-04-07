# Spec 120 — Choice Validation Result-Returning Migration

**Status**: DRAFT
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel choice subsystem + viability probe heuristic elimination
**Deps**: Spec 119 (evalCondition/evalQuery result-returning migration) must be complete.
**Design**: docs/plans/2026-04-07-eval-result-returning-migration-design.md

## Problem

`effects-choice.ts` contains 32 throw sites for `CHOICE_RUNTIME_VALIDATION_FAILED`. These throws occur during choice domain evaluation — normalizing tier items, validating encodability, checking cardinality — deep inside the choice resolution chain. When these throws propagate to `doesCompletedProbeMoveChangeGameplayState` in `free-operation-viability.ts`, the caller catches them and falls back to `hasTransportLikeStateChangeFallback` — a 68-line heuristic (lines 348-415) that guesses state-change potential from move params.

The heuristic is deterministic, bounded, and empirically correct for the current game set. But it is a workaround (F15 violation): it exists because choice validation communicates errors by throwing, and the caller cannot distinguish "validation genuinely failed" from "speculative probe hit an expected boundary."

With Spec 119 complete, `evalCondition`/`evalQuery` return result types. The choice validation pipeline is the next layer up — it calls eval functions and additionally throws its own validation errors. Converting these to result types eliminates the last remaining throw-for-control-flow pattern and allows the heuristic to be deleted.

**Evidence**:

| Metric | Count |
|--------|-------|
| `CHOICE_RUNTIME_VALIDATION_FAILED` throw sites in effects-choice.ts | 32 |
| Catch sites for this error | 2 (free-operation-viability.ts, apply-move.ts) |
| Heuristic lines to delete | 68 (lines 348-415 of free-operation-viability.ts) |
| Files in choice resolution chain | 3 (effects-choice.ts, choose-n-option-resolution.ts, effects.ts) |

**Why this matters**: The heuristic is the most visible F15 strain in the kernel. Eliminating it completes the throw-to-result migration started in Spec 118 and continued in Spec 119. After this spec, zero probe-context catch blocks remain for eval or choice validation errors.

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| F5 One Rules Protocol | Satisfied | Unchanged |
| F8 Determinism | Satisfied (heuristic is deterministic) | Unchanged (result type is deterministic) |
| F10 Bounded Computation | Satisfied (heuristic inspects only move params) | Enhanced — no heuristic needed, actual evaluation result used |
| F11 Immutability | Satisfied | Unchanged — result types are readonly |
| F14 No Backwards Compatibility | N/A | Full migration — heuristic deleted, no fallback paths |
| F15 Architectural Completeness | **Violated**: heuristic is a workaround | **Resolved**: choice validation returns result types; heuristic eliminated |
| F16 Testing as Proof | Heuristic tested via canary seeds | Result type tested via same canary seeds + explicit unit tests |

### Game-Agnosticism

All changes are in the generic kernel choice subsystem. No game-specific identifiers, rules, or payloads are involved.

## What to Change

### 1. Define Choice Validation Result Type

New type (can be in `effects-choice.ts` or a dedicated file):

```typescript
export type ChoiceValidationResult<T> =
  | { readonly outcome: 'success'; readonly value: T }
  | { readonly outcome: 'choiceValidationFailed'; readonly error: ChoiceValidationError }

export type ChoiceValidationError = {
  readonly code: 'CHOICE_RUNTIME_VALIDATION_FAILED'
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}
```

Design choice: `'choiceValidationFailed'` outcome (not generic `'error'`) because choice validation failure has specific semantic meaning in the probe context — it means "this move requires a sub-decision whose domain cannot be resolved in the current state," which is distinct from a genuine error.

### 2. Convert 32 Throw Sites in effects-choice.ts

Each throw site:

```typescript
// BEFORE
throw createEffectRuntimeError('CHOICE_RUNTIME_VALIDATION_FAILED', message)

// AFTER
return choiceValidationFailed(message)
```

This changes the return types of internal choice resolution functions. The propagation follows the call chain upward.

### 3. Propagate Through Choice Resolution Chain

**choose-n-option-resolution.ts**: Functions that call choice validation must handle the result type and propagate it.

**effects.ts**: The effect dispatcher must handle choice validation results from choice-processing effects.

### 4. Update doesCompletedProbeMoveChangeGameplayState

**File**: `packages/engine/src/kernel/free-operation-viability.ts`

```typescript
// BEFORE (line ~470)
try {
  // execute effects and compare state
} catch (error) {
  if (isEffectRuntimeReason(error, 'CHOICE_RUNTIME_VALIDATION_FAILED')) {
    return hasTransportLikeStateChangeFallback(move, state)
  }
  throw error
}

// AFTER
const result = executeEffectsForProbe(move, state)
if (result.outcome === 'choiceValidationFailed') {
  // Choice couldn't be resolved — the move's viability is inconclusive
  // but the result type carries enough info to decide without a heuristic
  return result // or map to appropriate viability result
}
return doesMaterialGameplayStateChange(result.value.before, result.value.after)
```

### 5. Delete hasTransportLikeStateChangeFallback

Remove lines 348-415 of `free-operation-viability.ts`. This is the 68-line heuristic that becomes unnecessary.

### 6. Update apply-move.ts Call Site

**apply-move.ts:1908**: Same pattern — replace catch + fallback with result pattern-match.

## Files Modified

| File | Change Type | Sites |
|------|-------------|-------|
| `effects-choice.ts` | throw → return (32 sites) + internal return type changes | 32 |
| `choose-n-option-resolution.ts` | Result propagation | Multiple |
| `effects.ts` | Result propagation from choice effects | Multiple |
| `free-operation-viability.ts` | Delete heuristic (68 lines) + result handling | 2 |
| `apply-move.ts` | Result handling at call site | 1 |

## Verification

1. **Heuristic deletion proof**: `grep -r "hasTransportLikeStateChangeFallback"` returns zero hits in non-test, non-archive code.
2. **Throw elimination proof**: `grep -rn "throw.*CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/effects-choice.ts` returns zero hits.
3. **Regression tests**: All ~703 existing test files pass. FITL canary seeds exercise the viability probe path extensively.
4. **Determinism tests**: Replay tests confirm F8.
5. **Typecheck**: `pnpm turbo typecheck` passes with zero errors.
6. **F15 proof**: No catch blocks remain in the probe subsystem for choice validation errors.

## Exclusions

- Other throw sites outside the choice validation pipeline (e.g., `ILLEGAL_MOVE`, `BUDGET_EXHAUSTED`) — these are genuine runtime errors, not control-flow
- Changes to the choice domain compilation pipeline (compile-time validation) — out of scope
- Performance optimization of the probe path — out of scope unless regression is detected
