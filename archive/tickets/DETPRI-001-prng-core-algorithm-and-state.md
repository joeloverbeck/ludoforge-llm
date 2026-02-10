# DETPRI-001 - PRNG Core Algorithm and State Contract

**Status**: ✅ COMPLETED

## Goal
Implement the deterministic PRNG core (MVP algorithm freeze: `pcg-dxsm-128`) with immutable state transitions and a stable state contract used by later deterministic primitives work.

## Reassessed Assumptions (Current Repository State)
- `src/kernel/prng.ts` and `test/unit/prng-core.test.ts` do not exist yet and must be created.
- RNG state currently exists in shared kernel contracts (`src/kernel/types.ts`, `src/kernel/schemas.ts`, and `src/kernel/serde.ts`) as `state` words only, without `algorithm`/`version`.
- Existing serde/schema/integration tests assert the legacy RNG serialized shape and will need minimal updates to align with the frozen state contract.

## Scope
- Add PRNG types and core constructor/step implementation.
- Persist algorithm/version metadata in the serialized state shape.
- Add deterministic golden-vector tests that pin first outputs for seed `42n`.
- Update existing schema/serde fixtures and tests that are directly coupled to RNG state shape.

## File List Expected To Touch
- `src/kernel/prng.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/prng-core.test.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts`
- `test/unit/serde.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/json-schema.test.ts`
- `test/integration/core-types-validation.integration.test.ts`
- `test/fixtures/trace/valid-serialized-trace.json`
- `schemas/Trace.schema.json`

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
- Regenerating or redesigning non-RNG JSON schemas.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/prng-core.test.ts`:
  - seed `42n` produces the expected first 10 raw deterministic outputs (golden vector).
  - seed `42n` and seed `43n` produce different first 10 outputs.
  - each step returns a new state object (no in-place mutation).
- Existing serde/schema tests continue passing with updated RNG shape contract:
  - `test/unit/serde.test.ts`
  - `test/unit/schemas-top-level.test.ts`
  - `test/unit/json-schema.test.ts`
- Existing `test/unit/smoke.test.ts` remains passing.

### Invariants That Must Remain True
- Serialized PRNG state includes `algorithm` and `version` fields.
- No floating-point arithmetic is used in PRNG core stepping.
- No forbidden randomness APIs (`Math.random`) are called.
- Same seed always yields the same step sequence.

## Outcome
- **Completion date**: 2026-02-10
- **What was changed**:
  - Added `src/kernel/prng.ts` with immutable `createRng(seed)` and `stepRng(rng)` for frozen `pcg-dxsm-128` contract (`algorithm`, `version`, two BigInt state words).
  - Updated shared RNG contract across `src/kernel/types.ts`, `src/kernel/schemas.ts`, `src/kernel/serde.ts`, and `src/kernel/index.ts`.
  - Added `test/unit/prng-core.test.ts` with golden-vector and immutability checks.
  - Updated RNG-shape-coupled tests and fixture data (`test/unit/serde.test.ts`, `test/unit/schemas-top-level.test.ts`, `test/unit/json-schema.test.ts`, `test/fixtures/trace/valid-serialized-trace.json`, `schemas/Trace.schema.json`).
- **Deviations from original plan**:
  - Ticket initially assumed PRNG files already existed; implementation required creating new PRNG module/tests and minimally updating pre-existing serde/schema contracts that depended on the old RNG shape.
- **Verification results**:
  - `npm test` passed (unit + integration), including new PRNG core tests and existing smoke/schema/serde coverage.
