# EVEINTCHOPRO-001: Emit event base templates from enumerateCurrentEventMoves

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: Critical (unblocks all other tickets)
**Depends on**: None
**Blocks**: EVEINTCHOPRO-002, EVEINTCHOPRO-003, EVEINTCHOPRO-004, EVEINTCHOPRO-005

## Summary

Change `enumerateCurrentEventMoves()` in `legal-moves.ts` to emit **base event moves** (eventCardId + eventDeckId + side + branch only) instead of fully pre-resolved moves. Replace the `resolveMoveDecisionSequence()` call with `isMoveDecisionSequenceSatisfiable()` for the satisfiability gate.

After this change, event moves returned by `legalMoves()` are templates — they have base params but no `decision:...chooseOne...` keys. Callers must complete the decisions before calling `applyMove()`.

## File List

| File | Change |
|------|--------|
| `packages/engine/src/kernel/legal-moves.ts` | Replace `resolveMoveDecisionSequence` with `isMoveDecisionSequenceSatisfiable` in `enumerateCurrentEventMoves()` (lines 303-329) |

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

- Agent changes (`random-agent.ts`, `greedy-agent.ts`, `template-completion.ts`) — that is EVEINTCHOPRO-002
- Updating existing integration tests — that is EVEINTCHOPRO-003
- New protocol validation tests — that is EVEINTCHOPRO-004
- Simulator or E2E validation — that is EVEINTCHOPRO-005
- Browser runner changes — explicitly out of scope per spec
- Any changes to `applyMove`, `effect-dispatch`, `effects-choice`, or any other kernel file

## Acceptance Criteria

### Tests that must pass

- **New unit test**: `legalMoves()` with Gulf of Tonkin card-1 and 8 US pieces in out-of-play returns an unshaded event move whose params contain only `{ eventCardId, eventDeckId, side }` and NO `decision:...chooseOne...` keys.
- **New unit test**: `legalMoves()` with Gulf of Tonkin card-1 and 0 US pieces in out-of-play returns an event move that is already complete (no pending decisions when probed with `legalChoicesEvaluate`).
- **New unit test**: Event card whose shaded effects are only `moveAll` + `addVar` (no `chooseOne`) — the shaded event move from `legalMoves()` is fully complete (no decision keys needed, `applyMove` succeeds directly).
- **Existing non-event tests**: All tests in `packages/engine/test/` that do NOT involve event moves must pass without modification.

### Invariants that must remain true

- **INV-2**: Event satisfiability gating unchanged — unsatisfiable events are still excluded from legal moves.
- **INV-5**: Events without `chooseOne` effects produce complete moves directly, same as before.
- **INV-6**: Non-event legal moves are completely unaffected. `enumerateParams()` is untouched.
- **INV-7**: The count of legal event moves per side/branch remains the same (one per satisfiable combination).

### Known breakage (expected, fixed by later tickets)

- Event integration tests that call `legalMoves()` → `applyMove()` directly will fail because event moves are now templates. Fixed by EVEINTCHOPRO-003.
- Simulator tests using agents will fail because agents don't yet complete event templates. Fixed by EVEINTCHOPRO-002.
