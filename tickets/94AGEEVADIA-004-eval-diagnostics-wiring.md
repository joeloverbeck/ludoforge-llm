# 94AGEEVADIA-004: Wire diagnostic data through eval and diagnostics layers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/policy-eval.ts, agents/policy-diagnostics.ts
**Deps**: 94AGEEVADIA-001, 94AGEEVADIA-002, 94AGEEVADIA-003

## Problem

The preview outcome cache and completion statistics are now available (from tickets 002 and 003), but are not threaded through `policy-eval.ts` into `PolicyEvaluationMetadata`, nor through `policy-diagnostics.ts` into the final `PolicyAgentDecisionTrace`. Without this wiring, the diagnostic data is computed but never reaches trace consumers.

## Assumption Reassessment (2026-03-29)

1. `PolicyEvaluationPreviewUsage` has `evaluatedCandidateCount`, `refIds`, `unknownRefs` — **confirmed** (line ~72 in policy-eval.ts).
2. `PolicyEvaluationCandidateMetadata` has `actionId`, `stableMoveKey`, `score`, etc. — **confirmed** (line ~47).
3. `PolicyEvaluationMetadata` has `previewUsage`, `candidates`, etc. — **confirmed** (line ~81).
4. `buildPolicyAgentDecisionTrace` in `policy-diagnostics.ts` maps `PolicyEvaluationMetadata` → `PolicyAgentDecisionTrace` with trace-level gating — **confirmed** (line ~101).
5. `PolicyDecisionTraceLevel` is `'summary' | 'verbose'` — **confirmed** (line ~13 in policy-diagnostics.ts).
6. The eval layer currently calls the preview runtime but does not access the outcome cache — **confirmed** (no `getOutcomeCache` calls exist).

## Architecture Check

1. This ticket threads existing data through existing interfaces — no new architectural patterns, just additive fields.
2. The trace-level gating follows the spec: `outcomeBreakdown` at summary level, `completionStatistics` and per-candidate `previewOutcome` at verbose level only.
3. No game-specific logic — all additions are generic pipeline diagnostics.
4. No backwards-compatibility shims — new fields are optional on existing interfaces.

## What to Change

### 1. Extend `PolicyEvaluationPreviewUsage` with `outcomeBreakdown`

In `policy-eval.ts`:

```typescript
export interface PolicyEvaluationPreviewUsage {
  // ... existing fields ...
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdown;
}
```

Import `PolicyPreviewOutcomeBreakdown` from `policy-preview.ts`.

### 2. Extend `PolicyEvaluationCandidateMetadata` with `previewOutcome`

```typescript
export interface PolicyEvaluationCandidateMetadata {
  // ... existing fields ...
  readonly previewOutcome?: 'ready' | 'random' | 'hidden' | 'unresolved' | 'failed';
}
```

### 3. Extend `PolicyEvaluationMetadata` with `completionStatistics`

```typescript
export interface PolicyEvaluationMetadata {
  // ... existing fields ...
  readonly completionStatistics?: PolicyCompletionStatistics;
}
```

Import `PolicyCompletionStatistics` from `prepare-playable-moves.ts`.

### 4. Wire preview outcome cache into eval flow

In the eval function that creates `PolicyEvaluationMetadata`:
- Accept the preview runtime's `getOutcomeCache()` result.
- Call `summarizePreviewOutcomes(cache)` to populate `previewUsage.outcomeBreakdown`.
- For each candidate, look up `cache.get(candidate.stableMoveKey)` to populate `previewOutcome`.

### 5. Wire completion statistics into eval metadata

Accept the `statistics` from `PreparedPlayableMoves` result and pass it through to `PolicyEvaluationMetadata.completionStatistics`.

### 6. Update `buildPolicyAgentDecisionTrace` trace-level gating

In `policy-diagnostics.ts`:
- **Summary level**: Include `previewUsage.outcomeBreakdown` (map from eval's `PolicyPreviewOutcomeBreakdown` to trace's `PolicyPreviewOutcomeBreakdownTrace`).
- **Verbose level**: Additionally include `completionStatistics` (map to `PolicyCompletionStatisticsTrace`) and per-candidate `previewOutcome`.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)

## Out of Scope

- Modifying `policy-preview.ts` (done in 94AGEEVADIA-002)
- Modifying `prepare-playable-moves.ts` (done in 94AGEEVADIA-003)
- Modifying `types-core.ts` (done in 94AGEEVADIA-001)
- JSON schema updates (done in 94AGEEVADIA-005)
- Changing preview resolution or completion classification behavior
- Adding new trace levels beyond `summary`/`verbose`

## Acceptance Criteria

### Tests That Must Pass

1. **New**: At `summary` level, `buildPolicyAgentDecisionTrace` includes `previewUsage.outcomeBreakdown` with correct counts.
2. **New**: At `summary` level, `completionStatistics` is NOT present on the trace.
3. **New**: At `summary` level, per-candidate `previewOutcome` is NOT present.
4. **New**: At `verbose` level, `completionStatistics` IS present with correct values.
5. **New**: At `verbose` level, per-candidate `previewOutcome` IS present with correct values.
6. **New**: When preview runtime has mixed outcomes (ready + various unknown reasons), `outcomeBreakdown` counts match the cache state.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass unchanged.

### Invariants

1. Trace backward compatibility: no existing required fields are removed or renamed.
2. `outcomeBreakdown` counts sum to `evaluatedCandidateCount` (or less, since some candidates may not appear in the preview cache if preview was not requested for them).
3. Per-candidate `previewOutcome` values are one of the 5 allowed strings, or absent.
4. `completionStatistics` fields, when present, are consistent with `PreparedPlayableMoves.statistics`.
5. The eval function does not modify the preview cache — it only reads.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/policy-diagnostics.test.ts` — new file, tests `buildPolicyAgentDecisionTrace` at summary and verbose levels with mock `PolicyEvaluationMetadata` containing diagnostic fields.
2. `packages/engine/test/unit/policy-eval.test.ts` — new file or additions to existing, tests that eval metadata correctly includes `outcomeBreakdown`, `completionStatistics`, and per-candidate `previewOutcome` when preview cache and statistics are provided.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="policy-diagnostics"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="policy-eval"`
3. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
