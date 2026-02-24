# FITLSEC3RULGAP-001: Patrol Multi-Hop Cube Sourcing (US/ARVN)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

`patrol-us-profile` and `patrol-arvn-profile` currently source cubes only with `tokensInAdjacentZones`, which blocks Rule 3.2.2 multi-hop Patrol movement through clear LoC/City chains.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` currently wires Patrol `move-cubes` selection via `tokensInAdjacentZones` for both US and ARVN.
2. Existing structure tests in `packages/engine/test/integration/fitl-coin-operations.test.ts` explicitly assert adjacent-only sourcing.
3. No current production FITL test verifies 2+ hop Patrol sourcing through clear LoC/City chains.

## Architecture Check

1. This is a GameSpecDoc data correction; no engine/kernel behavior should be specialized for FITL.
2. Patrol sourcing remains expressed in generic DSL queries/filters.
3. No compatibility shim should be introduced in kernel/compiler layers.

## What to Change

### 1. Update Patrol move-cubes sourcing

For both `patrol-us-profile` and `patrol-arvn-profile`:

1. Preserve direct adjacency sourcing (to allow 1-hop entry even when adjacent space contains NVA/VC).
2. Add multi-hop reachable sourcing through LoC/City-only chains that are clear of NVA/VC.
3. Ensure sourced cubes can still be moved from their originating zone to target LoC in one Patrol resolution step.

### 2. Add/adjust tests for Patrol sourcing semantics

1. Replace adjacent-only structural assertion with assertions that both direct-adjacent and multi-hop sources are represented.
2. Add runtime integration coverage for:
   - 2+ hop clear chain is legal.
   - adjacent enemy-occupied source still legal for 1-hop move.
   - chain traversal blocked by NVA/VC in intermediate zone.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-patrol-sweep-movement.test.ts` (modify) or `packages/engine/test/integration/fitl-patrol-multi-hop.test.ts` (new)

## Out of Scope

- Any kernel/compiler/query-evaluator source code changes.
- Sweep/Assault/Rally/March/Attack/Terror affordability changes.
- Turn-flow, phase ordering, or action applicability changes.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-coin-operations.test.ts`
   - Patrol profile structure compiles.
   - Patrol move-cubes is no longer asserted as adjacent-only.
2. Patrol runtime integration test(s) validate:
   - US 2+ hop clear-chain Patrol sourcing works.
   - ARVN 2+ hop clear-chain Patrol sourcing works.
   - Adjacent enemy-occupied source remains selectable for 1-hop Patrol.
   - Multi-hop traversal does not pass through enemy-occupied intermediate LoC/City.
3. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
4. `pnpm -F @ludoforge/engine test -- fitl-patrol-sweep-movement.test.ts`
5. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Patrol LimOp destination cap remains `max: 1`.
3. Patrol free-assault stage semantics remain unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` — update Patrol structural assertions.
2. `packages/engine/test/integration/fitl-patrol-sweep-movement.test.ts` (or new Patrol-specific integration file) — add multi-hop behavior scenarios.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-patrol-sweep-movement.test.ts`
4. `pnpm -F @ludoforge/engine test`
