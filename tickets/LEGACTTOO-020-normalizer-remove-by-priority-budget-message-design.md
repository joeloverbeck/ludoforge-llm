# LEGACTTOO-020: Replace Synthetic Budget SetMessage with Removal Metadata

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-normalizer.ts`, `packages/engine/src/kernel/tooltip-ir.ts`
**Deps**: `archive/tickets/LEGACTTOO/LEGACTTOO-005-compound-normalizer-control-flow-macros-stages.md`

## Problem

`normalizeRemoveByPriority` emits a synthetic `SetMessage` with `target: 'budget'` (a magic string) to represent the removal budget. This has two issues:

1. **Magic string**: `'budget'` is not a real variable name from the game state — it's an internal concept. Downstream consumers (content planner, template realizer) must know to handle it specially.
2. **Wrong message kind**: A budget is an attribute of the removal operation, not a separate "set variable" action. Using `SetMessage` overloads its semantics.

## Assumption Reassessment (2026-03-06)

1. `removeByPriority` AST shape confirmed: `{ budget: NumericValueExpr, groups: [...], in?: EffectAST[] }`.
2. `RemoveMessage` currently has fields: `tokenFilter`, `fromZone`, `destination`, `filter?`. No budget/count field.
3. `SetMessage` is used for real variable assignments elsewhere. The synthetic budget usage creates ambiguity.
4. LEGACTTOO-006 (content planner) and LEGACTTOO-007 (template realizer) will consume these messages — cleaner IR now prevents downstream hacks.

## Architecture Check

1. Folding budget into `RemoveMessage` as metadata keeps the IR faithful: one semantic action = one message. Adding a separate `BudgetMessage` kind would bloat the IR for a single use case.
2. No game-specific logic — budget is a generic `removeByPriority` concept.
3. No backwards compatibility — the synthetic `SetMessage` with `'budget'` target is removed entirely.

## What to Change

### 1. Extend `RemoveMessage` in `tooltip-ir.ts`

Add optional `budget?: string` field to `RemoveMessage` to carry the budget expression.

### 2. Update `normalizeRemoveByPriority`

Instead of emitting a separate `SetMessage` for budget, include `budget: budgetStr` in the `RemoveMessage`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `budget?` to `RemoveMessage`)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — update `normalizeRemoveByPriority`)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — update `removeByPriority` test assertions)

## Out of Scope

- Multi-group removal expansion (LEGACTTOO-018)
- Template realization of budget (LEGACTTOO-007)

## Acceptance Criteria

### Tests That Must Pass

1. `removeByPriority` emits `RemoveMessage` with `budget` field instead of separate `SetMessage`
2. No `SetMessage` with `target: 'budget'` appears in any normalizer output
3. Existing suite: `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`

### Invariants

1. `SetMessage.target` only contains real variable/marker names, never synthetic internal concepts
2. `RemoveMessage.budget` is only present when the removal has a budget constraint

## Test Plan

### New/Modified Tests

1. `tooltip-normalizer.test.ts` — update `removeByPriority` test to assert `RemoveMessage` contains `budget` field
2. `tooltip-normalizer.test.ts` — add negative test: no `SetMessage` with `target: 'budget'` in output

### Commands

1. `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`
2. `pnpm turbo build && pnpm turbo test`
