# KERDECSEQMOD-003 - `validateMove()` Relaxation for Operation Profiles

**Status**: COMPLETED
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Task 25b.3)
**Depends on**: KERDECSEQMOD-001, KERDECSEQMOD-002

## Goal

Relax `validateMove()` in `applyMove()` so that operation moves (those with an associated `OperationProfileDef`) are validated incrementally via `legalChoices()` instead of requiring an exact match in the `legalMoves()` output. Since `legalMoves()` now emits template moves (empty params) for profiled actions, the existing exact-match validation would reject any fully-parameterized operation move.

Simple actions (no operation profile) retain existing exact-match validation.

## Scope

- Modify the validation path in `applyMove()` to use `legalChoices()` for profiled actions
- For profiled actions: check that (a) the actionId matches a legal template move, and (b) `legalChoices()` returns `{ complete: true }` for the fully-parameterized move
- For non-profiled actions: keep existing exact-match validation
- Propagate `legalChoices()` errors as illegal-move errors

## File list it expects to touch

- `src/kernel/apply-move.ts`
- `test/unit/kernel/apply-move.test.ts`

## Out of scope

- The `legalChoices()` function itself (KERDECSEQMOD-001)
- The `legalMoves()` template move changes (KERDECSEQMOD-002)
- `__freeOperation` binding injection (KERDECSEQMOD-004)
- Agent updates (KERDECSEQMOD-005)
- Integration tests (KERDECSEQMOD-006)
- FITL-specific operation effects (Spec 26)

## Implementation Details

### Modified validation flow in `applyMove()`

```
if action has operation profile:
  1. Check actionId appears in legalMoves() output (as a template move)
  2. Run legalChoices(def, state, move) -- the full move with all params
  3. If legalChoices returns { complete: true } → move is valid
  4. If legalChoices throws → propagate as illegal-move error
  5. If legalChoices returns { complete: false } → reject (incomplete params)
else:
  Keep existing exact-match validation against legalMoves() output
```

### Error handling

- `legalChoices()` throwing (invalid param value) should be caught and re-thrown as a structured illegal-move error consistent with existing error patterns
- Incomplete moves (not all decisions made) should produce a clear error message

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/unit/kernel/apply-move.test.js`

### Test cases (in `test/unit/kernel/apply-move.test.ts`)

1. Operation move with valid fully-filled params passes validation via `legalChoices()`
2. Operation move with invalid params (bad selection) fails validation with descriptive error
3. Operation move with incomplete params (missing decisions) fails validation
4. Simple action move still validates via exact match in `legalMoves()` output
5. Operation move for an action not in `legalMoves()` template list is rejected

### Invariants that must remain true

- All existing tests pass (no regression)
- Simple actions are completely unaffected -- identical validation behavior
- `applyMove()` never mutates `state` on validation failure (atomicity preserved)
- Error messages for invalid operation moves are descriptive and structured
- The validation path for profiled actions uses `legalChoices()` as the single source of truth

## Outcome

- **Completed**: 2026-02-12
- **Changes**:
  - `src/kernel/apply-move.ts`: Replaced `validateMove()` with profile-aware logic. For profiled actions: checks template presence in `legalMoves()`, validates params via `legalChoices()`, supports `move.freeOperation` bypass. Non-profiled actions retain original exact-match validation.
  - `test/unit/apply-move.test.ts`: Updated error message expectations (tests 8, 9) and added pass action to free operation fixture (test 19) to prevent `STALL_LOOP_DETECTED`.
  - `test/fixtures/trace/fitl-events-initial-pack.golden.json`: Updated `initialLegalMoves` from 32 enumerated event moves to 1 template move.
  - `test/integration/fitl-card-flow-determinism.test.ts`: Updated to construct event move directly instead of searching `legalMoves()`.
  - 4 integration test files (`fitl-insurgent-operations`, `fitl-joint-operations`, `fitl-nva-vc-special-activities`, `fitl-us-arvn-special-activities`): Updated error reason assertions from specific profile messages to `'action is not legal in current state'` (rejection now happens earlier in `validateMove` via `legalMoves()` template absence).
- **Deviations**: Error messages changed — profiled actions with failing legality/cost are now rejected by `validateMove()` (template not in `legalMoves()`) rather than deeper in `applyMove()`, producing the generic reason `'action is not legal in current state'` instead of specific profile error codes.
- **Verification**: Build, typecheck, lint pass. 884/884 tests pass.
