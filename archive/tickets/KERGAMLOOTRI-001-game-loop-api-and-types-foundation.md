# KERGAMLOOTRI-001 - Game Loop API and Types Foundation

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`

## Goal
Introduce the minimal type/API surface required for Spec 06 without implementing loop behavior yet, so downstream tickets can compile and land incrementally.

## Reassessed Assumptions (Current Codebase)
- `src/kernel` currently has no game-loop modules (`initial-state`, `legal-moves`, `apply-move`, `trigger-dispatch`, `phase-advance`, `action-usage`, `terminal`).
- Existing trigger log typing is currently `TriggerFiring[]` without a `kind` discriminator.
- Trigger log shape is validated in runtime schemas and JSON schema artifacts, so this ticket must also update:
  - `src/kernel/schemas.ts`
  - `schemas/Trace.schema.json`
- Existing tests already assert trace/schema behavior for `triggerFirings`, so they are in scope for minimal fixture/type-shape updates.

## Scope
- Add game-loop public API type contracts (`ApplyMoveResult`, trigger log union with fired/truncated variants).
- Add module stubs and exports for:
  - `initialState`
  - `legalMoves`
  - `applyMove`
  - `terminalResult`
  - trigger dispatch and progression helpers
- Align `types.ts` with Spec 06 trigger log semantics while preserving existing external types.
- Align runtime/schema artifacts with the new trigger log union shape.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `src/kernel/schemas.ts`
- `schemas/Trace.schema.json`
- `src/kernel/initial-state.ts` (new)
- `src/kernel/legal-moves.ts` (new)
- `src/kernel/apply-move.ts` (new)
- `src/kernel/trigger-dispatch.ts` (new)
- `src/kernel/phase-advance.ts` (new)
- `src/kernel/action-usage.ts` (new)
- `src/kernel/terminal.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (new)
- `test/unit/schemas-top-level.test.ts`
- `test/unit/json-schema.test.ts`

## Out Of Scope
- Real move enumeration, trigger matching, phase advancement, or terminal evaluation logic.
- Any mutation to `effects.ts`, `eval-query.ts`, or `eval-condition.ts` behavior.
- Integration/property/golden tests.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/game-loop-api-shape.test.ts`
  - exports for all Spec 06 entrypoints exist and are callable.
  - `ApplyMoveResult.triggerFirings` accepts both fired and truncated entry shapes.
  - trigger log entries carry explicit `kind` discriminators.
- Existing tests remain green:
  - `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Existing exported symbols keep backward-compatible names.
- No behavior change for existing evaluator/effects call paths.
- Type-only changes do not alter runtime determinism.

## Outcome
- **Completion date**: 2026-02-10
- **What changed vs plan**:
  - Added the requested game-loop API/type foundation with stubbed modules and exports (`initialState`, `legalMoves`, `applyMove`, `dispatchTriggers`, `advancePhase`, `resetTurnUsage`, `resetPhaseUsage`, `terminalResult`).
  - Added `ApplyMoveResult`, `TriggerTruncated`, and `TriggerLogEntry` (`fired`/`truncated`) to kernel types and updated `MoveLog.triggerFirings` to use the union.
  - Updated runtime schema and JSON schema artifact for trigger log discriminator support.
  - Added a focused unit test for game-loop API shape and updated existing schema tests for the new `kind` field.
- **Deviation from original ticket draft**:
  - The original file list did not include schema files and schema tests; those were added after reassessment because trigger log shape is validated there.
- **Verification**:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
