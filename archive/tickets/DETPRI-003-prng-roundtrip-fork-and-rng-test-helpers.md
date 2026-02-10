# DETPRI-003 - PRNG Round-Trip, Fork, and RNG Determinism Helpers

**Status**: ✅ COMPLETED

## Goal
Implement PRNG state persistence (`serialize`/`deserialize`), stream splitting (`fork`), and reusable determinism helper assertions for RNG behavior.

## Reassessed Baseline (Current Code/Test State)
- `src/kernel/prng.ts` already implements `createRng`, `stepRng`, and `nextInt` for `pcg-dxsm-128`.
- `test/unit/prng-core.test.ts`, `test/unit/prng-nextint.test.ts`, and `test/unit/property/prng-nextint.property.test.ts` already cover core sequence determinism, immutability of stepping, `nextInt` bounds behavior, and rough distribution checks.
- `serialize(rng)`, `deserialize(state)`, `fork(rng)`, and RNG determinism helper assertions are not implemented yet.
- `src/kernel/index.ts` already re-exports `./prng.js`; new APIs should be exported through existing module exports without changing public contract shape.

## Scope
- Add `serialize(rng)` and `deserialize(state)` in the PRNG module with explicit algorithm/version/state validation.
- Add `fork(rng)` that deterministically derives two child streams without mutating the parent RNG.
- Add helper assertions `assertDeterministic` and `assertRngRoundTrip` in a new determinism helper module.
- Add focused unit tests only for the new capabilities (no rewrite of existing PRNG tests).

## File List Expected To Touch
- `src/kernel/prng.ts`
- `src/kernel/determinism.ts`
- `src/kernel/index.ts`
- `test/unit/prng-roundtrip-fork.test.ts`
- `test/unit/determinism-rng-helpers.test.ts`

## Implementation Notes
- Deserialization must reject unsupported algorithm/version combinations.
- `fork` must not mutate parent state and must derive children deterministically.
- Helper assertions should provide readable failure messages for mismatch positions.

## Out Of Scope
- Zobrist table generation or hash update logic.
- `assertStateRoundTrip` for full `GameState` objects.
- Integration-level full game-loop determinism tests.
- ESLint or forbidden API static checks.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/prng-roundtrip-fork.test.ts`:
  - serialize/deserialize round-trip preserves future generated sequence.
  - deserializing invalid `algorithm`/`version` throws.
  - forked streams diverge from each other and parent continuation.
- `test/unit/determinism-rng-helpers.test.ts`:
  - `assertDeterministic` passes for stable RNG-driven function.
  - `assertDeterministic` fails for intentionally unstable compare target.
  - `assertRngRoundTrip` passes on representative step counts.

### Invariants That Must Remain True
- `deserialize(serialize(rng))` preserves behavior exactly.
- `fork` must be deterministic given identical parent state.
- Parent RNG remains unchanged by `serialize` and `fork`.
- No floating-point operations introduced in PRNG pipeline.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `serialize`, `deserialize`, and `fork` to `src/kernel/prng.ts` with explicit contract validation and non-mutating behavior.
  - Added `assertDeterministic` and `assertRngRoundTrip` to new `src/kernel/determinism.ts`.
  - Re-exported determinism helpers via `src/kernel/index.ts`.
  - Added targeted unit coverage in `test/unit/prng-roundtrip-fork.test.ts` and `test/unit/determinism-rng-helpers.test.ts`.
- **Deviation from original plan**:
  - Kept existing PRNG tests (`prng-core`, `prng-nextint`, property tests) unchanged and added only delta tests for new APIs.
  - No schema/type shape changes were required because current `RngState` already matched Spec 03 constraints for algorithm/version.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed (unit + integration).
