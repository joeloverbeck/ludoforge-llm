# 119EVARESRET-004: Migrate probe and graceful-degradation catch sites to result pattern-matching

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — 7 catch/probeWith sites replaced with result pattern-matching across 4 files
**Deps**: `archive/tickets/119EVARESRET-002.md`, `tickets/119EVARESRET-003.md`

## Problem

After tickets 002 and 003, all eval call sites use `unwrapEval*` — including probe-context and graceful-degradation sites that previously used try-catch or `probeWith`. These sites should use result pattern-matching instead of unwrap-then-catch, since the whole point of result types is to eliminate catch blocks for expected eval failures. This ticket replaces the intermediate `unwrapEval*` calls at these 7 sites with direct `result.outcome` checks.

## Assumption Reassessment (2026-04-07)

1. `action-pipeline-predicates.ts` — 2 eval sites: 1 `probeWith` wrapping `evalCondition` (line 18), 1 try-catch wrapping `evalCondition` (line 37). After ticket 002, both use `unwrapEvalCondition`. This ticket replaces with result checks.
2. `free-operation-zone-filter-probe.ts` — 1 try-catch wrapping eval call (line 43). After ticket 002, uses `unwrapEvalCondition`. This ticket replaces with result check.
3. `free-operation-grant-authorization.ts` — 1 try-catch wrapping eval call (line 209). After ticket 002, uses `unwrapEvalCondition`. This ticket replaces with result check.
4. `condition-annotator.ts` — 3 try-catch-wrapped `evalCondition` calls (lines 66, 310, 459) for UI graceful degradation. After ticket 002, all use `unwrapEvalCondition`. This ticket replaces with result pattern-matching that returns fallback values on error.
5. `probeWith` in `probe-result.ts` has 4 callers. Only 1 (`action-pipeline-predicates.ts`) wraps `evalCondition` directly. The other 3 (`legal-choices.ts` x2, `pipeline-viability-policy.ts`, `move-decision-sequence.ts`) wrap higher-level operations. `probeWith` is NOT deleted by this ticket.

## Architecture Check

1. Eliminates try-catch blocks for expected eval failures — the root cause fix (F15).
2. Probe sites use `result.outcome === 'error'` + `isEvalErrorCode()` for classification — reuses existing infrastructure.
3. Graceful-degradation sites return fallback values on error, NOT throw — different from `unwrapEval*`.
4. No game-specific logic. All changes are in generic kernel error-handling paths.
5. `probeWith` remains for non-eval callers — no orphaned infrastructure deleted prematurely.

## What to Change

### 1. Migrate `action-pipeline-predicates.ts` probe sites (2 sites)

**Site 1** (line ~18, probeWith call):
```typescript
// AFTER ticket 002 (intermediate)
unwrapEvalCondition(evalCondition(condition, ctx))

// AFTER this ticket (final)
const result = evalCondition(condition, ctx);
if (result.outcome === 'error') return classifier(result.error);
return { outcome: 'legal', value: result.value };
```

**Site 2** (line ~37, try-catch):
```typescript
// AFTER this ticket (final)
const result = evalCondition(condition, ctx);
if (result.outcome === 'error') throw pipelinePredicateEvaluationError(action, profileId, predicate, result.error);
return result.value;
```

Remove `probeWith` import from this file (no longer needed here).

### 2. Migrate `free-operation-zone-filter-probe.ts` Group C site (1 site)

Replace `unwrapEvalCondition` with result pattern-match. On error with `MISSING_BINDING` code, return `zoneFilterDeferred(...)`. On other errors, return `zoneFilterFailed(...)`. On success, return `zoneFilterResolved(result.value)`.

### 3. Migrate `free-operation-grant-authorization.ts` Group C site (1 site)

Replace `unwrapEvalCondition` with result pattern-match. Use `classifyError(result.error)` on error outcome.

### 4. Migrate `condition-annotator.ts` graceful-degradation sites (3 sites)

All 3 sites follow the same pattern — return fallback annotation on error:

```typescript
// AFTER this ticket (final — line 66 example)
const result = evalCondition(cond, evalCtx);
if (result.outcome === 'error') return { result: 'fail', text: '?' };
return result.value
  ? { result: 'pass', text: '✓' }
  : { result: 'fail', text: '✗' };
```

Lines 310 and 459 follow similar patterns with their respective fallback values.

## Files to Touch

- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)

## Out of Scope

- Deleting `probeWith` from `probe-result.ts` — 3 non-eval callers remain
- Choice validation throws in `effects-choice.ts` — deferred to Spec 120
- `hasTransportLikeStateChangeFallback` heuristic — deferred to Spec 120
- Any eval consumer sites already handled by tickets 002/003

## Acceptance Criteria

### Tests That Must Pass

1. Probe sites in `action-pipeline-predicates.ts` return `ProbeResult` with correct `outcome` on eval errors
2. `free-operation-zone-filter-probe.ts` returns `zoneFilterDeferred` on MISSING_BINDING, `zoneFilterFailed` on other errors
3. `free-operation-grant-authorization.ts` returns classified error result on eval failure
4. `condition-annotator.ts` returns fallback annotations on eval errors (not throws)
5. No eval-related try-catch blocks remain in the 4 modified files
6. `probeWith` import removed from `action-pipeline-predicates.ts`
7. Existing suite: `pnpm turbo test`

### Invariants

1. Zero eval-related try-catch blocks in probe/annotation files — verified by grep
2. `probeWith` still has 3 active callers (not deleted)
3. No game-specific logic introduced (F1)
4. Determinism preserved (F8)
5. All error classification paths produce identical outcomes to the pre-migration try-catch behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/action-pipeline-predicates.test.ts` — verify probe result on eval error (if test exists; otherwise verify via integration tests)
2. `packages/engine/test/unit/free-operation-zone-filter-probe.test.ts` — verify deferred/failed results on eval error
3. `packages/engine/test/unit/condition-annotator.test.ts` — verify fallback annotations on eval error

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo test`
3. Verify: `grep -n 'try {' packages/engine/src/kernel/action-pipeline-predicates.ts packages/engine/src/kernel/free-operation-zone-filter-probe.ts packages/engine/src/kernel/free-operation-grant-authorization.ts` — should find no eval-related catches
