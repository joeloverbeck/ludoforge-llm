# SEATRES-029: Validate card-driven eligibility seats against canonical seats

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — GameDef validation of card-driven eligibility seat contracts + runtime regression guards
**Deps**: archive/tickets/SEATRES-015-enforce-strict-card-seat-order-metadata-and-initial-active-seat-resolution.md

## Problem

`turnFlow.eligibility.seats` can include values that do not resolve to canonical declared `seats[]`. This allows invalid seat contracts to pass validation and fail only at runtime during active-seat derivation. That violates the goal of front-loading contract failures at compile/validation boundaries.

## Assumption Reassessment (2026-03-01)

1. Kernel `validateGameDef` currently checks card-seat mappings against `turnFlow.eligibility.seats`, but does not validate `turnFlow.eligibility.seats` entries against canonical `GameDef.seats[]`.
2. CNL compile/cross-validation already enforces seat-catalog canonicality for `doc.turnOrder.config.turnFlow.eligibility.seats` (for seat-catalog mode) via `CNL_XREF_TURN_FLOW_ELIGIBILITY_SEAT_MISSING`; this ticket is about the kernel `GameDef` boundary.
3. Runtime initialization still catches unresolved `firstEligible` and throws `RUNTIME_CONTRACT_INVALID`, confirming malformed `GameDef` turn-flow seat contracts can reach runtime when bypassing CNL or post-mutating state/def.
4. Prior assumptions about active `SEATRES-016` through `SEATRES-026` are stale; those tickets are no longer active in `tickets/`.

## Architecture Check

1. Enforcing canonical seat resolvability at the kernel `GameDef` boundary is cleaner than runtime-only rejection because contract violations surface before simulation state construction.
2. CNL seat-catalog cross-validation remains the source for `GameSpecDoc` seat-catalog checks; this ticket closes the kernel-layer gap only.
3. Validation remains game-agnostic seat-contract logic with no game-specific identifiers or rules.
4. No backward-compatibility alias paths are added; invalid eligibility seat values are hard errors.

## What to Change

### 1. Add kernel validator checks for eligibility seat canonical resolvability

1. Add deterministic diagnostics when any `turnFlow.eligibility.seats[i]` does not resolve to canonical declared `GameDef.seats[]` identity.
2. Add deterministic diagnostics for duplicate resolved canonical seats in `turnFlow.eligibility.seats` (for example normalization collisions).
3. Ensure diagnostic paths point to exact `turnFlow.eligibility.seats[i]` entries.

### 2. Keep runtime invariants as defensive backstop

1. Preserve runtime invariant checks in initialization paths as defense-in-depth.
2. Add/adjust tests to show the kernel validation boundary now catches invalid eligibility seats before runtime mutation.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/seat-resolution.ts` (modify only if shared helper is truly required)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add as regression backstop)

## Out of Scope

- CNL seat-catalog cross-validation behavior already covered by existing `compiler-structured-results` tests
- Seat-catalog compiler/validator parity work
- Runtime error-shape unification across kernel/effects (`tickets/SEATRES-017-*.md`)
- Runner model/render code

## Acceptance Criteria

### Tests That Must Pass

1. Kernel `validateGameDef` emits deterministic diagnostics when `turnFlow.eligibility.seats` entries cannot resolve to canonical `GameDef.seats[]`.
2. Kernel `validateGameDef` emits deterministic diagnostics for duplicate resolved canonical seats in `turnFlow.eligibility.seats`.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven eligibility seat contract is validation-complete at both CNL and kernel `GameDef` boundaries.
2. Runtime initialization does not rely on malformed eligibility seat lists for primary contract enforcement (runtime checks remain defense-in-depth).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — invalid/duplicate eligibility seat entries emit deterministic kernel diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — runtime invariant remains defensive for malformed/injected post-validation state.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
  - Added kernel `validateGameDef` diagnostics for `turnFlow.eligibility.seats` canonical resolvability against `GameDef.seats[]` in `validate-gamedef-extensions.ts`.
  - Added kernel `validateGameDef` diagnostics for duplicate entries in `turnFlow.eligibility.seats` that resolve to the same canonical seat.
  - Added/updated unit coverage in `validate-gamedef.test.ts` for unresolvable and duplicate-resolved eligibility seats.
  - Reassessed and corrected ticket assumptions/scope to reflect that CNL seat-catalog xref checks already cover compile-time `GameSpecDoc` seat-catalog validation, while this ticket closes the kernel boundary gap.
- **Deviations From Original Plan**:
  - No changes were required in `seat-resolution.ts`; existing helpers were reused.
  - No changes were required in `kernel/legal-moves.test.ts`; existing runtime defensive invariant coverage remained valid.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
