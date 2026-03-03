# SEATRES-035: Remove implicit seat-resolution context fallback from active-seat invariants

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/effect active-seat invariant call contracts
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem

This ticket assumed active-seat invariant boundaries still allowed implicit seat-resolution lifecycle fallback. Current code no longer matches that assumption; the invariant helper and key operation flows already enforce explicit operation-scoped context ownership.

## Assumption Reassessment (2026-03-03)

1. `requireCardDrivenActiveSeat(def, state, surface, seatResolution)` already requires `SeatResolutionContext`; there is no optional `seatResolution?` contract and no internal `createSeatResolutionContext(...)` fallback.
2. All current kernel call sites pass explicit operation-scoped context (turn-flow eligibility, legal moves turn-order helpers, and phase-advance coup path).
3. Existing tests already enforce this architecture:
   - `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` guards against optional-seatResolution signature and implicit context creation.
   - `packages/engine/test/unit/kernel/legal-moves.test.ts` and `packages/engine/test/unit/phase-advance.test.ts` guard operation-scoped context threading.

## Architecture Check

1. Mandatory context injection at invariant boundaries is cleaner, more robust, and more extensible than implicit fallback creation.
2. The current implementation already follows the preferred architecture: strict operation ownership, no aliasing/shims, and game-agnostic runtime logic.
3. No further architectural change is warranted in this ticket; forcing additional refactors here would be churn without net design improvement.

## Updated Scope

1. Reassess assumptions against current code/tests and correct ticket scope.
2. Verify that strict active-seat invariant context ownership remains enforced.
3. Validate no regression via targeted and suite-level test/lint/typecheck runs.

## Files to Touch

- `tickets/SEATRES-035-remove-implicit-seat-resolution-context-fallback-from-active-seat-invariants.md` (modify)

## Out of Scope

- Changing top-level error code taxonomy (`RUNTIME_CONTRACT_INVALID` vs `EFFECT_RUNTIME`)
- Seat-catalog/compiler/validator tickets
- Runner/UI visual behavior

## Acceptance Criteria

### Tests That Must Pass

1. `requireCardDrivenActiveSeat` requires explicit prebuilt context and has no implicit fallback creation path.
2. Operation flows preserve existing runtime behavior/diagnostics under explicit context threading.
3. Verification runs pass for build, targeted unit tests, engine suite, workspace tests, typecheck, and lint.

### Invariants

1. Active-seat invariant evaluation always consumes operation-scoped seat-resolution context.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. None. Existing tests already cover the invariant contract and context-threading behavior this ticket targeted.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
5. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo test`
8. `pnpm turbo typecheck`
9. `pnpm turbo lint`
10. `pnpm run check:ticket-deps` (known unrelated pre-existing failures in `tickets/CROGAMPRIELE-*`)

## Outcome

- **Completion date**: 2026-03-03
- **What actually changed**: Ticket assumptions and scope were corrected to match existing implementation; no engine code or tests required changes.
- **Deviations from original plan**: Original plan expected kernel/test code changes; reassessment confirmed those changes were already in place before this ticket pass.
- **Verification results**:
  - Passed: `pnpm turbo build`
  - Passed: `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
  - Passed: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - Passed: `node --test packages/engine/dist/test/unit/phase-advance.test.js`
  - Passed: `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
  - Passed: `pnpm -F @ludoforge/engine test`
  - Passed: `pnpm turbo test`
  - Passed: `pnpm turbo typecheck`
  - Passed: `pnpm turbo lint`
  - Failed (pre-existing unrelated): `pnpm run check:ticket-deps` due to unresolved dependency paths in active `tickets/CROGAMPRIELE-*`
