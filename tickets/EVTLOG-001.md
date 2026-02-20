# EVTLOG-001: Extract shared groupByMove into model utility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`EventLogPanel.tsx` and `format-event-log-text.ts` each implement their own copy of `groupByMove` with identical logic and near-identical interfaces (`EventLogMoveGroup` vs `MoveGroup`). This is a DRY violation — if grouping logic changes, both sites must be updated in lockstep, and a missed update creates subtle divergence.

## Assumption Reassessment (2026-02-20)

1. `EventLogPanel.tsx:31-51` defines `groupEntriesByMove` and `EventLogMoveGroup`.
2. `format-event-log-text.ts:3-28` defines `groupByMove` and `MoveGroup`.
3. Both functions iterate entries, grouping consecutive entries with the same `moveIndex`. The logic, structure, and return shapes are identical — only names differ.

## Architecture Check

1. Extracting a shared utility is strictly cleaner than maintaining two copies. The function is a pure model concern (transforms `EventLogEntry[]` into grouped structure) and belongs in the `model/` layer.
2. No game-specific logic involved — grouping by moveIndex is engine-agnostic.
3. No backwards-compatibility shims — the two consumers switch to the single export directly. The old local definitions are deleted.

## What to Change

### 1. Create `packages/runner/src/model/event-log-grouping.ts`

Export a single `groupEntriesByMove` function and the `EventLogMoveGroup` interface:

```typescript
import type { EventLogEntry } from './translate-effect-trace.js';

export interface EventLogMoveGroup {
  readonly moveIndex: number;
  readonly entries: readonly EventLogEntry[];
}

export function groupEntriesByMove(entries: readonly EventLogEntry[]): readonly EventLogMoveGroup[] {
  // existing logic
}
```

### 2. Update `EventLogPanel.tsx`

- Remove the local `EventLogMoveGroup` interface and `groupEntriesByMove` function.
- Import `{ groupEntriesByMove, type EventLogMoveGroup }` from `../model/event-log-grouping.js`.

### 3. Update `format-event-log-text.ts`

- Remove the local `MoveGroup` interface and `groupByMove` function.
- Import `{ groupEntriesByMove }` from `./event-log-grouping.js`.
- Replace the `groupByMove(entries)` call with `groupEntriesByMove(entries)`.

## Files to Touch

- `packages/runner/src/model/event-log-grouping.ts` (new)
- `packages/runner/src/ui/EventLogPanel.tsx` (modify)
- `packages/runner/src/model/format-event-log-text.ts` (modify)

## Out of Scope

- Changing the grouping algorithm itself
- Adding new EventLogPanel features
- Touching engine code

## Acceptance Criteria

### Tests That Must Pass

1. `format-event-log-text.test.ts` — all existing tests pass unchanged (grouping behavior identical).
2. `EventLogPanel.test.tsx` — all existing tests pass unchanged (rendering behavior identical).
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. There is exactly one `groupEntriesByMove` function in the runner codebase — no duplicates.
2. `EventLogMoveGroup` is defined once and imported by all consumers.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/event-log-grouping.test.ts` — Unit tests for the extracted function: empty input, single group, multiple groups, non-consecutive moveIndex values. Rationale: the function now has its own module and warrants direct unit coverage independent of its consumers.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/event-log-grouping.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
