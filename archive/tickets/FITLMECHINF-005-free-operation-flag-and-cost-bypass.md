# FITLMECHINF-005 - Free Operation Flag and Cost Bypass

**Status**: COMPLETED
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Task 25.4)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B)
**Depends on**: None (builds on existing `EffectContext` and `apply-move.ts`)

## Goal

Add `freeOperation?: boolean` to `EffectContext` and wire it through `applyMove` so that when `freeOperation: true`, the operation-level `costSpend` effects are skipped and eligibility state is not changed. Resolution stage effects (e.g., Pacify/Agitate shifts, Trail costs) still execute normally.

## Rationale

Rule 3.1.2 defines "free operations" that don't cost resources and don't affect eligibility. The spec identifies that the existing `costSpend` vs `resolutionStages` separation in `OperationExecutionProfile` already provides the hook — `costSpend` is skipped, `resolutionStages` execute normally. This ticket adds the flag and wires the bypass.

## Scope

### Changes

1. **Extend `EffectContext`** (`src/kernel/effect-context.ts`): Add `readonly freeOperation?: boolean`.

2. **Update `applyMove`** (`src/kernel/apply-move.ts`):
   - Accept optional `freeOperation` flag (either via a new parameter or by reading from move metadata/context)
   - When `freeOperation: true` and an `OperationExecutionProfile` exists:
     - Skip `costEffects` application (lines ~191-198)
     - Skip eligibility state change (the call to `applyTurnFlowEligibilityAfterMove`)
   - Resolution stages execute normally regardless
   - Add trace log entry `{ kind: 'operationFree', actionId, step: 'costSpendSkipped' }`

3. **Unit tests** verifying cost bypass and eligibility preservation for free operations.

## File List

- `src/kernel/effect-context.ts` — Add `freeOperation?: boolean`
- `src/kernel/apply-move.ts` — Wire free operation bypass logic
- `src/kernel/types.ts` — Extend `Move` type with optional `freeOperation` flag (if chosen to pass via Move) OR extend `applyMove` signature
- `test/unit/apply-move.test.ts` — Free operation unit tests

## Out of Scope

- Event card integration that grants free operations (Spec 29)
- Derived value computation (FITLMECHINF-002)
- Stacking enforcement (FITLMECHINF-003/004)
- Joint operation cost constraint (FITLMECHINF-006)
- Individual operation definitions (Spec 26–27)
- Any changes to `effects.ts` internal logic
- Compiler changes

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/apply-move.test.ts`:
  - Free operation with `OperationExecutionProfile`: `costSpend` effects NOT applied, resource variables unchanged
  - Free operation: eligibility state unchanged (faction remains eligible for next card)
  - Free operation: resolution stage effects still execute and modify state
  - Free operation: trace log includes `operationFree` entry
  - Non-free operation (default): `costSpend` applied normally, eligibility updated normally
  - Free operation without `OperationExecutionProfile` (plain action): all effects execute normally (no-op for freeOperation flag)
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- Default behavior unchanged: `freeOperation` defaults to `undefined`/`false`, existing tests unaffected
- Resolution effects (Pacify shift, Agitate shift, Trail marker costs) always execute regardless of `freeOperation` flag
- Cost validation (`costValidation` predicate) is irrelevant for free operations — skip cost entirely, not just validation
- Trigger dispatch after effects is unaffected by the free operation flag
- `applyMove` atomicity contract preserved: if any resolution stage throws, the entire move is rejected

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - `src/kernel/effect-context.ts`: Added `readonly freeOperation?: boolean` to `EffectContext`
  - `src/kernel/types.ts`: Added `readonly freeOperation?: boolean` to `Move`, added `OperationFreeTraceEntry` interface, included it in `TriggerLogEntry` union
  - `src/kernel/apply-move.ts`: Wired bypass logic — `isFreeOp` derived from `move.freeOperation && executionProfile !== undefined`; cost validation short-circuited, costSpend skipped, eligibility update skipped, `operationFree` trace entry emitted; resolution stages and trigger dispatch unaffected
  - `test/unit/apply-move.test.ts`: 7 new tests covering all acceptance criteria
- **Deviations**: Passed `freeOperation` via `Move` type (not `applyMove` signature) — cleaner since it's a per-move property
- **Verification**: `npm run build` passes, `npm test` passes (815 tests, 0 failures)
