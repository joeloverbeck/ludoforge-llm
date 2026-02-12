# KERDECSEQMOD-001 - ChoiceRequest Type and `legalChoices()` Core Function

**Status**: Not started
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Task 25b.1)
**Depends on**: None (builds on existing types from Spec 25a)

## Goal

Add the `ChoiceRequest` interface to kernel types and implement the core `legalChoices()` function that walks an action's effect AST to identify the next unbound decision point (`chooseOne` or `chooseN`), returning a `ChoiceRequest` describing the available options.

This is the foundation of the incremental decision model: given a partially-filled `Move`, `legalChoices()` tells the caller what the next decision is (or that the move is complete).

## Scope

- Add `ChoiceRequest` interface to `src/kernel/types.ts`
- Create `src/kernel/legal-choices.ts` with the `legalChoices()` function
- Export the new module from `src/kernel/index.ts`
- Full unit test suite for the function

## File list it expects to touch

- `src/kernel/types.ts` (add `ChoiceRequest` interface)
- `src/kernel/legal-choices.ts` (**NEW** file)
- `src/kernel/index.ts` (add re-export)
- `test/unit/kernel/legal-choices.test.ts` (**NEW** file)

## Out of scope

- Changes to `legalMoves()` (that is KERDECSEQMOD-002)
- Changes to `applyMove()` or `validateMove()` (that is KERDECSEQMOD-003)
- `__freeOperation` binding injection (that is KERDECSEQMOD-004)
- Agent updates (that is KERDECSEQMOD-005)
- Integration tests (that is KERDECSEQMOD-006)
- FITL-specific operation effects (Spec 26)
- Any changes to the `Move` interface itself

## Implementation Details

### `ChoiceRequest` interface (in `types.ts`)

```typescript
export interface ChoiceRequest {
  readonly complete: boolean;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
}
```

### `legalChoices()` function signature

```typescript
export function legalChoices(def: GameDef, state: GameState, partialMove: Move): ChoiceRequest;
```

### Effect traversal behavior

| Effect type | Behavior |
|-------------|----------|
| `chooseOne` | DECISION POINT -- if unbound, return `ChoiceRequest`; if bound, validate and continue |
| `chooseN` | DECISION POINT -- same as above |
| `if` | TRAVERSE -- evaluate condition, walk matching branch only |
| `forEach` | TRAVERSE -- resolve `over`, walk inner effects (no inner choices allowed) |
| `let` | EVALUATE -- compute binding value, add to context, walk `in` effects |
| `rollRandom` | STOP -- do not walk `in` effects |
| `setVar`, `addVar`, `moveToken`, `moveAll`, `moveTokenAdjacent`, `createToken`, `destroyToken`, `draw`, `shuffle`, `setTokenProp`, `setMarker`, `shiftMarker` | SKIP |

### Key behaviors

- For actions WITH operation profiles: walk `resolution` stage effects
- For actions WITHOUT operation profiles: walk `ActionDef.effects`
- Does NOT apply side effects (no state mutation)
- Evaluates read-only constructs: `let` and `if`
- Options domain computed via `evalQuery` against current state
- `max` for `chooseN` clamped to `Math.min(declaredMax, options.length)`
- Invalid selection in `partialMove.params` throws descriptive error
- Operation profile `legality.when` failure returns `{ complete: true }`
- `chooseN` with `min >= 1` and empty domain returns `ChoiceRequest` with `options: []`

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/unit/kernel/legal-choices.test.js`

### Test cases (in `test/unit/kernel/legal-choices.test.ts`)

1. Simple action with no `chooseOne`/`chooseN` returns `{ complete: true }` immediately
2. Action with one `chooseOne` returns options on first call, `{ complete: true }` after param filled
3. Action with one `chooseN` (range mode) returns options with min/max, max clamped to domain size
4. Action with multiple sequential `chooseOne`s returns them one at a time
5. Invalid selection in params throws descriptive error
6. `chooseOne` inside `if.then` only appears when condition is true (walk matching branch only)
7. `chooseN` with `min >= 1` and empty domain returns `ChoiceRequest` with `options: []`
8. `legalChoices` evaluates `let` bindings so subsequent options queries reference them correctly
9. `legalChoices` does NOT walk `rollRandom.in` effects (returns `{ complete: true }` before inner choices)
10. Action with `chooseN` exact-n mode returns options with correct cardinality constraint

### Invariants that must remain true

- `legalChoices()` is pure: it does NOT mutate `state` or `partialMove`
- All existing tests pass (no regression)
- The function handles both profiled and non-profiled actions
- Binding names starting with `__` are reserved for kernel use (not validated here, but the function must not create such bindings)
