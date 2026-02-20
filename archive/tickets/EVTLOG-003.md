# EVTLOG-003: Split lifecycle event kind into iteration vs lifecycle

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

The `EventLogEntry.kind` value `'lifecycle'` currently conflates two categories of events with very different signal-to-noise ratios:

1. **Iteration telemetry** - `forEach` (iterated N/M) and `reduce` (iterated N/M) entries. These are high-volume and low-signal for most users. A Texas Hold'em showdown with 2 players generates 42+ reduce lines (C(7,5) = 21 per player).
2. **Meaningful lifecycle events** - `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree`. These are low-volume and high-signal game events.

The EventLogPanel provides a filter toggle per kind. Users who want to hide the reduce/forEach spam must disable `Lifecycle`, which also hides the meaningful events. There is no way to filter one without the other.

## Assumption Reassessment (2026-02-20)

Validated against current code/tests:

1. `EventLogEntry.kind` is a union: `'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle'` (`packages/runner/src/model/translate-effect-trace.ts`).
2. `EventLogPanel.tsx` defines `EVENT_KIND_ORDER` with those six kinds and renders one filter button per kind (`packages/runner/src/ui/EventLogPanel.tsx`).
3. `format-event-log-text.ts` uses `entry.kind` dynamically in the output prefix (`[kind]`), so new kinds render automatically (`packages/runner/src/model/format-event-log-text.ts`).
4. `forEach` and `reduce` effect-trace entries currently produce `kind: 'lifecycle'` (`packages/runner/src/model/translate-effect-trace.ts`).
5. `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree` trigger-log entries currently produce `kind: 'lifecycle'` (`packages/runner/src/model/translate-effect-trace.ts`).
6. There are no additional runner consumers with exhaustive handling of `EventLogEntry['kind']` beyond `EventLogPanel` labels/order and tests. Prior note to update `trace-to-descriptors` was incorrect for this ticket scope.

## Architecture Reassessment

1. Introducing a first-class `'iteration'` kind is a cleaner architecture than keeping a mixed `'lifecycle'` bucket:
   - category semantics are explicit in the type system
   - filtering logic stays simple (one toggle per kind)
   - no ad hoc message parsing or secondary classification layer needed
2. Alternative designs (sub-kind fields, severity, regex/prefix-based filtering) add complexity without solving the root modeling issue.
3. This remains engine-agnostic and reusable across games because iteration telemetry is a generic runtime concept.
4. No compatibility aliases should be added. Consumers should move directly to the new kind model.

## Scope (Corrected)

### In Scope

1. Extend `EventLogEntry.kind` with `'iteration'`.
2. Reclassify `forEach` and `reduce` translated entries as `'iteration'`.
3. Add Iteration filter/button label in `EventLogPanel`.
4. Update/strengthen runner tests to cover the new kind and separation semantics.

### Out of Scope

1. Any engine trace-entry kind changes.
2. Any summarization/collapsing UX for repeated iteration entries.
3. Any changes to `packages/runner/src/animation/trace-to-descriptors.ts` (not a consumer of `EventLogEntry.kind`).

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify - kind union + forEach/reduce cases)
- `packages/runner/src/ui/EventLogPanel.tsx` (modify - filter order + labels)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify - explicit kind assertions)
- `packages/runner/test/model/format-event-log-text.test.ts` (modify - include iteration kind)
- `packages/runner/test/ui/EventLogPanel.test.tsx` (modify - validate iteration/lifecycle filter separation)

## Acceptance Criteria

### Tests That Must Pass

1. `translate-effect-trace.test.ts` asserts `forEach` and `reduce` entries are `kind: 'iteration'`.
2. `translate-effect-trace.test.ts` asserts `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree` remain `kind: 'lifecycle'`.
3. `EventLogPanel.test.tsx` verifies Iteration filter renders and can hide iteration entries without hiding lifecycle entries.
4. `format-event-log-text.test.ts` verifies `[iteration]` output appears when iteration entries are present.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Every `EventLogEntry.kind` value has exactly one corresponding filter button in EventLogPanel.
2. No `EventLogEntry['kind']` consumer remains unhandled after adding `'iteration'`.
3. TypeScript strict mode enforces completeness for kind-label/order mappings.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - add direct assertions for `entries[6]` and `entries[7]` as `kind: 'iteration'`; add direct assertions that trigger lifecycle event kinds remain `'lifecycle'`.
2. `packages/runner/test/model/format-event-log-text.test.ts` - extend kind coverage test to include `'iteration'`.
3. `packages/runner/test/ui/EventLogPanel.test.tsx` - add filter-behavior test proving Iteration and Lifecycle can be filtered independently.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts test/model/format-event-log-text.test.ts test/ui/EventLogPanel.test.tsx`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Actually changed:
  - Added `'iteration'` to `EventLogEntry.kind` and reclassified translated `forEach`/`reduce` entries to `'iteration'`.
  - Added Iteration filter/label in `EventLogPanel`.
  - Strengthened runner tests for iteration-vs-lifecycle classification and filtering independence.
- Deviations from original plan:
  - Corrected ticket scope by removing `trace-to-descriptors` follow-up, since it does not consume `EventLogEntry.kind`.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
