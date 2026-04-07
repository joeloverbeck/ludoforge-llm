# Spec 117 — Zone Filter Evaluation Result Type

**Status**: DRAFT
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation subsystem refactoring
**Deps**: Spec 115 (Grant Lifecycle Protocol) must be complete. Spec 116 is independent.

## Problem

Free-operation zone-filter evaluation uses a throw-and-catch pattern to handle bindings that cannot be resolved during discovery time. Six catch blocks across 4 files independently catch `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` or raw `EvalError<'MISSING_BINDING'>` errors, then decide whether to defer, retry, or re-throw. The centralized policy `shouldDeferFreeOperationZoneFilterFailure()` exists but only controls the *decision* — each call site independently implements the *recovery flow* (return `true`, push to an array, retry with rebinding, etc.).

**Evidence** (from missing-abstractions report, 2026-04-07):

| File | Line | Catch pattern | Recovery |
|------|------|---------------|----------|
| `free-operation-discovery-analysis.ts` | 101 | `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` + `MISSING_BINDING` | Push to `unresolvedZoneFilterGrants` array |
| `free-operation-discovery-analysis.ts` | 397 | `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` + `MISSING_BINDING`/`MISSING_VAR` | Return `true` (assume grant applies) |
| `free-operation-grant-authorization.ts` | 192 | Raw eval error | `shouldDeferZoneFilterFailure()` -> return `true` |
| `free-operation-grant-authorization.ts` | 216 | Raw eval error | `shouldDeferZoneFilterFailure()` -> return `true` |
| `free-operation-zone-filter-probe.ts` | 40 | `MISSING_BINDING` | Rebind alias, retry loop |
| `eval-query.ts` | 476 | Raw eval error | `shouldDeferFreeOperationZoneFilterFailure()` -> return `true` |

**Why this matters**: The throw-and-catch pattern creates a double error path — errors are thrown, caught, classified, and then either re-thrown (wrapped in a different error type) or swallowed. This makes the control flow hard to trace and easy to break when adding new zone-filter evaluation paths. A result type eliminates the exception-based control flow entirely.

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| SS5 One Rules Protocol | Satisfied (no sim compensations) | Unchanged |
| SS8 Determinism | Satisfied (deferral is deterministic) | Unchanged (same behavior, result type instead of exception) |
| SS12 Compiler-Kernel Boundary | Zone filter expressions validated at compile time; runtime catches unexpected MISSING_BINDING | Unchanged — runtime still handles discovery-time binding gaps |
| SS15 Architectural Completeness | Strained: 6 catch blocks implement the same "can't evaluate yet, defer" pattern | Single result type carries the deferral decision; no catch blocks needed |

### Game-Agnosticism

Zone filter evaluation is game-agnostic. Zone filters are generic `ConditionAST` nodes evaluated against game state. The deferral policy depends on the evaluation surface (`legalChoices` vs `turnFlowEligibility`), not on game-specific logic.

## What to Change

### 1. Define `ZoneFilterEvaluationResult` in a new module

```typescript
// packages/engine/src/kernel/zone-filter-evaluation-result.ts

export type ZoneFilterEvaluationResult =
  | { readonly status: 'resolved'; readonly matched: boolean }
  | { readonly status: 'deferred'; readonly reason: ZoneFilterDeferralReason }
  | { readonly status: 'failed'; readonly error: unknown };

export type ZoneFilterDeferralReason =
  | 'missingBinding'
  | 'missingVar';
```

### 2. Convert `evaluateZoneFilterForMove()` to return `ZoneFilterEvaluationResult`

In `free-operation-grant-authorization.ts`, the function `evaluateZoneFilterForMove()` currently throws `freeOperationZoneFilterEvaluationError()` on non-deferrable errors and returns `boolean` on success or deferral. Convert it to:

```typescript
export const evaluateZoneFilterForMove = (
  ...params
): ZoneFilterEvaluationResult => {
  // Instead of try-catch-rethrow:
  // - On success: return { status: 'resolved', matched: true/false }
  // - On deferrable error: return { status: 'deferred', reason: 'missingBinding' }
  // - On non-deferrable error: return { status: 'failed', error }
};
```

The deferral decision (`shouldDeferFreeOperationZoneFilterFailure()`) moves INTO this function. Callers no longer need to catch and classify — they pattern-match on `status`.

### 3. Convert `evaluateFreeOperationZoneFilterProbe()` to return a result

In `free-operation-zone-filter-probe.ts`, the retry-on-MISSING_BINDING loop currently catches and retries internally. This is an internal implementation detail and CAN remain as a try-catch within the probe function, since the retry is bounded and self-contained. However, the function's external return type should become `ZoneFilterEvaluationResult` instead of throwing on non-rebindable bindings.

### 4. Update callers to pattern-match on `status`

Replace each catch block with a pattern match:

**`free-operation-discovery-analysis.ts:101`**:
```typescript
// Before:
try { ... } catch (e) { if (isMissingBinding(e)) { unresolvedGrants.push(grant); } else throw e; }

// After:
const result = evaluateZoneFilterForMove(...);
if (result.status === 'deferred') { unresolvedGrants.push(grant); }
else if (result.status === 'failed') { throw result.error; }
else { /* use result.matched */ }
```

**`free-operation-discovery-analysis.ts:397`**:
```typescript
// Before:
try { ... } catch (e) { if (isMissingBindingOrVar(e)) return true; throw e; }

// After:
const result = evaluateZoneFilterForMove(...);
if (result.status === 'deferred') return true;
if (result.status === 'failed') throw result.error;
return result.matched;
```

**`free-operation-grant-authorization.ts:192, 216`**: Internal to `evaluateZoneFilterForMove()` — these catch blocks disappear because the function itself now returns a result type.

**`eval-query.ts:476`**:
```typescript
// Before:
try { ... } catch (e) { if (shouldDefer(surface, e)) return true; throw wrapped(e); }

// After:
const result = evaluateZoneFilterForZone(...);
if (result.status === 'deferred') return true;
if (result.status === 'failed') throw result.error;
return result.matched;
```

### 5. Remove `freeOperationZoneFilterEvaluationError()` wrapper

The `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` error code and its factory function `freeOperationZoneFilterEvaluationError()` in `turn-flow-error.ts` can be removed. The result type replaces the need to wrap eval errors in a turn-flow error for the sole purpose of catching them one stack frame up.

**Caveat**: Verify that no other code path depends on `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` before removing. If it is referenced in diagnostic rendering or error messages, keep the code but remove the throw-and-catch usage.

### 6. Preserve the deferral policy as-is

`shouldDeferFreeOperationZoneFilterFailure()` in `missing-binding-policy.ts` is NOT removed or changed. It becomes an internal implementation detail of `evaluateZoneFilterForMove()`, called to classify raw eval errors into `deferred` vs `failed` status. Its logic and surface-based behavior are unchanged.

## Files to Touch

**New**:
- `packages/engine/src/kernel/zone-filter-evaluation-result.ts` — result type definition
- `packages/engine/test/unit/kernel/zone-filter-evaluation-result.test.ts` — unit tests

**Modify**:
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` — convert `evaluateZoneFilterForMove()` return type; remove internal catch blocks
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` — convert external return type to `ZoneFilterEvaluationResult`; internal retry loop may remain as try-catch
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` — replace 2 catch blocks with status pattern-match
- `packages/engine/src/kernel/eval-query.ts` — replace 1 catch block with status pattern-match
- `packages/engine/src/kernel/index.ts` — re-export `ZoneFilterEvaluationResult`, `ZoneFilterDeferralReason`
- `packages/engine/src/kernel/turn-flow-error.ts` — remove or deprecate `freeOperationZoneFilterEvaluationError()` and `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` (if safe)

**Possibly modify** (verify references first):
- `packages/engine/src/kernel/free-operation-viability.ts` — if it catches `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` at line 587

## Out of Scope

- Changing the deferral policy logic (`shouldDeferFreeOperationZoneFilterFailure()`)
- Modifying zone-filter compilation in `cnl/`
- Changing the `FreeOperationZoneFilterSurface` type
- The `ProbeResult` pattern (addressed separately in Spec 116)
- Grant lifecycle transitions (addressed in Spec 115)
- Any changes to `ConditionAST` or `evalCondition()`

## Acceptance Criteria

### Tests

1. **Result type unit tests**: `ZoneFilterEvaluationResult` construction for each status (`resolved`, `deferred`, `failed`).
2. **Behavioral identity**: Every migrated call site produces identical results before and after. Verified by full test suite passing with zero diff.
3. **No catch blocks for zone filter errors**: Grep for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` in catch blocks — should be zero (outside diagnostic rendering).
4. **Full test suite**: All existing tests pass with zero failures.
5. **Determinism canary**: Seeds 1001-1004 produce identical outcomes.
6. **FITL playbook golden test**: Passes with identical trace output.

### Invariants

- `evaluateZoneFilterForMove()` never throws for deferrable errors — all deferral decisions are expressed through the return type.
- The internal retry loop in `evaluateFreeOperationZoneFilterProbe()` is the ONLY place where zone-filter eval errors are caught. All other callers use the result type.
- `shouldDeferFreeOperationZoneFilterFailure()` remains the single source of truth for deferral decisions, but is called internally, not by each consumer.

## Test Plan

1. Write unit tests for `ZoneFilterEvaluationResult` construction and type guards.
2. Convert `evaluateZoneFilterForMove()` return type. Update its 2 internal catch blocks.
3. Run full test suite.
4. Migrate `free-operation-discovery-analysis.ts` (2 catch sites).
5. Run full test suite.
6. Migrate `eval-query.ts` (1 catch site).
7. Run full test suite.
8. Attempt removal of `freeOperationZoneFilterEvaluationError()` — run grep first.
9. Run determinism canary and FITL playbook golden test.
