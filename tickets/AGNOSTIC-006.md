# AGNOSTIC-006: Fail-Fast Runner Bootstrap Errors with User-Visible Failure State

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## What Needs to Change

1. Update runner bootstrap flow so failures from bootstrap resolution and `initGame()` are not swallowed.
2. Replace console-only failure handling with a deterministic user-visible failure path (existing error state and/or ErrorBoundary integration).
3. Ensure bootstrap failure produces a stable terminal UI state (no silent idle/hanging render loop).
4. Keep bootstrap cancellation/unmount cleanup behavior correct under React Strict Mode remount cycles.

## Invariants

1. Invalid/missing bootstrap `GameDef` never results in silent non-initialized UI.
2. Bootstrap failures are surfaced exactly once through the runner’s error-state path.
3. Successful bootstrap behavior for default game and FITL remains unchanged.
4. Worker termination semantics remain correct on unmount/remount.

## Tests That Should Pass

1. `packages/runner/test/ui/App.test.ts`
   - New/updated case: bootstrap resolver rejection surfaces a UI-visible failure (not only `console.error`).
   - New/updated case: `initGame()` rejection also surfaces the same deterministic failure state.
2. `packages/runner/test/ui/GameContainer.test.ts` (or equivalent UI error-state tests)
   - New case: propagated bootstrap/init errors render runner error state.
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`

