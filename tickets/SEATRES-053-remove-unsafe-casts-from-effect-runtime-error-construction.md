# SEATRES-053: Remove unsafe casts from effect-runtime error construction

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect error construction internals and type guards
**Deps**: tickets/SEATRES-052-enforce-required-effect-runtime-context-args-by-reason.md

## Problem

`effectRuntimeError` currently relies on explicit casts when constructing reason-scoped runtime error context. This masks type incompatibilities and weakens compiler guarantees for the core error API.

## Assumption Reassessment (2026-03-02)

1. `effectRuntimeError` constructs context then casts to `EffectRuntimeErrorContextForReason<R>` and `EffectErrorContext<'EFFECT_RUNTIME'>`.
2. Type casts are currently required due to generic union assignability friction, not business logic needs.
3. Existing tests exercise behavior, but do not prevent future widening/unsafe cast drift in this path.

## Architecture Check

1. Removing unsafe casts from core constructors is cleaner and more robust: the type system must prove correctness, not assertions.
2. This is fully game-agnostic and localized to engine error infrastructure.
3. No compatibility aliasing: replace cast-based paths with typed helpers/factories that compile without escape hatches.

## What to Change

### 1. Refactor `effectRuntimeError` construction to eliminate unsafe casts

1. Introduce internal typed helper(s) that produce `EffectRuntimeErrorContext` without `as` assertions.
2. Ensure `new EffectRuntimeError('EFFECT_RUNTIME', ...)` receives a statically valid context type.

### 2. Add anti-regression assertions

1. Add tests that cover both reason narrowing and construction path behavior.
2. Add static contract checks that fail if constructor typing regresses to cast-only safety.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)

## Out of Scope

- Expanding per-reason context schemas for all reasons
- Migrating unrelated kernel/runtime error APIs

## Acceptance Criteria

### Tests That Must Pass

1. `effectRuntimeError` compiles without unsafe context type assertions in its construction path.
2. Reason-specific narrowing behavior remains correct.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Core effect runtime error construction is type-proven, not assertion-forced.
2. Error payload remains deterministic and JSON-serializable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — strengthen construction-path and reason-guard contract assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
