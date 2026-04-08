# 120CHOVALRES-003: Migrate choose-n-option-resolution.ts catch sites to result pattern-matching

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel choice option resolution
**Deps**: `archive/tickets/120CHOVALRES-002.md`

## Problem

`choose-n-option-resolution.ts` has 2 catch sites for `CHOICE_RUNTIME_VALIDATION_FAILED` (lines ~344 and ~502). These currently use try/catch with `isEffectRuntimeReason()` to detect validation failures during singleton probe caching and stochastic cardinality validation. With ticket 002 converting throws to result types, these catch sites must be migrated to result pattern-matching.

## Assumption Reassessment (2026-04-07)

1. Catch site at line ~344 (stochastic cardinality validation): catches `CHOICE_RUNTIME_VALIDATION_FAILED` and marks option as `{ resolution: 'provisional' }` — confirmed. Category: (a) probe/speculative execution.
2. Catch site at line ~502 (singleton probe caching): catches `CHOICE_RUNTIME_VALIDATION_FAILED` and returns `{ outcome: { kind: 'unresolved' }, cached: false }` — confirmed. Category: (a) probe/speculative execution.
3. Both sites use `isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)` for type-safe matching — confirmed.
4. `choose-n-option-resolution.ts` imports from `effects-choice.ts` indirectly via the effect execution pipeline — confirmed.

## Architecture Check

1. Replacing try/catch with result pattern-matching eliminates throw-for-control-flow (F15).
2. Behavior is preserved exactly: validation failure → same `'provisional'`/`'unresolved'` outcome.
3. No game-specific logic — these are generic choice resolution utilities.
4. No backwards-compatibility shims — both sites are fully migrated.

## What to Change

### 1. Migrate stochastic cardinality validation catch site (~line 344)

```typescript
// BEFORE
try {
  resolved = /* choice resolution call */;
} catch (error: unknown) {
  if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
    resultByKey.set(key, { legality: 'unknown', illegalReason: null, resolution: 'provisional' });
    continue;
  }
  throw error;
}

// AFTER
const resolved = /* choice resolution call returning result */;
if (resolved.outcome === 'error') {
  resultByKey.set(key, { legality: 'unknown', illegalReason: null, resolution: 'provisional' });
  continue;
}
// use resolved.value
```

### 2. Migrate singleton probe caching catch site (~line 502)

```typescript
// BEFORE
try {
  resolved = /* choice resolution call */;
} catch (error: unknown) {
  if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
    const outcome: SingletonProbeOutcome = { kind: 'unresolved' };
    probeCache.set(cacheKey, outcome);
    return { outcome, cached: false };
  }
  throw error;
}

// AFTER
const resolved = /* choice resolution call returning result */;
if (resolved.outcome === 'error') {
  const outcome: SingletonProbeOutcome = { kind: 'unresolved' };
  probeCache.set(cacheKey, outcome);
  return { outcome, cached: false };
}
// use resolved.value
```

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify) — 2 catch site migrations

## Out of Scope

- Changes to `effects-choice.ts` throw sites — already done in ticket 002
- Changes to `free-operation-viability.ts` or `apply-move.ts` — that is ticket 004
- Changes to the `ChoiceValidationResult` type definition

## Acceptance Criteria

### Tests That Must Pass

1. `grep -rn "CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/choose-n-option-resolution.ts` returns zero hits (no catch sites remain for this error).
2. Stochastic cardinality validation: when choice resolution fails, option is marked `'provisional'` — existing tests confirm.
3. Singleton probe caching: when choice resolution fails, outcome is `{ kind: 'unresolved' }` — existing tests confirm.
4. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. Zero try/catch blocks for `CHOICE_RUNTIME_VALIDATION_FAILED` remain in `choose-n-option-resolution.ts`.
2. Behavior on validation failure is identical to pre-migration (same outcome values).
3. F8 Determinism preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` (modify) — verify that validation failures during singleton probing and stochastic cardinality produce the correct `'provisional'`/`'unresolved'` outcomes.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "choose-n"`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Completed: 2026-04-08
- What changed:
  - Removed the two `CHOICE_RUNTIME_VALIDATION_FAILED` catch sites from `packages/engine/src/kernel/choose-n-option-resolution.ts` and replaced them with result pattern-matching that preserves the same `provisional` and cached-`unresolved` behavior.
  - Added a narrow adapter in `packages/engine/src/kernel/legal-choices.ts` that converts probe-time `CHOICE_RUNTIME_VALIDATION_FAILED` throws into `ChoiceValidationResult` before they reach the choose-n resolver, keeping the migration scoped to this ticket while preserving `004`'s broader caller work.
  - Added direct resolver-seam regression coverage in `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` for singleton and witness-probe validation failures.
- Deviations from original plan:
  - Live code after ticket `002` still rethrew `choiceValidationError` at the dispatcher boundary, so the resolver did not yet receive result-returning probe callbacks directly. The owned fix was a narrow `legal-choices.ts` adapter rather than a broader execution-path migration.
  - The ticket's `Files to Touch` list named only `choose-n-option-resolution.ts`, but adjacent `legal-choices.ts` changes were required to satisfy the live boundary without absorbing `004`.
  - The ticket's example `pnpm -F @ludoforge/engine test -- --test-name-pattern "choose-n"` command traversed the full engine package suite under the current Node test-runner setup rather than only the named slice.
- Verification:
  - `grep -rn "CHOICE_RUNTIME_VALIDATION_FAILED" packages/engine/src/kernel/choose-n-option-resolution.ts`
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/unit/kernel/choose-n-option-resolution.test.js`
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "choose-n"` (passed; exercised the full engine package suite, 733 passing tests)
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
