# 119EVARESRET-001: Define eval result types and unwrap helpers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new kernel types module `eval-result.ts`, export addition to `eval-query.ts`
**Deps**: `archive/specs/118-probe-boundary-catch-to-result-migration.md`

## Problem

`evalCondition` and `evalQuery` communicate errors by throwing, forcing probe-context callers to use try-catch for expected failures. Before changing their signatures, the result types, factory function, and unwrap helpers must exist so consumer tickets (002, 003, 004) can import them.

## Assumption Reassessment (2026-04-07)

1. `packages/engine/src/kernel/eval-result.ts` does NOT exist yet — confirmed via glob.
2. `QueryResult` in `eval-query.ts` is a local type (line 39), not exported — confirmed via grep.
3. `EvalError` class exists at `eval-error.ts:107` with `code`, `message`, `context` fields — reused, not redefined.
4. `EvalErrorCode` union exists at `eval-error.ts:20` — reused, not redefined.
5. `ProbeResult<T>` uses `outcome` discriminator — confirmed in `probe-result.ts`. New result types follow same convention.
6. `KernelRuntimeError` exists in `runtime-error.ts` — used by `unwrapEval*` for throw-on-error.

## Architecture Check

1. Purely additive — no signatures change, no existing code breaks. This is a foundation-laying ticket.
2. All types are in the generic `kernel/` module. No game-specific identifiers or payloads.
3. No backwards-compatibility shims — result types are the single canonical representation.
4. Reuses existing `EvalError<C>` class (F15 — no parallel error types). Reuses existing `EvalErrorCode` union (F17 — typed error discrimination preserved).

## What to Change

### 1. Export `QueryResult` from `eval-query.ts`

Change the local type declaration at line 39 from:

```typescript
type QueryResult = Token | AssetRow | number | string | boolean | PlayerId | ZoneId;
```

to:

```typescript
export type QueryResult = Token | AssetRow | number | string | boolean | PlayerId | ZoneId;
```

### 2. Create `eval-result.ts`

New file: `packages/engine/src/kernel/eval-result.ts`

Contents:
- `EvalConditionResult` discriminated union (`outcome: 'success' | 'error'`)
- `EvalQueryResult` discriminated union (`outcome: 'success' | 'error'`)
- `evalSuccess<T>()` factory function
- `unwrapEvalCondition()` — returns `boolean` on success, throws `KernelRuntimeError` on error
- `unwrapEvalQuery()` — returns `readonly QueryResult[]` on success, throws `KernelRuntimeError` on error

All types and functions as specified in Spec 119 Section 1.

### 3. Export from kernel barrel (if applicable)

Check `packages/engine/src/kernel/index.ts` — if eval-related types are re-exported, add exports for the new result types and unwrap helpers.

## Files to Touch

- `packages/engine/src/kernel/eval-result.ts` (new)
- `packages/engine/src/kernel/eval-query.ts` (modify — export `QueryResult`)
- `packages/engine/src/kernel/index.ts` (modify — re-export if pattern matches)

## Out of Scope

- Changing `evalCondition` or `evalQuery` signatures — that is tickets 002 and 003
- Migrating any call sites — that is tickets 002, 003, and 004
- Modifying `eval-error.ts` — existing error infrastructure is reused as-is

## Acceptance Criteria

### Tests That Must Pass

1. `evalSuccess(true)` returns `{ outcome: 'success', value: true }`
2. `evalSuccess([])` returns `{ outcome: 'success', value: [] }`
3. `unwrapEvalCondition({ outcome: 'success', value: false })` returns `false`
4. `unwrapEvalCondition({ outcome: 'error', error: ... })` throws `KernelRuntimeError`
5. `unwrapEvalQuery({ outcome: 'success', value: [...] })` returns the array
6. `unwrapEvalQuery({ outcome: 'error', error: ... })` throws `KernelRuntimeError`
7. Existing suite: `pnpm turbo test`

### Invariants

1. Result types are readonly — no mutable fields
2. `unwrapEval*` throws on error outcome, never returns undefined or null
3. `QueryResult` export does not break any existing imports (additive change)
4. `outcome` discriminator uses string literals, consistent with `ProbeResult<T>`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-result.test.ts` — unit tests for `evalSuccess`, `unwrapEvalCondition`, `unwrapEvalQuery` with success and error cases

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern eval-result`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

**Completed**: 2026-04-07

**What changed**:
- Created `packages/engine/src/kernel/eval-result.ts` with `EvalConditionResult`, `EvalQueryResult`, `evalSuccess()`, `unwrapEvalCondition()`, `unwrapEvalQuery()`
- Exported `QueryResult` from `packages/engine/src/kernel/eval-query.ts`
- Added barrel re-export in `packages/engine/src/kernel/index.ts`
- Created `packages/engine/test/unit/eval-result.test.ts` with 11 unit tests

**Deviations**: None — implemented as specified.

**Verification**: Build pass, typecheck pass (3/3 packages), lint pass (2/2 packages), 0 test failures across full suite, all 11 new eval-result tests pass.
