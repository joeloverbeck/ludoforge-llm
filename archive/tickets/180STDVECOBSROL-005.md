# 180STDVECOBSROL-005: Phase 4 - Standing role primitives

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes - policy surface/expression/compiler.
**Deps**: `archive/tickets/180STDVECOBSROL-003.md`

## Problem

Opponent-aware authoring currently requires low-level `seatAgg(over: opponents, aggOp: max/min)` formulations that can invert under different terminal ranking orders. Spec 180 needs generic role selectors so authors can name `currentLeader`, `nearestThreat`, `closestAhead`, and `closestBehind` directly.

## Assumption Reassessment (2026-05-17)

1. Terminal ranking and tie-break order already exist in GameDef and can resolve roles generically.
2. Role semantics must work for both ascending and descending ranking orders.
3. Role resolution should compose with `seatAgg.availability`, especially `selfAndTargetReady`.

## Architecture Check

1. Roles derive only from terminal ranking/margins, not game-specific seat names.
2. Resolution is deterministic through the existing ranking tie-break chain.
3. No duplicate standing aggregation operator is added.

## What to Change

### 1. Add role tokens

Support `currentLeader`, `nearestThreat`, `closestAhead`, and `closestBehind` as seat selectors where Spec 180 defines them.

### 2. Support role use in refs and seatAgg

Support ref form when selected by implementation (`victory.currentMargin.role:currentLeader` or equivalent) and `seatAgg.over: { role: nearestThreat }`.

### 3. Validate and trace unresolved roles

Compiler/validator must reject unknown roles. Runtime must propagate unresolved role status through the chosen availability mode.

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` and `validate-agents.ts` (modify if authored syntax changes)
- schema sources/artifacts if authored syntax changes
- focused tests under `packages/engine/test/architecture/` and `packages/engine/test/unit/cnl/`

## Out of Scope

- Evolution-library profile migration.
- `allies` / `teams` semantics.
- Inner-preview opponent option refs.

## Acceptance Criteria

### Tests That Must Pass

1. Generic four-seat fixture proves all roles under `ranking.order: asc`.
2. Generic four-seat fixture proves all roles under `ranking.order: desc`.
3. Unresolved roles propagate as unavailable under status-aware availability.
4. Compiler rejects unknown roles.

### Invariants

1. Role resolution is deterministic.
2. Role resolution does not inspect hidden state outside the observer view used by the preview/current surface.

## Test Plan

### New/Modified Tests

1. Role primitive architecture tests for asc/desc fixtures.
2. Compiler validation tests for accepted/rejected role tokens.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled role tests.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-17

Phase 4 is implemented. The engine now recognizes the closed standing-role set
`currentLeader`, `nearestThreat`, `closestAhead`, and `closestBehind` through
both direct refs such as `victory.currentMargin.role:currentLeader` and
`seatAgg.over: { role: 'nearestThreat' }`.

Implementation landed in the shared policy contracts, policy expression
analysis, CNL role/ref validation, runtime surface resolution, and seat
aggregate evaluation. Role selection derives from terminal margin ranking,
honors both ascending and descending ranking order, and returns unresolved
instead of inventing a value when no adjacent seat exists. `seatAgg` role
resolution composes with the existing availability path, including
`selfAndTargetReady`.

Generated schema artifacts were refreshed for the new `seatAgg.over` object
form. No new compiled policy expression variant was added.

Post-review correction: role target selection is now gated by public standing
visibility before it can resolve `role:` selectors. This prevents hidden current
standing from leaking through `seatAgg.over: { role: ... }` with non-standing
inner expressions.

### Files Changed

- `packages/engine/src/contracts/policy-contract.ts`
- `packages/engine/src/agents/policy-standing-roles.ts`
- `packages/engine/src/agents/policy-surface.ts`
- `packages/engine/src/agents/policy-evaluation-core.ts`
- `packages/engine/src/agents/policy-runtime.ts`
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-expr.ts`
- `packages/engine/src/cnl/compile-agents.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/schemas/GameDef.schema.json`
- `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts`
- `packages/engine/test/architecture/preview-standing/spec-180-standing-role-primitives.test.ts`
- `packages/engine/test/unit/agents/policy-standing-role-expr.test.ts`
- `packages/engine/test/unit/cnl/standing-role-authoring.test.ts`
- `packages/engine/test/unit/schemas-standing-role.test.ts`

### Source-Size Ledger

- Existing over-cap source hubs were kept compact: `policy-expr.ts` 1767 -> 1767,
  `compile-agents.ts` 4720 -> 4720, `types-core.ts` 2376 -> 2376,
  `schemas-core.ts` 2799 -> 2799, `policy-evaluation-core.ts` 2280 -> 2285,
  `policy-runtime.ts` 812 -> 816, and `policy-preview.ts` 1363 -> 1367.
- `policy-surface.ts` grew 562 -> 596 and remains below the 600-line soft cap.
- New focused files are small: `policy-standing-roles.ts` 9 lines,
  `spec-180-standing-role-primitives.test.ts` 74 lines,
  `policy-standing-role-expr.test.ts` 64 lines,
  `standing-role-authoring.test.ts` 148 lines, and
  `schemas-standing-role.test.ts` 164 lines.

### Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-standing/spec-180-standing-role-primitives.test.js dist/test/unit/agents/policy-standing-role-expr.test.js dist/test/unit/cnl/standing-role-authoring.test.js dist/test/unit/schemas-standing-role.test.js`
- `pnpm -F @ludoforge/engine test` (92/92 files passed)
- `pnpm run check:ticket-deps`
- `git diff --check`

### Follow-Up

Phase 5 is archived at `archive/tickets/180STDVECOBSROL-006.md`: FITL ARVN
role-based witness and cookbook/FOUNDATIONS addendum.
