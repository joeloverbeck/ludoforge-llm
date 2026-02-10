# SPAMOD-006 - `moveTokenAdjacent` Effect Runtime and Diagnostics

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-002`, `SPAMOD-003`

## Goal
Replace the spatial stub for `moveTokenAdjacent` with concrete destination resolution and adjacency-validated movement behavior.

## Reassessed Assumptions
- `moveTokenAdjacent` is currently a hard stub in `src/kernel/effects.ts` that throws `SpatialNotImplementedError`.
- Existing single-token move semantics (token occurrence checks, conservation, RNG behavior, and event emission) already exist in `applyMoveToken` and should be reused rather than duplicated.
- Current token selection runtime for movement effects expects a bound token selector (`$` binding key) and should remain unchanged in this ticket.
- `EffectContext` already carries `adjacencyGraph`; no graph threading changes are required for this ticket.
- Existing unit tests in `test/unit/effects-runtime.test.ts` and `test/unit/effects-zone-ops.test.ts` currently encode stub behavior and must be updated.

## Scope
- Implement `moveTokenAdjacent` in `effects.ts`:
  - require `direction` (destination source)
  - resolve destination from:
    - concrete zone ID string
    - `$`-prefixed binding/move param value
  - validate destination adjacency against normalized graph
  - reuse single-token movement semantics from `moveToken`
  - emit `tokenEntered` event on success
- Add explicit runtime errors for:
  - missing destination (`SPATIAL_DESTINATION_REQUIRED`)
  - non-adjacent destination (`SPATIAL_DESTINATION_NOT_ADJACENT`)
- Update tests that currently assert `SpatialNotImplementedError`.
- Keep the current public `EffectAST` shape (`direction?: string`) and enforce destination presence at runtime.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-runtime.test.ts`
- `test/unit/effects-zone-ops.test.ts`
- `test/unit/spatial-effects.test.ts` (new)

## Out Of Scope
- BFS/query/condition traversal semantics.
- Graph construction and validation.
- Trigger-dispatch algorithm changes beyond consuming emitted `tokenEntered`.
- CNL macro/compiler work.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/spatial-effects.test.ts`
  - adjacent move succeeds and token is relocated correctly.
  - non-adjacent destination fails with explicit spatial runtime error.
  - missing `direction` fails with explicit spatial runtime error.
  - `$` binding destination resolves correctly from move params/bindings.
  - successful move emits `{ type: 'tokenEntered', zone: <destination> }`.
- `test/unit/effects-runtime.test.ts`
  - no longer expects `SpatialNotImplementedError` for `moveTokenAdjacent`.
- `npm test`

## Invariants That Must Remain True
- Token count is conserved across all zones by `moveTokenAdjacent`.
- Exactly one token moves per successful invocation.
- RNG state is unchanged by `moveTokenAdjacent`.

## Outcome
- Completion date: 2026-02-10
- Implemented `moveTokenAdjacent` runtime in `src/kernel/effects.ts`:
  - `direction` is now enforced at runtime with `SPATIAL_DESTINATION_REQUIRED`.
  - `$` destination binding resolution now reads from merged move params + bindings.
  - adjacency validation now throws `SPATIAL_DESTINATION_NOT_ADJACENT` when destination is not a normalized neighbor.
  - successful adjacent moves delegate to existing `moveToken` semantics, preserving single-token move behavior and `tokenEntered` emission parity.
- Added spatial runtime error codes to `src/kernel/effect-error.ts`:
  - `SPATIAL_DESTINATION_REQUIRED`
  - `SPATIAL_DESTINATION_NOT_ADJACENT`
- Updated legacy tests that previously asserted `SpatialNotImplementedError`.
- Added `test/unit/spatial-effects.test.ts` to cover adjacent success, non-adjacent failure, missing direction failure, `$` destination binding resolution, event emission, token conservation, and RNG invariance.
- Deviation from original plan: retained `EffectAST.moveTokenAdjacent.direction?: string` as-is and enforced destination presence at runtime (no schema/API breaking change).
- Verification: `npm run build` and `npm test` both pass.
