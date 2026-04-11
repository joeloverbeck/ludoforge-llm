# 126FREOPEBIN-002: Investigate and bound legal-move enumeration hangs

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel move enumeration budgets, legal moves, simulator stop reason
**Deps**: None

## Problem

~10% of FITL simulation seeds (e.g., 1040, 1054) cause `enumerateLegalMoves()` to never return, violating Foundation 10 (Bounded Computation). The hang occurs inside a single call, so the simulator's `maxTurns` guard never triggers. The existing `MoveEnumerationBudgets` system bounds template and parameter expansion but may not cover all code paths — the specific unbounded loop must be identified before it can be bounded.

## Assumption Reassessment (2026-04-11)

1. `MoveEnumerationBudgets` in `move-enumeration-budgets.ts` has 5 fields: `maxTemplates`, `maxParamExpansions`, `maxDecisionProbeSteps`, `maxDeferredPredicates`, `maxCompletionDecisions` — confirmed.
2. `resolveMoveEnumerationBudgets` resolves overrides with defaults — confirmed.
3. `legal-moves.ts` tracks `templateBudgetExceeded` and `paramExpansionBudgetExceeded` flags — confirmed.
4. `decision-sequence-satisfiability.ts` and `free-operation-viability.ts` also consume `MoveEnumerationBudgets` — confirmed as candidate hang locations.
5. `enumerateLegalMoves` is exported from `legal-moves.ts` line 1403, re-exported in kernel `index.ts`, consumed by 72+ files — confirmed. Behavioral changes must be transparent to callers.

## Architecture Check

1. Integrates with the existing `MoveEnumerationBudgets` infrastructure rather than creating a parallel budget mechanism on `GameDef.terminal`. This is cleaner — single budget system, single resolver, single set of defaults.
2. The new bound is engine-agnostic — it caps total enumeration cost regardless of game, not FITL-specific.
3. No backwards-compatibility shims — the new field is added to the existing interface with a default value, so existing callers that don't pass an override see no change.

## What to Change

### 1. Investigate hang mechanism

Trace seeds 1040 and 1054 to identify the specific unbounded loop. Run with diagnostic logging or attach a timeout to `enumerateLegalMoves`. Check whether the hang is in:
- Decision-sequence satisfiability (`decision-sequence-satisfiability.ts`)
- Free-operation viability checks (`free-operation-viability.ts`)
- Zone filter probe retries (`free-operation-zone-filter-probe.ts`)
- The main parameter expansion loop in `legal-moves.ts`
- Some combination of the above

Document the finding before implementing the bound.

### 2. Add top-level bound to `MoveEnumerationBudgets`

Add a new field (e.g., `maxTotalExpansions`) to the `MoveEnumerationBudgets` interface in `move-enumeration-budgets.ts`. Add the default value to `DEFAULT_MOVE_ENUMERATION_BUDGETS` and wire the resolver. The default should be generous enough that well-formed games never approach it (e.g., 500,000).

### 3. Wire the bound into the enumeration loop

In `legal-moves.ts`, increment a total-expansion counter at each expansion step and check against the new budget. When exhausted, stop enumeration and set a `totalBudgetExceeded` flag. Return whatever moves have been discovered so far.

### 4. Add `enumerationBudgetExhausted` stop reason

In the simulator, if `enumerateLegalMoves` returns zero moves due to budget exhaustion, stop the game with a new `'enumerationBudgetExhausted'` stop reason. If some moves were found, continue normally — the budget truncation is transparent.

## Files to Touch

- `packages/engine/src/kernel/move-enumeration-budgets.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/simulator.ts` (modify — new stop reason)
- `packages/engine/src/kernel/types-core.ts` (modify — if stop reason type needs updating)
- `packages/engine/test/unit/move-enumeration-budgets.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves-enumeration-budget.test.ts` (new)

## Out of Scope

- Zone filter probe `MISSING_VAR` fix (ticket 001)
- Agent template completion fallback (ticket 003)
- FITL-specific data fixes (ticket 004)
- Changing existing budget field defaults

## Acceptance Criteria

### Tests That Must Pass

1. Unit: `MoveEnumerationBudgets` interface includes `maxTotalExpansions` with default
2. Unit: enumeration with `maxTotalExpansions = 10` halts and returns partial results
3. Unit: budget-exhausted enumeration with zero moves produces `enumerationBudgetExhausted` stop reason
4. Existing suite: `pnpm turbo test`

### Invariants

1. Callers of `enumerateLegalMoves` that don't opt into budget-aware behavior see no change (transparent)
2. Default budget is generous enough that well-formed games never trigger it
3. Determinism preserved — same seed + same budget = same result
4. All iteration remains bounded (Foundation 10)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves-enumeration-budget.test.ts` — new file testing budget exhaustion behavior
2. `packages/engine/test/unit/move-enumeration-budgets.test.ts` — extend with new field validation

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "enumeration-budget"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "move-enumeration-budgets"`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
