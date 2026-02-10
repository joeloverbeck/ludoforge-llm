# KERGAMLOOTRI-005 - Trigger Dispatch Depth Limits and Cascade Ordering

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement deterministic trigger dispatch with event matching, recursive cascade handling, and explicit depth truncation logging.

## Assumption Reassessment (2026-02-10)
- `src/kernel/trigger-dispatch.ts` exists and already supports event matching plus `fired`/`truncated` logging.
- `TriggerLogEntry` union (`fired | truncated`) is already present in `src/kernel/types.ts`; no additional type-shape work from this ticket is required.
- `dispatchTriggers` currently does **not** recurse into emitted events because `applyEffects` does not currently expose emitted trigger events.
- `test/unit/trigger-dispatch.test.ts` does not exist yet.
- Existing coverage for trigger firing is currently indirect (`test/unit/apply-move.test.ts`, `test/unit/initial-state.test.ts`) and does not validate cascade depth-first ordering or depth truncation boundary behavior.

## Scope
- Keep public API behavior stable while extending internals needed for cascade dispatch.
- Implement recursive dispatch in `dispatchTriggers` for events emitted by trigger effects.
- Add minimal event-emission plumbing in effects execution so moved tokens can emit deterministic `tokenEntered` events in effect order.
- Preserve depth limit behavior: emitted events beyond `maxTriggerDepth` are logged as `kind: 'truncated'` and do not apply partial effects at the truncated node.
- Add focused trigger-dispatch unit tests covering match/when filtering, deterministic depth-first cascade order, and truncation semantics.

## File List Expected To Touch
- `src/kernel/trigger-dispatch.ts`
- `src/kernel/effect-context.ts` (EffectResult event-emission metadata)
- `src/kernel/effects.ts` (event-emission plumbing for trigger cascades)
- `test/unit/trigger-dispatch.test.ts` (new)

## Out Of Scope
- Move legality checks.
- Phase/turn auto-advancement loops.
- Terminal scoring/winner computation.
- Trace/evaluator-level degeneracy reporting.
- Broad refactors outside trigger/effect event plumbing.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/trigger-dispatch.test.ts`
  - matching trigger fires and records `kind: 'fired'`.
  - `when`/`match` filtering behaves as expected.
  - non-matching triggers do not fire.
  - cascading emitted events fire downstream triggers in deterministic depth-first order.
  - depth overflow produces `kind: 'truncated'` with event/depth metadata.
  - truncation applies no partial effects at truncated node.
- Existing effects tests remain green:
  - `test/unit/effects-zone-ops.test.ts`
  - `test/unit/effects-token-move-draw.test.ts`

## Invariants That Must Remain True
- Trigger traversal order is stable for identical state/event input.
- Depth limit never causes crash; it truncates deterministically.
- Trigger log accurately reflects fired and truncated steps in execution order.

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added emitted-event plumbing in `applyEffects`/`applyEffect` results and emitted `tokenEntered` events from `moveToken`, `draw`, and `moveAll`.
  - Implemented recursive depth-first cascade dispatch in `dispatchTriggers`, including truncation logging at `depth > maxDepth`.
  - Fixed wildcard event matching for `actionResolved` and `tokenEntered` triggers when optional `action`/`zone` is omitted.
  - Added `test/unit/trigger-dispatch.test.ts` for match/when filtering, deterministic cascade order, and truncation no-partial-effects behavior.
- Deviations from original plan:
  - `src/kernel/types.ts` did not require changes because trigger log types already existed.
  - The required test coverage was implemented as a new unit file plus full regression verification via existing suites.
- Verification results:
  - `npm test` (build + unit + integration) passed.
