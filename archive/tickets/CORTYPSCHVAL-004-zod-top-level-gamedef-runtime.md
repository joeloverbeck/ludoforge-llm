# CORTYPSCHVAL-004 - Top-Level Zod Schemas (GameDef, GameState, Move, Trace, EvalReport)
**Status**: ✅ COMPLETED

## Goal
Implement top-level runtime validation schemas that compose the base AST schemas and validate complete objects used by kernel/simulator/evaluator.

## Assumption Reassessment (2026-02-10)
- `src/kernel/schemas.ts` currently contains only selector/AST-level schemas from `CORTYPSCHVAL-003`; top-level schemas are not implemented yet.
- `test/unit/schemas.test.ts` does not exist in this repository. Existing schema coverage is in `test/unit/schemas-ast.test.ts`.
- Scope for this ticket should add a dedicated top-level schema test file instead of editing a nonexistent legacy test path.

## File List Expected To Touch
- `src/kernel/schemas.ts`
- `src/kernel/index.ts`
- `test/unit/schemas-top-level.test.ts` (new)

## Implementation Notes
- Implement and export:
  - `GameDefSchema`
  - `GameStateSchema`
  - `MoveSchema`
  - `GameTraceSchema`
  - `EvalReportSchema`
- Ensure nested AST fields use schemas from `CORTYPSCHVAL-003`.
- Ensure malformed inputs return useful issue paths.

## Out Of Scope
- Semantic reference checks (`validateGameDef`).
- JSON schema output files.
- BigInt serialization codecs.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`:
  - minimal valid `GameDef` parses with zero issues.
  - full-featured valid `GameDef` parses with zero issues.
  - missing `metadata` fails with path `metadata`.
  - invalid `VariableDef.init` type fails at the correct path.
  - unknown keys behavior matches documented strictness policy.
  - malformed top-level `GameTrace` fails with actionable path.
  - malformed top-level `EvalReport` fails with actionable path.

### Invariants That Must Remain True
- Valid objects for documented type shapes are accepted.
- Invalid structural shapes are rejected with path-level errors.
- Schema contracts remain aligned with TypeScript type definitions.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented and exported top-level runtime schemas in `src/kernel/schemas.ts`: `GameDefSchema`, `GameStateSchema`, `MoveSchema`, `GameTraceSchema`, and `EvalReportSchema` (plus supporting nested schemas used by those types).
  - Added top-level schema unit coverage in `test/unit/schemas-top-level.test.ts` for all acceptance cases in this ticket.
  - Updated ticket assumptions to match repository reality (`test/unit/schemas.test.ts` did not exist; existing baseline was `test/unit/schemas-ast.test.ts`).
- **Deviations from original plan**:
  - Created `test/unit/schemas-top-level.test.ts` instead of modifying `test/unit/schemas.test.ts` (nonexistent in repo baseline).
  - No `src/kernel/index.ts` change was required because it already re-exports `schemas.ts`.
- **Verification**:
  - `npm run build` passed.
  - `npm run test:unit` passed, including the new top-level schema test file.
