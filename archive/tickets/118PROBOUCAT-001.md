# 118PROBOUCAT-001: Add `probeWith` helper to `probe-result.ts`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel probe-result module
**Deps**: `archive/specs/116-probe-result-behavioral-contract.md`, `archive/specs/117-zone-filter-evaluation-result-type.md`

## Problem

The 7 Group A catch blocks in the probe subsystem all follow an identical pattern: try a function, classify the error with a `(error: unknown) => ProbeResult<never> | null` classifier, return the classified result or re-throw. There is no shared abstraction for this pattern — each site re-implements it inline.

This ticket adds a generic `probeWith<T>` helper to `probe-result.ts` that encapsulates the try-catch-classify pattern, enabling mechanical one-liner replacements in subsequent tickets.

## Assumption Reassessment (2026-04-07)

1. `probe-result.ts` exists at `packages/engine/src/kernel/probe-result.ts` — confirmed. Currently exports `ProbeResult<T>`, `ProbeOutcome`, `ProbeResultPolicy`, `resolveProbeResult`, and related types. No `probeWith` exists yet.
2. The classifier signature `(error: unknown) => ProbeResult<never> | null` matches `classifyDiscoveryProbeError` and `classifyChoiceProbeError` (single-param). `classifyMissingBindingProbeError` takes 2 params — callers will curry the context (addressed in 118PROBOUCAT-003).
3. `probe-result.ts` is re-exported through `packages/engine/src/kernel/index.ts` — new export will be available to all kernel consumers.

## Architecture Check

1. `probeWith` is a pure generic function — no game-specific logic. It captures the try-catch-classify pattern exactly as it exists today, just centralized.
2. Preserves game-agnostic boundaries — the helper operates on generic `ProbeResult<T>` and takes a generic classifier function. No knowledge of what errors mean or what games produce them.
3. No backwards-compatibility shims — this is a pure addition. Existing catch blocks remain unchanged until migrated in subsequent tickets.

## What to Change

### 1. Add `probeWith` to `probe-result.ts`

Add a new exported function:

```typescript
export const probeWith = <T>(
  fn: () => T,
  classifier: (error: unknown) => ProbeResult<never> | null,
): ProbeResult<T> => {
  try {
    return { outcome: 'legal', value: fn() };
  } catch (error: unknown) {
    const classified = classifier(error);
    if (classified !== null) return classified;
    throw error;
  }
};
```

### 2. Export from `index.ts`

Add `probeWith` to the re-export list in `packages/engine/src/kernel/index.ts` if `probe-result.ts` is re-exported via wildcard. If individual named exports are used, add `probeWith` explicitly.

### 3. Unit tests for `probeWith`

Add a test file or test block covering:
- **Success path**: `fn` returns a value → returns `{ outcome: 'legal', value }`.
- **Classified error path**: `fn` throws, classifier returns a `ProbeResult` → returns that result.
- **Unclassified error path**: `fn` throws, classifier returns `null` → re-throws the original error.
- **Type narrowing**: The returned `ProbeResult<T>` has the correct generic type from `fn`.

## Files to Touch

- `packages/engine/src/kernel/probe-result.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify — if explicit re-exports needed)
- `packages/engine/test/kernel/probe-result.test.ts` (new or modify — add `probeWith` tests)

## Out of Scope

- Migrating any existing catch blocks — that is 118PROBOUCAT-002 and 118PROBOUCAT-003
- Changing classifier function signatures
- Group B, C, or D migration work

## Acceptance Criteria

### Tests That Must Pass

1. `probeWith` returns `{ outcome: 'legal', value }` when the wrapped function succeeds
2. `probeWith` returns the classifier's `ProbeResult` when the wrapped function throws a classified error
3. `probeWith` re-throws when the classifier returns `null`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `probeWith` is a pure function — no side effects, no state mutation
2. Unclassified errors propagate unchanged — no wrapping, no swallowing
3. The `ProbeResult<T>` generic parameter is inferred from the wrapped function's return type

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/probe-result.test.ts` — unit tests for `probeWith` covering success, classified error, and unclassified error paths

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern probeWith`
2. `pnpm turbo test --force`

## Outcome

- **Completion date**: 2026-04-07
- **What changed**:
  - `packages/engine/src/kernel/probe-result.ts` — added `probeWith<T>(fn, classifier)` helper (12 lines + JSDoc)
  - `packages/engine/src/kernel/index.ts` — added `probeWith` to value re-export line
  - `packages/engine/test/unit/probe-with.test.ts` — new file with 5 unit tests (success, classified inconclusive, classified illegal, unclassified re-throw, generic type preservation)
- **Deviations**: None. Implemented exactly as specified.
- **Verification**: Build clean, typecheck clean, 735/735 engine tests pass (0 fail)
