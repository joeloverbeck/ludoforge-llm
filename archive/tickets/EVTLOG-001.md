# EVTLOG-001: Extract shared groupByMove into model utility

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`EventLogPanel.tsx` and `format-event-log-text.ts` each implement their own copy of move grouping logic with identical behavior and structurally identical group shapes (`EventLogMoveGroup` vs `MoveGroup`). This is a DRY violation: if grouping logic changes, both sites must be updated in lockstep, and a missed update creates subtle divergence.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/EventLogPanel.tsx` defines local `groupEntriesByMove` and `EventLogMoveGroup`.
2. `packages/runner/src/model/format-event-log-text.ts` defines local `groupByMove` and `MoveGroup`.
3. Both functions iterate entries, grouping consecutive entries with the same `moveIndex`. The logic, structure, and return shapes are identical — only identifiers differ.
4. There is currently no direct unit test for the grouping helper itself; behavior is covered only indirectly through `EventLogPanel` and formatter tests.

## Architecture Check

1. Extracting a shared utility is cleaner than maintaining two copies. The function is a pure model concern (transforms `EventLogEntry[]` into grouped structure) and belongs in the `model/` layer.
2. No game-specific logic is involved; grouping by `moveIndex` is engine-agnostic.
3. No backwards-compatibility shims: both consumers switch to the single export directly, and old local definitions are deleted.
4. API surface should stay minimal: one shared grouping module in `model/`, no duplicate helper names, no aliases.

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

- Remove local `EventLogMoveGroup` interface and `groupEntriesByMove` function.
- Import the shared helper from `../model/event-log-grouping.js`.

### 3. Update `format-event-log-text.ts`

- Remove local `MoveGroup` interface and `groupByMove` function.
- Import `{ groupEntriesByMove }` from `./event-log-grouping.js`.
- Replace the `groupByMove(entries)` call with `groupEntriesByMove(entries)`.

## Files to Touch

- `packages/runner/src/model/event-log-grouping.ts` (new)
- `packages/runner/src/ui/EventLogPanel.tsx` (modify)
- `packages/runner/src/model/format-event-log-text.ts` (modify)
- `packages/runner/test/model/event-log-grouping.test.ts` (new)

## Out of Scope

- Changing the grouping algorithm itself
- Adding new EventLogPanel features
- Touching engine code

## Acceptance Criteria

### Tests and Checks That Must Pass

1. `format-event-log-text.test.ts` — existing tests pass unchanged (grouping behavior identical).
2. `EventLogPanel.test.tsx` — existing tests pass unchanged (rendering behavior identical).
3. New direct tests for the shared helper pass.
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. There is exactly one `groupEntriesByMove` implementation in the runner codebase.
2. Group shape type is defined only in the shared module (no duplicate local interfaces in consumers).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/event-log-grouping.test.ts` — unit tests for the extracted function: empty input, single group, multiple groups, and non-consecutive `moveIndex` values. Rationale: the function now has its own module and warrants direct coverage independent of consumers.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/event-log-grouping.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-20
- What was changed:
  - Added shared grouping module `packages/runner/src/model/event-log-grouping.ts` exporting `groupEntriesByMove` and `EventLogMoveGroup`.
  - Updated `packages/runner/src/ui/EventLogPanel.tsx` to consume the shared helper and removed local duplicate interface/helper.
  - Updated `packages/runner/src/model/format-event-log-text.ts` to consume the shared helper and removed local duplicate interface/helper.
  - Added direct unit tests in `packages/runner/test/model/event-log-grouping.test.ts`.
- Deviations from original plan:
  - None in implementation scope.
  - Ticket assumptions/scope were tightened before implementation to explicitly state missing direct unit coverage and include lint/typecheck acceptance checks.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- test/model/event-log-grouping.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
