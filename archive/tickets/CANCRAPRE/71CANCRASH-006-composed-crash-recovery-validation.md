# 71CANCRASH-006: Integration Test — Composed Crash-Recovery Validation

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 71CANCRASH-003, 71CANCRASH-004, 71CANCRASH-005

## Problem

Most of Spec 71's layer-level behavior is now already implemented and covered by focused tests. What is still missing is a composed integration test that proves the recovery chain across module boundaries:

- contained ticker error in runtime wiring
- render-health verification and/or runtime-health heartbeat
- crash-recovery request dispatch
- idempotent recovery signaling when multiple recovery sources race

The original draft for this ticket over-scoped the work by trying to re-prove each layer's local invariant inside one test file. That would duplicate existing tests instead of covering the real remaining seam: composition.

## Assumption Reassessment (2026-03-21)

1. The archived tickets are not all implemented exactly as Spec 71 originally forecast:
   - 71CANCRASH-001 was re-scoped away from a PixiJS-global `TexturePool` monkey-patch and instead hardened runner-owned destroy paths.
   - 71CANCRASH-002 through 71CANCRASH-005 are already implemented and archived under `archive/tickets/CANCRAPRE/`.
2. The runner test infrastructure uses Vitest with both plain module tests and jsdom React tests — confirmed.
3. Existing tests already cover most layer-local behavior:
   - `create-app.test.ts` covers teardown ordering and `TexturePool.clear()`.
   - `ticker-error-fence.test.ts` covers corruption suspicion lifecycle.
   - `canvas-crash-recovery.test.ts` covers recovery dispatch and heartbeat behavior.
   - `render-health-probe.test.ts` covers probe behavior.
   - `GameCanvas.test.ts` covers runtime wiring from contained errors to probe scheduling and `onError`.
   - `GameCanvas.recovery.test.tsx` covers recovery remount behavior.
4. The crash recovery flow remains `reportCanvasCrash()` → `beginCanvasRecovery()` → `onRecoveryNeeded()` — confirmed in `canvas-crash-recovery.ts`.
5. There is no `texture-pool-patch.ts` in the live runner codebase. This ticket must not assume a PixiJS-global monkey-patch exists or is desirable.
6. This remains a test-focused ticket. Production changes are only justified if implementation uncovers a genuine mismatch between the intended architecture and the current code.

## Architecture Check

1. The current architecture is directionally good. The important local invariants already live at the right ownership boundaries:
   - destroy-path hardening in runner lifecycle helpers
   - heartbeat and health status in recovery/runtime contracts
   - active render verification in a dedicated probe
   - Pixi global cleanup at the `GameCanvas.destroy()` boundary
2. What is still beneficial is not another monolithic "all five layers are independently sufficient" test. The more valuable addition is a cross-module integration test that proves the composed recovery pipeline behaves correctly when these pieces interact.
3. A broad end-to-end test that manually simulates every Pixi internal detail would be less clean than the current architecture. It would duplicate lower-level tests and create brittle knowledge of implementation details.
4. This ticket is not the place to invent a richer runtime-health model or resurrect the abandoned monkey-patch plan. If implementation exposes a design flaw, call it out explicitly rather than silently broadening scope.

## What to Change

### 1. Add a focused integration test file

Create `packages/runner/test/canvas/crash-elimination-integration.test.ts`:

The file should compose the live recovery primitives rather than duplicating unit tests for their internals.

**Test group 1: Immediate verification path**
- Compose `installTickerErrorFence()`, `createRenderHealthProbe()`, and `createCanvasCrashRecovery()` in one test harness.
- Simulate a contained ticker error.
- Simulate a non-functional stage on the next verification tick.
- Assert: confirmed corruption routes into recovery immediately.
- Assert: `reportCanvasCrash()` and `beginCanvasRecovery()` run before `onRecoveryNeeded()`.

**Test group 2: Heartbeat fallback path**
- Compose the same harness with a short fake-timer heartbeat.
- Simulate a contained ticker error without a confirming probe failure.
- Assert: `isRenderCorruptionSuspected()` becomes `true`.
- Assert: heartbeat-triggered recovery still occurs while structural health remains `true`.

**Test group 3: Racing recovery sources stay idempotent**
- Simulate a scenario where both probe confirmation and heartbeat could request recovery.
- Assert: recovery is requested exactly once.
- Assert: no uncaught error escapes the harness.

### 2. Prefer composition over production edits

- Do not change production files unless the integration work reveals a genuine architectural mismatch.
- Reuse the existing canonical runtime-health contract from `canvas-runtime-health.ts`.
- Do not add alias APIs, compatibility shims, or alternate recovery channels.

## Files to Touch

- `tickets/71CANCRASH-006.md` (modify)
- `packages/runner/test/canvas/crash-elimination-integration.test.ts` (new)
- `archive/tickets/` (move this ticket there after completion, with an Outcome section)
- `archive/specs/` (move Spec 71 there after completion)

## Out of Scope

- Modifying production source files unless a real mismatch is discovered during implementation.
- Re-proving destroy-path ordering, probe child inspection, or heartbeat basics that are already covered in focused tests.
- Changes to the engine package.
- Browser-based E2E testing.
- Performance benchmarking.
- Adding telemetry or error reporting infrastructure.
- Reintroducing a PixiJS-global monkey-patch plan.

## Acceptance Criteria

### Tests That Must Pass

1. **Immediate verification chain**: A contained ticker error can lead to immediate recovery through probe confirmation, without requiring heartbeat polling.
2. **Heartbeat fallback chain**: A corruption-suspected runtime can still recover via heartbeat even when `tickerStarted` and `canvasConnected` stay `true`.
3. **Idempotent recovery**: When multiple recovery signals race, recovery is requested exactly once.
4. Existing focused layer tests remain passing unmodified.
5. `pnpm -F @ludoforge/runner test` passes.
6. `pnpm -F @ludoforge/runner typecheck` passes.
7. `pnpm -F @ludoforge/runner lint` passes.

### Invariants

1. Cross-module recovery wiring is proven without duplicating lower-level unit assertions.
2. The integration test uses the single canonical `CanvasRuntimeHealthStatus` contract from production code.
3. The integration test remains runner-only and does not require a real GPU context.
4. All existing runner tests continue to pass.
5. No compatibility layers, aliases, or duplicate health contracts are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/crash-elimination-integration.test.ts` — composed recovery-path integration tests for immediate probe recovery, heartbeat fallback recovery, and idempotent recovery signaling.

### Commands

1. `pnpm -F @ludoforge/runner test -- crash-elimination-integration`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed: Reassessed the ticket against the live Spec 71 implementation and corrected its stale assumptions before touching tests. Added `packages/runner/test/canvas/crash-elimination-integration.test.ts` to compose the real ticker fence, render-health probe, and crash-recovery modules in one harness, covering immediate probe-driven recovery, heartbeat fallback recovery, and idempotent recovery when both signals race.
- Deviations from original plan: Did not build a monolithic "prove every layer independently" test and did not assume a PixiJS-global `TexturePool` monkey-patch exists. The archived 71CANCRASH tickets showed the architecture evolved toward runner-owned destroy hardening plus targeted recovery plumbing, so this ticket narrowed to the actual remaining integration seam instead of duplicating existing unit coverage.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- crash-elimination-integration`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
