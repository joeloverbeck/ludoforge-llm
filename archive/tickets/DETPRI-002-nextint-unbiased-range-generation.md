# DETPRI-002 - Unbiased `nextInt` Range Generation

**Status**: ✅ COMPLETED

## Goal
Implement `nextInt(rng, min, max)` with strict input validation and modulo-bias-free integer generation for inclusive closed ranges.

## Scope
- Add a new exported `nextInt(rng, min, max)` helper in `src/kernel/prng.ts` with input guards and error handling.
- Implement unbiased range sampling (rejection sampling or Lemire-style reduction).
- Add unit/property-style tests for bounds correctness and rough uniformity using the existing Node test harness.

## Reassessed Assumptions (Before Implementation)
- Current kernel PRNG implementation exposes `createRng` and `stepRng` only; `nextInt` does not exist yet.
- `src/kernel/index.ts` already re-exports `./prng.js`, so adding `nextInt` in `prng.ts` is sufficient for public export unless the barrel structure changes.
- The repository does not use a property-testing library (for example `fast-check`) for this area; "property" coverage should follow existing table-driven/property-style tests under `test/unit/property/`.
- Existing PRNG determinism tests live in `test/unit/prng-core.test.ts` and must continue passing unchanged.

## File List Expected To Touch
- `src/kernel/prng.ts`
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

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `nextInt(rng, min, max)` to `src/kernel/prng.ts` with full `RangeError` validation and modulo-bias-free rejection sampling over 64-bit PRNG outputs.
  - Added `test/unit/prng-nextint.test.ts` for fixed-range behavior, two-outcome coverage, and invalid input guards.
  - Added `test/unit/property/prng-nextint.property.test.ts` for seeded table-driven in-range checks plus rough uniformity (`0..9`, 1000 draws, each bucket `>= 50`).
- **Deviations from original plan**:
  - `src/kernel/index.ts` did not require changes because it already re-exports `./prng.js`; adding `nextInt` in `prng.ts` made it part of the public API automatically.
  - Property coverage was implemented as Node test property-style checks (consistent with existing repository patterns), not via an external property-testing library.
- **Verification results**:
  - `npm run test:unit` passed.
  - `npm test` (build + unit + integration) passed.
