# EVTLOG-003: Split lifecycle event kind into iteration vs lifecycle

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The `EventLogEntry.kind` value `'lifecycle'` conflates two categories of events with very different signal-to-noise ratios:

1. **Iteration telemetry** — `forEach` (iterated N/M) and `reduce` (iterated N/M) entries. These are high-volume and low-signal for most users. A Texas Hold'em showdown with 2 players generates 42+ reduce lines (C(7,5) = 21 per player).
2. **Meaningful lifecycle events** — `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree`. These are low-volume and high-signal game events.

The EventLogPanel provides a filter toggle per kind. Users who want to hide the reduce/forEach spam must disable `Lifecycle`, which also hides the meaningful events. There is no way to filter one without the other.

## Assumption Reassessment (2026-02-20)

1. `EventLogEntry.kind` is a union: `'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle'` (translate-effect-trace.ts:9).
2. `EventLogPanel.tsx:10` defines `EVENT_KIND_ORDER` with all six kinds and renders one filter button per kind.
3. `format-event-log-text.ts:34` uses `entry.kind` in the output prefix (e.g., `[lifecycle]`).
4. `forEach` and `reduce` trace entries produce `kind: 'lifecycle'` (translate-effect-trace.ts:116-124).
5. `simultaneousSubmission`, `simultaneousCommit`, `operationPartial`, `operationFree` trigger entries also produce `kind: 'lifecycle'` (translate-effect-trace.ts:192-228).

## Architecture Check

1. Adding a new kind `'iteration'` cleanly separates the two categories at the type level. The filter UI gains a new toggle at no additional complexity. This is cleaner than sub-kind fields or composite filtering logic.
2. No game-specific logic — iteration vs lifecycle is a universal engine distinction applicable to any game.
3. No backwards-compatibility shims needed — `EventLogEntry` is a runner-internal type not exposed to the engine or external consumers. We change the union and update all switch sites.

## What to Change

### 1. Extend the `EventLogEntry.kind` union

In `translate-effect-trace.ts`, change:
```typescript
readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle';
```
to:
```typescript
readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle' | 'iteration';
```

### 2. Assign `kind: 'iteration'` to forEach and reduce entries

In `translateEffectEntry`, change the `forEach` and `reduce` cases from `kind: 'lifecycle'` to `kind: 'iteration'`.

### 3. Update EventLogPanel filter UI

In `EventLogPanel.tsx`:
- Add `'iteration'` to `EVENT_KIND_ORDER`.
- Add `iteration: 'Iteration'` to `EVENT_KIND_LABELS`.

### 4. Update format-event-log-text output

No change needed — `formatEntry` already uses `entry.kind` dynamically, so `[iteration]` will appear automatically.

### 5. Update trace-to-descriptors and any other consumers

Search for `kind === 'lifecycle'` and `entry.kind` exhaustiveness checks across the runner. Update any exhaustive switch/map to handle the new `'iteration'` kind.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify — kind union + switch cases)
- `packages/runner/src/ui/EventLogPanel.tsx` (modify — filter array + labels)
- Any other runner files with exhaustive checks on `EventLogEntry['kind']` (modify)

## Out of Scope

- Collapsing or summarizing repeated iteration entries (future UX improvement)
- Changing engine trace entry kinds
- Adding sub-kind or severity fields to EventLogEntry

## Acceptance Criteria

### Tests That Must Pass

1. `translate-effect-trace.test.ts` — forEach entries have `kind: 'iteration'`, reduce entries have `kind: 'iteration'`.
2. `translate-effect-trace.test.ts` — simultaneousSubmission, operationPartial, operationFree entries retain `kind: 'lifecycle'`.
3. `EventLogPanel.test.tsx` — the Iteration filter button renders and toggles correctly.
4. `format-event-log-text.test.ts` — the `[iteration]` label appears for iteration entries.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Every `EventLogEntry.kind` value has exactly one corresponding filter button in EventLogPanel.
2. No exhaustive switch/map on `EventLogEntry['kind']` is left unhandled after adding `'iteration'`.
3. `TypeScript strict mode` catches any unhandled kind at compile time via exhaustiveness checks.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — Update existing assertions: `entries[6]` (forEach) and `entries[7]` (reduce) now have `kind: 'iteration'`. Add explicit assertion for simultaneousSubmission retaining `kind: 'lifecycle'`.
2. `packages/runner/test/model/format-event-log-text.test.ts` — Update the "formats all six event kinds" test to include `'iteration'` as a seventh kind.
3. `packages/runner/test/ui/EventLogPanel.test.tsx` — Add assertion that the Iteration filter button renders with correct label and toggles filtering.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
