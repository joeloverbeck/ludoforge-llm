# 62BINCCHOPRO-002: Create shared tier-admissibility helper

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module + unit tests
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, archive/tickets/62CONPIESOU-004.md

## Problem

Tier-admissibility logic for `prioritized` queries must be shared between discovery-time legality (`legal-choices.ts`) and apply-time validation (`effects-choice.ts`). Without a shared helper, these two sites will inevitably drift, causing the engine to advertise options it later rejects (or vice versa). This is the building block identified by ticket 62CONPIESOU-005's architecture analysis.

## Assumption Reassessment (2026-03-14)

1. The `prioritized` query AST exists (landed by archived ticket 62CONPIESOU-001). It has `tiers: PrioritizedTier[]` and optional `qualifierKey`. Confirmed.
2. `evalQuery` handles `prioritized` queries (landed by archived ticket 62CONPIESOU-004). It flattens tiers into a single result set. Confirmed.
3. No shared tier-admissibility helper exists today. `effects-choice.ts` and `legal-choices.ts` each have their own validation logic with no tier awareness. Confirmed.
4. The `PrioritizedTier` type is defined in the kernel types. Confirmed.

## Architecture Check

1. The helper is a pure function — no side effects, no state mutation, no GameState modification.
2. It derives admissibility from the `prioritized` AST tiers and already-selected items. It does NOT attach metadata to `evalQuery` results.
3. With `qualifierKey`: a lower-tier item is inadmissible while an unselected higher-tier item sharing the same qualifier value remains available.
4. Without `qualifierKey`: a lower-tier item is inadmissible while any unselected higher-tier item remains available.
5. The helper is game-agnostic — it operates on generic `MoveParamScalar[]` values and authored tier definitions.

## What to Change

### 1. Create `prioritized-tier-legality.ts`

New file at `packages/engine/src/kernel/prioritized-tier-legality.ts`.

Exports a pure function:

```ts
function computeTierAdmissibility(
  tiers: readonly PrioritizedTier[],
  alreadySelected: readonly MoveParamScalar[],
  qualifierKey?: string,
): { admissibleValues: readonly MoveParamScalar[]; tierIndex: number };
```

The function:
- Evaluates each tier in order (highest priority first)
- Determines which items in each tier are still available (not in `alreadySelected`)
- Returns the set of values that are admissible for the next selection step
- Returns the `tierIndex` of the currently active tier (for diagnostics/testing)

### 2. Add comprehensive unit tests

Test file at `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts`.

## Files to Touch

- `packages/engine/src/kernel/prioritized-tier-legality.ts` (new)
- `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts` (new)

## Out of Scope

- Wiring the helper into `effects-choice.ts` or `legal-choices.ts` (ticket 62BINCCHOPRO-003)
- The `advanceChooseN` function (ticket 62BINCCHOPRO-004)
- `evalQuery` changes — it remains a pure flattening evaluator
- Any hidden tier metadata on query results
- Runner changes
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)

## Acceptance Criteria

### Tests That Must Pass

1. With `qualifierKey`: lower-tier item with qualifier `Q` is inadmissible while higher-tier item with qualifier `Q` remains unselected
2. With `qualifierKey`: lower-tier item with qualifier `Q` becomes admissible once all higher-tier items with qualifier `Q` are in `alreadySelected`
3. With `qualifierKey`: items with different qualifiers are independent — exhausting qualifier `A` in tier 1 does not affect qualifier `B` admissibility
4. Without `qualifierKey`: lower-tier items are inadmissible while any higher-tier item remains unselected
5. Without `qualifierKey`: lower-tier items become admissible once all higher-tier items are exhausted
6. Empty `alreadySelected` returns all items from the highest-priority tier
7. All items selected returns empty admissible set
8. Single-tier case: all items are always admissible (no lower-tier restriction)
9. `pnpm turbo build` succeeds
10. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions

### Invariants

1. The helper is a pure function — same inputs always produce same outputs
2. No FITL-specific identifiers appear in the helper or its tests
3. `evalQuery` is not modified — the helper operates independently
4. No tier metadata is attached to query results

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts` — all acceptance criteria scenarios above

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
