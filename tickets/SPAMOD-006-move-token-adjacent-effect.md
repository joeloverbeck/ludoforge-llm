# SPAMOD-006 - `moveTokenAdjacent` Effect Runtime and Diagnostics

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-002`, `SPAMOD-003`

## Goal
Replace the spatial stub for `moveTokenAdjacent` with concrete destination resolution and adjacency-validated movement behavior.

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

