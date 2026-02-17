# WRKBRIDGE-005: GameDef Loading from URL in Worker (D4)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: XS
**Spec**: 36, Deliverable D4 (Worker Initialization with GameDef Loading)
**Deps**: WRKBRIDGE-002 (worker entry point exists)

## Problem

The bridge must support loading a GameDef from a URL (fetched inside the worker, parsed as JSON), in addition to receiving a pre-compiled JSON object directly. This enables the runner to point the worker at a hosted GameDef file without fetching it on the main thread first.

## What to Change

Add a `loadFromUrl` method to the GameWorker API in `packages/runner/src/worker/game-worker.ts`:

```typescript
async loadFromUrl(
  url: string,
  seed: number,
  options?: BridgeInitOptions,
): Promise<GameState> {
  const response = await fetch(url);
  if (!response.ok) {
    throw toWorkerError('VALIDATION_FAILED', `Failed to fetch GameDef: ${response.status} ${response.statusText}`);
  }
  const def = await response.json() as GameDef;
  // Optional: validate GameDef using engine's validateGameDef if available
  return this.init(def, seed, options);
}
```

### Key details
- Uses the Worker's own `fetch()` (available in Worker scope).
- On HTTP error, throws `VALIDATION_FAILED` WorkerError with status info.
- On JSON parse error, throws `VALIDATION_FAILED`.
- After fetching, delegates to `this.init()` — reuses existing initialization logic.
- GameDef validation (via engine's `validateGameDef`) is optional but recommended. Check if the engine exports a validation function; if so, call it and throw `VALIDATION_FAILED` on failure.

## Files to Touch

- `packages/runner/src/worker/game-worker.ts` — add `loadFromUrl` method to `gameWorker` object

## Out of Scope

- Do NOT modify any engine code.
- Do NOT modify the bridge factory (`game-bridge.ts`) — Comlink automatically proxies the new method.
- Do NOT implement caching, retry logic, or progress reporting for the fetch.
- Do NOT add tests in this ticket — URL-based loading tests belong in WRKBRIDGE-006.

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner typecheck` passes (new method signature is valid).
- `pnpm turbo build` succeeds.

### Invariants
- The `loadFromUrl` method follows the same error conventions as other worker methods (throws WorkerError objects).
- `GameWorkerAPI` type automatically includes the new method (since it's `typeof gameWorker`).
- No kernel source files are modified.
- The method is `async` (returns `Promise<GameState>`).
