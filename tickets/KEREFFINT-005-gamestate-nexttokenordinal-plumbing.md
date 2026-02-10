# KEREFFINT-005 - `GameState.nextTokenOrdinal` Plumbing

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: none (can land early)

## Goal
Add deterministic token ID counter support to runtime state types and serialization/schema boundaries so `createToken` can generate stable unique IDs in later tickets.

## Scope
- Add `nextTokenOrdinal: number` to `GameState` and `SerializedGameState`.
- Update Zod `GameStateSchema` to require the new field.
- Ensure serde round-trip includes `nextTokenOrdinal` unchanged.
- Update/extend existing state-schema and serde unit tests for the new required field.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/serde.test.ts`

## Out Of Scope
- `createToken`/`destroyToken` effect logic.
- Any game-loop initialization behavior (Spec 06 owns initial state construction).
- Backfilling fixtures unrelated to serialized `GameState` coverage unless tests require minimal updates.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - `GameStateSchema` accepts valid states that include `nextTokenOrdinal`.
  - `GameStateSchema` rejects states missing `nextTokenOrdinal`.
- `test/unit/serde.test.ts`
  - `serializeGameState` and `deserializeGameState` preserve `nextTokenOrdinal` exactly.
  - trace serialization/deserialization preserves `finalState.nextTokenOrdinal`.
- Existing baseline tests remain green:
  - `test/unit/smoke.test.ts`

## Invariants That Must Remain True
- Existing serialized bigint behavior (`rng.state`, `stateHash`) is unchanged.
- `nextTokenOrdinal` is treated as deterministic state data (not derived from wall-clock/randomness).
- No API changes to unrelated schema/type exports.

