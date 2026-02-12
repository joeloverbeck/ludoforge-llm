# KERDECSEQMOD-002 - Template Moves in `legalMoves()`

**Status**: COMPLETED
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Task 25b.2)
**Depends on**: KERDECSEQMOD-001

## Goal

Modify `legalMoves()` so that actions with an associated `OperationProfileDef` emit a single **template move** (empty params) instead of exhaustively enumerating all parameter combinations. This eliminates the combinatorial explosion for multi-space operations (e.g., Train on ~30 eligible spaces = 2^30 variants).

Simple actions without operation profiles continue to enumerate fully as before.

## Scope

- Modify `legalMoves()` to detect actions with operation profiles and emit template moves
- Template moves have `params: {}` -- agents fill them via `legalChoices()`
- Template moves still respect legality predicates and cost validation
- Add/update unit tests for the new behavior

## File list it expects to touch

- `src/kernel/legal-moves.ts`
- `test/unit/kernel/legal-moves.test.ts`

## Out of scope

- The `legalChoices()` function itself (KERDECSEQMOD-001)
- Changes to `applyMove()` or `validateMove()` (KERDECSEQMOD-003)
- Agent updates (KERDECSEQMOD-005)
- Compound SA variant pre-generation for template moves (deferred to Spec 26)
- FITL-specific operation effects (Spec 26)

## Implementation Details

### Template move emission logic

For each action in `def.actions` during legal move enumeration:

1. Check if the action has an associated operation profile in `def.operationProfiles`
2. If YES (profiled action):
   - Verify actor matches active player
   - Verify action is within usage limits
   - Verify operation profile `legality.when` passes (if present)
   - Verify operation profile `cost.validate` passes (if present), OR `partialExecution.mode === 'allow'`
   - Emit a single template move: `{ actionId, params: {} }`
   - Do NOT enumerate parameter combinations
3. If NO (simple action):
   - Continue with existing exhaustive parameter enumeration

### Template move structure

```typescript
const templateMove: Move = {
  actionId: action.id,
  params: {},
};
```

### Notes on cost validation for template moves

For operations with per-space cost in resolution effects (i.e., `cost.spend: []`), `cost.validate` checks whether the player can afford at least 1 space. Per-space cost is enforced inside resolution effects.

### Compound move variants

For template moves, compound SA variants from `linkedSpecialActivityWindows` are NOT pre-generated. This is deferred to Spec 26.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/unit/kernel/legal-moves.test.js`

### Test cases (in `test/unit/kernel/legal-moves.test.ts`)

1. Operation with profile emits a template move with `params: {}`
2. Simple action (no profile) still emits fully-enumerated moves with all param combinations
3. Template move respects legality predicate (profile with failing `legality.when` produces no template)
4. Template move respects cost validation (profile with failing `cost.validate` and `partialExecution.mode === 'forbid'` produces no template)
5. Free operations produce template moves (free ops skip cost validation)
6. Limited operations produce template moves when within limits

### Invariants that must remain true

- All existing tests pass (no regression)
- Simple actions are completely unaffected -- identical `legalMoves()` output
- `legalMoves()` output for profiled actions is O(actions) instead of O(2^spaces)
- Template moves are valid `Move` objects with empty `params`
- The function remains pure (no state mutation)

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - `src/kernel/legal-moves.ts`: Added `resolveOperationProfile()` helper. Modified `legalMoves()` to emit `{ actionId, params: {} }` template moves for profiled actions. Includes try-catch guards for legality/cost conditions that may reference unavailable bindings at enumeration time.
  - `test/unit/kernel/legal-moves.test.ts`: Created with 8 test cases covering template emission, legality predicates, cost validation (forbid/allow modes), limits, mixed actions, and Move structure validation.
- **Deviations**: Added defensive try-catch around `evalCondition()` calls for `legality.when` and `cost.validate` — conditions may reference `{ ref: 'binding' }` which are unavailable during `legalMoves()` (only available during `applyMove()`). On error, the template is silently skipped.
- **Verification**: Build, typecheck, lint pass. 884/884 tests pass.
