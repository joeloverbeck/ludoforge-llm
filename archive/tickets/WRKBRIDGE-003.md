# WRKBRIDGE-003: Implement Main-Thread GameBridge Factory (D2)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: S
**Spec**: 36, Deliverable D2 (Main-Thread Bridge)
**Deps**: WRKBRIDGE-002 (worker entry point exists)

## Problem

The main thread needs a typed async RPC interface to the GameWorker. Comlink's `wrap()` provides this, but we need a clean factory function that bundles the Worker instantiation, Comlink wrapping, and termination lifecycle into a single `createGameBridge()` call.

## Assumptions Reassessment (2026-02-17)

- `WRKBRIDGE-002` is already implemented beyond the raw entry point:
  - `packages/runner/src/worker/game-worker-api.ts` exists with the full worker API surface (`init`, `legalMoves`, `enumerateLegalMoves`, `legalChoices`, `applyMove`, `playSequence`, `terminalResult`, `getState`, `getMetadata`, `getHistoryLength`, `undo`, `reset`).
  - `packages/runner/src/worker/game-worker.ts` exists and exposes the worker via Comlink.
- Worker behavior tests already exist in `packages/runner/test/worker/game-worker.test.ts`.
- The missing deliverable for D2 is specifically the **main-thread factory** (`createGameBridge`) and typed export surface for main-thread consumers.
- Because this ticket now closes a bridge lifecycle boundary, bridge-focused tests are in scope here (mocked Worker + mocked Comlink). Full end-to-end worker integration remains in WRKBRIDGE-006.

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
4. Add bridge unit tests in `packages/runner/test/worker/game-bridge.test.ts` that verify:
   - Worker is constructed with `new URL('../worker/game-worker.ts', import.meta.url)` and `{ type: 'module' }`.
   - `wrap<GameWorkerAPI>()` receives the created worker and returned value is surfaced as `bridge`.
   - `terminate()` invokes `worker.terminate()` exactly once.
   - `proxy` is re-exported from the bridge module.

### Key details
- `terminate()` calls `worker.terminate()` to destroy the worker. Must be called on component unmount / navigation away.
- The bridge is typed via Comlink's `Remote<T>` which converts all methods to return `Promise<ReturnType>`.
- `proxy()` import from comlink should be re-exported for consumers who need it for `playSequence` callbacks.

## Files to Touch

- `packages/runner/src/bridge/game-bridge.ts` — **NEW FILE**
- `packages/runner/test/worker/game-bridge.test.ts` — **NEW FILE**

## Out of Scope

- Do NOT modify the worker file (`game-worker.ts`) — that was WRKBRIDGE-002.
- Do NOT modify any engine code.
- Do NOT add browser-mode or end-to-end Comlink-worker integration harness in this ticket.
- Do NOT add React hooks or components that consume the bridge (that is a later spec).
- Do NOT add `worker.onerror` handling beyond what Comlink provides (error handling is in the worker via WorkerError).

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner test` passes (includes worker logic tests and new bridge factory tests).
- `pnpm -F @ludoforge/runner typecheck` passes (bridge types resolve correctly against worker types).
- `pnpm -F @ludoforge/runner lint` passes.
- `pnpm turbo build` succeeds.

### Invariants
- `createGameBridge()` returns `GameBridgeHandle` with exactly two members: `bridge` and `terminate`.
- `GameBridge` type equals `Remote<GameWorkerAPI>` — no manual type overrides.
- Worker URL uses `new URL('../worker/game-worker.ts', import.meta.url)` pattern (Vite-native).
- `proxy` is exported from the bridge module for `playSequence` callback bridging.
- No kernel source files are modified.
- No new runtime dependencies beyond `comlink` (already added in WRKBRIDGE-001).

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/bridge/game-bridge.ts` with `createGameBridge()`, `GameBridge`/`GameBridgeHandle` types, `GameWorkerAPI` type re-export, and `proxy` re-export.
  - Added `packages/runner/test/worker/game-bridge.test.ts` covering worker construction URL/options, Comlink `wrap()` binding, terminate lifecycle, and `proxy` re-export.
  - Updated this ticket’s assumptions/scope to match repo reality (worker API and worker tests already existed).
- **Deviations from original plan**:
  - Original ticket declared tests out of scope; this was corrected because bridge-lifecycle coverage belonged with D2 closure and current codebase state.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm turbo build` ✅
