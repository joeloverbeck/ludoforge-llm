# CORTYPSCHVAL-005 - BigInt-Safe Serialized DTO Types and Codecs
**Status**: ✅ COMPLETED

## Goal
Implement serialized DTO interfaces and deterministic bigint codecs for game state and trace I/O.

## Assumptions Reassessed (2026-02-10)
- `src/kernel/types.ts` already contains the serialized DTO interfaces for this ticket (`HexBigInt`, `SerializedRngState`, `SerializedMoveLog`, `SerializedGameState`, `SerializedGameTrace`).
- `src/kernel/serde.ts` does not exist yet and is the missing implementation surface for codec behavior.
- `src/kernel/index.ts` already re-exports `types.ts`; adding a new serde module requires explicit export wiring.
- `test/unit/serde.test.ts` does not exist yet and must be added.

## Updated Scope
- Keep the existing DTO types in `src/kernel/types.ts` unchanged unless a concrete mismatch is discovered during implementation.
- Implement deterministic bigint codecs in a new `src/kernel/serde.ts`.
- Export codec API from `src/kernel/index.ts`.
- Add focused unit coverage in `test/unit/serde.test.ts` for round-trip and invalid-hex behavior.

## File List Expected To Touch
- `src/kernel/types.ts` (only if mismatch corrections are required)
- `src/kernel/serde.ts`
- `src/kernel/index.ts`
- `test/unit/serde.test.ts`

## Implementation Notes
- Add/confirm DTO types: `HexBigInt`, `SerializedRngState`, `SerializedMoveLog`, `SerializedGameState`, `SerializedGameTrace`.
- Implement and export:
  - `serializeGameState`
  - `deserializeGameState`
  - `serializeTrace`
  - `deserializeTrace`
- Encode bigint as lowercase `0x...` hex strings.
- Preserve all hash values exactly through round-trip.

## Out Of Scope
- Zod schema definitions unrelated to serialized DTO validation.
- JSON schema generation files.
- Semantic validation rules.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/serde.test.ts`:
  - `serializeGameState` converts `stateHash` and RNG words to lowercase hex strings.
  - `deserializeGameState` reconstructs exact bigint values.
  - `deserializeTrace(serializeTrace(trace))` preserves all hashes exactly.
  - invalid hex input is rejected with deterministic error behavior.

### Invariants That Must Remain True
- No bigint values leak into JSON DTO outputs.
- Hex encoding format remains lowercase and `0x`-prefixed.
- Serialization/deserialization is deterministic and lossless for bigint fields.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `src/kernel/serde.ts` with deterministic codecs:
    - `serializeGameState`
    - `deserializeGameState`
    - `serializeTrace`
    - `deserializeTrace`
  - Added `test/unit/serde.test.ts` covering lower-case hex serialization, exact bigint reconstruction, trace hash round-trips, and deterministic invalid-hex rejection.
  - Updated `src/kernel/index.ts` to export `./serde.js`.
- **Deviations from original plan**:
  - `src/kernel/types.ts` did not require changes because serialized DTO interfaces were already present and aligned with this ticket.
  - Implemented strict lowercase validation for input hex (`/^0x[0-9a-f]+$/`) to enforce deterministic behavior rather than accepting uppercase/malformed variants.
- **Verification results**:
  - `npm run build` passed.
  - `npm run test:unit` passed, including `dist/test/unit/serde.test.js`.
