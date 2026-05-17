# 180STDVECOBSROL-005: Phase 4 - Standing role primitives

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes - policy surface/expression/compiler.
**Deps**: `tickets/180STDVECOBSROL-003.md`

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
