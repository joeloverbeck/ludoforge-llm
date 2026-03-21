# 68CANLIFCRARES-003: Add ticker error fence and runtime crash reporting

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

An uncaught error in PixiJS's ticker enters an infinite crash loop: every subsequent `_tick` call re-throws the same error, producing cascading `requestAnimationFrame` stack traces visible in the console. React's `ErrorBoundary` cannot catch errors thrown inside the PixiJS ticker (which runs outside React's component tree).

The fix: install a ticker error fence that wraps the PixiJS application ticker's `_tick` method. Single transient errors are caught and logged. If errors occur on N consecutive ticks (default: 3), the ticker is stopped and a `canvas-crash` event is emitted for the recovery layer to handle.

## Assumption Reassessment (2026-03-20)

1. Spec 68 phase-1 disposal fixes already landed in archived tickets `68CANLIFCRARES-001` and `68CANLIFCRARES-002`. The active bug surface for this ticket is no longer disposal timing; it is uncaught render-loop failure containment after those fixes.
2. No existing ticker wrapping code exists in the runner, but `packages/runner/src/canvas/GameCanvas.tsx` already owns Pixi app creation, teardown, and the component-level `onError` contract. Any ticker fence should integrate with that lifecycle instead of introducing a parallel crash bus prematurely.
3. `createGameCanvasRuntime()` already has strong test seams via injected runtime deps in `packages/runner/test/canvas/GameCanvas.test.ts`. The right place to verify installation/cleanup behavior is the existing runtime suite, not only a new isolated utility test.
4. The runner package test command is `vitest run`. Focused file runs should use `pnpm -F @ludoforge/runner exec vitest run ...` with package-relative paths, not `pnpm ... test -- ...`.
5. The fence still needs an instance-level wrap around the Pixi ticker callback. That is acceptable under Spec 68 Constraint C-1 as long as we patch only the created application instance, never the Pixi prototype, and we fully restore the original callback on teardown.

## Architecture Check

1. A dedicated `ticker-error-fence.ts` module is still the right unit for the low-level wrapping logic, but leaving it unwired would add dead architecture. This ticket should include runtime integration so the fence actually protects the live canvas.
2. The original `EventTarget`-based crash contract is weaker than the runner's existing callback-driven lifecycle. For this ticket, the fence should report fatal threshold breaches through an explicit `onCrash` callback, and `GameCanvas` should bridge that into its existing `onError` surface. If later recovery work needs store transitions, ticket `68CANLIFCRARES-005` can build on the same callback path without aliasing or duplicate event systems.
3. No PixiJS prototype modification. The implementation must wrap only the concrete application ticker instance and restore it during runtime teardown.
4. The architecture win over the current state is real: render-loop failure containment belongs at the canvas runtime boundary. That keeps Pixi-private handling localized, prevents infinite RAF crash spam, and preserves a single error/reporting seam for higher layers.

## What to Change

### 1. Create `ticker-error-fence.ts`

New file: `packages/runner/src/canvas/ticker-error-fence.ts`

Exports:
- `installTickerErrorFence(app: Application, options?: TickerErrorFenceOptions): TickerErrorFence`
- `TickerErrorFence` interface: `{ destroy(): void }`
- `TickerErrorFenceOptions`: `{ maxConsecutiveErrors?: number; onCrash?: (error: unknown) => void; logger?: Pick<Console, 'warn'> }`

Behavior:
1. Store reference to `app.ticker` and its original `_tick` bound method.
2. Replace `app.ticker._tick` with a wrapped version that:
   - Calls the original in a try/catch.
   - On success: resets `consecutiveErrors` to 0.
   - On error: increments `consecutiveErrors`, logs a warning.
   - If `consecutiveErrors >= maxConsecutiveErrors`: stops the ticker via `app.ticker.stop()`, logs the fatal containment, and invokes `onCrash(error)` exactly once.
3. `destroy()` restores the original `_tick` method.
4. Installing twice on the same ticker should throw. Silent double-wrapping is not acceptable.

### 2. Wire the fence into `GameCanvas.tsx`

Modify `packages/runner/src/canvas/GameCanvas.tsx` so `createGameCanvasRuntime()` installs the fence immediately after `createGameCanvas()` resolves and destroys it during runtime teardown.

Behavior:
1. Extend the internal runtime options shape so `createGameCanvasRuntime()` can receive an optional `onError`.
2. Thread the public `GameCanvas` component `onError` prop into those runtime options.
3. When the fence reaches the fatal threshold, it should call the runtime `onError` callback with the triggering error after stopping the ticker.
4. Runtime destruction must always restore the original ticker callback before the app is destroyed.

### 3. Create test files

New file: `packages/runner/test/canvas/ticker-error-fence.test.ts`

Modify: `packages/runner/test/canvas/GameCanvas.test.ts`

## Files to Touch

- `packages/runner/src/canvas/ticker-error-fence.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/ticker-error-fence.test.ts` (new)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)

## Out of Scope

- Store lifecycle changes (68CANLIFCRARES-004).
- Canvas crash recovery/store orchestration beyond surfacing the fatal error through the existing `onError` seam (68CANLIFCRARES-005).
- Modifying `safe-destroy.ts` or `disposal-queue.ts`.
- Modifying any engine package files.
- Persistent crash telemetry or error reporting infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. `ticker error fence > single error is caught and does not propagate` — verify wrapped tick catches one error, does not re-throw, ticker continues.
2. `ticker error fence > successful tick resets consecutive error counter` — verify error followed by success followed by error does not accumulate.
3. `ticker error fence > stops ticker after N consecutive errors` — verify `app.ticker.stop()` is called after threshold is reached.
4. `ticker error fence > reports crash through onCrash after threshold` — verify `onCrash` receives the triggering error exactly once.
5. `ticker error fence > logs warning for each contained error` — verify `console.warn` is called.
6. `ticker error fence > destroy restores original _tick` — verify original method is restored.
7. `GameCanvas runtime > installs ticker error fence and tears it down on destroy` — verify the runtime restores the original ticker callback during teardown.
8. `GameCanvas runtime > forwards fatal ticker failure to onError` — verify the public `onError` hook receives the fatal crash.
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Must not modify PixiJS's `Ticker` prototype — only instance-level wrapping.
2. Must not suppress errors silently — all contained errors are logged via `console.warn`.
3. `destroy()` must fully restore original behavior (no lingering wrapper).
4. The fence must reject duplicate installation on the same ticker rather than silently stacking wrappers.
5. Runtime integration must not introduce a second crash-reporting abstraction that duplicates the existing `GameCanvas` `onError` path.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/ticker-error-fence.test.ts` — unit tests for containment, reset behavior, threshold stop, duplicate-install rejection, and cleanup restoration using a mock app/ticker object.
2. `packages/runner/test/canvas/GameCanvas.test.ts` — runtime integration coverage verifying the fence is installed, teardown restores the ticker callback, and fatal crashes flow through `onError`.

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/ticker-error-fence.test.ts --reporter=verbose`
2. `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts --reporter=verbose`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-20
- What actually changed:
  - Added `packages/runner/src/canvas/ticker-error-fence.ts` to wrap a Pixi application ticker instance, contain transient `_tick` failures, stop the ticker after repeated failures, reject duplicate installation, and restore the original callback on teardown.
  - Wired the fence into `createGameCanvasRuntime()` so live canvases are protected immediately after app creation and fatal threshold breaches flow through the existing `GameCanvas` `onError` seam.
  - Added dedicated fence unit coverage and expanded `GameCanvas` runtime coverage to verify install/restore behavior and fatal error forwarding.
- Deviations from original plan:
  - Replaced the proposed `EventTarget` crash bus with an explicit callback contract because the runner already had a cleaner runtime error path; adding a parallel event abstraction here would have duplicated lifecycle ownership.
  - Expanded scope slightly to include runtime wiring in `GameCanvas.tsx`. Shipping an unwired fence utility would not have improved the actual architecture or the running product.
  - Corrected the remount integration test to model a real destroy-then-remount sequence instead of reusing one fake Pixi app across overlapping runtimes.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/ticker-error-fence.test.ts --reporter=verbose` ✅
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.test.ts --reporter=verbose` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
