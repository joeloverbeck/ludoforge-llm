# SEATRES-053: Remove unsafe casts from effect-runtime error construction

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test-only hardening for kernel effect error construction contracts
**Deps**: archive/tickets/SEATRES/SEATRES-052-enforce-required-effect-runtime-context-args-by-reason.md

## Problem

The original ticket assumed `effectRuntimeError` still used unsafe casts in constructor-path context assembly. Current code no longer has those casts, so the remaining risk is regression back to cast-driven construction without an explicit architecture guard.

## Assumption Reassessment (2026-03-03)

1. `effectRuntimeError` in `packages/engine/src/kernel/effect-error.ts` currently constructs reason-scoped contexts without unsafe `as EffectRuntimeErrorContextForReason<...>` constructor casts.
2. The core unsafe-cast removal was already delivered by `SEATRES-052` (see Outcome item 4 in the archived ticket).
3. Existing contracts test behavior and reason typing, but they do not explicitly guard against reintroducing unsafe constructor-path casts.
4. Therefore, the original implementation scope is stale; this ticket should focus on anti-regression guard coverage, not re-refactoring production constructor logic.

## Architecture Check

1. The current architecture (reason-branch construction + context type guard) is cleaner than a generic cast-based factory and should remain the baseline.
2. Additional production refactoring here is not more beneficial right now; a focused anti-regression guard gives higher signal with lower churn.
3. This remains game-agnostic and localized to engine error infrastructure.
4. No compatibility aliasing: if future changes regress typing guarantees, fail fast in tests and fix directly.

## What to Change

### 1. Correct scope: no production constructor refactor

1. Keep `packages/engine/src/kernel/effect-error.ts` unchanged unless guard work reveals an actual defect.
2. Treat unsafe-cast removal as already completed by prior work.

### 2. Add anti-regression assertions

1. Add/strengthen a static architecture guard in `effect-error-contracts.test.ts` that fails if `effectRuntimeError` constructor path reintroduces unsafe context casts.
2. Keep existing reason narrowing and required/optional context contract checks intact.

## Files to Touch

- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)

## Out of Scope

- Expanding per-reason context schemas for all reasons
- Migrating unrelated kernel/runtime error APIs

## Acceptance Criteria

### Tests That Must Pass

1. A unit architecture guard fails if `effectRuntimeError` reintroduces unsafe context constructor casts.
2. Reason-specific narrowing behavior remains correct.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Core effect runtime error construction remains type-proven, not assertion-forced.
2. Error payload remains deterministic and JSON-serializable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — add explicit anti-regression guard for unsafe constructor-path casts and preserve reason-guard contract assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Corrected ticket assumptions/scope before implementation: unsafe constructor-cast removal had already been completed by `SEATRES-052`, so this ticket was narrowed to anti-regression hardening.
2. Added an architecture guard in `packages/engine/test/unit/effect-error-contracts.test.ts` that inspects the `effectRuntimeError` implementation section and fails if unsafe constructor-path casts (`as EffectRuntimeErrorContextForReason...` or `as EffectErrorContext<'EFFECT_RUNTIME'>`) are reintroduced.
3. Left `packages/engine/src/kernel/effect-error.ts` unchanged because the current branch-based typed construction remains the cleaner, robust architecture.
4. Executed and passed the full planned verification commands (`pnpm turbo build`, focused effect-error unit test, `pnpm -F @ludoforge/engine test`, and `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`).
