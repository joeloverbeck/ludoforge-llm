# 117ZONFILEVA-003: Migrate caller catch blocks to pattern-match on result status

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation-discovery-analysis, eval-query
**Deps**: `tickets/117ZONFILEVA-002.md`

## Problem

After ticket 002 converts `evaluateZoneFilterForMove()` to return `ZoneFilterEvaluationResult`, 3 external catch blocks still wrap calls to this function (or functions that transitively call it). These catch blocks classify errors and decide whether to defer — logic that is now handled by the result type. They must be replaced with pattern-matching on `status`.

## Assumption Reassessment (2026-04-07)

1. `free-operation-discovery-analysis.ts` catch block at line 101 wraps a call to `evaluateZoneFilterForMove()` at line 93 — confirmed. Catches `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` + `MISSING_BINDING`, pushes to `unresolvedZoneFilterGrants`.
2. `free-operation-discovery-analysis.ts` catch block at line 397 wraps a call to `doesGrantPotentiallyAuthorizeMove()` at line 396 — confirmed. Catches `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` + `MISSING_BINDING`/`MISSING_VAR`, returns `true`.
3. `eval-query.ts` catch block at line 474 wraps a call involving `evaluateFreeOperationZoneFilterForZone()` — confirmed. Calls `shouldDeferFreeOperationZoneFilterFailure()` and either defers or throws wrapped error.
4. After ticket 002, `evaluateZoneFilterForMove()` returns a result type, so callers at sites 1 and 3 no longer receive thrown errors from that function. Site 2 wraps `doesGrantPotentiallyAuthorizeMove()` which after ticket 002 handles the result internally, so the catch is also dead code — but the catch also handles errors from `doesGrantSatisfySequenceContext()` calls within `doesGrantPotentiallyAuthorizeMove()`, so the migration must be careful to preserve error handling for non-zone-filter errors.

## Architecture Check

1. Replacing catch blocks with pattern-matching eliminates the error classification logic at each call site — the result type carries the classification.
2. The migration preserves identical behavior: `deferred` → same recovery as the old `MISSING_BINDING` catch, `failed` → same re-throw, `resolved` → use `matched`.
3. No backwards-compatibility shims — catch blocks are replaced, not supplemented.

## What to Change

### 1. Migrate `free-operation-discovery-analysis.ts` catch block at line 101

Replace the try-catch wrapping `evaluateZoneFilterForMove()` with:
```typescript
const result = evaluateZoneFilterForMove(...);
if (result.status === 'deferred') { unresolvedZoneFilterGrants.push(grant); return false; }
if (result.status === 'failed') { throw result.error; }
// use result.matched
```

### 2. Migrate `free-operation-discovery-analysis.ts` catch block at line 397

This catch wraps `doesGrantPotentiallyAuthorizeMove()`. After ticket 002, `doesGrantPotentiallyAuthorizeMove()` handles the zone-filter result internally (treating `deferred` as `true`). The catch block at line 397 should no longer receive `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` errors from the zone-filter path. However, verify that no other error type caught here needs preservation. If the catch is purely for zone-filter errors, remove it entirely. If it also handles other errors, narrow the catch to those.

### 3. Migrate `eval-query.ts` catch block at line 474

Replace the try-catch with pattern-matching on the result from `evaluateFreeOperationZoneFilterForZone()`. Note: `evaluateFreeOperationZoneFilterForZone()` in `eval-query.ts` is a local helper that calls `evaluateFreeOperationZoneFilterProbe()`. After ticket 002, the probe returns a result type. The local helper must also return `ZoneFilterEvaluationResult` (or the pattern-match happens at the call site).

```typescript
const result = evaluateZoneFilterForZone(...);
if (result.status === 'deferred') return true;
if (result.status === 'failed') throw result.error;
return result.matched;
```

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify — replace 2 catch blocks with status pattern-match)
- `packages/engine/src/kernel/eval-query.ts` (modify — replace 1 catch block with status pattern-match; update local `evaluateFreeOperationZoneFilterForZone` helper return type)

## Out of Scope

- The internal catch blocks in `evaluateZoneFilterForMove()` (already removed in ticket 002)
- Dead catch blocks in `legal-moves.ts` and `apply-move.ts` (ticket 004)
- Removing `freeOperationZoneFilterEvaluationError()` (ticket 004)
- Test assertion migration (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. `free-operation-discovery-analysis.ts` line 101 site: grants with unresolvable zone filters are pushed to `unresolvedZoneFilterGrants` (same as before).
2. `free-operation-discovery-analysis.ts` line 397 site: grants with missing bindings/vars return `true` (same as before).
3. `eval-query.ts` line 474 site: deferred zone filters return `true` (same as before).
4. Existing suite: `pnpm turbo test --force` — all existing tests pass (behavioral identity).

### Invariants

1. No catch blocks for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` remain in `free-operation-discovery-analysis.ts` or `eval-query.ts`.
2. All callers of `evaluateZoneFilterForMove()` and `evaluateFreeOperationZoneFilterProbe()` use pattern-matching on `status`, not try-catch.

## Test Plan

### New/Modified Tests

1. No new test files — behavioral identity verified by existing test suite.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`
