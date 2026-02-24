# EVEINTCHOPRO-002: Broaden agent template completion to handle event moves

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: Critical
**Depends on**: EVEINTCHOPRO-001
**Blocks**: EVEINTCHOPRO-005

## Summary

After EVEINTCHOPRO-001, event moves from `legalMoves()` are templates with pending `chooseOne` decisions. Both `RandomAgent` and `GreedyAgent` use `isTemplateMoveForProfile()` to decide whether a move needs template completion. This function returns `false` for event moves (they have non-empty params), so agents push them as-is — then `applyMove()` fails on missing decision params.

Fix agents to complete ALL moves that have pending decisions, not just pipeline-template moves with zero params.

## File List

| File | Change |
|------|--------|
| `packages/engine/src/agents/template-completion.ts` | Add `moveNeedsCompletion()` predicate or broaden `isTemplateMoveForProfile()` |
| `packages/engine/src/agents/random-agent.ts` | Use broadened predicate in chooseMove loop |
| `packages/engine/src/agents/greedy-agent.ts` | Use broadened predicate in chooseMove loop |

## Detailed Change

### Option A: Call `completeTemplateMove` unconditionally (recommended)

The simplest fix: remove the `isTemplateMoveForProfile` guard and call `completeTemplateMove` on every move. For already-complete moves, `legalChoicesEvaluate()` returns `kind: 'complete'` on the first call, so `completeTemplateMove` returns immediately — it's a no-op.

In `RandomAgent.chooseMove()` (lines 14-23):
```typescript
// Before:
if (isTemplateMoveForProfile(input.def, move)) {
  const result = completeTemplateMove(input.def, input.state, move, rng);
  ...
} else {
  completedMoves.push(move);
}

// After: attempt completion on every move
const result = completeTemplateMove(input.def, input.state, move, rng);
if (result !== null) {
  completedMoves.push(result.move);
  rng = result.rng;
}
```

Same pattern in `GreedyAgent.chooseMove()` (lines 40-55).

`isTemplateMoveForProfile` may become unused. If so, either remove it or keep it as an exported utility. Do not remove it if `decision-sequence.test.ts` or `template-completion.test.ts` import it.

### Option B: Add an `isEventTemplateMove` predicate (alternative)

If unconditional completion has unacceptable performance overhead, add a targeted check:

```typescript
export const isEventTemplateMove = (def: GameDef, state: GameState, move: Move): boolean => {
  // Fast check: is this an event action with partial params?
  if (!isCardEventActionId(def, move.actionId)) return false;
  return legalChoicesEvaluate(def, state, move).kind === 'pending';
};
```

Then guard agents with `isTemplateMoveForProfile(def, move) || isEventTemplateMove(def, state, move)`.

Option A is preferred for simplicity.

## Out of Scope

- Changes to `legal-moves.ts` — that is EVEINTCHOPRO-001
- Changes to any test files — that is EVEINTCHOPRO-003/004
- Changes to the kernel (`effects-choice.ts`, `effect-dispatch.ts`, etc.)
- Browser runner changes
- New agent strategies (GreedyAgent evaluating city options strategically)

## Acceptance Criteria

### Tests that must pass

- **Existing agent unit tests**: `packages/engine/test/unit/agents/template-completion.test.ts` must pass (may need minor adjustments if `isTemplateMoveForProfile` usage changes).
- **New agent test**: `RandomAgent.chooseMove()` given legal moves containing an event template with pending `chooseOne` decisions returns a completed move with all decision params filled.
- **New agent test**: `GreedyAgent.chooseMove()` given legal moves containing an event template returns a completed move with all decision params filled and `applyMove()` succeeds.
- **New agent test**: `RandomAgent.chooseMove()` given legal moves containing a complete non-event move still works correctly (no regression).
- **New agent test**: With Gulf of Tonkin event template and a non-trivial seed, `RandomAgent` distributes pieces across at least 2 different cities (Spec Test 4).

### Invariants that must remain true

- **INV-1**: Deterministic replayability — same seed + same agent type = same move sequence.
- **INV-3**: Agents produce valid completed moves. `applyMove()` with agent-completed event moves succeeds without error.
- **INV-6**: Non-event moves are unaffected. Agents still handle regular moves identically.
