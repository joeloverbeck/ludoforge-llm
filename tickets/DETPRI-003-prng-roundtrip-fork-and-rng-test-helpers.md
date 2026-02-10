# DETPRI-003 - PRNG Round-Trip, Fork, and RNG Determinism Helpers

**Status**: Planned

## Goal
Implement PRNG state persistence (`serialize`/`deserialize`), stream splitting (`fork`), and reusable determinism helper assertions for RNG behavior.

## Scope
- Add `serialize(rng)` and `deserialize(state)` with version/algorithm checks.
- Add `fork(rng)` that creates two deterministic but independent streams.
- Add helper assertions `assertDeterministic` and `assertRngRoundTrip`.

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
