# 120CHOVALRES-004: Update probe and apply-move callers, delete heuristic

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel viability probe, move application
**Deps**: `tickets/120CHOVALRES-002.md`, `tickets/120CHOVALRES-003.md`

## Problem

`doesCompletedProbeMoveChangeGameplayState` in `free-operation-viability.ts` catches `CHOICE_RUNTIME_VALIDATION_FAILED` and falls back to `hasTransportLikeStateChangeFallback` — a 68-line heuristic (lines ~348-415) that guesses state-change potential from move params. This is the most visible F15 violation in the kernel. With tickets 002 and 003 converting throws to result types, this catch site and the heuristic can be eliminated. The `apply-move.ts:529` catch site must also be migrated.

## Assumption Reassessment (2026-04-07)

1. `doesCompletedProbeMoveChangeGameplayState` exists at lines ~470-627 of `free-operation-viability.ts` — confirmed.
2. The try/catch + heuristic fallback is at lines ~537-610 — confirmed.
3. `hasTransportLikeStateChangeFallback` is at lines ~348-415 (68 lines), is not exported, and has exactly 1 call site (line ~589) — confirmed.
4. `apply-move.ts` catch site is at line ~529 (not 1908 as originally stated in the spec draft) — confirmed. Category: (c) bug detection/re-throw (converts to `MOVE_PARAMS_INVALID` illegal move error).
5. `free-operation-viability.ts` catch site category: (a) probe/speculative execution — confirmed.

## Architecture Check

1. Deleting the heuristic resolves the F15 violation — the workaround is replaced by actual evaluation results.
2. Conservative `return true` on validation failure matches the heuristic's intent (keep the move viable when resolution is inconclusive) without the heuristic's complexity.
3. `apply-move.ts` migration preserves the `MOVE_PARAMS_INVALID` error semantics — validation failure in normal execution is still an illegal move.
4. No game-specific logic — both callers are generic kernel infrastructure.
5. No backwards-compatibility shims — heuristic is fully deleted, not deprecated.

## What to Change

### 1. Update doesCompletedProbeMoveChangeGameplayState

Replace the try/catch + heuristic fallback with result pattern-matching:

```typescript
// BEFORE (~line 588)
} catch (error) {
  if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
    return hasTransportLikeStateChangeFallback(def, state, move);
  }
  throw error;
}

// AFTER
const result = /* effect execution returning result */;
if (result.outcome === 'error' && result.error.code === 'CHOICE_RUNTIME_VALIDATION_FAILED') {
  // Choice couldn't be resolved in probe context — conservatively assume
  // the move could change state, keeping it viable.
  return true;
}
// use result.value for state comparison
```

### 2. Delete hasTransportLikeStateChangeFallback

Remove the `hasTransportLikeStateChangeFallback` function (lines ~348-415). It is internal to `free-operation-viability.ts` with zero external consumers.

### 3. Update apply-move.ts catch site

Replace the catch at line ~529:

```typescript
// BEFORE
} catch (err) {
  if (isEffectRuntimeReason(err, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID, {
      detail: err.message,
    });
  }
  // ...
}

// AFTER
const result = /* effect execution returning result */;
if (result.outcome === 'error' && result.error.code === 'CHOICE_RUNTIME_VALIDATION_FAILED') {
  throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID, {
    detail: result.error.message,
  });
}
```

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify) — delete heuristic + update probe path
- `packages/engine/src/kernel/apply-move.ts` (modify) — update catch site

## Out of Scope

- Changes to `effects-choice.ts` throw sites — already done in ticket 002
- Changes to `choose-n-option-resolution.ts` — already done in ticket 003
- Other throw sites outside the choice validation pipeline (`ILLEGAL_MOVE`, `BUDGET_EXHAUSTED`)
- Performance optimization of the probe path

## Acceptance Criteria

### Tests That Must Pass

1. `grep -r "hasTransportLikeStateChangeFallback" packages/engine/src/` returns zero hits (heuristic fully deleted).
2. `grep -rn "CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/free-operation-viability.ts` — zero catch sites remain.
3. `grep -rn "CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/apply-move.ts` — zero catch sites remain (pattern-match replaces catch).
4. FITL canary seeds pass — viability probe path exercised extensively.
5. Replay/determinism tests confirm F8.
6. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. Zero catch blocks for `CHOICE_RUNTIME_VALIDATION_FAILED` remain in the probe subsystem (`free-operation-viability.ts`, `apply-move.ts`).
2. `hasTransportLikeStateChangeFallback` does not exist anywhere in non-archive code.
3. F15: No workaround heuristics remain for choice validation in the probe path.
4. F8 Determinism: `return true` is deterministic (same as the heuristic was, but simpler).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-viability.test.ts` (modify) — verify that probe returns `true` (move viable) when choice validation fails, replacing the heuristic-based determination.
2. `packages/engine/test/e2e/` — FITL canary seeds exercise the viability probe path.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "viability"`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck && pnpm turbo test`
