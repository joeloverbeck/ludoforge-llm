# CORTYPSCHVAL-004 - Top-Level Zod Schemas (GameDef, GameState, Move, Trace, EvalReport)

## Goal
Implement top-level runtime validation schemas that compose the base AST schemas and validate complete objects used by kernel/simulator/evaluator.

## File List Expected To Touch
- `src/kernel/schemas.ts`
- `src/kernel/index.ts`
- `test/unit/schemas.test.ts`

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
- `test/unit/schemas.test.ts`:
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
