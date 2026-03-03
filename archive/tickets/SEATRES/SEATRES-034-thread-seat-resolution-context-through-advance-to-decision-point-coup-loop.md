# SEATRES-034: Thread seat-resolution context through advance-to-decision-point coup loop

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No kernel behavior change expected after reassessment; verification + test hardening only
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem (Original Scope)

The original ticket assumed `advanceToDecisionPoint(...)` coup-loop progression was still creating seat-resolution context implicitly per iteration, weakening operation-scoped lifecycle ownership.

## Assumption Reassessment (2026-03-03)

1. `coupPhaseImplicitPass(...)` does **not** create fallback seat-resolution context; it requires `seatResolution` explicitly.
2. `advanceToDecisionPoint(...)` already creates one operation-scoped seat-resolution context and calls `coupPhaseImplicitPass(def, nextState, seatResolution)`.
3. `packages/engine/test/unit/phase-advance.test.ts` already contains an architecture guard test that enforces explicit coup-loop context threading.

## Discrepancies Found

1. Original assumptions #1 and #2 were stale versus current `packages/engine/src/kernel/phase-advance.ts`.
2. Planned kernel refactor work is already implemented.

## Architecture Reassessment

1. The current architecture is already the cleaner long-term shape: explicit operation-owned context in `advanceToDecisionPoint(...)`, no fallback aliasing.
2. Additional refactoring in this area would add churn without improving extensibility or robustness.
3. Most beneficial remaining work is invariant hardening in tests and running full validation gates.

## Updated Scope

### 1. Validate and harden invariants (no gameplay behavior changes)

1. Keep kernel logic unchanged unless a failing test reveals a real defect.
2. Strengthen/confirm architecture guard coverage for explicit coup-loop context ownership.

### 2. Run hard verification gates

1. Run focused unit validation for `phase-advance`.
2. Run full engine tests.
3. Run workspace test/typecheck/lint gates.

## Files to Touch

- `packages/engine/test/unit/phase-advance.test.ts` (modify only if needed for additional guard coverage)
- `archive/tickets/SEATRES/SEATRES-034-thread-seat-resolution-context-through-advance-to-decision-point-coup-loop.md` (this reassessment)

## Out of Scope

- Broad legal-moves filter context threading (`SEATRES-033`)
- Active-seat surface typing tickets (`SEATRES-030`, `SEATRES-031`, `SEATRES-032`)
- Compiler/validator seat-catalog work

## Acceptance Criteria

### Tests That Must Pass

1. Focused `phase-advance` unit test run passes.
2. `pnpm -F @ludoforge/engine test` passes.
3. Workspace `test`, `typecheck`, and `lint` gates pass.

### Invariants

1. Seat-resolution lifecycle ownership remains explicit for coup-loop operation boundaries.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — keep or strengthen architecture guard coverage to prevent regression to implicit/fallback context creation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

1. Updated this ticket to correct stale assumptions: the coup-loop seat-resolution threading refactor was already present in kernel code.
2. Strengthened architecture-guard coverage in `packages/engine/test/unit/phase-advance.test.ts` to assert `coupPhaseImplicitPass` does not allocate seat-resolution context internally.
3. No kernel behavior/code-path changes were required; current architecture already matched the intended explicit operation-scoped lifecycle model.
