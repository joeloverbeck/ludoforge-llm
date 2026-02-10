# DETPRI-001 - PRNG Core Algorithm and State Contract

**Status**: Planned

## Goal
Implement the deterministic PRNG core (MVP algorithm freeze: `pcg-dxsm-128`) with immutable state transitions and a stable state contract used by later deterministic primitives work.

## Scope
- Add PRNG types and core constructor/step implementation.
- Persist algorithm/version metadata in the serialized state shape.
- Add deterministic golden-vector tests that pin first outputs for seed `42n`.

## File List Expected To Touch
- `src/kernel/prng.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/prng-core.test.ts`

## Implementation Notes
- Freeze MVP algorithm to `pcg-dxsm-128`.
- Use integer-only BigInt arithmetic for state transitions and output generation.
- Keep state immutable: each step returns a new RNG object/state.
- Add explicit constants and bit-masking helpers for 64-bit/128-bit operations.

## Out Of Scope
- `nextInt(rng, min, max)` range reduction and validation.
- PRNG `fork`, `serialize`, `deserialize` behavior tests beyond state shape contract.
- Zobrist table/key/hash logic.
- Integration and property tests.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/prng-core.test.ts`:
  - seed `42n` produces the expected first 10 raw deterministic outputs (golden vector).
  - seed `42n` and seed `43n` produce different first 10 outputs.
  - each step returns a new state object (no in-place mutation).
- Existing `test/unit/smoke.test.ts` remains passing.

### Invariants That Must Remain True
- Serialized PRNG state includes `algorithm` and `version` fields.
- No floating-point arithmetic is used in PRNG core stepping.
- No forbidden randomness APIs (`Math.random`) are called.
- Same seed always yields the same step sequence.
