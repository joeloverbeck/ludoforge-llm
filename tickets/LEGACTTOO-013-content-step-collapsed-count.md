# LEGACTTOO-013: Carry `collapsedCount` Through to ContentStep

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-rule-card.ts`, `packages/engine/src/kernel/tooltip-template-realizer.ts`
**Deps**: archive/tickets/LEGACTTOO-007-template-realizer-blocker-extractor-golden-tests.md

## Problem

The content planner's `ContentPlanStep.collapsedCount` tracks how many messages were collapsed by rhetorical budget enforcement. This value is silently dropped during realization — `ContentStep` has no `collapsedCount` field. The runner UI cannot show "(+N more effects)" indicators because the information is lost.

## Assumption Reassessment (2026-03-07)

1. `ContentPlanStep` at `tooltip-content-planner.ts:16-22` has `collapsedCount: number`.
2. `ContentStep` at `tooltip-rule-card.ts:6-11` has no `collapsedCount`.
3. `realizeStep` at `tooltip-template-realizer.ts` maps `ContentPlanStep` to `ContentStep` but does not carry `collapsedCount`.
4. The runner does not yet consume `ContentStep` (confirmed by grep — no references in `packages/runner/`).

## Architecture Check

1. Adding an optional `collapsedCount` to `ContentStep` is a non-breaking additive change.
2. The data flows naturally: planner computes it, realizer carries it, runner displays it.
3. No game-specific logic — purely structural metadata.

## What to Change

### 1. Add `collapsedCount` to `ContentStep` in `tooltip-rule-card.ts`

```typescript
export interface ContentStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly lines: readonly RealizedLine[];
  readonly collapsedCount?: number;
  readonly subSteps?: readonly ContentStep[];
}
```

### 2. Carry `collapsedCount` in `realizeStep` in `tooltip-template-realizer.ts`

Pass `planStep.collapsedCount` through to the output `ContentStep` when non-zero.

## Files to Touch

- `packages/engine/src/kernel/tooltip-rule-card.ts` (modify)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (modify)

## Out of Scope

- Runner UI rendering of collapsed indicators (LEGACTTOO-009)
- Changing the planner's budget enforcement logic

## Acceptance Criteria

### Tests That Must Pass

1. A plan step with `collapsedCount: 3` produces a `ContentStep` with `collapsedCount: 3`.
2. A plan step with `collapsedCount: 0` produces a `ContentStep` without `collapsedCount`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `collapsedCount` is never negative in output.
2. `ContentStep` remains JSON-serializable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add test for `collapsedCount` passthrough.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
