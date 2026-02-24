# FITLSEC3RULGAP-001: Patrol Multi-Hop Cube Sourcing (US/ARVN)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

`patrol-us-profile` and `patrol-arvn-profile` currently source cubes only with `tokensInAdjacentZones`, which blocks Rule 3.2.2 multi-hop Patrol movement through clear LoC/City chains.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` currently wires Patrol `move-cubes` selection via `tokensInAdjacentZones` for both US and ARVN.
2. Existing structure tests in `packages/engine/test/integration/fitl-coin-operations.test.ts` explicitly assert adjacent-only sourcing.
3. `packages/engine/test/integration/fitl-patrol-sweep-movement.test.ts` does not compile or execute the production FITL patrol profiles; it validates lower-level kernel effects with synthetic fixtures.
4. No current production FITL test verifies 2+ hop Patrol sourcing through clear LoC/City chains, adjacent enemy-occupied 1-hop sourcing, and intermediate-chain blocking in the same compiled patrol flow.

## Architecture Check

1. This is a GameSpecDoc data correction; no engine/kernel behavior should be specialized for FITL.
2. Patrol sourcing should remain expressed in generic DSL queries/filters, with no fitl-only query primitives.
3. Prefer a single-source selection query (`tokensInMapSpaces` + `spaceFilter.condition`) over ad hoc query unions/aliases, because this is cleaner, deterministic, and avoids duplicate option inflation.
4. No compatibility shim should be introduced in kernel/compiler layers.

## What to Change

### 1. Update Patrol move-cubes sourcing

For both `patrol-us-profile` and `patrol-arvn-profile`:

1. Replace adjacent-only sourcing with one generic cube-source query that allows either:
   - direct adjacency to target LoC (`op: adjacent`) OR
   - multi-hop connectivity to target LoC (`op: connected`) through LoC/City-only intermediate zones with no NVA/VC.
2. Keep direct adjacency legal even if the adjacent source contains NVA/VC (1-hop Patrol entry-and-stop behavior).
3. Ensure multi-hop traversal never crosses an intermediate LoC/City containing NVA/VC.
4. Keep move execution generic: cubes still move from current `tokenZone` to selected target LoC in one resolution step.

### 2. Add/adjust tests for Patrol sourcing semantics

1. Replace adjacent-only structural assertions with assertions that Patrol sourcing uses the combined adjacency-or-connected space condition.
2. Add production-profile runtime integration coverage for:
   - 2+ hop clear chain is legal.
   - adjacent enemy-occupied source still legal for 1-hop move.
   - chain traversal blocked by NVA/VC in intermediate zone.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-patrol-multi-hop.test.ts` (new)

## Out of Scope

- Any kernel/compiler/query-evaluator source code changes.
- Sweep/Assault/Rally/March/Attack/Terror affordability changes.
- Turn-flow, phase ordering, or action applicability changes.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-coin-operations.test.ts`
   - Patrol profile structure compiles.
   - Patrol move-cubes is asserted as adjacency-or-connected sourcing (not adjacent-only).
2. Patrol runtime integration test(s) validate:
   - US 2+ hop clear-chain Patrol sourcing works.
   - ARVN 2+ hop clear-chain Patrol sourcing works.
   - Adjacent enemy-occupied source remains selectable for 1-hop Patrol.
   - Multi-hop traversal does not pass through enemy-occupied intermediate LoC/City.
3. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
4. `pnpm -F @ludoforge/engine test -- fitl-patrol-multi-hop.test.ts`
5. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Patrol LimOp destination cap remains `max: 1`.
3. Patrol free-assault stage semantics remain unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` — update Patrol structural assertions.
2. `packages/engine/test/integration/fitl-patrol-multi-hop.test.ts` — add production Patrol multi-hop behavior scenarios.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-patrol-multi-hop.test.ts`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-24
- Actual changes:
  - Updated Patrol `move-cubes` sourcing in `30-rules-actions.md` for US/ARVN from adjacent-only to a generic adjacency-or-connected map-space source query with clear-chain gating through LoC/City intermediates.
  - Updated Patrol structure assertions in `fitl-coin-operations.test.ts` to validate adjacency-or-connected sourcing.
  - Added `fitl-patrol-multi-hop.test.ts` with production-profile runtime coverage for US/ARVN multi-hop sourcing, adjacent enemy-occupied 1-hop sourcing, and blocked intermediate-chain behavior.
- Deviations from original plan:
  - Used one `tokensInMapSpaces` query with `spaceFilter` (`adjacent OR connected`) instead of combining multiple token-source queries; this avoided aliasing/combinator ambiguity and kept selection deterministic.
  - `pnpm -F @ludoforge/engine test -- <file>` currently executes the full engine unit+integration suite due script wiring; verification was still completed successfully.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed (269/269).
  - `pnpm turbo lint` passed.
