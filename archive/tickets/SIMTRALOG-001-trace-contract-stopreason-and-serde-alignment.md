# SIMTRALOG-001 - Trace Contract: `stopReason` + Schema/Serde Alignment

**Status**: ✅ COMPLETED  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: none

## Goal
Add the Spec 10 trace contract amendment to core kernel types and codecs so simulator output has an explicit termination reason and round-trips cleanly.

## Reassessed Assumptions (Before Implementation)
- `GameTrace` currently does **not** include `stopReason` in `src/kernel/types.ts`.
- Runtime Zod schema `GameTraceSchema` currently does **not** require `stopReason`.
- Kernel serde (`serializeTrace` / `deserializeTrace`) currently performs structural passthrough for trace top-level fields, so it will preserve `stopReason` once the type/schema contract includes it.
- The ticket originally under-scoped test impact: serialized trace JSON-schema artifacts/tests will fail if `stopReason` is added to trace output but `schemas/Trace.schema.json` is not updated.
- Integration fixture `test/fixtures/trace/valid-serialized-trace.json` must include `stopReason` to remain aligned with serialized trace contract tests.

## Scope
- Add `SimulationStopReason = 'terminal' | 'maxTurns' | 'noLegalMoves'` to kernel types.
- Add required `stopReason` to `GameTrace`.
- Add `stopReason` validation to `GameTraceSchema`.
- Ensure `serializeTrace` / `deserializeTrace` include and preserve `stopReason` as part of the trace contract.
- Update existing top-level schema and serde tests to assert this field is required and stable.
- Align serialized JSON schema artifact (`schemas/Trace.schema.json`) and impacted JSON-schema/integration tests/fixtures.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts`
- `schemas/Trace.schema.json`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/serde.test.ts`
- `test/unit/json-schema.test.ts`
- `test/fixtures/trace/valid-serialized-trace.json`

## Out Of Scope
- Implementing `runGame` or `runGames`.
- Delta computation logic.
- Agent behavior or RNG policy changes.
- Any evaluator metrics or degeneracy logic.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/schemas-top-level.test.ts`
  - `GameTraceSchema` rejects traces missing `stopReason` with actionable path.
  - `GameTraceSchema` accepts all three allowed literals.
- `test/unit/serde.test.ts`
  - `deserializeTrace(serializeTrace(trace))` preserves `stopReason` exactly.
  - Existing hash/BigInt round-trip assertions remain green.
- `test/unit/json-schema.test.ts`
  - known-good serialized trace with `stopReason` validates against `Trace.schema.json`.
- `test/integration/core-types-validation.integration.test.ts`
  - serialized trace fixture round-trip remains deterministic with required `stopReason` present.
- Baseline regression guard:
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- `SerializedGameTrace` remains the only trace JSON surface in kernel serde.
- BigInt/hash conversion semantics remain unchanged.
- `GameTrace.result` remains nullable and independent from serde encoding behavior.
- `stopReason` literals remain exactly: `'terminal' | 'maxTurns' | 'noLegalMoves'`.

## Diff Size Guardrail
Keep this ticket to contract + tests only (no simulator files). Target review size: ~200 lines or less including JSON schema/fixture alignment.

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added `SimulationStopReason` and required `GameTrace.stopReason` in `src/kernel/types.ts`.
  - Added runtime validation for `stopReason` in `GameTraceSchema` (`src/kernel/schemas.ts`).
  - Aligned serialized trace JSON schema by requiring `stopReason` in `schemas/Trace.schema.json`.
  - Updated impacted tests and fixture data to include and validate `stopReason`.
- Deviations from original plan:
  - `src/kernel/serde.ts` required no logic changes because trace top-level fields are already structurally preserved via object spread; coverage was added/updated in tests instead.
  - Scope was expanded to include JSON schema artifacts/tests and the serialized trace fixture due contract coupling not captured in the initial file list.
- Verification:
  - `npm run test:unit -- --coverage=false`
  - `node --test dist/test/integration/core-types-validation.integration.test.js`
