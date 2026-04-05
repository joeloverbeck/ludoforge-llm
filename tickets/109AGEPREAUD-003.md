# 109AGEPREAUD-003: Audit enumeration-time event filter

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal-moves.ts (if fix needed)
**Deps**: `archive/tickets/109AGEPREAUD-001.md`

## Problem

`isMoveDecisionSequenceAdmittedForLegalMove` at `legal-moves.ts:1136-1148` filters event moves during enumeration — before they ever reach `preparePlayableMoves`. This filter evaluates decision sequence satisfiability and may incorrectly reject valid event moves whose effect tree has side-dependent decision paths. If an event move is rejected here, it never becomes a candidate for the agent to evaluate.

## Assumption Reassessment (2026-04-05)

1. `enumerateCurrentEventMoves` at `legal-moves.ts:1071-1156` — confirmed. Creates separate moves per side.
2. `isMoveDecisionSequenceAdmittedForLegalMove` is called at lines 1136-1148 for each enumerated event move — confirmed.
3. This filter uses `MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE` — need to verify if this context is side-aware.

## Architecture Check

1. The enumeration filter is in the kernel (legal-moves.ts), which is game-agnostic (Foundation 1). Any fix must remain generic.
2. The filter's purpose is to reject moves with unsatisfiable decision sequences — valid for preventing crashes. But it should not reject moves that ARE satisfiable when side-specific context is provided.
3. Foundation 15 (Architectural Completeness) — if the filter incorrectly rejects valid event moves, that's a root cause issue, not a preview issue.

## What to Change

### 1. Audit the enumeration-time filter

Determine:
- Does the filter evaluate the decision sequence with the correct side context (shaded vs unshaded)?
- Or does it evaluate against a generic/empty context that makes some decisions appear unsatisfiable?
- How many FITL event moves are rejected by this filter? (Use diagnostic from ticket 001)

### 2. Fix if needed

If the filter incorrectly rejects side-satisfiable event moves:
- Ensure the decision sequence probe uses the side-specific effect tree
- The `resolveSelectedSide` mechanism in `event-execution.ts` should inform which decision paths exist

If the filter correctly rejects truly unsatisfiable moves:
- Document the finding — no code change needed
- Close this ticket as "no fix required"

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify, if fix needed) — enumeration-time event filter

## Out of Scope

- Preview pipeline changes (ticket 002)
- Preview diagnostics (ticket 004)
- Integration tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. If fix applied: event moves that were previously rejected now appear as legal move candidates
2. If no fix needed: document audit findings showing the filter is correct
3. Existing suite: `pnpm turbo test`

### Invariants

1. No game-specific logic in the fix (Foundation 1)
2. Truly unsatisfiable event moves continue to be rejected (no false positives)
3. Event move enumeration remains deterministic

## Test Plan

### New/Modified Tests

1. If fix applied: add a test in `packages/engine/test/unit/kernel/legal-moves.test.ts` verifying that sided event moves with side-dependent decision domains are not incorrectly rejected

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
