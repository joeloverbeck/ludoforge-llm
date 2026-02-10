# CORTYPSCHVAL-005 - BigInt-Safe Serialized DTO Types and Codecs

## Goal
Implement serialized DTO interfaces and deterministic bigint codecs for game state and trace I/O.

## File List Expected To Touch
- `src/kernel/types.ts`
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
