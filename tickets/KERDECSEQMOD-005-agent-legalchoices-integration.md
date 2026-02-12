# KERDECSEQMOD-005 - Agent `legalChoices()` Integration

**Status**: Not started
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Task 25b.5)
**Depends on**: KERDECSEQMOD-001, KERDECSEQMOD-002, KERDECSEQMOD-003

## Goal

Update `RandomAgent` and `GreedyAgent` to handle template moves from `legalMoves()`. When an agent receives a template move (empty params for a profiled action), it must use the `legalChoices()` loop to incrementally fill in parameters before returning a complete move.

## Scope

- Modify `RandomAgent.chooseMove()` to detect template moves and fill params via `legalChoices()` loop
- Modify `GreedyAgent.chooseMove()` to do the same with greedy heuristic (or N-random-completions strategy)
- Add a safety guard against infinite loops (`MAX_CHOICES = 50`)
- Add unit tests for both agents with template moves

## File list it expects to touch

- `src/agents/random-agent.ts`
- `src/agents/greedy-agent.ts`
- `test/unit/agents/random-agent.test.ts`
- `test/unit/agents/greedy-agent.test.ts`

## Out of scope

- The `legalChoices()` function itself (KERDECSEQMOD-001)
- The `legalMoves()` template move changes (KERDECSEQMOD-002)
- The `validateMove()` relaxation (KERDECSEQMOD-003)
- `__freeOperation` binding (KERDECSEQMOD-004)
- Integration tests (KERDECSEQMOD-006)
- FITL-specific operation effects (Spec 26)
- Non-player AI decision logic (Spec 30)
- Changes to the `Agent` interface signature (it stays the same)

## Implementation Details

### Template move detection

A template move is a move whose action has an associated operation profile and whose `params` is empty (`{}`). The agent can detect this by checking:

```typescript
const isTemplate = def.operationProfiles?.some(p => p.actionId === move.actionId)
  && Object.keys(move.params).length === 0;
```

### `legalChoices()` loop pattern (shared by both agents)

```typescript
const MAX_CHOICES = 50;
let current = { ...templateMove };
let choices = legalChoices(def, state, current);
let iterations = 0;
while (!choices.complete) {
  if (++iterations > MAX_CHOICES) {
    throw new Error(`Choice loop exceeded ${MAX_CHOICES} iterations for action ${current.actionId}`);
  }
  const selected = selectFromChoices(choices, rng); // agent-specific
  current = { ...current, params: { ...current.params, [choices.name!]: selected } };
  choices = legalChoices(def, state, current);
}
return current;
```

### RandomAgent specifics

- For `chooseOne`: pick one random option from `choices.options` using PRNG
- For `chooseN`: pick a random count in `[min, max]`, then pick a random subset of that size
- If `choices.options` is empty (unplayable template): skip this template move, try next legal move
- Partition `legalMoves` output into template moves and fully-parameterized moves; combine completed templates with fully-parameterized moves into a single candidate pool, then pick randomly

### GreedyAgent specifics

- Generate N random complete moves from each template (using the `legalChoices()` loop with random selections)
- Combine with fully-parameterized moves
- Evaluate all candidates via `applyMove()` + `evaluateState()`
- Return highest-scoring move (existing tiebreak with random)
- Keep the `maxMovesToEvaluate` cap

### RNG threading

Both agents must thread the PRNG correctly through the `legalChoices()` loop so that determinism is preserved. Each random selection consumes RNG state, and the final RNG must be returned.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/unit/agents/random-agent.test.js`
- `node --test dist/test/unit/agents/greedy-agent.test.js`

### Test cases

#### RandomAgent (`test/unit/agents/random-agent.test.ts`)

1. RandomAgent can play operations via template moves (fills params via `legalChoices()` loop)
2. RandomAgent still works with simple (non-template) moves as before
3. RandomAgent produces deterministic results with same seed
4. RandomAgent skips unplayable templates (empty options domain)

#### GreedyAgent (`test/unit/agents/greedy-agent.test.ts`)

1. GreedyAgent can play operations via template moves
2. GreedyAgent still works with simple (non-template) moves as before
3. GreedyAgent produces deterministic results with same seed
4. GreedyAgent respects `maxMovesToEvaluate` cap with template moves

### Invariants that must remain true

- All existing tests pass (no regression)
- The `Agent` interface signature is unchanged
- Both agents produce deterministic output given the same seed and state
- The `MAX_CHOICES` guard prevents infinite loops
- Simple games (no operation profiles) are completely unaffected
- RNG state is correctly threaded through template move completion
