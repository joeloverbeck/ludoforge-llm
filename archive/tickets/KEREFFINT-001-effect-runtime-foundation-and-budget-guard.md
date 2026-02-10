# KEREFFINT-001 - Effect Runtime Foundation and Budget Guard

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: Spec 04 evaluator modules already merged

## Goal
Establish the effect runtime contract (`EffectContext`, `EffectResult`) and the top-level `applyEffects` sequencing loop with cumulative effect-operation budget enforcement.

## Reassessed Assumptions (Current Codebase)
- Effect runtime foundation files do not exist yet (`effect-context`, `effect-error`, `effects`).
- No effect handlers are implemented; this ticket provides runtime plumbing and dispatcher scaffolding only.
- Nested budget behavior cannot be directly executed until nested handlers (`if`, `forEach`, `let`) exist; this ticket wires cumulative-budget plumbing for future nested execution.

## Scope
- Add effect runtime types and default budget constant.
- Add typed effect runtime errors needed by Spec 05 core flow:
  - `EffectBudgetExceededError`
  - `EffectRuntimeError` base/context carrier for deterministic diagnostics
  - `SpatialNotImplementedError` for `moveTokenAdjacent` stub behavior
- Implement `applyEffects(effects, ctx)` state/rng threading and cumulative budget decrement.
- Add `applyEffect` dispatcher skeleton that routes known effect variants and throws explicit "not implemented in this ticket" errors for unimplemented handlers.
- Dispatch `moveTokenAdjacent` to `SpatialNotImplementedError` stub behavior per Spec 05.
- Export new APIs from kernel index.

## File List Expected To Touch
- `src/kernel/effect-context.ts` (new)
- `src/kernel/effect-error.ts` (new)
- `src/kernel/effects.ts` (new)
- `src/kernel/index.ts`
- `test/unit/effects-runtime.test.ts` (new)

## Out Of Scope
- Business logic for individual effect handlers (`setVar`, `addVar`, token movement, lifecycle, control flow, choice assertions).
- Any game-loop integration (`legal move enumeration`, trigger dispatch, zobrist updates).
- Schema/type-system expansion beyond effect runtime APIs.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-runtime.test.ts`
  - `applyEffects` dispatches in strict list order (verified by first failing effect kind).
  - `applyEffects([])` returns unchanged state/rng.
  - default max effect budget is `10_000` when `ctx.maxEffectOps` is omitted.
  - custom `ctx.maxEffectOps` overrides the default.
  - budget exhaustion throws `EffectBudgetExceededError` before dispatch.
  - `moveTokenAdjacent` throws `SpatialNotImplementedError`.
- Existing regression tests continue to pass:
  - `test/unit/smoke.test.ts`
  - `test/unit/types-foundation.test.ts`

## Invariants That Must Remain True
- `applyEffects` is deterministic for identical `{def, state, rng, bindings, moveParams}` input.
- Budget accounting plumbing is cumulative-capable for nested calls; nested behavior is verified when nested handlers are implemented.
- No mutation of incoming `ctx.state`, `ctx.rng`, `ctx.bindings`, or `ctx.moveParams`.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added effect runtime contracts in `src/kernel/effect-context.ts` (`EffectContext`, `EffectResult`, default/override budget helper).
  - Added typed effect runtime errors in `src/kernel/effect-error.ts` (`EffectRuntimeError`, `EffectBudgetExceededError`, `SpatialNotImplementedError`, helpers).
  - Added runtime foundation in `src/kernel/effects.ts` with `applyEffect`/`applyEffects`, budget enforcement, and dispatcher skeleton.
  - Added `test/unit/effects-runtime.test.ts` covering default/custom budget, empty-list behavior, pre-dispatch budget exhaustion, dispatcher order, and spatial stub.
  - Re-exported new effect runtime APIs from `src/kernel/index.ts`.
- **Deviations from original plan**:
  - The original ticket expected executable nested-budget behavior tests. That assumption was corrected because nested effect handlers are explicitly out of scope in this ticket and do not exist yet.
  - Nested cumulative-budget behavior is wired for future use and deferred for behavioral verification to the first ticket that adds nested handler execution.
- **Verification**:
  - `npm run test:unit -- --test-name-pattern="effects runtime foundation|project smoke test|types foundation"` passed.
  - `npm test` passed.
