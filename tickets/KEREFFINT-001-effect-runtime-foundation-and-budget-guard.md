# KEREFFINT-001 - Effect Runtime Foundation and Budget Guard

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: Spec 04 evaluator modules already merged

## Goal
Establish the effect runtime contract (`EffectContext`, `EffectResult`) and the top-level `applyEffects` sequencing loop with cumulative effect-operation budget enforcement.

## Scope
- Add effect runtime types and default budget constant.
- Add typed effect runtime errors needed by Spec 05 core flow:
  - `EffectBudgetExceededError`
  - `EffectRuntimeError` base/context carrier for deterministic diagnostics
  - `SpatialNotImplementedError` for `moveTokenAdjacent` stub behavior
- Implement `applyEffects(effects, ctx)` state/rng threading and cumulative budget decrement.
- Add `applyEffect` dispatcher skeleton that routes known effect variants and throws explicit "not implemented in this ticket" errors for unimplemented handlers.
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
  - `applyEffects` applies effects strictly in list order.
  - state/rng output of effect `i` becomes input of effect `i+1`.
  - default max effect budget is `10_000` when `ctx.maxEffectOps` is omitted.
  - custom `ctx.maxEffectOps` overrides the default.
  - nested effect applications consume from one cumulative budget and throw `EffectBudgetExceededError` at the threshold.
- Existing regression tests continue to pass:
  - `test/unit/smoke.test.ts`
  - `test/unit/types-foundation.test.ts`

## Invariants That Must Remain True
- `applyEffects` is deterministic for identical `{def, state, rng, bindings, moveParams}` input.
- Budget accounting is cumulative across nested calls, not reset per nested branch.
- No mutation of incoming `ctx.state`, `ctx.rng`, `ctx.bindings`, or `ctx.moveParams`.

