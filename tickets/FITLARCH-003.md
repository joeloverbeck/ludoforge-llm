# FITLARCH-003: Harden FITL Playbook Golden Harness and Add Explicit Regression Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-only (engine e2e/integration helpers)
**Deps**: FITLARCH-002

## Problem

The new FITL playbook golden suite improved readability with turn descriptors/harness utilities, but it still mutates shared `state` across `it(...)` blocks and does not include an explicit targeted regression test for the stale boundary-trace scenario that originally drove engine changes.

## Assumption Reassessment (2026-02-24)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently passes.
2. The suite currently relies on ordered execution with shared mutable state between tests.
3. Mismatch: test structure can mask root-cause failures and makes isolated reruns weaker; correction: isolate state progression per test step or encapsulate progression into deterministic helper flow with explicit checkpoints.

## Architecture Check

1. Test isolation and explicit regression vectors provide a cleaner safety net than order-coupled tests.
2. This ticket only improves test architecture; runtime remains game-agnostic and unchanged.
3. No backwards-compatibility shims.

## What to Change

### 1. Remove order-coupled shared mutable state from playbook e2e

Refactor to deterministic per-step setup/replay checkpoints so each test can run independently.

### 2. Add focused stale-boundary regression test

Create an integration/e2e test that reproduces the stale `pendingCardBoundaryTraceEntries` condition and asserts correct next-card promotion/eligibility.

### 3. Keep harness generic

Ensure helper abstractions remain reusable and avoid hardcoding assumptions outside declarative turn descriptors.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `packages/engine/test/helpers/fitl-playbook-harness.ts` (modify)
- `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (modify) or add a new focused integration test

## Out of Scope

- Engine runtime behavior changes (handled in FITLARCH-002).
- Runner/UI behavior.

## Acceptance Criteria

### Tests That Must Pass

1. FITL playbook golden tests run independently without order-coupled hidden state.
2. New focused regression test fails on pre-fix behavior and passes on corrected behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Golden harness remains deterministic and readable.
2. Regression coverage explicitly guards the originally observed boundary lifecycle bug.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — isolate state checkpoints.
2. `packages/engine/test/helpers/fitl-playbook-harness.ts` — helper support for deterministic checkpoint replay.
3. `packages/engine/test/integration/<new-or-existing-fitl-boundary-regression>.test.ts` — targeted stale-boundary bug coverage.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "FITL playbook golden suite"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`
