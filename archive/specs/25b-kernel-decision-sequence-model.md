# Spec 25b: Kernel Decision Sequence Model

**Status**: COMPLETED
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
- **`__freeOperation` binding**: Inject `move.freeOperation` into effect context bindings as `__freeOperation` (reserved kernel prefix) so resolution effects can conditionally skip cost spending
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
- `legalChoices()` evaluates read-only constructs that produce bindings: `let` (computes a value) and `if` (evaluates condition to determine which branch to walk). These are not side effects — they don't mutate state. Side-effect-producing effects (`setVar`, `addVar`, `moveToken`, `createToken`, etc.) are skipped.
- The options domain is computed using `evalQuery` against the CURRENT state (not a hypothetical post-cost state), since per-space costs are paid inside resolution effects.
- For actions WITHOUT operation profiles (simple actions), `legalChoices()` walks `ActionDef.effects` instead. This includes event resolution actions, which use `chooseOne` for branch selection and `chooseN` for target selection.
- `legalChoices()` walks resolution stage effects only. Cost effects (`cost.spend`) MUST NOT contain `chooseOne`/`chooseN`. Cost is always a deterministic deduction.

**Structural constraints**:
- `chooseOne` and `chooseN` effects MUST NOT appear inside `forEach` blocks. Per-element resolution within `forEach` MUST be deterministic. Rationale: `applyChooseOne()` reads from `ctx.moveParams[bind]` (a flat record). In a `forEach` with N iterations, an inner `chooseOne { bind: '$x' }` reads the SAME `$x` for all iterations — there's no way to store per-iteration values in the flat `move.params` record, and `legalChoices()` can't return N separate decision points with the same binding name. Future extension: indexed bindings (e.g., `$pieceType[0]`) could enable per-iteration choices if needed for other games.
- `chooseOne` and `chooseN` effects MUST NOT appear inside `rollRandom.in` blocks. The random value is unknown during decision-building, so `legalChoices()` cannot compute options that depend on it.
- Binding names starting with `__` (double underscore) are reserved for kernel use and MUST NOT be used in game specifications.

**Effect traversal behavior**:

| Effect type | `legalChoices()` behavior |
|-------------|--------------------------|
| `chooseOne` | **DECISION POINT** — if unbound, return `ChoiceRequest`; if bound, validate and continue |
| `chooseN` | **DECISION POINT** — same as `chooseOne` |
| `if` | **TRAVERSE** — evaluate condition against current state + existing bindings; walk the matching branch only (`then` or `else`). Do NOT walk both branches. |
| `forEach` | **TRAVERSE** — resolve `over` binding, walk inner effects (no inner choices allowed per structural constraint) |
| `let` | **EVALUATE** — compute binding value, add to context, walk `in` effects |
| `rollRandom` | **STOP** — do not walk `in` effects (choices inside `rollRandom` forbidden per structural constraint) |
| `setVar` | SKIP |
| `addVar` | SKIP |
| `moveToken` | SKIP |
| `moveAll` | SKIP |
| `moveTokenAdjacent` | SKIP |
| `createToken` | SKIP |
| `destroyToken` | SKIP |
| `draw` | SKIP |
| `shuffle` | SKIP |
| `setTokenProp` | SKIP |
| `setMarker` | SKIP |
| `shiftMarker` | SKIP |

**Edge cases**:
- If `partialMove.params` contains an invalid selection (not in domain), throw an error
- If the operation profile has `legality.when` that fails, return `{ complete: true }` (the move is illegal; `applyMove` will reject it)
- If `chooseOne` or `chooseN` (with `min >= 1`) has an empty options domain, return a `ChoiceRequest` with `options: []`. The agent sees empty options and knows this template move is unplayable — it should skip this template.
- The returned `max` for `chooseN` is clamped to the domain size: `max = Math.min(declaredMax, options.length)`

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
  - `chooseOne` inside `if.then` only appears when condition is true
  - `chooseN` with `min >= 1` and empty domain returns `ChoiceRequest` with `options: []`
  - `legalChoices` evaluates `let` bindings so subsequent options queries can reference them

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

**Compound move variants**: For template moves, compound SA variants (from `linkedSpecialActivityWindows`) are NOT pre-generated. Compound move construction for template moves is deferred to Spec 26 (Operations Full Effects). Spec 25b tests use operations WITHOUT linked special activities. Agents in spec 25b only build the operation part via `legalChoices()`; the compound SA interleaving mechanism is designed in Spec 26.

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

### Task 25b.4: `__freeOperation` binding in effect context

Modify `src/kernel/apply-move.ts`:

Inject `move.freeOperation` into the effect context bindings under the reserved name `__freeOperation` so that resolution effects can reference it via `{ ref: 'binding', name: '__freeOperation' }`:

```typescript
const effectCtxBase = {
  ...
  bindings: { ...move.params, __freeOperation: move.freeOperation ?? false },
};
```

The `__` prefix indicates a kernel-reserved binding name, preventing collision with game-designer bindings. All binding names starting with `__` are reserved for kernel use (see structural constraints in Task 25b.1).

This allows operation resolution effects to conditionally skip per-space cost via:

```yaml
- if:
    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
    then:
      - addVar: { scope: global, var: arvnResources, delta: -3 }
```

Modify:
- `src/kernel/apply-move.ts`

Tests:
- `freeOperation: true` makes binding `__freeOperation` resolve to `true`
- `freeOperation: false` (or absent) makes binding `__freeOperation` resolve to `false`
- Resolution effects can read `__freeOperation` via `{ ref: 'binding', name: '__freeOperation' }`
- Per-space cost is conditionally skipped when `__freeOperation` is `true`

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
const MAX_CHOICES = 50; // Safety guard against infinite loops
let move = templateMove;
let choices = legalChoices(def, state, move);
let iterations = 0;
while (!choices.complete) {
  if (++iterations > MAX_CHOICES) {
    throw new Error(`Choice loop exceeded ${MAX_CHOICES} iterations for action ${move.actionId}`);
  }
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
3. Action with `chooseN` (range min/max) → returns options with min/max, `max` clamped to domain size
4. Multiple sequential `chooseOne`s → returns them one at a time
5. `chooseOne` inside `if.then` only appears when condition is true (walk matching branch only)
6. Invalid selection → throws descriptive error
7. Action with no choices → returns `{ complete: true }` immediately
8. `chooseN` with `min >= 1` and empty domain → returns `ChoiceRequest` with `options: []`
9. `legalChoices` evaluates `let` bindings so subsequent options queries reference them correctly
10. `legalChoices` does NOT walk `rollRandom.in` effects (returns `complete: true` before inner choices)

### Unit Tests (UPDATED: `test/unit/kernel/legal-moves.test.ts`)

11. Operation with profile → emits template move with empty params
12. Simple action → still emits fully-enumerated moves
13. Template move respects legality predicate
14. Template move respects cost validation

### Unit Tests (UPDATED: `test/unit/kernel/apply-move.test.ts`)

15. Operation move with valid filled params → passes validation
16. Operation move with invalid params → fails validation
17. Operation move with `__freeOperation: true` → binding available in effects
18. Simple action move → still validates via exact match

### Integration Tests (NEW: `test/integration/decision-sequence.test.ts`)

19. RandomAgent plays a multi-choice operation from template to completion
20. GreedyAgent plays a multi-choice operation
21. Same seed produces identical results for template-based moves
22. Free operation via template move skips per-space cost

## Acceptance Criteria

1. `legalChoices()` correctly identifies the next unbound decision point
2. `legalMoves()` returns template moves for operations with profiles
3. `validateMove()` accepts operation moves validated via `legalChoices()`
4. `__freeOperation` binding is accessible in resolution effects
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

### Future extensions (not needed for FITL)

- **Dynamic cardinality**: `chooseN.min`/`max`/`n` could accept `ValueExpr` instead of static numbers, enabling state-dependent cardinality (e.g., "choose up to N spaces where N = resources / 3"). This would change `EffectAST` types with wide impact. Defer until a concrete game requires it.
- **Ordered choices**: `chooseN` currently enforces uniqueness (set semantics). Some games need ordered sequences or duplicates. A `chooseN.ordering: 'set' | 'sequence'` flag could be added. FITL operations don't need this.
- **Multi-phase operations**: An `applyMovePartial()` function for operations where later choices depend on effects from earlier choices (e.g., Spirit Island cascading powers). FITL per-space resolution is deterministic, so this isn't needed now.
- **Indexed bindings for forEach inner choices**: Per-iteration choices inside `forEach` could use indexed binding names (e.g., `$pieceType[0]`, `$pieceType[1]`). This would require changes to the flat `move.params` record and the `legalChoices()` loop. Defer until a concrete game demonstrates the need.

## Outcome

**Completed**: 2026-02-12

### Implementation summary

All 5 tasks (25b.1–25b.5) plus the integration test ticket (KERDECSEQMOD-006) were implemented across 6 commits:

| Task | Ticket | What was delivered |
|------|--------|--------------------|
| 25b.1 | KERDECSEQMOD-001 | `legalChoices()` in `src/kernel/legal-choices.ts`, `ChoiceRequest` type |
| 25b.2 | KERDECSEQMOD-002 | Template moves in `legalMoves()` for profiled actions |
| 25b.3 | KERDECSEQMOD-003 | `validateMove()` relaxation for operation moves via `legalChoices()` |
| 25b.4 | KERDECSEQMOD-004 | `__freeOperation` binding injection in effect context |
| 25b.5 | KERDECSEQMOD-005 | RandomAgent + GreedyAgent template completion via `completeTemplateMove()` |
| Integration | KERDECSEQMOD-006 | 8 end-to-end integration tests in `test/integration/decision-sequence.test.ts` |

### Key files created/modified
- `src/kernel/legal-choices.ts` (NEW)
- `src/kernel/types.ts` (ChoiceRequest interface)
- `src/kernel/legal-moves.ts` (template move emission)
- `src/kernel/apply-move.ts` (validation relaxation + __freeOperation binding)
- `src/agents/template-completion.ts` (NEW — shared legalChoices loop)
- `src/agents/random-agent.ts` (template move support)
- `src/agents/greedy-agent.ts` (template move support with N-completion sampling)
- `test/integration/decision-sequence.test.ts` (NEW — 8 integration tests)

### Verification
- All 904 tests pass, 0 failures
- Build, typecheck, and lint all clean
