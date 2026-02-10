# DETPRI-002 - Unbiased `nextInt` Range Generation

**Status**: Planned

## Goal
Implement `nextInt(rng, min, max)` with strict input validation and modulo-bias-free integer generation for inclusive closed ranges.

## Scope
- Add `nextInt` input guards and error handling.
- Implement unbiased range sampling (rejection sampling or Lemire-style reduction).
- Add unit/property tests for bounds correctness and rough uniformity.

## File List Expected To Touch
- `src/kernel/prng.ts`
- `src/kernel/index.ts`
- `test/unit/prng-nextint.test.ts`
- `test/unit/property/prng-nextint.property.test.ts`

## Implementation Notes
- Validate and throw `RangeError` for:
  - `min > max`
  - non-safe-integer bounds
  - overflowed range (`max - min + 1 > Number.MAX_SAFE_INTEGER`)
- Return tuple `[value, nextRng]` with `value` always in `[min, max]`.
- Convert to `number` only after unbiased range reduction is complete.

## Out Of Scope
- Changing the underlying PRNG algorithm.
- PRNG `fork`/`serialize`/`deserialize` logic.
- Any Zobrist hashing behavior.
- Determinism lint/guardrail utilities.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/prng-nextint.test.ts`:
  - `nextInt(rng, 0, 0)` always returns `0`.
  - `nextInt(rng, 5, 5)` always returns `5`.
  - `nextInt(rng, 0, 1)` returns both `0` and `1` over repeated calls.
  - invalid inputs throw `RangeError` for all specified guard cases.
- `test/unit/property/prng-nextint.property.test.ts`:
  - for seeded table-driven `(min, max)` pairs, output is always within `[min, max]`.
  - for `nextInt(rng, 0, 9)` over 1000 draws, each bucket count is >= 50.

### Invariants That Must Remain True
- `nextInt` remains inclusive on both ends of range.
- No modulo bias introduced by `% range` shortcuts.
- RNG state progression remains deterministic and immutable.
- No floating-point randomness path is introduced.
