# WRKBRIDGE-003: Implement Main-Thread GameBridge Factory (D2)

**Status**: PENDING
**Priority**: HIGH
**Effort**: XS
**Spec**: 36, Deliverable D2 (Main-Thread Bridge)
**Deps**: WRKBRIDGE-002 (worker entry point exists)

## Problem

The main thread needs a typed async RPC interface to the GameWorker. Comlink's `wrap()` provides this, but we need a clean factory function that bundles the Worker instantiation, Comlink wrapping, and termination lifecycle into a single `createGameBridge()` call.

## What to Change

Create `packages/runner/src/bridge/game-bridge.ts` implementing:

1. `createGameBridge()` function that:
   - Creates a new `Worker` pointing to `../worker/game-worker.ts` using Vite's `new URL(...)` pattern with `{ type: 'module' }`.
   - Wraps the worker with `Comlink.wrap<GameWorkerAPI>()`.
   - Returns a `GameBridgeHandle` object: `{ bridge, terminate }`.
2. Type exports:
   - `GameBridge` = `Remote<GameWorkerAPI>` (the Comlink-wrapped proxy).
   - `GameBridgeHandle` = `{ readonly bridge: GameBridge; readonly terminate: () => void }`.
3. Re-export `GameWorkerAPI` type from the worker module (for consumer convenience).

### Key details
- `terminate()` calls `worker.terminate()` to destroy the worker. Must be called on component unmount / navigation away.
- The bridge is typed via Comlink's `Remote<T>` which converts all methods to return `Promise<ReturnType>`.
- `proxy()` import from comlink should be re-exported for consumers who need it for `playSequence` callbacks.

## Files to Touch

- `packages/runner/src/bridge/game-bridge.ts` — **NEW FILE**

## Out of Scope

- Do NOT modify the worker file (`game-worker.ts`) — that was WRKBRIDGE-002.
- Do NOT modify any engine code.
- Do NOT write tests — that is WRKBRIDGE-006.
- Do NOT add React hooks or components that consume the bridge (that is a later spec).
- Do NOT add `worker.onerror` handling beyond what Comlink provides (error handling is in the worker via WorkerError).

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner typecheck` passes (bridge types resolve correctly against worker types).
- `pnpm turbo build` succeeds.

### Invariants
- `createGameBridge()` returns `GameBridgeHandle` with exactly two members: `bridge` and `terminate`.
- `GameBridge` type equals `Remote<GameWorkerAPI>` — no manual type overrides.
- Worker URL uses `new URL('../worker/game-worker.ts', import.meta.url)` pattern (Vite-native).
- No kernel source files are modified.
- No new runtime dependencies beyond `comlink` (already added in WRKBRIDGE-001).
