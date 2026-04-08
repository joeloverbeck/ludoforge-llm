# 63GRAARRAUT-008: Integration tests, regression test, and determinism canary verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test/unit/kernel/grant-lifecycle.test.ts
**Deps**: `archive/tickets/63GRAARRAUT-002.md`, `archive/tickets/63GRAARRAUT-003.md`, `archive/tickets/63GRAARRAUT-004.md`, `archive/tickets/63GRAARRAUT-005.md`, `archive/tickets/63GRAARRAUT-006.md`, `archive/tickets/63GRAARRAUT-007.md`

## Problem

After all caller modules have been migrated to the array-level grant API, integration-level tests are needed to prove that the full grant lifecycle works end-to-end through the authority module. A regression test for FREOPSKIP-001 (commit `8669140e`) must verify that the consolidated authority correctly handles the determinism edge case. The determinism canary must pass on seeds 1001-1004.

## Assumption Reassessment (2026-04-08)

1. All 6 caller modules will have been migrated to the array-level API by tickets 003-007 — prerequisite.
2. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` exists and will already contain unit tests from ticket 002 — prerequisite.
3. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` exists — confirmed.
4. Commit `8669140e` ("Fix FREOPSKIP-001 determinism regression") is valid — confirmed.

## Architecture Check

1. Integration tests prove that the array-level API composes correctly with the full kernel pipeline — not just in isolation.
2. The FREOPSKIP-001 regression test proves Foundation 8 (determinism) is preserved under the consolidated authority.
3. The determinism canary is the project's standard determinism verification mechanism.

## What to Change

### 1. Integration test: Full lifecycle round-trip

Add a test that: inserts a grant via `insertGrant`, advances it to ready via `advanceSequenceGrants` (or directly via the caller flow), consumes uses via `consumeGrantUse`, and verifies the grant is removed from the array when exhausted. Verify all trace entries are collected.

### 2. Integration test: Phase-advance expiry

Add a test that: inserts grants, triggers phase advance (through the kernel pipeline or via direct `expireGrantsForSeat` call in an integrated context), and verifies expired grants are removed and trace entries collected.

### 3. Integration test: Probe isolation

Add a test that: creates a probe overlay via `createProbeOverlay`, verifies the original grants array is unchanged after the overlay is discarded.

### 4. Regression test: FREOPSKIP-001 scenario

Reproduce the determinism regression from commit `8669140e`. Set up a state where `skipIfNoLegalCompletion` is relevant, execute the grant lifecycle through the consolidated authority, and assert deterministic behavior. The test should fail if the pre-fix behavior is accidentally reintroduced.

### 5. Determinism canary verification

Run the existing determinism canary on seeds 1001-1004 and confirm it passes. This is a verification step, not a new test — the canary file already exists.

## Files to Touch

- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` (modify — add integration and regression tests)

## Out of Scope

- Modifying any source code (all migrations are complete at this point)
- Adding new unit tests for individual array-level functions (already done in ticket 002)
- Changing the determinism canary test itself

## Acceptance Criteria

### Tests That Must Pass

1. New integration tests (lifecycle round-trip, phase-advance expiry, probe isolation) pass
2. FREOPSKIP-001 regression test passes
3. Determinism canary passes on seeds 1001-1004: `node --test packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`
4. Full suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The FREOPSKIP-001 regression test must fail if the consolidated authority's skipIfNoLegalCompletion handling is broken
2. Determinism canary produces identical results across repeated runs with same seeds
3. No direct `pendingFreeOperationGrants` array manipulation exists anywhere in kernel source files (verify via grep)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — add integration tests (lifecycle round-trip, phase-advance expiry, probe isolation) and FREOPSKIP-001 regression test

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `node --test packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`
