# KEREFFINT-007 - Control Flow Effects (`if`, `forEach`, `let`) and Binding Scope

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`, effect handlers used in tests may require `KEREFFINT-002` onward

## Goal
Implement branch/iteration/compositional effects with strict binding scope, deterministic truncation limits, and nested state/rng threading.

## Reassessed Current State (2026-02-10)
- `src/kernel/effects.ts` currently does **not** dispatch `if`, `forEach`, or `let`; these effects fall through to `EFFECT_NOT_IMPLEMENTED`.
- `test/unit/effects-runtime.test.ts` currently codifies the old behavior by asserting that `if` is unimplemented.
- `chooseOne` and `chooseN` are also still unimplemented, but this ticket remains focused on control-flow effects only.

## Scope
- Implement `if` effect with `then`/optional `else` dispatch via `evalCondition`.
- Implement `let` effect:
  - evaluate value once
  - create inner binding scope
  - prevent leakage outside `in` block
- Implement `forEach` effect:
  - evaluate `over` via `evalQuery`
  - validate `limit` positive integer; default `100`
  - truncate deterministically to first `limit` values
  - apply nested effects in order, threading state and rng between iterations
  - enforce per-iteration binding scope for `bind`
- Preserve public `applyEffect`/`applyEffects` APIs while ensuring nested control-flow execution shares one effect-operation budget.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `test/unit/effects-control-flow.test.ts` (new)
- `test/unit/effects-runtime.test.ts` (update outdated unimplemented-`if` assumption)

## Out Of Scope
- Query evaluator logic changes (`evalQuery` behavior is Spec 04 territory).
- Any UI/agent prompt behavior for choices.
- Trigger dispatch or game-loop orchestration.
- Implementing `chooseOne` / `chooseN` effect handlers.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-control-flow.test.ts`
  - `if` executes correct branch for true/false predicates.
  - `if` with false and no `else` is a no-op.
  - `let` binding is visible inside `in` effects.
  - `let` binding is not visible outside `in` scope.
  - `forEach` iterates every element when collection size <= limit.
  - `forEach` with empty collection performs zero iterations.
  - `forEach` enforces default limit `100`.
  - `forEach` enforces explicit limit and truncates deterministically.
  - invalid `forEach.limit` (`<=0` or non-integer) throws runtime error.
  - nested `forEach`/`if`/`let` composition threads state correctly.
- `test/unit/effects-runtime.test.ts` budget tests remain green for nested branches.

## Invariants That Must Remain True
- Inner bindings shadow outer bindings only within inner scope.
- No scope leakage from `let` or `forEach` into parent context.
- Iteration count is always bounded by `min(queryResult.length, limit)`.

## Outcome
- **Completed on**: 2026-02-10
- **What was changed**:
  - Implemented `if`, `forEach`, and `let` handlers in `src/kernel/effects.ts`.
  - Added nested control-flow budget threading so nested branches/iterations consume the same operation budget.
  - Added `test/unit/effects-control-flow.test.ts` for branch behavior, scoping, default/explicit limits, invalid limits, and nested composition threading.
  - Updated `test/unit/effects-runtime.test.ts` to remove the outdated assumption that `if` is unimplemented and to assert nested budget behavior.
- **Deviations from original plan**:
  - `src/kernel/effect-error.ts` did not require changes.
  - `chooseOne`/`chooseN` remain out of scope and unimplemented as stated in this ticket.
- **Verification**:
  - `npm test` passes (build + unit + integration).
