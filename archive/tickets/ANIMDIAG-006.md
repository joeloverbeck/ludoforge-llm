# ANIMDIAG-006: Wire Diagnostic Buffer and Logger in Animation Controller

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: ANIMDIAG-002, ANIMDIAG-003, ANIMDIAG-005

## Problem

The diagnostic buffer and extended logger exist, but the animation controller does not currently wire them through the full trace->descriptor->timeline pipeline lifecycle. More importantly, controller-level `logger.enabled` guards currently prevent logger methods from being invoked at all, which blocks buffer capture when console logging is disabled.

## Assumption Reassessment (2026-02-22)

1. `animation-controller.ts` already has `createDefaultDeps()` and an internal `AnimationControllerDeps` dependency bag.
2. `processTrace()` is the main orchestration point and calls both `traceToDescriptors()` and `buildTimeline()`.
3. `AnimationController` currently does **not** expose diagnostic buffer access.
4. `buildTimeline()` already supports `options.logger`, but controller does **not** pass its logger into that option yet.
5. Current controller code only calls `logger.logTraceReceived`, `logger.logDescriptorsMapped`, and `logger.logTimelineBuilt` when `logger.enabled === true`; this is architecturally wrong for buffer capture.

## Architecture Decision

1. Treat diagnostics as an independent telemetry pipeline: logger calls should always execute when a logger exists; console verbosity remains a logger-internal concern.
2. Keep dependency construction centralized in `createDefaultDeps()`.
3. Expose buffer through controller API (`getDiagnosticBuffer`) instead of globals as the primary access path.
4. Keep dev-only global (`__animDiagnosticBuffer`) as a convenience mirror, not as architecture.
5. Keep `__animationLogger` and `?animDebug` behavior intact for explicit console debugging; do **not** force-enable noisy console output in all dev sessions.

## Updated Scope

### 1. Create and wire buffer in `createDefaultDeps()`

- Instantiate one `DiagnosticBuffer` via `createDiagnosticBuffer()` per controller lifecycle.
- Pass it to `createAnimationLogger({ diagnosticBuffer })`.
- Preserve current logger console enablement policy (`detectAnimDebugEnabled()`), rather than auto-enabling in all dev mode.
- In dev mode (`import.meta.env.DEV`), set `(globalThis as any).__animDiagnosticBuffer`.

### 2. Extend controller deps/controller interface

- Add `diagnosticBuffer?: DiagnosticBuffer` to controller deps.
- Add `getDiagnosticBuffer(): DiagnosticBuffer | undefined` to `AnimationController`.

### 3. Make `processTrace()` batch-safe and always-logging

- At `processTrace()` start: `logger?.beginBatch(isSetup)`.
- Remove controller-level `logger.enabled` guards around logger method calls.
- Ensure logger method calls happen for each stage:
  - `logTraceReceived`
  - `logDescriptorsMapped`
  - `logTimelineBuilt`
- Pass logger to `buildTimeline()` via `BuildTimelineOptions.logger`.
- Use `try/finally` so `logger?.endBatch()` runs exactly once per processed trace (including thrown/error paths and non-visual descriptor returns).

## Files to Touch

- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/test/animation/animation-controller.test.ts` (modify)

## Out of Scope

- UI download button (ANIMDIAG-007)
- Buffer internals (ANIMDIAG-002)
- Logger internals (ANIMDIAG-003)

## Acceptance Criteria

### Tests That Must Pass

1. Controller exposes `getDiagnosticBuffer()` and returns injected buffer when provided.
2. `processTrace()` wraps processing with `beginBatch()`/`endBatch()` exactly once.
3. `endBatch()` runs even when descriptor mapping throws.
4. `endBatch()` runs even when timeline building throws.
5. `buildTimeline()` receives `options.logger`.
6. Logger stage methods are called regardless of `logger.enabled` value.
7. Default deps create a diagnostic buffer and expose it through `getDiagnosticBuffer()`.
8. Existing runner suite passes.

### Invariants

1. Buffer is created once per controller lifecycle, not per trace.
2. Every non-empty processed trace produces a balanced begin/end batch pair.
3. Diagnostic capture does not require console logging to be enabled.
4. Existing animation behavior remains unchanged (diagnostics are observational).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-controller.test.ts`
   - verify `getDiagnosticBuffer()` API
   - verify begin/end lifecycle around `processTrace()`
   - verify finally semantics on mapping/timeline errors
   - verify `buildTimeline` receives logger
   - verify logger callbacks execute even when `enabled === false`
   - verify default deps expose a buffer through controller

### Commands

1. `pnpm -F @ludoforge/runner test -- animation-controller`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-22
- Actually changed:
  - Wired a per-controller diagnostic buffer in `createDefaultDeps()` and injected it into the animation logger.
  - Added controller API `getDiagnosticBuffer()` and exposed the default buffer through it.
  - Added dev-only global mirror `globalThis.__animDiagnosticBuffer`.
  - Updated `processTrace()` to always invoke logger stage methods when logger exists (independent from `logger.enabled`).
  - Added `beginBatch(isSetup)` / `endBatch()` around processing with `try/finally`.
  - Threaded logger into `buildTimeline(..., options.logger)`.
  - Added tests for batch lifecycle, error-path finalization, logger threading, and controller buffer exposure.
- Deviations from original plan:
  - Did **not** auto-enable console logger in all dev mode. Kept `?animDebug` gating for console noise control while making buffer capture always-on via unconditional logger method calls.
- Verification:
  - `pnpm -F @ludoforge/runner test -- animation-controller` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
