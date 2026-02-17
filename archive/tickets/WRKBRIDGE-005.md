# WRKBRIDGE-005: GameDef Loading from URL in Worker (D4)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: XS
**Spec**: 36, Deliverable D4 (Worker Initialization with GameDef Loading)
**Deps**: WRKBRIDGE-002 (worker entry point exists)

## Problem

The worker bridge must support initializing directly from a GameDef URL (fetch in worker scope), in addition to direct object initialization. This keeps GameDef acquisition and validation inside the worker boundary and avoids main-thread fetch/parse coupling.

## Assumptions Reassessment (2026-02-17)

- Worker runtime logic is implemented in `packages/runner/src/worker/game-worker-api.ts`; `packages/runner/src/worker/game-worker.ts` is only the Comlink expose entrypoint.
- Existing worker API behavior is already covered by `packages/runner/test/worker/game-worker.test.ts`.
- `@ludoforge/engine` exports `validateGameDef`, so URL-loaded JSON can be validated explicitly before initialization.
- The prior assumption "do not add tests in this ticket" is incorrect for current architecture: this ticket introduces new error/validation paths and requires direct worker API tests to lock behavior.

## Scope Decision

Adding `loadFromUrl` is beneficial over the current architecture because it centralizes fetch/parse/validation/init in the worker, which is cleaner and more extensible than duplicating this pipeline on the main thread.

Architectural direction for this ticket:
- Keep bridge contracts generic and engine-agnostic.
- Reuse existing initialization flow instead of introducing parallel state setup paths.
- Enforce strict error taxonomy (`VALIDATION_FAILED`) for all URL-load validation failures (HTTP, JSON parse, schema/semantic validation).

## What to Change

Implement `loadFromUrl` on the worker API in `packages/runner/src/worker/game-worker-api.ts`:

```typescript
async loadFromUrl(
  url: string,
  seed: number,
  options?: BridgeInitOptions,
): Promise<GameState>
```

Required behavior:
- Fetch from `url` using worker `fetch()`.
- If response is not OK, throw `WorkerError` with `code: 'VALIDATION_FAILED'` and status details in message.
- If JSON parsing fails, throw `VALIDATION_FAILED`.
- Validate parsed payload via engine `validateGameDef`; if invalid, throw `VALIDATION_FAILED` with diagnostics in `details`.
- On success, delegate to the existing worker initialization flow (`init`) so state/history/trace defaults remain consistent.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` - add `loadFromUrl` implementation to worker API.
- `packages/runner/test/worker/game-worker.test.ts` - add URL-loading behavior and failure-path tests.

## Out of Scope

- Do NOT modify engine source code.
- Do NOT modify `packages/runner/src/bridge/game-bridge.ts`.
- Do NOT add caching/retries/progress events.
- Do NOT introduce game-specific handling or aliases.

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner test` passes (including new URL-loading tests).
- `pnpm -F @ludoforge/runner typecheck` passes.
- `pnpm -F @ludoforge/runner lint` passes.
- `pnpm turbo build` succeeds.

### Invariants
- `loadFromUrl` returns `Promise<GameState>`.
- URL-loading failures map to `WorkerError` with `code: 'VALIDATION_FAILED'`.
- Successful `loadFromUrl` follows exactly the same initialization semantics as `init` (history reset, trace option handling).
- No kernel source files are modified.

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `loadFromUrl(url, seed, options?)` to `packages/runner/src/worker/game-worker-api.ts`.
  - Added explicit URL-load validation flow: HTTP status checks, JSON parse handling, `validateGameDef` diagnostics, and malformed-payload fallback mapping.
  - Improved worker error normalization so thrown objects with `message`/`details` preserve structured details while remaining clone-safe.
  - Added URL-loading tests to `packages/runner/test/worker/game-worker.test.ts` for success + failure paths.
- **Deviations from original plan**:
  - Original ticket targeted `game-worker.ts`; implementation was correctly applied in `game-worker-api.ts`, with `game-worker.ts` remaining a thin expose layer.
  - Original ticket excluded tests; tests were added because URL loading introduces new invariants and error paths.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm turbo build` ✅
  - `pnpm turbo test` ✅
