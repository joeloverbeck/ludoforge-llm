# SEATRES-031: Type effect runtime context for active-seat invariants

**Status**: COMPLETED (2026-03-02)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect error context contract typing for turn-flow runtime validation invariants
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

Effect-side active-seat invariant payloads were runtime-validated but not compile-time coupled to `EffectRuntimeReason`. `effectRuntimeError(...)` accepted generic context records, allowing invariant schema drift without TypeScript failures.

## Assumption Reassessment (2026-03-02)

1. `effectRuntimeError` currently accepts `context?: Readonly<Record<string, unknown>>`.
2. `applyGrantFreeOperation` already emits active-seat invariant fields (`invariant`, `surface`, `activePlayer`, `seatOrder`) and unit tests assert the runtime payload shape.
3. The unresolved gap is compile-time: effect runtime reason/context coupling is still untyped, so payload schema can drift without TypeScript failures.
4. Existing active tickets do not add reason-specific `EFFECT_RUNTIME` context typing.

## Scope Correction (2026-03-02)

1. Keep existing runtime assertions for active-seat invariant payload behavior.
2. Add strict reason-specific typing for `effectRuntimeError` context, starting with the `turnFlowRuntimeValidationFailed` active-seat invariant path used by `applyGrantFreeOperation`.
3. Do not broaden this ticket into full migration of all effect runtime reason payloads; preserve incremental rollout.

## Architecture Check

1. Reason-specific typed effect contexts are cleaner and more extensible than free-form records because invariants become first-class contracts.
2. This change remains game-agnostic and concerns runtime error-schema quality only.
3. No backwards-compat aliasing: callsites adopt typed context builders/contracts directly.

## What to Change

### 1. Introduce reason-specific effect runtime context typing

1. Add typed context mapping for `EFFECT_RUNTIME` reasons (starting with `turnFlowRuntimeValidationFailed` unresolved-active-seat invariant payload).
2. Provide helper(s) that construct typed context payloads for active-seat invariant effect throws.

### 2. Migrate active-seat invariant effect emitters to typed payload contract

1. Update `applyGrantFreeOperation` unresolved-active-seat throw path to use typed context shape.
2. Keep existing effect code/reason taxonomy while enforcing payload contract at compile time.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)

## Out of Scope

- Converting every existing `turnFlowRuntimeValidationFailed` payload in one pass
- Kernel `RUNTIME_CONTRACT_INVALID` redesign beyond active-seat invariant contract
- Seat-resolution lifecycle/performance work

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant effect payload schema is enforced by TypeScript contracts in the effect error API, not only runtime assertions.
2. Existing effect error behavior (code/reason/message) remains stable while payload typing becomes strict.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime active-seat invariant metadata is strongly typed and deterministic.
2. Runtime logic remains game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep/extend assertion that unresolved active-seat effect payload includes canonical invariant fields under the typed callsite.
2. `packages/engine/test/unit/effect-error-contracts.test.ts` — add reason-typed turn-flow active-seat invariant context assertion through `effectRuntimeError`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Added reason-scoped effect runtime context typing in `effect-error.ts`, including:
   - `EffectRuntimeContextByReason`
   - `EffectRuntimeContext<R>`
   - `TurnFlowRuntimeValidationFailedContext`
   - `TurnFlowActiveSeatUnresolvableEffectRuntimeContext`
2. Added typed helper `makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext(...)` and migrated `applyGrantFreeOperation` unresolved-active-seat throw path to use it.
3. Preserved existing runtime error serialization/diagnostic behavior (`EffectErrorContext<'EFFECT_RUNTIME'>` remains free-form for consumers reading context keys without reason narrowing).
4. Added unit coverage in `effect-error-contracts.test.ts` for the new turn-flow typed context path.
5. All requested verification commands passed:
   - `pnpm turbo build`
   - targeted unit tests (`effects-turn-flow`, `effect-error-contracts`)
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo test`
   - `pnpm turbo typecheck`
   - `pnpm turbo lint`
