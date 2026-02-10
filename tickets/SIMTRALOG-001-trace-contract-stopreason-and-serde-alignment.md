# SIMTRALOG-001 - Trace Contract: `stopReason` + Schema/Serde Alignment

**Status**: Proposed  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: none

## Goal
Add the Spec 10 trace contract amendment to core kernel types and codecs so simulator output has an explicit termination reason and round-trips cleanly.

## Scope
- Add `SimulationStopReason = 'terminal' | 'maxTurns' | 'noLegalMoves'` to kernel types.
- Add `stopReason` to `GameTrace`.
- Add `stopReason` validation to `GameTraceSchema`.
- Ensure `serializeTrace` / `deserializeTrace` include and preserve `stopReason`.
- Update existing top-level schema and serde tests to assert this field is required and stable.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/serde.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/serde.test.ts`

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
- Baseline regression guard:
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- `SerializedGameTrace` remains the only trace JSON surface in kernel serde.
- BigInt/hash conversion semantics remain unchanged.
- `GameTrace.result` remains nullable and independent from serde encoding behavior.

## Diff Size Guardrail
Keep this ticket to contract + tests only (no simulator files). Target review size: ~150 lines or less.

