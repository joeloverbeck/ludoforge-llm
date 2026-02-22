# ANIMDIAG-006: Wire Buffer and Logger in Animation Controller

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-002, ANIMDIAG-003, ANIMDIAG-004, ANIMDIAG-005

## Problem

The diagnostic buffer and extended logger exist as standalone modules, but nothing creates them, connects them, or passes them into the pipeline. The animation controller is the orchestrator — it creates dependencies, calls `processTrace()`, and owns the lifecycle. This ticket wires everything together so diagnostic data flows from pipeline stages into the buffer.

## Assumption Reassessment (2026-02-22)

1. `animation-controller.ts` has a `createDefaultDeps()` function (or similar) that constructs the controller's dependency bag — to be confirmed during implementation.
2. `processTrace()` is the main entry point that calls `buildTimeline()` — to be confirmed.
3. `AnimationControllerDeps` type defines the dependency bag — to be confirmed.
4. The controller exposes a public interface (likely `AnimationController`) — needs a new method for buffer access.

## Architecture Check

1. Creating the buffer in `createDefaultDeps()` keeps dependency construction centralized — single place to configure.
2. Exposing buffer via `getDiagnosticBuffer()` on the controller interface is cleaner than a global — allows the UI layer to access it through the controller.
3. `__animDiagnosticBuffer` global in dev mode is a pragmatic addition for REPL debugging — gated by `import.meta.env.DEV`.
4. No engine boundary concerns — animation controller is purely runner infrastructure.

## What to Change

### 1. Create buffer in `createDefaultDeps()`

- Instantiate a `DiagnosticBuffer` via `createDiagnosticBuffer()`.
- Pass it to `createAnimationLogger()` as the `diagnosticBuffer` option.
- In dev mode (`import.meta.env.DEV`), auto-enable the logger (so diagnostic data is captured without requiring `?animDebug=true` URL param).

### 2. Add buffer to `AnimationControllerDeps`

- Add `diagnosticBuffer?: DiagnosticBuffer` to the deps type so it's available throughout the controller.

### 3. Expose buffer on `AnimationController` interface

- Add `getDiagnosticBuffer(): DiagnosticBuffer | undefined` to the public `AnimationController` interface (or equivalent).

### 4. Thread logger and buffer through `processTrace()`

- At the start of `processTrace()`: call `logger.beginBatch(isSetup)`.
- Pass `logger` into `buildTimeline()` via `BuildTimelineOptions`.
- At the end of `processTrace()` (including error/finally paths): call `logger.endBatch()`.
- Ensure `endBatch()` is called even if an error occurs (try/finally pattern).

### 5. Expose buffer globally in dev mode

- After creating the buffer in `createDefaultDeps()`, if `import.meta.env.DEV`, assign to `(globalThis as any).__animDiagnosticBuffer` for REPL access.

## Files to Touch

- `packages/runner/src/animation/animation-controller.ts` (modify)

## Out of Scope

- UI download button (ANIMDIAG-007)
- Buffer implementation (ANIMDIAG-002)
- Logger implementation (ANIMDIAG-003)

## Acceptance Criteria

### Tests That Must Pass

1. `getDiagnosticBuffer()` returns a `DiagnosticBuffer` instance when controller is created with default deps.
2. `processTrace()` calls `beginBatch()` at start and `endBatch()` at end.
3. `endBatch()` is called even when `processTrace()` throws (try/finally).
4. Logger is passed to `buildTimeline()` in the options.
5. In dev mode, `__animDiagnosticBuffer` global is set.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Buffer is created once per controller lifecycle — not per trace.
2. `beginBatch()` / `endBatch()` wrap every `processTrace()` call exactly once.
3. Existing animation behavior is unchanged — wiring is observational only.
4. No buffer creation in production mode if that decision is made (current plan: buffer exists in all modes, but global assignment is dev-only).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-controller.test.ts` — add/modify tests verifying:
   - Buffer created in default deps
   - `getDiagnosticBuffer()` returns buffer
   - `beginBatch`/`endBatch` lifecycle around `processTrace()`
   - Logger threaded into `buildTimeline()` options

### Commands

1. `pnpm -F @ludoforge/runner test -- animation-controller`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
