# CORTYPSCHVAL-006 - JSON Schema Artifacts for External Tooling

## Goal
Produce JSON Schema files for serialized forms consumed externally and keep them consistent with TypeScript/Zod contracts.

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
