# FITLKERN-023: Consolidate event playability/context resolution to eliminate duplicated legality logic

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel event-execution helper consolidation + tests
**Deps**: none

## Problem

`packages/engine/src/kernel/event-execution.ts` currently repeats the same event playability/context checks across multiple exported paths (`shouldDeferIncompleteDecisionValidationForMove`, `executeEventMove`, `resolveEventFreeOperationGrants`, `resolveEventEligibilityOverrides`).

This duplication increases drift risk: one path may evolve while another misses the same guard, causing inconsistent legality/execution behavior for the same move.

## Assumption Reassessment (2026-02-26)

1. Event context resolution is centralized by `resolveEventExecutionContext`, but playability checks (`playCondition`) are repeated in several exported functions.
2. `shouldDeferIncompleteDecisionValidationForMove` introduced additional legality usage of the same playability checks.
3. Mismatch + correction: architectural intent is centralization, but current implementation still duplicates playability validation branches.

## Architecture Check

1. A single internal resolver for "playable event context" is cleaner and more robust than copy/paste checks in each exported API.
2. Consolidation keeps all event legality/execution behavior game-agnostic and based on generic event primitives, preserving GameSpecDoc vs GameDef/runtime boundaries.
3. No compatibility aliases/shims are needed; this is an internal refactor with invariant-preserving behavior.

## What to Change

### 1. Add a canonical internal playable-event-context helper

Introduce an internal helper that:
1. verifies `isCardEventMove`
2. resolves event context
3. evaluates `playCondition`
4. returns a unified result (`null` or context)

Use this helper in:
- `executeEventMove`
- `resolveEventFreeOperationGrants`
- `resolveEventEligibilityOverrides`
- `shouldDeferIncompleteDecisionValidationForMove`

### 2. Preserve behavior and tighten coverage

Add/adjust tests to assert behavior parity before/after refactor for:
1. unplayable event card path (`playCondition` false)
2. playable deferred path (`afterGrants` + grants)
3. non-card-event path

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (modify, if helper-facing coverage is added there)

## Out of Scope

- Event schema changes
- Turn-flow eligibility policy redesign
- Runner event-log formatting changes

## Acceptance Criteria

### Tests That Must Pass

1. `executeEventMove`, `resolveEventFreeOperationGrants`, `resolveEventEligibilityOverrides`, and deferred-leniency gate remain behaviorally consistent for playable/unplayable cards.
2. No regressions in apply-move legality around incomplete deferred decisions.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Event playability/context evaluation has one source of truth in kernel event execution.
2. Engine behavior remains game-agnostic and free of game-specific branches or fallback aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — verify deferred legality parity through applyMove path after consolidation.
2. `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — add/extend direct event-execution behavior checks (playable vs unplayable context) if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
