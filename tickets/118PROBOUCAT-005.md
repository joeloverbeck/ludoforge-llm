# 118PROBOUCAT-005: Investigate + migrate `legal-moves.ts` 3 catch blocks

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel legal-moves module
**Deps**: `archive/tickets/118PROBOUCAT-001.md`, `archive/tickets/118PROBOUCAT-004.md`

## Problem

`legal-moves.ts` has 3 catch blocks in Group B scope:

1. **Line ~386** — bare catch returning `false`. No classifier. Catches errors from `compiled.check(ctx).admissible` and silently returns `false` (treat as not admissible).
2. **Line ~530** — bare catch keeping the move. No classifier. Catches errors during plain-action effect evaluation and silently keeps the move. Comment: "effects may reference runtime state not available during discovery."
3. **Line ~685** — catches `isTurnFlowErrorCode(FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED)` and returns `true`.

The first two are defensive catch-alls that swallow unknown errors — a correctness risk. This ticket investigates what errors they actually catch and either adds typed classification or documents why a bare catch is necessary. The third should migrate to use `ZoneFilterEvaluationResult` from the zone-filter probe function.

## Assumption Reassessment (2026-04-07)

1. `legal-moves.ts` exists at `packages/engine/src/kernel/legal-moves.ts` — confirmed.
2. Bare catch at line ~386: wraps `compiled.check(ctx).admissible`, returns `false` — confirmed.
3. Bare catch at line ~530: wraps effect evaluation during discovery, keeps the move — confirmed.
4. Zone-filter catch at line ~685: checks for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`, returns `true` — confirmed.
5. `ZoneFilterEvaluationResult` is available from `zone-filter-evaluation-result.ts` with `zoneFilterResolved`, `zoneFilterDeferred`, `zoneFilterFailed` constructors — confirmed.

## Architecture Check

1. Bare catches are a correctness risk per FOUNDATIONS §15 — they address symptoms rather than root causes. Investigation determines whether they mask genuine bugs or are legitimate discovery-time uncertainty.
2. The zone-filter catch (line ~685) should use the typed result from the zone-filter probe function, eliminating error-code matching.
3. No game-specific logic — all three sites are in the generic legal-moves pipeline.
4. No backwards-compatibility shims — each catch is either replaced with a typed pattern or documented with a clear justification.

## What to Change

### 1. Investigate bare catch at line ~386

Determine what error types `compiled.check(ctx)` can throw during probe evaluation:
- If specific error codes (e.g., MISSING_BINDING, MISSING_VAR): replace with a typed classifier, potentially using `probeWith` or `isRecoverableEvalResolutionError`.
- If genuinely any error (e.g., the compiled check can fail in unpredictable ways during discovery): document why the bare catch is necessary with a code comment citing the investigation, and leave it.

### 2. Investigate bare catch at line ~530

Determine what error types the effect evaluation can throw during plain-action discovery:
- Same investigation criteria as line ~386.
- If the errors are the same class as `isRecoverableEvalResolutionError` (MISSING_BINDING, MISSING_VAR, DIVISION_BY_ZERO), use the eval-query wrappers from 118PROBOUCAT-004.
- If broader, document the justification.

### 3. Migrate zone-filter catch at line ~685

This catch block checks for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`. It should be eliminated by having the upstream zone-filter evaluation function return a `ZoneFilterEvaluationResult` instead of throwing. The caller then pattern-matches on the result status instead of catching error codes.

Investigate the call chain to determine:
- Whether the throwing function already has a result-returning variant
- If not, whether it can be added without affecting other callers

### 4. Add tests for investigated bare catches

For each bare catch that remains after investigation, add a test that exercises the code path to document what error class triggers it.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/test/kernel/legal-moves.test.ts` (modify — add tests for bare catch code paths)

## Out of Scope

- Migrating `evalCondition` to be result-returning (Group C scope)
- The `hasTransportLikeStateChangeFallback` heuristic (Group D, 118PROBOUCAT-006)
- Catch blocks in other files
- The non-catch `classifyMissingBindingProbeError` call at line ~451

## Acceptance Criteria

### Tests That Must Pass

1. Investigation findings documented: each bare catch either replaced with typed classification or justified with a code comment
2. Zone-filter catch at line ~685 eliminated if upstream result-returning variant exists, or documented if deferred
3. New tests exercise the bare-catch code paths to verify what error class triggers them
4. FITL canary seeds produce identical results
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No behavioral change — same moves are enumerated in the same order
2. Non-recoverable errors still propagate (no silent swallowing of new error classes)
3. Determinism preserved (F8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/legal-moves.test.ts` — tests for bare-catch code paths at lines ~386 and ~530

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test --force`
