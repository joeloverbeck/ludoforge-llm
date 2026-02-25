# ENGINEARCH-011: Prevent Silent Event Move Drops During Deferrable Decision Probing

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal move enumeration + decision satisfiability policy + tests
**Deps**: none

## Problem

Event move probing in legal move enumeration currently catches deferrable decision-sequence errors and drops the move (`continue`) instead of preserving it as a candidate. This can hide legal event moves and recreates the reachability failure pattern we just fixed for event targets.

## Assumption Reassessment (2026-02-25)

1. `enumerateCurrentEventMoves` currently catches probe errors and drops moves when `shouldDeferMissingBinding(..., 'legalMoves.eventDecisionSequence')` returns true.
2. `shouldDeferMissingBinding` now also defers a subset of `SELECTOR_CARDINALITY` errors (unresolved binding selectors with zero resolutions) for `legalMoves.eventDecisionSequence`.
3. Existing tests cover target synthesis and missing-binding policy shape, but do not assert that deferrable probe-time errors preserve legal event move visibility.

## Architecture Check

1. Legal move probing should classify uncertain branches as unknown/pending, not prune them at enumeration time; this is cleaner and avoids false negatives.
2. The fix remains generic and policy-driven, with no game-specific card IDs, branches, or special-case runtime logic.
3. No backwards-compatibility shims are added; behavior is corrected toward deterministic legality semantics.

## What to Change

### 1. Replace deferrable-error drop behavior in event probing

Adjust `enumerateCurrentEventMoves` so deferrable probe-time errors do not silently discard the base event move. Reuse existing decision-satisfiability classification semantics where possible.

### 2. Consolidate handling around satisfiability outcomes

Use `classifyMoveDecisionSequenceSatisfiability` (or equivalent centralized helper) for event move probing so `satisfiable`/`unsatisfiable`/`unknown` behavior is explicit and consistent.

### 3. Add regression tests for event move visibility

Add tests proving that when probing encounters deferrable binding/cardinality conditions, event moves are preserved (not dropped), while truly unsatisfiable moves remain excluded.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify, if needed for shared classification path)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify, if needed)

## Out of Scope

- Event effect semantics unrelated to legality probing
- Compiler/CNL changes
- Runner/UI event-log formatting

## Acceptance Criteria

### Tests That Must Pass

1. Unit test demonstrates deferrable event probing errors do not remove otherwise legal event moves.
2. Unit test demonstrates unsatisfiable event decision sequences are still excluded.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `GameDef` and kernel legality remain game-agnostic and data-driven.
2. Event move enumeration does not silently drop moves due to recoverable probe-time uncertainty.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add regression for deferrable event decision probing.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — add/extend satisfiability classification coverage for unknown/deferrable paths.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

