# KEREFFINT-007 - Control Flow Effects (`if`, `forEach`, `let`) and Binding Scope

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`, effect handlers used in tests may require `KEREFFINT-002` onward

## Goal
Implement branch/iteration/compositional effects with strict binding scope, deterministic truncation limits, and nested state/rng threading.

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

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-control-flow.test.ts` (new)

## Out Of Scope
- Query evaluator logic changes (`evalQuery` behavior is Spec 04 territory).
- Any UI/agent prompt behavior for choices.
- Trigger dispatch or game-loop orchestration.

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

