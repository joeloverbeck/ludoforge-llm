# ENGINEARCH-011: Prevent Silent Event Move Drops During Deferrable Decision Probing

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal move enumeration + decision satisfiability policy + tests
**Deps**: none

## Problem

Event move probing in legal move enumeration currently catches deferrable decision-sequence errors and drops the move (`continue`) instead of preserving it as a candidate. This can hide legal event moves and recreates the reachability failure pattern we just fixed for event targets.

## Assumption Reassessment (2026-02-25)

1. `enumerateCurrentEventMoves` currently catches probe errors and drops moves when `shouldDeferMissingBinding(..., 'legalMoves.eventDecisionSequence')` returns true.
2. `shouldDeferMissingBinding` now also defers a subset of `SELECTOR_CARDINALITY` errors (unresolved binding selectors with zero resolutions) for `legalMoves.eventDecisionSequence`.
3. `enumerateCurrentEventMoves` uses `isMoveDecisionSequenceSatisfiable` (boolean) rather than explicit classification. This collapses `unknown` and `unsatisfiable` into the same `false` path, which can prune event moves under probe uncertainty.
4. Existing tests cover decision sequence behavior and missing-binding policy shape, but do not assert event-move visibility under deferrable probe-time errors or `unknown` satisfiability outcomes.

## Architecture Check

1. Legal move probing should classify uncertain branches as unknown/pending, not prune them at enumeration time; this is cleaner and avoids false negatives.
2. The fix remains generic and policy-driven, with no game-specific card IDs, branches, or special-case runtime logic.
3. No backwards-compatibility shims are added; behavior is corrected toward deterministic legality semantics.

## What to Change

### 1. Replace deferrable-error drop behavior in event probing

Adjust `enumerateCurrentEventMoves` so deferrable probe-time errors do not silently discard the base event move. Reuse existing decision-satisfiability classification semantics where possible.

### 2. Consolidate handling around satisfiability outcomes

Use `classifyMoveDecisionSequenceSatisfiability` for event move probing so `satisfiable`/`unsatisfiable`/`unknown` behavior is explicit and consistent. Treat:
- `satisfiable` as include
- `unsatisfiable` as exclude
- `unknown` as include (probe uncertainty should not hide event moves)

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
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add regression that event moves remain visible when event decision satisfiability is `unknown`.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — extend/confirm classification coverage for unknown paths where needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Event move probing in `legal-moves` now uses explicit satisfiability classification and keeps event moves for `unknown` outcomes.
  - Deferrable probe-time errors (`MISSING_BINDING` and scoped unresolved-selector cardinality) no longer silently prune event moves.
  - Card-event actions no longer fall through to generic non-event template enumeration when event probing yields no moves.
  - Added/updated event-focused regressions in kernel legal-move tests plus dependent architecture-alignment updates in related unit tests that assumed event params were discovered via generic action param enumeration.
- Deviations from original plan:
  - Expanded test updates beyond the two originally targeted files to correct stale event-fixture assumptions in existing `apply-move`, top-level `legal-moves`, and simulator unit tests.
  - No runtime/compiler architecture broadening beyond the event-move discovery boundary; implementation stayed policy-driven and game-agnostic.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
