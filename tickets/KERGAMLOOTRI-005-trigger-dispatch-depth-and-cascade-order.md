# KERGAMLOOTRI-005 - Trigger Dispatch Depth Limits and Cascade Ordering

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement deterministic trigger dispatch with event matching, recursive cascade handling, and explicit depth truncation logging.

## Scope
- Implement `dispatchTriggers(def, state, rng, event, depth, maxDepth, triggerLog)`.
- Match triggers by event type and optional `match`/`when` conditions.
- Fire matched triggers in definition order.
- Recursively dispatch emitted events in deterministic depth-first order.
- Enforce `maxTriggerDepth` truncation with typed `TriggerTruncated` logs and no partial effects at truncated boundary.

## File List Expected To Touch
- `src/kernel/trigger-dispatch.ts`
- `src/kernel/types.ts` (trigger log shape, if not already completed by ticket 001)
- `src/kernel/effects.ts` (only for event-emission plumbing, no behavioral regressions)
- `test/unit/trigger-dispatch.test.ts` (new)

## Out Of Scope
- Move legality checks.
- Phase/turn auto-advancement loops.
- Terminal scoring/winner computation.
- Trace/evaluator-level degeneracy reporting.

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
