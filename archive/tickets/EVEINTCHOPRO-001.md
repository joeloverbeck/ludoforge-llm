# EVEINTCHOPRO-001: Emit event base templates from enumerateCurrentEventMoves
**Status**: ✅ COMPLETED

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: Critical (unblocks all other tickets)
**Depends on**: None
**Blocks**: EVEINTCHOPRO-002, EVEINTCHOPRO-003, EVEINTCHOPRO-004, EVEINTCHOPRO-005

## Summary

Change `enumerateCurrentEventMoves()` in `legal-moves.ts` to emit **base event moves** (eventCardId + eventDeckId + side + branch only) instead of fully pre-resolved moves. Replace the `resolveMoveDecisionSequence()` call with `isMoveDecisionSequenceSatisfiable()` for the satisfiability gate.

After this change, event moves returned by `legalMoves()` are templates — they have base params but no `decision:...chooseOne...` keys. Callers must complete the decisions before calling `applyMove()`.

## Assumption Reassessment (2026-02-24)

Validated against current code in:
- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/agents/template-completion.ts`
- `packages/engine/src/agents/random-agent.ts`
- `packages/engine/src/agents/greedy-agent.ts`
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`

Discrepancies found:

1. **Agent gating assumption was incomplete**
   - Current agents only call `completeTemplateMove()` when `isTemplateMoveForProfile(def, move)` is true.
   - Current predicate requires `Object.keys(move.params).length === 0`.
   - Event templates emitted by this ticket will include base params (`eventCardId`, `eventDeckId`, `side`, optional `branch`), so agents would skip completion and hand incomplete moves to `applyMove()`.
   - Therefore agent/template predicate updates are required in this ticket for architectural correctness.

2. **Existing FITL event integration tests currently apply event legal moves directly**
   - Several tests in `fitl-events-tutorial-gulf-of-tonkin.test.ts` call `applyMove(def, setup, unshadedMove!)` directly.
   - After this ticket, those moves are intentionally partial templates for `chooseOne`-driven events and must be completed first.
   - Therefore test updates are required in this ticket to keep the suite coherent with the new protocol.

3. **File list was too narrow**
   - Restricting changes to `legal-moves.ts` would knowingly leave broken behavior in agents/tests.
   - Ticket scope is expanded below to include the minimal files needed for a robust end-to-end change.

## File List

| File | Change |
|------|--------|
| `packages/engine/src/kernel/legal-moves.ts` | Replace `resolveMoveDecisionSequence` with `isMoveDecisionSequenceSatisfiable` in `enumerateCurrentEventMoves()` (lines 303-329) |
| `packages/engine/src/agents/template-completion.ts` | Broaden template detection so event moves with unresolved decisions are eligible for completion |
| `packages/engine/src/agents/random-agent.ts` | Ensure event templates are completed before selection/application path |
| `packages/engine/src/agents/greedy-agent.ts` | Ensure event templates are completed before scoring/application path |
| `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` | Update event tests to complete event templates before `applyMove()` where decisions are pending |
| `packages/engine/test/integration/decision-sequence.test.ts` | Add/adjust tests to assert event-template completion behavior in agents if needed |

## Detailed Change

In `enumerateCurrentEventMoves()` (lines 303-329), replace:

```typescript
let completion: ReturnType<typeof resolveMoveDecisionSequence>;
try {
  completion = resolveMoveDecisionSequence(def, state, move, {
    budgets: enumeration.budgets,
    onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
  });
} catch (error) {
  if (shouldDeferMissingBinding(error, 'legalMoves.eventDecisionSequence')) {
    continue;
  }
  throw error;
}
if (!completion.complete) {
  continue;
}
if (!tryPushOptionMatrixFilteredMove(enumeration, def, state, completion.move, action)) {
  return;
}
```

With logic that:
1. Calls `isMoveDecisionSequenceSatisfiable(def, state, move, ...)` to check the event is satisfiable
2. If not satisfiable: `continue` (skip, same as before)
3. If satisfiable: emit the **base move** (as constructed on lines 280-287 / 291-299) via `tryPushOptionMatrixFilteredMove`

The `resolveMoveDecisionSequence` import may become unused — remove it if so. Add an import for `isMoveDecisionSequenceSatisfiable` (already exported from `move-decision-sequence.ts`).

## Out of Scope

- Browser runner interaction loop wiring (UI choice prompts) — runner-side concern
- New strategy heuristics for event choices in Greedy/Random agents (only protocol completion behavior is in scope)
- Simulator or E2E validation — that is EVEINTCHOPRO-005
- Browser runner changes — explicitly out of scope per spec
- Any changes to `applyMove`, `effect-dispatch`, `effects-choice`, or any other kernel file

## Acceptance Criteria

### Tests that must pass

- **New unit test**: `legalMoves()` with Gulf of Tonkin card-1 and 8 US pieces in out-of-play returns an unshaded event move whose params contain only `{ eventCardId, eventDeckId, side }` and NO `decision:...chooseOne...` keys.
- **New unit test**: `legalMoves()` with Gulf of Tonkin card-1 and 0 US pieces in out-of-play returns an event move that is already complete (no pending decisions when probed with `legalChoicesEvaluate`).
- **New unit test**: Event card whose shaded effects are only `moveAll` + `addVar` (no `chooseOne`) — the shaded event move from `legalMoves()` is fully complete (no decision keys needed, `applyMove` succeeds directly).
- **New/updated agent tests**: RandomAgent and GreedyAgent must complete event template moves (with base params present) before returning selected move.
- **Updated integration tests**: Existing FITL Gulf of Tonkin tests must use template completion or explicit decision params when pending decisions exist.
- **Existing non-event tests**: All tests in `packages/engine/test/` that do NOT involve event moves must pass without modification.

### Invariants that must remain true

- **INV-2**: Event satisfiability gating unchanged — unsatisfiable events are still excluded from legal moves.
- **INV-5**: Events without `chooseOne` effects produce complete moves directly, same as before.
- **INV-6**: Non-event legal moves are completely unaffected. `enumerateParams()` is untouched.
- **INV-7**: The count of legal event moves per side/branch remains the same (one per satisfiable combination).
- **INV-8**: Agents remain generic and protocol-driven; they complete any move with pending decisions, not only empty-param pipeline templates.

### Known breakage (expected, fixed by later tickets)

- Runner/UI flows that do not yet drive repeated `legalChoices()` calls for event templates may still require follow-up work in runner tickets.

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - `enumerateCurrentEventMoves()` now uses `isMoveDecisionSequenceSatisfiable()` and emits base event moves directly (no prefilled decision keys).
  - Agent completion flow was made protocol-driven for any legal move with pending decisions, so event templates with base params are completed before apply/scoring.
  - Gulf of Tonkin integration coverage was updated to assert template emission from `legalMoves()` and to complete/probe decisions before `applyMove()` where needed.
  - Added event-template agent coverage (RandomAgent/GreedyAgent completion assertions).
  - Updated agent unit tests that previously used action-id stubs not present in `def.actions`, which became invalid under generic decision probing.
- **Deviations vs original plan**:
  - Scope expanded beyond `legal-moves.ts` to include agents and affected tests, because the original assumption that this could be isolated to event enumeration was incorrect in current code.
  - Updated one pre-existing lint issue in `test/helpers/fitl-playbook-harness.ts` required to satisfy lint gate.
- **Verification**:
  - Targeted integration tests passed:
    - `packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
    - `packages/engine/dist/test/integration/decision-sequence.test.js`
  - Targeted agent unit tests passed:
    - `packages/engine/dist/test/unit/agents/random-agent.test.js`
    - `packages/engine/dist/test/unit/agents/factory-api-shape.test.js`
  - Workspace validation:
    - `pnpm turbo test` passed (cached full run replayed for engine + runner with all tests passing)
    - `pnpm turbo lint` passed
