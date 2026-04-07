# 117ZONFILEVA-002: Convert `evaluateZoneFilterForMove()` and probe to return result type

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation-grant-authorization, free-operation-zone-filter-probe
**Deps**: `archive/tickets/117ZONFILEVA-001.md`

## Problem

`evaluateZoneFilterForMove()` currently returns `boolean` and throws `freeOperationZoneFilterEvaluationError()` on non-deferrable errors. Its 2 internal catch blocks (lines 192, 216) classify errors and either defer or re-throw. `evaluateFreeOperationZoneFilterProbe()` returns `boolean` and throws on non-rebindable bindings. Both functions need to return `ZoneFilterEvaluationResult` so callers can pattern-match instead of catch.

Additionally, `doesGrantAuthorizeMove()` (line 246) and `doesGrantPotentiallyAuthorizeMove()` (line 262) call `evaluateZoneFilterForMove()` in boolean expressions and must be updated to handle the result type.

## Assumption Reassessment (2026-04-07)

1. `evaluateZoneFilterForMove()` in `free-operation-grant-authorization.ts` at lines 144-232 returns `boolean` — confirmed.
2. Internal catch blocks at lines 192 and 216 call `shouldDeferZoneFilterFailure()` — confirmed.
3. `evaluateFreeOperationZoneFilterProbe()` in `free-operation-zone-filter-probe.ts` at lines 28-64 returns `boolean` with internal retry loop — confirmed.
4. `doesGrantAuthorizeMove()` at line 240 calls `evaluateZoneFilterForMove()` at line 246 in a boolean `||` chain — confirmed.
5. `doesGrantPotentiallyAuthorizeMove()` at line 249 calls `evaluateZoneFilterForMove()` at line 262 in a boolean `||` chain — confirmed.
6. `shouldDeferFreeOperationZoneFilterFailure()` in `missing-binding-policy.ts` at lines 93-112 — confirmed. It becomes an internal detail of `evaluateZoneFilterForMove()`.

## Architecture Check

1. Converting the return type from `boolean` to `ZoneFilterEvaluationResult` eliminates 2 internal catch blocks and moves the deferral classification into the function's return value — cleaner than the current throw-catch-reclassify pattern.
2. `shouldDeferFreeOperationZoneFilterFailure()` remains the single policy source but is called internally, not by each consumer — preserves the centralized policy without requiring consumers to know about it.
3. No backwards-compatibility shims — all callers of `evaluateZoneFilterForMove()` are updated in this ticket or subsequent tickets.

## What to Change

### 1. Convert `evaluateZoneFilterForMove()` return type

In `free-operation-grant-authorization.ts`, change the function signature from `boolean` to `ZoneFilterEvaluationResult`. Replace the 2 internal try-catch blocks (lines 192, 216) with result-type returns:
- On successful evaluation: `{ status: 'resolved', matched: <result> }`
- When `shouldDeferZoneFilterFailure()` returns `true`: `{ status: 'deferred', reason: 'missingBinding' }` (or `'missingVar'` based on the error)
- On non-deferrable error: `{ status: 'failed', error: <cause> }`

The deferral policy function `shouldDeferFreeOperationZoneFilterFailure()` is called inside a try-catch that wraps the raw eval call. The catch converts to a result instead of re-throwing.

### 2. Convert `evaluateFreeOperationZoneFilterProbe()` return type

In `free-operation-zone-filter-probe.ts`, change the external return type to `ZoneFilterEvaluationResult`. The internal retry loop (while-true with catch-and-rebind) CAN remain as a try-catch since it is bounded and self-contained. The function returns a result type instead of throwing on non-rebindable bindings.

### 3. Update `doesGrantAuthorizeMove()` and `doesGrantPotentiallyAuthorizeMove()`

Both functions use `evaluateZoneFilterForMove()` in boolean `||` chains. Extract the result to a local variable and pattern-match:
- `deferred` → treat as `true` (preserves current behavior where thrown errors bubbled up and were caught as deferral)
- `failed` → treat as `true` (same reasoning)
- `resolved` → use `result.matched`

This preserves the semantic that when evaluation can't determine zone-filter match, the grant is treated as matching (conservative/safe).

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify — convert `evaluateZoneFilterForMove()` return type, remove 2 internal catch blocks, update `doesGrantAuthorizeMove()` and `doesGrantPotentiallyAuthorizeMove()`)
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify — convert external return type)

## Out of Scope

- Migrating external caller catch blocks in `free-operation-discovery-analysis.ts` and `eval-query.ts` (ticket 003)
- Removing dead catch blocks in `legal-moves.ts` and `apply-move.ts` (ticket 004)
- Removing `freeOperationZoneFilterEvaluationError()` (ticket 004)
- Test assertion migration (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. `evaluateZoneFilterForMove()` returns `{ status: 'resolved', matched: true/false }` on successful evaluation.
2. `evaluateZoneFilterForMove()` returns `{ status: 'deferred', reason: 'missingBinding' }` when `shouldDeferFreeOperationZoneFilterFailure()` would have deferred.
3. `evaluateZoneFilterForMove()` returns `{ status: 'failed', error }` on non-deferrable errors.
4. `doesGrantAuthorizeMove()` treats `deferred` and `failed` as `true` (grant matches).
5. Existing suite: `pnpm turbo test --force` — all existing tests must pass (behavioral identity).

### Invariants

1. `evaluateZoneFilterForMove()` never throws for deferrable errors — all deferral decisions are expressed through the return type.
2. The internal retry loop in `evaluateFreeOperationZoneFilterProbe()` is the ONLY place where zone-filter eval errors are caught within these two functions.
3. `shouldDeferFreeOperationZoneFilterFailure()` remains the single source of truth for deferral decisions, called internally by `evaluateZoneFilterForMove()`.

## Test Plan

### New/Modified Tests

1. No new test files — behavioral identity verified by existing test suite passing with zero diff.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

## Outcome

**Completed**: 2026-04-07

**What changed**:
- `free-operation-grant-authorization.ts` — `evaluateZoneFilterForMove()` returns `ZoneFilterEvaluationResult` instead of `boolean`. Internal catch blocks replaced with `classifyError` helper. New `unwrapZoneFilterResult` helper for `doesGrantAuthorizeMove()` and `doesGrantPotentiallyAuthorizeMove()`.
- `free-operation-zone-filter-probe.ts` — `evaluateFreeOperationZoneFilterProbe()` returns `ZoneFilterEvaluationResult`. Internal retry loop preserved. Non-retryable errors returned as `failed`.
- `free-operation-discovery-analysis.ts` — Catch block at line 93 replaced with result pattern-match (absorbed from ticket 003).
- `eval-query.ts` — `evaluateFreeOperationZoneFilterForZone()` returns `ZoneFilterEvaluationResult`. Catch block replaced with result pattern-match (absorbed from ticket 003).

**Deviations**: Absorbed ticket 003's scope (migrate caller catch blocks) due to Foundation 14 atomicity — changing the return type required all callers to be migrated in the same change. Ticket 003 marked COMPLETED as absorbed. Ticket 004 deps updated to depend on 002 directly.

**Verification**: `pnpm turbo build` clean, `pnpm turbo typecheck` clean, `pnpm turbo test --force` — 5613/5613 pass (0 failures).
