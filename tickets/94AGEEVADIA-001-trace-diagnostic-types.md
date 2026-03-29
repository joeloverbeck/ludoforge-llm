# 94AGEEVADIA-001: Add diagnostic trace types to types-core.ts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types (trace-serialized shapes only)
**Deps**: Spec 94 (draft), Spec 93 (implemented)

## Problem

The `PolicyAgentDecisionTrace` and related trace interfaces lack fields for preview outcome breakdown, completion statistics, and per-candidate preview outcome. Without these types, the remaining diagnostic pipeline tickets cannot compile.

## Assumption Reassessment (2026-03-29)

1. `PolicyPreviewUsageTrace` exists at `types-core.ts` with `evaluatedCandidateCount`, `refIds`, `unknownRefs` — **confirmed** (line ~1329).
2. `PolicyCandidateDecisionTrace` exists with `actionId`, `stableMoveKey`, `score`, `prunedBy`, `scoreContributions`, `previewRefIds`, `unknownPreviewRefs` — **confirmed** (line ~1307).
3. `PolicyAgentDecisionTrace` exists with `previewUsage`, `candidates?`, etc. — **confirmed** (line ~1343).
4. No `outcomeBreakdown`, `completionStatistics`, or per-candidate `previewOutcome` fields exist yet — **confirmed**.

## Architecture Check

1. These are additive optional fields on existing trace interfaces — the minimal-impact approach.
2. All new types are generic (no game-specific content). They describe agent evaluation pipeline outcomes, not game rules.
3. No backwards-compatibility shims — new fields are optional (`?`), so existing consumers are unaffected.

## What to Change

### 1. Add `PolicyPreviewOutcomeBreakdownTrace` interface

New interface in `types-core.ts` near the existing `PolicyPreviewUsageTrace`:

```typescript
export interface PolicyPreviewOutcomeBreakdownTrace {
  readonly ready: number;
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}
```

### 2. Add `outcomeBreakdown?` to `PolicyPreviewUsageTrace`

```typescript
export interface PolicyPreviewUsageTrace {
  // ... existing fields ...
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdownTrace;
}
```

### 3. Add `PolicyCompletionStatisticsTrace` interface

```typescript
export interface PolicyCompletionStatisticsTrace {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
}
```

### 4. Add `completionStatistics?` to `PolicyAgentDecisionTrace`

```typescript
export interface PolicyAgentDecisionTrace {
  // ... existing fields ...
  readonly completionStatistics?: PolicyCompletionStatisticsTrace;
}
```

### 5. Add `previewOutcome?` to `PolicyCandidateDecisionTrace`

```typescript
export interface PolicyCandidateDecisionTrace {
  // ... existing fields ...
  readonly previewOutcome?: 'ready' | 'random' | 'hidden' | 'unresolved' | 'failed';
}
```

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)

## Out of Scope

- Changing any runtime logic (agents, preview, eval, diagnostics)
- Updating JSON schemas (that is 94AGEEVADIA-005)
- Adding tests for runtime behavior (no runtime changes in this ticket)
- Modifying existing required fields or removing any fields

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — new types compile without errors
2. `pnpm turbo typecheck` — no type errors across the monorepo
3. Existing suite: `pnpm turbo test` — all existing tests pass unchanged

### Invariants

1. All new fields are optional (`?`) — no existing consumer breaks.
2. No existing interface fields are modified or removed.
3. `PolicyPreviewOutcomeBreakdownTrace` field names exactly match the spec: `ready`, `unknownRandom`, `unknownHidden`, `unknownUnresolved`, `unknownFailed`.
4. `PolicyCompletionStatisticsTrace` field names exactly match the spec: `totalClassifiedMoves`, `completedCount`, `stochasticCount`, `rejectedNotViable`, `templateCompletionAttempts`, `templateCompletionSuccesses`, `templateCompletionUnsatisfiable`.
5. `previewOutcome` union is exactly `'ready' | 'random' | 'hidden' | 'unresolved' | 'failed'`.

## Test Plan

### New/Modified Tests

No new tests — this is a type-only change. Type correctness is verified by the build.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
