# 69CANCRAPRE-005: Integration Test — Full Recovery Flow

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 69CANCRAPRE-001, 69CANCRAPRE-002, 69CANCRAPRE-003, 69CANCRAPRE-004

## Problem

The preceding tickets introduce behavior across multiple seams: ticker error detection, runtime health polling, crash recovery orchestration, and viewport restoration. The current recovery coverage is centered in `GameCanvas.recovery.test.tsx`, but it does not yet prove the Spec 69 recovery flow with the new hardening paths.

## Assumption Reassessment (2026-03-20)

1. `GameCanvas.recovery.test.tsx` already exists and is the right integration seam for `GameCanvas` remount behavior, store lifecycle preservation, and runtime recreation. **Confirmed**.
2. The ticker fence itself is still best verified in its own unit suite. The integration layer should compose recovery, health polling, and viewport preservation rather than try to spin up real Pixi rendering. **Scope correction**.
3. All four preceding tickets must land for this integration coverage to exercise the full updated recovery path. **Confirmed**.

## Architecture Check

1. Integration tests verify interaction contracts between components, not individual unit behavior.
2. The integration seam should remain at `GameCanvas` plus mocked runtimes and stores.
3. No production code changes — this ticket is test-only.

## What to Change

### 1. Extend the recovery integration suite

Extend `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` with tests that:
- verify the full recovery sequence: crash or heartbeat trigger → viewport snapshot captured → old runtime destroyed → new runtime created → viewport restored
- verify that the runtime health heartbeat can trigger the same recovery path
- verify that the recovery path preserves store session state and only requests one recovery per failure window

## Files to Touch

- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` (modify)

## Out of Scope

- Any source code changes
- Real Pixi rendering integration
- Manual/visual testing
- Any engine package files

## Acceptance Criteria

### Tests That Must Pass

1. Full recovery flow: crash or heartbeat trigger → snapshot → destroy → remount → restore completes without errors.
2. Heartbeat-triggered recovery follows the same lifecycle transitions as explicit `handleCrash()`.
3. After recovery, the recreated runtime receives the captured viewport snapshot.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No production source files are modified by this ticket.
2. All preceding ticket tests continue to pass.
3. The integration test does not depend on real Pixi rendering.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — integration tests exercising the full Spec 69 recovery flow with heartbeat and viewport preservation.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.recovery.test.tsx`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - extended `GameCanvas.recovery.test.tsx` to cover viewport-preserving crash recovery and heartbeat-triggered recovery
  - kept integration coverage at the `GameCanvas` seam with mocked runtimes and real recovery orchestration
- Deviations from original plan:
  - no new standalone integration file was added; the existing recovery integration suite was extended instead
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.recovery.test.tsx`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
