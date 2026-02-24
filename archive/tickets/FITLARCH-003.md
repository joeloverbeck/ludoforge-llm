# FITLARCH-003: Harden FITL Playbook Golden Harness and Remove Order-Coupled State

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-only (engine e2e/integration helpers)
**Deps**: FITLARCH-002

## Problem

The FITL playbook golden suite still mutates shared `state` across `it(...)` blocks in `packages/engine/test/e2e/fitl-playbook-golden.test.ts`, which weakens isolated reruns and can mask failures behind execution order.

## Assumption Reassessment (2026-02-24)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently relies on ordered execution with shared mutable state between tests.
2. **Correction**: explicit stale-boundary regression coverage already exists in `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` (`promotes cards across successive rightmost-pass boundaries without stale boundary reuse`).
3. Scope adjustment: this ticket should focus on test isolation and harness ergonomics, not adding a duplicate boundary regression test.

## Architecture Check

1. Isolated, checkpoint-replay-based tests are cleaner and more robust than order-coupled mutation.
2. Existing targeted boundary regression coverage is already a better architectural placement in integration tests than duplicating it in e2e.
3. This ticket improves test architecture only; runtime stays game-agnostic and unchanged.
4. No backwards-compatibility shims.

## What to Change

### 1. Remove order-coupled shared mutable state from playbook e2e

Refactor playbook golden tests so each `it(...)` reconstructs its starting state deterministically from a baseline + turn checkpoint replay, without cross-test mutation.

### 2. Keep and reference existing stale-boundary regression coverage

Do not duplicate stale-boundary tests. Ensure this ticket explicitly references the existing integration regression for lifecycle safety.

### 3. Keep harness generic

Ensure helper abstractions remain reusable and avoid hardcoding assumptions outside declarative turn descriptors.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `packages/engine/test/helpers/fitl-playbook-harness.ts` (modify, if needed for checkpoint replay helper)
- `tickets/FITLARCH-003.md` (this reassessment update)

## Out of Scope

- Engine runtime behavior changes (handled in FITLARCH-002).
- Runner/UI behavior.
- Adding duplicate stale-boundary regression tests.

## Acceptance Criteria

### Tests That Must Pass

1. FITL playbook golden tests run independently without order-coupled hidden state.
2. Existing stale-boundary regression test remains green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Golden harness remains deterministic and readable.
2. Regression coverage explicitly guards the boundary lifecycle bug via existing integration test.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — isolate per-turn state checkpoints.
2. `packages/engine/test/helpers/fitl-playbook-harness.ts` — optional helper support for deterministic checkpoint replay.
3. `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts` — no functional changes required; retain as explicit referenced guard.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "FITL playbook golden suite"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "FITL eligibility/pass-chain integration"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-02-24
- What changed:
  - Reassessed and corrected ticket assumptions to match repository reality:
    - stale-boundary regression coverage already existed in `fitl-eligibility-pass-chain.test.ts`
    - remaining architectural gap was order-coupled shared state in playbook e2e
  - Refactored FITL playbook e2e to remove cross-test mutable state coupling by deriving each turn from deterministic checkpoint replay.
  - Added reusable `replayPlaybookTurns(...)` helper for deterministic multi-turn replay in harness.
- Deviations from original plan:
  - Did not add a new stale-boundary regression test because equivalent coverage already existed; ticket scope was updated to avoid duplicate coverage.
- Verification:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "FITL playbook golden suite"`: pass
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "FITL eligibility/pass-chain integration"`: pass
  - `pnpm -F @ludoforge/engine test`: pass
  - `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts`: pass (follow-up for transient timeout seen during one turbo run)
  - `pnpm turbo test`: pass
  - `pnpm turbo lint`: pass
