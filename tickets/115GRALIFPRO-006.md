# 115GRALIFPRO-006: Test migration and determinism verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test fixtures and verification
**Deps**: `archive/tickets/115GRALIFPRO-005.md`

## Problem

After tickets 001-005 refactor the grant system, 9+ test files construct `TurnFlowPendingFreeOperationGrant` objects without the required `phase` field. These tests must be updated to include `phase`, and the full determinism and integration test suites must be verified to confirm the refactoring introduces no regressions.

## Assumption Reassessment (2026-04-07)

1. The following test files construct `TurnFlowPendingFreeOperationGrant` objects — confirmed via grep:
   - `test/helpers/turn-order-helpers.ts`
   - `test/integration/fitl-event-free-operation-grants.test.ts`
   - `test/integration/fitl-events-sihanouk.test.ts`
   - `test/unit/kernel/apply-move.test.ts`
   - `test/unit/kernel/free-operation-grant-bindings.test.ts`
   - `test/unit/kernel/free-operation-grant-sequence-readiness.test.ts`
   - `test/unit/phase-advance.test.ts`
   - `test/unit/kernel/runtime-error-contracts.test.ts`
2. Determinism canary test exists at `test/determinism/fitl-policy-agent-canary.test.ts` — confirmed.
3. Test lanes exist: `test:determinism`, `test:integration:fitl-events` — confirmed in `package.json`.
4. Seed 1009 and Card 75 Sihanouk tests exist in `fitl-events-sihanouk.test.ts` — confirmed.
5. Ticket 001 already updated core repo-owned typed helpers and a broad set of inline fixtures to keep the required `phase` field migration atomic. This ticket should not re-advertise already-landed fixture work.
6. Ticket 005 already updated `fitl-event-free-operation-grants.test.ts` and `phase-advance.test.ts` for the lifecycle/export boundary cleanup. Any remaining work in those files must be limited to unresolved phase-fixture or verification gaps, not the already-landed wrapper-removal assertions.
7. `test/unit/kernel/free-operation-viability-export-surface-guard.test.ts` does not construct pending grant fixtures in the live codebase and should not remain in the file list for this ticket.

## Architecture Check

1. Test fixtures must reflect the actual type contract — `phase` is required, so all fixtures must include it (Foundation 14: no optional backwards-compat).
2. Test updates are mechanical: add `phase` field to each grant construction. The phase value should match what the production code would set (e.g., `ready` for non-sequenced grants, `sequenceWaiting` for sequenced ones).
3. The determinism canary verifies Foundation 8 end-to-end — if seeds 1001-1004 produce different results, the refactoring broke something.

## What to Change

### 1. Finish any remaining post-lifecycle fixture migration

Audit for any remaining pending-grant fixtures that still need `phase` after tickets 002-005 land. Do not duplicate helper or fixture changes already completed in ticket 001.

### 2. Update integration test fixtures

In `fitl-event-free-operation-grants.test.ts` and `fitl-events-sihanouk.test.ts`, add `phase` to all grant object literals. Use `'ready'` for non-sequenced grants, `'sequenceWaiting'` for sequenced grants.

### 3. Update unit test fixtures

In `apply-move.test.ts`, `free-operation-grant-bindings.test.ts`, `phase-advance.test.ts`, and `runtime-error-contracts.test.ts`, add `phase` to all remaining grant object literals that still lack it after tickets 001-005.

### 4. Refactor `free-operation-grant-sequence-readiness.test.ts`

This test directly tests `isPendingFreeOperationGrantSequenceReady`. Since that function is replaced by a phase read (ticket 004), this test needs significant refactoring:
- If the function was fully removed, convert tests to verify that `advanceToReady` correctly transitions `sequenceWaiting` → `ready` based on sequence predecessor completion.
- If a thin wrapper remains, update tests to verify the wrapper reads `phase`.

### 5. Run full verification suite

Execute all test lanes and verify:
- Seeds 1001-1004 produce identical PolicyAgent outcomes (determinism canary)
- Seed 1009 Card 75 shaded March grant is skipped without deadlock
- All 5 Sihanouk Card 75 tests pass
- Full test suite passes (5581+ tests, 0 failures)

## Files to Touch

- `packages/engine/test/helpers/turn-order-helpers.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` (modify — significant refactoring)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)

## Out of Scope

- Further refactoring of production code — all production changes are complete in tickets 001-005
- Adding new test coverage beyond what's needed for the lifecycle refactoring
- Performance benchmarking of the new lifecycle approach

## Acceptance Criteria

### Tests That Must Pass

1. Determinism canary: seeds 1001-1004 produce identical PolicyAgent outcomes.
2. Seed 1009: Card 75 shaded March grant is skipped without deadlock.
3. Sihanouk integration: all 5 Card 75 tests pass.
4. Full test suite: 5581+ tests pass, 0 failures.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. Grant phase is the ONLY source of truth for grant state — no test computes readiness from raw fields.
2. Every phase transition produces a trace entry (Foundation 9).
3. The simulator has no grant-specific logic (Foundation 5) — verified by test inspection.
4. All transitions are deterministic (Foundation 8) — verified by canary.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/turn-order-helpers.ts` — add `phase` to grant factory
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add `phase` to fixtures
3. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — add `phase` to fixtures
4. `packages/engine/test/unit/kernel/apply-move.test.ts` — add `phase` to fixtures
5. `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` — add `phase` to fixtures
6. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` — refactor for lifecycle-based readiness
7. `packages/engine/test/unit/phase-advance.test.ts` — add `phase` to any remaining direct fixtures
8. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add `phase` to any remaining direct fixtures

### Commands

1. `pnpm -F @ludoforge/engine test` (full default suite)
2. `pnpm -F @ludoforge/engine test:determinism` (determinism lane)
3. `pnpm -F @ludoforge/engine test:integration:fitl-events` (event integration lane)
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
