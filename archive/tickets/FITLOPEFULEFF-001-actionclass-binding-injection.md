# FITLOPEFULEFF-001: `__actionClass` Binding Injection

**Status**: COMPLETED
**Priority**: P0 (blocker — all operation profiles depend on this)
**Estimated effort**: Small (1-2 hours)
**Spec reference**: Spec 26, Task 26.1

## Summary

Inject `__actionClass` into effect context bindings alongside the existing `__freeOperation`. This enables LimOp-aware space selection (`max: 1` when limited operation) in all 16 operation profiles.

## Design

Add an optional `actionClass` field to the `Move` type (parallel to `freeOperation`). The turn flow or agent sets it when constructing the move. Default: `'operation'`.

Accepted values: `'operation' | 'limitedOperation' | 'operationPlusSpecialActivity'`

## Files to Touch

- `src/kernel/types.ts` — Add `actionClass?: string` to `Move` interface
- `src/kernel/apply-move.ts` — Add `__actionClass` to bindings object (line ~172)
- `src/kernel/legal-choices.ts` — Add `__actionClass` to `baseBindings` object (line ~244)
- `test/unit/kernel/apply-move.test.ts` — New tests for `__actionClass` binding
- `test/integration/decision-sequence.test.ts` — Verify `__actionClass` in decision sequence context

## Out of Scope

- Turn flow logic that determines which action class applies (that's the turn flow system)
- Any operation profile YAML (subsequent tickets)
- Changes to `__freeOperation` behavior
- Any changes to compiler/parser/validator

## Acceptance Criteria

### Tests That Must Pass
1. New unit test: `applyMove` with `move.actionClass = 'limitedOperation'` → bindings contain `__actionClass: 'limitedOperation'`
2. New unit test: `applyMove` without `actionClass` field → bindings contain `__actionClass: 'operation'` (default)
3. New unit test: `legalChoices` with `partialMove.actionClass = 'limitedOperation'` → bindings contain `__actionClass: 'limitedOperation'`
4. All existing `apply-move.test.ts` tests continue to pass unchanged
5. All existing `decision-sequence.test.ts` tests continue to pass unchanged

### Invariants
- `__freeOperation` binding behavior is unchanged
- No existing test file modified (only new test cases added)
- `Move` type change is backwards-compatible (field is optional)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

**Completed**: 2026-02-13

### Changes Made
- `src/kernel/types.ts`: Added `actionClass?: string` to `Move` interface (line 815)
- `src/kernel/apply-move.ts`: Injected `__actionClass: move.actionClass ?? 'operation'` into bindings (line 172)
- `src/kernel/legal-choices.ts`: Injected `__actionClass: partialMove.actionClass ?? 'operation'` into baseBindings (line 245)
- `test/unit/kernel/apply-move.test.ts`: Added 4 new unit tests for `__actionClass` binding
- `test/integration/decision-sequence.test.ts`: Added 1 new integration test for `__actionClass` in decision context

### Verification
- Build: clean (0 errors)
- All 960 tests pass (0 failures)
- No existing tests modified, no deviations from ticket design
