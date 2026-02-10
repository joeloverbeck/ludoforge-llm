# KEREFFINT-005 - `GameState.nextTokenOrdinal` Plumbing

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: none (can land early)

## Goal
Add deterministic token ID counter support to runtime state types and serialization/schema boundaries so `createToken` can generate stable unique IDs in later tickets.

## Reassessed Assumptions (2026-02-10)
- `GameState` is consumed by many unit/integration fixtures beyond the two tests originally listed, so adding a required field will require minimal fixture updates across affected tests.
- JSON schema artifacts include serialized game state shape in `schemas/Trace.schema.json`; this artifact must be updated alongside TypeScript/Zod schemas to avoid drift.
- Serde currently uses spread-based pass-through for non-bigint fields; no extra transform logic is needed for `nextTokenOrdinal` beyond ensuring it exists in typed fixtures and schema validation.

## Scope
- Add `nextTokenOrdinal: number` to `GameState` and `SerializedGameState`.
- Update Zod `GameStateSchema` to require the new field.
- Update JSON schema artifact for serialized traces so `serializedGameState.required` includes `nextTokenOrdinal`.
- Ensure serde round-trip includes `nextTokenOrdinal` unchanged.
- Update/extend existing state-schema and serde unit tests for the new required field.
- Apply minimal fixture updates where typed `GameState` literals now require `nextTokenOrdinal`.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts`
- `schemas/Trace.schema.json`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/serde.test.ts`
- Additional tests with inline `GameState` fixtures (minimal field-add only)

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

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added required `nextTokenOrdinal` to `GameState` in `src/kernel/types.ts`.
  - Added required `nextTokenOrdinal` to `GameStateSchema` in `src/kernel/schemas.ts`.
  - Updated JSON schema artifact `schemas/Trace.schema.json` so serialized game state requires and defines `nextTokenOrdinal`.
  - Extended schema/serde tests to explicitly validate presence and round-trip preservation of `nextTokenOrdinal`.
  - Applied minimal fixture updates to existing typed `GameState` test data that now require the field.
- **Deviations from original plan**:
  - No code changes were needed in `src/kernel/serde.ts` because spread-based serialization/deserialization already preserves additional non-bigint fields, including `nextTokenOrdinal`.
  - Scope expanded to include additional fixture-bearing test files and JSON schema artifact alignment.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run test:unit` passed.
  - `npm test` passed.
