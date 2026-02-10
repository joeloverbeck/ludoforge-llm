# CORTYPSCHVAL-006 - JSON Schema Artifacts for External Tooling
**Status**: ✅ COMPLETED

## Goal
Produce JSON Schema files for serialized forms consumed externally and keep them consistent with TypeScript/Zod contracts.

## Assumptions Reassessed (2026-02-10)
- `schemas/` exists but currently has no schema files; this ticket is creating artifacts for the first time, not regenerating existing ones.
- Runtime Zod schemas in `src/kernel/schemas.ts` validate in-memory shapes (`bigint` for trace/game-state hash fields), while external JSON schema validation must target serialized DTO-compatible payloads.
- There is no existing `test/unit/json-schema.test.ts`; it needs to be added.
- `SerializedGameTrace` exists in types/codecs and should be the trace shape validated by `Trace.schema.json` and by `EvalReport.schema.json` for embedded traces.

## Updated Scope
- Add new JSON Schema artifacts for external consumers:
  - `schemas/GameDef.schema.json`
  - `schemas/Trace.schema.json` (serialized trace DTO shape, lowercase hex bigint encoding)
  - `schemas/EvalReport.schema.json` (eval report with serialized traces)
- Add a dedicated unit test file that loads these schema files and validates known-good/known-bad payloads.
- Keep runtime TypeScript/Zod APIs unchanged (no breaking API changes).

## File List Expected To Touch
- `schemas/GameDef.schema.json`
- `schemas/Trace.schema.json`
- `schemas/EvalReport.schema.json`
- `test/unit/json-schema.test.ts`

## Implementation Notes
- Create or regenerate the three schema files.
- Ensure trace/eval schemas model serialized DTO shapes for bigint-containing structures.
- Ensure `stateHash` and RNG words are modeled as lowercase `0x` hex strings.
- Keep schema draft version explicit (draft-07 or later).

## Out Of Scope
- Runtime `validateGameDef` semantic checks.
- Changes to kernel execution behavior.
- Parser/CNL specs and files.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/json-schema.test.ts`:
  - each schema file is valid JSON and declares a draft version.
  - known-good serialized trace validates against `Trace.schema.json`.
  - trace with non-hex `stateHash` fails schema validation.
  - known-good eval report validates against `EvalReport.schema.json`.
  - known-good game def validates against `GameDef.schema.json`.

### Invariants That Must Remain True
- JSON schemas describe serialized DTOs, not raw in-memory bigint fields.
- Schema constraints for enum/discriminated values align with TS/Zod contracts.
- External consumers can validate payloads without custom bigint handlers.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added JSON Schema artifacts:
    - `schemas/GameDef.schema.json`
    - `schemas/Trace.schema.json`
    - `schemas/EvalReport.schema.json`
  - Added schema artifact tests in `test/unit/json-schema.test.ts` using Ajv to validate known-good and known-bad payloads against the new schema files.
  - Added `ajv` as a dev dependency for JSON Schema validation tests.
- **Deviations from original plan**:
  - The ticket originally said "create or regenerate"; there were no pre-existing schema artifacts in `schemas/`, so this work created them for the first time.
  - `EvalReport.schema.json` was implemented to validate external JSON payloads with serialized traces (hex-encoded bigint fields), which is the externally consumable contract implied by Spec 02.
- **Verification results**:
  - `npm run build` passed.
  - `npm run test:unit` passed, including `dist/test/unit/json-schema.test.js`.
