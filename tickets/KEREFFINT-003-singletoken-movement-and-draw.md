# KEREFFINT-003 - Single-Token Movement (`moveToken`) and `draw`

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement deterministic single-token movement semantics and draw behavior, including strict location validation and random insertion support through PRNG threading.

## Scope
- Implement `moveToken` handler with:
  - bound token resolution
  - `from`/`to` zone resolution
  - source membership validation
  - top/bottom/random insertion behavior
- Implement `draw` handler with integer/non-negative count validation and bounded moves from zone front.
- Ensure token-not-found and multi-zone-presence conditions throw deterministic runtime errors.
- Ensure RNG advances only for `moveToken.position = "random"` and only when random placement is required.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-token-move-draw.test.ts` (new)

## Out Of Scope
- Bulk movement (`moveAll`) and shuffle.
- Token creation/destruction.
- Control flow, variable operations, and choice assertions.
- Spatial movement implementation (`moveTokenAdjacent` remains stub-only in this phase).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-token-move-draw.test.ts`
  - `moveToken` to `top` inserts at destination index `0`.
  - `moveToken` to `bottom` appends at destination end.
  - `moveToken` with `random` uses deterministic PRNG index for known seed.
  - `moveToken` decrements source count and increments destination count by exactly one.
  - `moveToken` throws if token is not in resolved `from` zone.
  - `moveToken` throws if token appears in multiple zones.
  - `draw` with valid count moves `min(count, sourceSize)` tokens.
  - `draw` from empty source is no-op.
  - `draw` throws on negative or non-integer count.
- `test/unit/effects-runtime.test.ts` remains green.

## Invariants That Must Remain True
- Total token count across all zones is conserved after successful `moveToken`/`draw`.
- Token ordering for non-moved tokens remains unchanged.
- RNG state changes only when randomness is actually used.

