# AGNOSTIC-006: Fail-Fast Runner Bootstrap Errors with User-Visible Failure State

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## Reassessed Current State

1. `packages/runner/src/App.tsx` currently catches bootstrap errors (`resolveGameDef()` / unexpected `initGame()` rejection) and logs to `console.error` only.
2. `packages/runner/src/ui/GameContainer.tsx` already renders deterministic `ErrorState` when store `error !== null`; this path is not the gap.
3. `packages/runner/src/store/game-store.ts` already normalizes `initGame()` failures into store `error`, but there is no store action for app-level bootstrap failures that happen before `initGame()` can run.
4. Existing tests already cover part of this:
- `packages/runner/test/ui/App.test.ts` has a bootstrap resolver rejection case, but it asserts `console.error` side effects.
- `packages/runner/test/ui/GameContainer.test.ts` already verifies `ErrorState` rendering for non-null store error.

## What Must Change

1. Update runner bootstrap flow so failures from bootstrap resolution and `initGame()` are not swallowed.
2. Replace console-only failure handling with a deterministic user-visible failure path through store `error` (consumed by existing `GameContainer` error UI).
3. Add a store action dedicated to external/bootstrap failure reporting so `App` does not mutate store internals directly.
4. Ensure bootstrap failure produces a stable UI state (error screen, not silent idle/hanging loop).
5. Keep bootstrap cancellation/unmount cleanup behavior correct under React Strict Mode remount cycles.

## Invariants

1. Invalid/missing bootstrap `GameDef` never results in silent non-initialized UI.
2. Bootstrap failures are surfaced exactly once through the runner’s error-state path.
3. Successful bootstrap behavior for default game and FITL remains unchanged.
4. Worker termination semantics remain correct on unmount/remount.
5. `App` remains an orchestrator; store state transitions stay encapsulated in store actions.

## Tests That Should Pass

1. `packages/runner/test/ui/App.test.ts`
- Update existing bootstrap resolver rejection case to assert store error-path dispatch (no `console.error` assertion).
- New case: unexpected `initGame()` rejection also dispatches the same bootstrap error-path action.
2. `packages/runner/test/ui/GameContainer.test.ts`
- No new case required; existing `error !== null` rendering assertion already covers UI projection of store errors.
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-18
- What changed:
  - Added store bootstrap failure action in `packages/runner/src/store/game-store.ts`: `reportBootstrapFailure(error)` now normalizes external bootstrap failures into the existing store error state and clears stale session data via shared init-failure path.
  - Updated `packages/runner/src/App.tsx` bootstrap effect to route resolver/init rejections through `reportBootstrapFailure` (with cancellation guard), removing console-only handling.
  - Updated `packages/runner/test/ui/App.test.ts`:
    - Bootstrap resolver failure now asserts store error-path dispatch.
    - Added coverage for unexpected `initGame()` rejection routing through the same path.
  - Added regression coverage in `packages/runner/test/store/game-store.test.ts` that `reportBootstrapFailure` clears stale session fields and preserves structured `WorkerError` payload.
- Deviations from original plan:
  - No new `GameContainer` tests were added because `packages/runner/test/ui/GameContainer.test.ts` already covered deterministic `error !== null` projection to UI.
  - Instead of ErrorBoundary integration, solution uses existing store-driven `ErrorState` path to keep a single deterministic failure surface.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed (526/526).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
