# KERGAMLOOTRI-001 - Game Loop API and Types Foundation

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`

## Goal
Introduce the minimal type/API surface required for Spec 06 without implementing loop behavior yet, so downstream tickets can compile and land incrementally.

## Scope
- Add game-loop public API type contracts (`ApplyMoveResult`, trigger log union with fired/truncated variants).
- Add module stubs and exports for:
  - `initialState`
  - `legalMoves`
  - `applyMove`
  - `terminalResult`
  - trigger dispatch and progression helpers
- Align `types.ts` with Spec 06 trigger log semantics while preserving existing external types.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `src/kernel/initial-state.ts` (new)
- `src/kernel/legal-moves.ts` (new)
- `src/kernel/apply-move.ts` (new)
- `src/kernel/trigger-dispatch.ts` (new)
- `src/kernel/phase-advance.ts` (new)
- `src/kernel/action-usage.ts` (new)
- `src/kernel/terminal.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (new)

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
