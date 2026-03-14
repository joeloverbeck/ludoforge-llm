# 62CONPIESOU-007: Unit tests for tier-aware `chooseN` legality

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test files only
**Deps**: archive/tickets/62CONPIESOU-005.md, archive/specs/62b-incremental-choice-protocol.md

## Status Note

This ticket's original scope assumed the pre-62b array-based `chooseN` architecture.

After [Spec 62b](/home/joeloverbeck/projects/ludoforge-llm/archive/specs/62b-incremental-choice-protocol.md), the highest-value unit coverage is no longer just "final array admissibility" plus simulated dynamic re-evaluation. The real target is the new engine-owned incremental selection protocol and its transition semantics.

Keep this ticket only as a reminder of the behavior that needs coverage. The eventual test ticket should be rewritten against Spec 62b's command-based `chooseN` flow.

## Problem

The tier-aware legality behavior in `chooseN` is the most complex part of this spec. It requires thorough unit testing with both `qualifierKey` and non-qualifierKey modes, plus dynamic re-evaluation during multi-select.

## Assumption Reassessment (2026-03-14)

1. Legal-choices tests are in `packages/engine/test/unit/kernel/legal-choices.test.ts`. Confirmed.
2. Legal-choices executor tests are in `packages/engine/test/unit/kernel/legal-choices-executor.test.ts`. Confirmed.
3. Tests create synthetic GameDef/GameState fixtures with minimal setups. Engine test convention.

## Architecture Check

1. Tests should use synthetic fixtures with generic property names (e.g., `qualifierKey: 'color'` not `qualifierKey: 'type'` in FITL context).
2. Tests must cover the exact scenarios from the spec's "Unit Tests — Legality" section.
3. Dynamic re-evaluation tests simulate incremental selection steps.

## What to Change

### 1. Add tier-aware legality tests (with qualifierKey)

In `packages/engine/test/unit/kernel/legal-choices.test.ts`:

**Required test cases (from spec)**:
- Tier-2 item with qualifier Q is illegal while tier-1 item with qualifier Q is unselected
- Tier-2 item with qualifier Q becomes legal once all tier-1 items with qualifier Q are selected
- Tier-2 item with qualifier R is legal even if tier-1 items with qualifier Q remain (qualifier independence)
- Partial fulfillment across tiers works correctly
- Dynamic re-evaluation after each selection step

### 2. Add tier-aware legality tests (without qualifierKey)

**Required test cases (from spec)**:
- Tier-2 items are illegal while any tier-1 item is unselected
- Tier-2 items become legal once all tier-1 items are selected

### 3. Add edge case tests

- 3-tier query: tier-3 items illegal while tier-2 has items, even if tier-1 is exhausted
- `chooseN` with `min` < available tier-1 items: player can select fewer than tier-1 count without unlocking tier-2
- All tiers empty: `chooseN` produces no legal options
- Single tier: behaves like non-prioritized `chooseN`
- `qualifierKey` references a property not on all tokens: tokens without the property are treated as having a distinct qualifier (or null qualifier)

### 4. Add move validation tests

- A selection that picks a tier-2 item while a same-qualifier tier-1 item was available is rejected
- A valid selection mixing tier-1 and tier-2 items (different qualifiers) is accepted

## Files to Touch

- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices-executor.test.ts` (modify — if move validation tests go here)

## Out of Scope

- evalQuery tests (ticket 006)
- Integration tests (ticket 009)
- Card 87 (ticket 008)
- Any source file changes
- Performance benchmarks for combination enumeration

## Acceptance Criteria

### Tests That Must Pass

1. All 5 spec-required qualifierKey legality tests pass
2. All 2 spec-required non-qualifierKey legality tests pass
3. All edge case tests pass
4. Move validation tests pass
5. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. All test fixtures are synthetic — no FITL-specific identifiers
2. Legal choice generation and move application agree on admissibility (tested explicitly)
3. Tests are deterministic
4. Tests use `node --test` runner convention

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — tier-aware legality suite
2. `packages/engine/test/unit/kernel/legal-choices-executor.test.ts` — move validation suite

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
