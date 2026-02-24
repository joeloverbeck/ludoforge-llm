# EVEINTCHOPRO-004: Add event choice protocol validation tests

**Spec**: 50 (Event Interactive Choice Protocol)
**Priority**: High
**Depends on**: EVEINTCHOPRO-001, EVEINTCHOPRO-002
**Blocks**: None (EVEINTCHOPRO-005 can run in parallel)

## Summary

Add new integration tests that validate the interactive choice protocol end-to-end. These tests prove that the step-by-step `legalChoicesEvaluate` → decide → repeat loop works correctly for event effects, that agents produce properly distributed choices, and that edge cases (zero pieces, fewer-than-limit, no-chooseOne events) are handled correctly.

These correspond to Spec 50 Tests 1-9.

## File List

| File | Change |
|------|--------|
| `packages/engine/test/integration/event-choice-protocol.test.ts` | **New file** — protocol validation tests |

## Tests to Implement

### Test 1: Event template move has base params only (Spec Test 1)

```
Setup: Gulf of Tonkin card-1, 8 US pieces in out-of-play
Action: Call legalMoves(def, state)
Assert:
  - The unshaded event move has params keys: eventCardId, eventDeckId, side
  - The move does NOT have any key matching /decision:.*chooseOne/
  - Total event move count equals the number of satisfiable event sides (unshaded + shaded)
```

### Test 2: legalChoicesEvaluate returns pending choice for event template (Spec Test 2)

```
Setup: Gulf of Tonkin card-1 unshaded event template (from legalMoves)
Action: Call legalChoicesEvaluate(def, state, templateMove)
Assert:
  - Returns kind: 'pending'
  - Returns type: 'chooseOne'
  - Options include all 8 FITL city zones
  - decisionId contains 'chooseOne' and '$targetCity'
```

### Test 3: Step-by-step completion resolves all decisions (Spec Test 3)

```
Setup: Gulf of Tonkin card-1, 8 US pieces in out-of-play
Action: Call completeTemplateMove(def, state, templateMove, rng)
Assert:
  - Returns non-null
  - Returned move has exactly 6 decision params (one per forEach iteration)
  - Each decision value is a valid city zone ID (exists in def.zones with category 'city')
  - applyMove(def, state, completedMove) succeeds without error
  - 6 pieces moved to cities, 2 remain in out-of-play
```

### Test 4: Agent-completed event move distributes across cities (Spec Test 4)

```
Setup: Gulf of Tonkin card-1, 8 US pieces in out-of-play
Action: RandomAgent.chooseMove() with event templates in legal moves, non-trivial seed
Assert:
  - Agent returns a valid completed event move
  - After applyMove, pieces land in at least 2 different city zones
  - 6 pieces total in cities
Note: Probabilistic — P(all same city) ≈ (1/8)^5 ≈ 0.00003. If a specific seed fails,
      try seeds: 7, 13, 42, 100, 999 — at least one must distribute.
```

### Test 5: GreedyAgent completes event templates (Spec Test 5)

```
Setup: Gulf of Tonkin card-1, 8 US pieces in out-of-play
Action: GreedyAgent.chooseMove() with event templates in legal moves
Assert:
  - Returns a valid completed event move
  - applyMove succeeds
  - 6 pieces moved to cities
```

### Test 6: Fewer-than-limit pieces produce fewer decisions (Spec Test 6)

```
Setup: Gulf of Tonkin card-1, only 4 US pieces in out-of-play (2 troops + 2 bases)
Action: completeTemplateMove on the unshaded event template
Assert:
  - Completed move has exactly 4 decision params (not 6)
  - After applyMove: 4 pieces in cities, 0 in out-of-play
```

### Test 7: Zero pieces produce a complete move (Spec Test 7)

```
Setup: Gulf of Tonkin card-1, 0 US pieces in out-of-play
Action: legalChoicesEvaluate(def, state, unshadedEventMove)
Assert:
  - Returns kind: 'complete' (no pending decisions — forEach body never executes)
  - applyMove with the unresolved template succeeds directly
  - No pieces moved to cities
```

### Test 8: Events without chooseOne are emitted as complete moves (Spec Test 8)

```
Setup: Gulf of Tonkin card-1, the shaded side has only moveAll + addVar (no chooseOne)
Action: legalMoves returns the shaded event move
Assert:
  - legalChoicesEvaluate returns kind: 'complete'
  - applyMove succeeds directly without template completion
```

### Test 9: Satisfiability gating excludes impossible events (Spec Test 9)

```
Setup: An event card whose chooseOne queries return 0 options
  (this needs careful setup — e.g., an event requiring "choose a city zone"
  but all city zones have been removed from the game, or a filter that matches nothing)
  If constructing this scenario from production FITL is impractical, use a minimal
  synthetic GameDef fixture with a custom event card.
Action: legalMoves(def, state)
Assert:
  - The event move for that side is NOT in the legal moves list
  - OR the event move IS present but legalChoicesEvaluate returns kind: 'illegal'
```

## Out of Scope

- Changes to kernel source code (`legal-moves.ts`, `effects-choice.ts`, etc.)
- Changes to agent source code
- Changes to existing test files
- Simulator or E2E tests — that is EVEINTCHOPRO-005
- Browser runner tests

## Acceptance Criteria

### Tests that must pass

All 9 tests in the new `event-choice-protocol.test.ts` file must pass.

### Invariants that must remain true

- **INV-2**: Satisfiability gating — Test 9 confirms unsatisfiable events are excluded.
- **INV-3**: Agent-completed moves are valid — Tests 4, 5 confirm `applyMove` succeeds.
- **INV-4**: Zero-piece no-op — Test 7 confirms.
- **INV-5**: No-chooseOne events are complete — Test 8 confirms.

### Verification

```bash
pnpm turbo build
node --test packages/engine/dist/test/integration/event-choice-protocol.test.js
```
