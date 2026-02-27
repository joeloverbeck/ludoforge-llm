# ENGINEARCH-117: Close `ILLEGAL_MOVE` Empty-Context Reasons Against Extra Payload Keys

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel runtime error context typing and illegal-move helper signature
**Deps**: archive/tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md

## Problem

`illegalMoveError` now enforces required context for required reasons, but reasons with no additional context still accept arbitrary extra payload keys at compile time because their input type resolves to `{}`.

## Assumption Reassessment (2026-02-27)

1. `IllegalMoveContextInput<R>` is derived via `Omit` and resolves to `{}` for reasons that have no extra fields beyond `actionId`/`params`/`reason`.
2. In TypeScript, `{}` allows any non-nullish object, so calls like `illegalMoveError(move, UNKNOWN_ACTION_ID, { unexpected: 1 })` remain assignable.
3. Mismatch: architecture target is strict, reason-scoped error context contracts. Corrected scope is to close empty-context reason inputs so extra keys are compile-time rejected.

## Architecture Check

1. Closing empty-context reason inputs yields a cleaner, explicit contract boundary and prevents silent context pollution.
2. This is kernel contract typing only and remains game-agnostic; no GameSpecDoc or visual-config concerns are introduced.
3. No backwards-compatibility aliasing/shims; tighten canonical helper typing directly.

## What to Change

### 1. Introduce strict empty-context input semantics

Replace permissive empty-object typing for no-context reasons with a closed form (for example `Record<never, never>` or `context?: undefined` overloads) so extra keys are rejected.

### 2. Update illegal-move helper typing

Ensure `illegalMoveError` overloads distinguish:
- required-context reasons => context required
- optional-context reasons => typed optional context
- no-context reasons => no payload object accepted

### 3. Add explicit type-contract assertions

Add compile-time tests proving no-context reasons reject extra keys while preserving current valid call sites.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)

## Out of Scope

- Runtime behavior changes to illegal-move semantics.
- New illegal-move reasons.
- Compiler or runner changes.

## Acceptance Criteria

### Tests That Must Pass

1. No-context illegal-move reasons cannot accept extra context keys at compile time.
2. Existing required-context reason enforcement remains intact.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ILLEGAL_MOVE` context contracts are strictly reason-scoped and closed against undeclared keys.
2. Kernel runtime error contracts stay game-agnostic and generic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add `@ts-expect-error` assertions for extra payload on no-context reasons.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`