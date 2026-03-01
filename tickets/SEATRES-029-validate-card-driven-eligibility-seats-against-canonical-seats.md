# SEATRES-029: Validate card-driven eligibility seats against canonical seats

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — GameDef validation of card-driven eligibility seat contracts + runtime regression guards
**Deps**: archive/tickets/SEATRES-015-enforce-strict-card-seat-order-metadata-and-initial-active-seat-resolution.md

## Problem

`turnFlow.eligibility.seats` can include values that do not resolve to canonical declared `seats[]`. This allows invalid seat contracts to pass validation and fail only at runtime during active-seat derivation. That violates the goal of front-loading contract failures at compile/validation boundaries.

## Assumption Reassessment (2026-03-01)

1. Validator currently checks card-seat mappings against `turnFlow.eligibility.seats`, but does not validate `turnFlow.eligibility.seats` itself against canonical `seats[]` identities.
2. Runtime initialization currently catches unresolved `firstEligible` and throws `RUNTIME_CONTRACT_INVALID`, proving invalid eligibility seats can escape compile-time checks.
3. Existing active tickets `SEATRES-016` through `SEATRES-026` do not cover validator enforcement of `turnFlow.eligibility.seats` canonical resolvability.

## Architecture Check

1. Validating eligibility seats at GameDef boundary is cleaner and more robust than runtime-only rejection because contract violations are surfaced before simulation state construction.
2. This is strictly game-agnostic seat-contract validation; no game-specific identifiers or rules are introduced.
3. No backward-compatibility alias paths are added; invalid eligibility seat values become hard errors.

## What to Change

### 1. Add validator checks for eligibility seat canonical resolvability

1. Add deterministic diagnostics when any `turnFlow.eligibility.seats[i]` does not resolve to canonical declared seat identity.
2. Add deterministic diagnostics for duplicate resolved canonical seats in `turnFlow.eligibility.seats` (if normalization/mapping creates collisions).
3. Ensure diagnostic paths point to exact eligibility seat entries.

### 2. Keep runtime as defensive backstop

1. Preserve runtime invariant checks in initialization paths as defense-in-depth.
2. Add/adjust tests to show compile-time boundary now catches invalid eligibility seats before runtime mutation.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/seat-resolution.ts` (modify only if shared helper needed)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add as regression backstop)

## Out of Scope

- Seat-catalog compiler/validator parity work (`tickets/SEATRES-021-*.md` onward)
- Runtime error-shape unification across kernel/effects (`tickets/SEATRES-017-*.md`)
- Runner model/render code

## Acceptance Criteria

### Tests That Must Pass

1. `turnFlow.eligibility.seats` entry that cannot resolve to canonical seat emits deterministic validation error.
2. Duplicate resolved canonical seats in `turnFlow.eligibility.seats` emit deterministic validation error.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven eligibility seat contract is canonical and validation-complete before runtime initialization.
2. Runtime initialization no longer depends on malformed eligibility seat lists reaching execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid/duplicate eligibility seat entries emit deterministic diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — runtime invariant remains defensive for malformed post-validation state injection.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
