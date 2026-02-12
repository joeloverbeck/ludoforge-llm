# Spec 25b: Kernel Decision Sequence Model

**Status**: Draft
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25a (kernel operation primitives)
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming Section 3.4 (EffectAST), 7.4 (Deterministic Engine)

## Overview

Extend the kernel so that multi-step player decisions within a single operation are resolved incrementally rather than requiring all choices to be encoded upfront in `Move.params`. This eliminates the combinatorial explosion in `legalMoves()` for operations targeting variable numbers of spaces (e.g., Train on ~30 eligible spaces = 2^30 move variants).

This is game-agnostic infrastructure that benefits any game with sequential in-operation decisions (COIN-series operations, Spirit Island targeting, Twilight Imperium movement, Terraforming Mars card plays, etc.).

## Problem Statement

The current kernel model requires all player choices in `Move.params`, and `legalMoves()` exhaustively enumerates all parameter combinations. For multi-space FITL operations:

- **Train** on ~30 eligible cities/provinces with no limit = 2^30 (~1B) legal moves
- Even "up to 3 spaces" from 30 eligible = ~4,500 moves per operation
- Each operation has 8 variants, some with compound SA interleaving

This makes exhaustive enumeration infeasible for operations with `chooseN` where the domain is large and the cardinality is variable.

## Scope

### In Scope

- **`legalChoices()` function**: Given a partially-filled move, return the next decision point with available options
- **Template moves**: `legalMoves()` returns template moves (actionId + empty params) for actions with operation profiles
- **`validateMove()` relaxation**: For operations with profiles, validate incrementally via effect execution rather than requiring exact match in `legalMoves()` output
- **`freeOperation` binding**: Inject `move.freeOperation` into effect context bindings so resolution effects can conditionally skip cost spending
- **Agent interface updates**: Agents use `legalChoices()` to incrementally build valid moves

### Out of Scope

- FITL-specific operation effects (Spec 26)
- Special activity effects (Spec 27)
- Non-player AI decision logic (Spec 30)

## Key Types & Interfaces

### ChoiceRequest

Returned by `legalChoices()` to indicate what decision is needed next:

```typescript
export interface ChoiceRequest {
  readonly complete: boolean;           // true = no more decisions needed, move is fully parameterized
  readonly name?: string;               // binding name for the next decision (undefined when complete)
  readonly type?: 'chooseOne' | 'chooseN';  // which effect produced this decision point
  readonly options?: readonly MoveParamValue[];  // legal values for the next choice
  readonly min?: number;                // minimum selections (for chooseN range mode)
  readonly max?: number;                // maximum selections (for chooseN range mode)
}
```

### Updated Move semantics

No changes to the `Move` interface itself. The `params` field continues to hold all resolved decisions. The difference is that for operations with profiles, agents build `params` incrementally using `legalChoices()` rather than selecting from a pre-enumerated list.

## Implementation Tasks

### Task 25b.1: `legalChoices()` function

Create a new exported function in `src/kernel/legal-choices.ts`:

```typescript
export function legalChoices(def: GameDef, state: GameState, partialMove: Move): ChoiceRequest;
```

**Behavior**:
1. Find the action and its operation profile (if any)
2. Build an effect context from `partialMove.params` as bindings
3. Walk the resolution stage effects sequentially
4. For each `chooseOne` or `chooseN` effect:
   - If the binding name is already present in `partialMove.params`, validate the selection against the computed domain and continue
   - If the binding name is NOT in `partialMove.params`, compute the options domain and return a `ChoiceRequest` with `complete: false`
5. If all `chooseOne`/`chooseN` bindings are satisfied, return `{ complete: true }`

**Key design decisions**:
- `legalChoices()` does NOT apply side effects (no state mutation). It only walks effects to find the next unbound decision point.
- The options domain is computed using `evalQuery` against the CURRENT state (not a hypothetical post-cost state), since per-space costs are paid inside resolution effects.
- For actions WITHOUT operation profiles (simple actions), `legalChoices()` walks `ActionDef.effects` instead.

**Edge cases**:
- If `partialMove.params` contains an invalid selection (not in domain), throw an error
- If the operation profile has `legality.when` that fails, return `{ complete: true }` (the move is illegal; `applyMove` will reject it)
- Nested `chooseOne`/`chooseN` inside `forEach` or `if` blocks: these produce decisions only when the enclosing context is resolved (i.e., the `forEach` binding must already be in params)

Modify:
- `src/kernel/legal-choices.ts` (NEW file)
- `src/kernel/index.ts` (export the new module)
- `src/kernel/types.ts` (add `ChoiceRequest` interface)

Tests:
- `test/unit/kernel/legal-choices.test.ts` (NEW)
  - Simple action with no chooseOne/chooseN returns `{ complete: true }` immediately
  - Action with one `chooseOne` returns options on first call, `complete: true` after param filled
  - Action with one `chooseN` (range mode) returns options with min/max
  - Action with multiple sequential choices returns them one at a time
  - Invalid selection in params throws error
  - `chooseN` inside `forEach` only triggers after forEach binding resolved

### Task 25b.2: Template moves in `legalMoves()`

Modify `src/kernel/legal-moves.ts`:

For actions that have an associated `OperationProfileDef` (found via `def.operationProfiles`), instead of exhaustively enumerating all parameter combinations, emit a single **template move** per legal operation:

```typescript
const templateMove: Move = {
  actionId: action.id,
  params: {},  // empty — agent fills via legalChoices()
};
```

Template moves are emitted when:
1. The action has an associated operation profile
2. The action's actor matches the active player
3. The action is within usage limits
4. The operation profile's `legality.when` (if present) passes
5. The operation profile's `cost.validate` (if present) passes (or partialMode is 'allow')

Simple actions (no operation profile) continue to enumerate fully as before.

**Note on multi-space cost validation**: For operations with per-space cost in resolution effects (i.e., `cost.spend: []`), `cost.validate` checks whether the player can afford **at least 1 space**. The per-space cost is enforced inside resolution effects using the `freeOperation` guard. The `legalChoices()` options domain is not constrained by remaining resources -- resource exhaustion is handled by the resolution effects themselves (the player selects spaces, and the `addVar` effects deduct cost per space, with the variable's min/max bounds clamping at zero).

**Compound move variants**: For template moves, compound SA variants (from `linkedSpecialActivityWindows`) are NOT pre-generated. Instead, compound SA selection happens after the agent completes the operation's decisions. This defers compound move variant generation to a later step.

Modify:
- `src/kernel/legal-moves.ts`

Tests:
- Operations with profiles produce template moves (empty params)
- Simple actions still produce fully-enumerated moves
- Template moves respect legality and cost validation
- Free operations produce template moves
- Limited operations produce template moves (agents restrict via `legalChoices`)

### Task 25b.3: `validateMove()` relaxation

Modify `src/kernel/apply-move.ts`:

For moves whose action has an operation profile, relax validation:
- Instead of requiring exact match in `legalMoves()` output (which only has template moves), check:
  1. The actionId matches a legal template move (action is legal for this player in this state)
  2. Run `legalChoices()` to verify all params are valid — the function returns `{ complete: true }` for a fully valid move
- If `legalChoices()` throws (invalid param), propagate as an illegal move error

For moves whose action has NO operation profile, keep existing validation (exact match in `legalMoves()`).

Modify:
- `src/kernel/apply-move.ts`

Tests:
- Operation moves with valid params pass validation
- Operation moves with invalid params fail validation
- Simple action moves still validate via exact match
- Operation moves with incomplete params fail validation

### Task 25b.4: `freeOperation` binding in effect context

Modify `src/kernel/apply-move.ts`:

Inject `move.freeOperation` into the effect context bindings so that resolution effects can reference it via `{ ref: 'binding', name: 'freeOperation' }`:

```typescript
const effectCtxBase = {
  ...
  bindings: { ...move.params, freeOperation: move.freeOperation ?? false },
};
```

This allows operation resolution effects to conditionally skip per-space cost via:

```yaml
- if:
    when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
    then:
      - addVar: { scope: global, var: arvnResources, delta: -3 }
```

Modify:
- `src/kernel/apply-move.ts`

Tests:
- `freeOperation: true` makes binding `freeOperation` resolve to `true`
- `freeOperation: false` (or absent) makes binding `freeOperation` resolve to `false`
- Resolution effects can read `freeOperation` via `{ ref: 'binding', name: 'freeOperation' }`
- Per-space cost is conditionally skipped when `freeOperation` is `true`

### Task 25b.5: Agent interface updates

Update `RandomAgent` and `GreedyAgent` to support the template move + `legalChoices()` pattern.

**RandomAgent**:
```typescript
chooseMove(input) {
  // Partition legal moves into template moves and fully-parameterized moves
  // For template moves: use legalChoices() loop to fill params randomly
  // For fully-parameterized moves: select randomly as before
  // Combine into a single candidate pool and pick randomly
}
```

The `legalChoices()` loop pattern:
```typescript
let move = templateMove;
let choices = legalChoices(def, state, move);
while (!choices.complete) {
  // For chooseOne: pick one random option
  // For chooseN: pick random count in [min, max], then random subset
  const selected = randomSelect(choices, rng);
  move = { ...move, params: { ...move.params, [choices.name!]: selected } };
  choices = legalChoices(def, state, move);
}
```

**GreedyAgent**:
- For template moves: use `legalChoices()` with greedy heuristic at each decision point
- Alternatively, generate N random complete moves from each template and evaluate them
- Keep the `maxMovesToEvaluate` cap

Modify:
- `src/agents/random-agent.ts`
- `src/agents/greedy-agent.ts`

Tests:
- RandomAgent can play operations via template moves
- RandomAgent still works with simple (non-template) moves
- GreedyAgent can play operations via template moves
- Both agents produce deterministic results with same seed

## Testing Requirements

### Unit Tests (NEW: `test/unit/kernel/legal-choices.test.ts`)

1. Simple action (no profile) with `chooseOne` in effects → returns options, then complete
2. Action with `chooseN` (exact n) → returns options with cardinality constraint
3. Action with `chooseN` (range min/max) → returns options with min/max
4. Multiple sequential `chooseOne`s → returns them one at a time
5. `chooseN` followed by `forEach` with inner `chooseOne` → inner choice only after outer resolved
6. Invalid selection → throws descriptive error
7. Action with no choices → returns `{ complete: true }` immediately

### Unit Tests (UPDATED: `test/unit/kernel/legal-moves.test.ts`)

8. Operation with profile → emits template move with empty params
9. Simple action → still emits fully-enumerated moves
10. Template move respects legality predicate
11. Template move respects cost validation

### Unit Tests (UPDATED: `test/unit/kernel/apply-move.test.ts`)

12. Operation move with valid filled params → passes validation
13. Operation move with invalid params → fails validation
14. Operation move with `freeOperation: true` → binding available in effects
15. Simple action move → still validates via exact match

### Integration Tests (NEW: `test/integration/decision-sequence.test.ts`)

16. RandomAgent plays a multi-choice operation from template to completion
17. GreedyAgent plays a multi-choice operation
18. Same seed produces identical results for template-based moves
19. Free operation via template move skips per-space cost

## Acceptance Criteria

1. `legalChoices()` correctly identifies the next unbound decision point
2. `legalMoves()` returns template moves for operations with profiles
3. `validateMove()` accepts operation moves validated via `legalChoices()`
4. `freeOperation` binding is accessible in resolution effects
5. RandomAgent and GreedyAgent can play operations via the new model
6. All existing tests pass (no regression)
7. Build passes (`npm run build`)
8. Typecheck passes (`npm run typecheck`)
9. Lint passes (`npm run lint`)

## Design Rationale

### Why not enumerate subsets?

Even "up to 3 from 30" produces ~4,500 combinations. With 8 operations, some with compound SA variants, the move list explodes. The template + incremental approach keeps `legalMoves()` O(actions) instead of O(2^spaces).

### Why walk effects to find decision points?

The decision structure IS the effect AST. Rather than duplicating targeting/choice logic in a separate system, we reuse the existing `chooseOne`/`chooseN` effects as the source of truth. This keeps the kernel DRY and ensures the decision sequence matches the execution sequence exactly.

### Why not change the Agent interface signature?

The `Agent.chooseMove` interface stays the same — agents receive `legalMoves` (which now includes templates) and return a complete `Move`. The `legalChoices()` function is a tool agents USE internally, not a change to the contract. This preserves backward compatibility for simple games.

### Backward compatibility

- Simple games (no operation profiles) are completely unaffected
- `legalMoves()` output for simple actions is identical
- `validateMove()` for simple actions is identical
- Only operations with profiles use the new template + `legalChoices()` path
