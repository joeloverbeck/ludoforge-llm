# 62BINCCHOPRO-005: Runner worker/bridge — add `advanceChooseN` RPC method

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — runtime export surface only
**Deps**: archive/tickets/62BINCCHOPRO-004.md

## Problem

The runner's Web Worker and Comlink bridge have no method to invoke `advanceChooseN`. The runner currently communicates `chooseN` decisions as one-shot arrays through `legalChoices` + `applyTemplateMove`. To enable incremental selection, the worker API needs a new method that forwards `ChooseNCommand` to the kernel's `advanceChooseN` and returns the result.

## Assumption Reassessment (2026-03-14)

1. `GameWorkerAPI` is defined in `packages/runner/src/worker/game-worker-api.ts` and the worker implementation lives in the same file via `createGameWorker()`. Confirmed.
2. The bridge is in `packages/runner/src/bridge/game-bridge.ts`. It is a thin `Comlink.wrap<GameWorkerAPI>()` wrapper with fatal-error plumbing only. Confirmed.
3. Worker methods are async and the bridge exposes them as `Remote<GameWorkerAPI>`. Confirmed.
4. The worker already holds `GameDef`, `GameState`, and `GameDefRuntime` internally, so it has access to everything `advanceChooseN` needs. Confirmed.
5. The runner imports engine APIs from the curated `@ludoforge/engine/runtime` surface, not from the kernel root. `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult` are exported from `packages/engine/src/kernel/index.ts` today, but they are not exported from `packages/engine/src/kernel/runtime.ts`. The original “runner-only” assumption is therefore incorrect: this ticket needs a small engine runtime-surface change instead of bypassing the curated runtime API.
6. The proposed worker test file `packages/runner/test/worker/game-worker-api.test.ts` does not exist. The real worker-facing test surfaces are `packages/runner/test/worker/game-worker.test.ts`, `packages/runner/test/worker/clone-compat.test.ts`, and `packages/runner/test/worker/game-bridge.test.ts`.

## Architecture Check

1. The new worker method should follow the same pattern as `legalChoices`: receive caller parameters, call a pure engine function with worker-owned `def`/`state`/`runtime`, and return the result.
2. `advanceChooseN` is pure and does not mutate worker state. That makes a direct worker RPC a good fit for the current architecture.
3. The bridge should remain a thin Comlink wrapper. No bridge-side branching, fallback aliasing, or compatibility indirection should be added.
4. Because the runner already depends on the curated runtime surface, the clean architecture is to expose `advanceChooseN` through `@ludoforge/engine/runtime` instead of having runner code reach into a different engine surface.
5. `ChooseNCommand` and `AdvanceChooseNResult` are plain-object payloads, so they should remain structured-clone safe across the worker boundary. That invariant should be tested explicitly.

## What to Change

### 1. Add `advanceChooseN` to `GameWorkerAPI`

In `packages/runner/src/worker/game-worker-api.ts`:

```ts
async advanceChooseN(
  partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
): Promise<AdvanceChooseNResult>
```

Implementation delegates to the kernel's `advanceChooseN` using the worker's internal `def`, `state`, and `runtime`.

### 2. Export the incremental chooseN API through the curated engine runtime surface

Add `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult` to `packages/engine/src/kernel/runtime.ts`.

This keeps runner code on the intended runtime import surface instead of creating a one-off import path to the kernel barrel.

### 3. Verify bridge access

The bridge (`game-bridge.ts`) uses `Comlink.wrap<GameWorkerAPI>()`, so the new method is automatically available. No bridge code changes should be needed, but verify the type is correctly inferred.

### 4. Add worker-boundary tests

Test the new worker method in the existing runner worker suites, including structured-clone compatibility for the new command/result payloads.

## Files to Touch

- `tickets/62BINCCHOPRO-005.md` (modify — correct assumptions/scope first)
- `packages/engine/src/kernel/runtime.ts` (modify — export `advanceChooseN` runtime surface)
- `packages/runner/src/worker/game-worker-api.ts` (modify — add method)
- `packages/runner/test/worker/game-worker.test.ts` (modify — worker delegation/behavior coverage)
- `packages/runner/test/worker/clone-compat.test.ts` (modify — structured-clone coverage for command/result payloads)
- `packages/runner/test/worker/game-bridge.test.ts` (modify only if needed for bridge type surface; otherwise no code changes)

## Out of Scope

- Kernel `advanceChooseN` implementation (ticket 62BINCCHOPRO-004)
- Runner store changes (ticket 62BINCCHOPRO-006)
- Runner UI changes (ticket 62BINCCHOPRO-007)
- Engine type changes (ticket 62BINCCHOPRO-001)
- Any modification to `legalChoices` or `applyTemplateMove`
- Changing the existing `chooseN` one-shot path (it continues to work for AI agents)
- Any bridge-layer business logic or compatibility aliasing

## Acceptance Criteria

### Tests That Must Pass

1. `@ludoforge/engine/runtime` exports `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult`
2. Worker `advanceChooseN` method exists and is callable on the worker API
3. Worker delegates to engine `advanceChooseN` with correct parameters (`def`, `state`, `partialMove`, `decisionKey`, `currentSelected`, `command`, `runtime`)
4. Worker returns `AdvanceChooseNResult` correctly for both `{ done: false }` and `{ done: true }` cases
5. `ChooseNCommand` and `AdvanceChooseNResult` remain structured-clone compatible across the worker boundary
6. Existing worker methods (`legalChoices`, `applyTemplateMove`, `legalMoves`) are unaffected
7. `pnpm -F @ludoforge/runner typecheck` succeeds
8. `pnpm -F @ludoforge/runner test` succeeds
9. `pnpm turbo lint --filter=@ludoforge/runner` succeeds

### Invariants

1. The bridge remains a thin Comlink wrapper — no business logic in the bridge layer
2. Existing worker API contract remains additive — all current methods continue to work
3. No game-specific identifiers in worker code
4. Runner code continues to consume the curated engine runtime surface instead of reaching into an ad hoc kernel-only import path

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker.test.ts` — verify `advanceChooseN` delegation, argument threading, and returned pending/finalized results
2. `packages/runner/test/worker/clone-compat.test.ts` — verify `ChooseNCommand` and `AdvanceChooseNResult` are structured-clone safe
3. `packages/runner/test/worker/game-bridge.test.ts` — only if a bridge-facing type or runtime expectation needs explicit pinning

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo lint --filter=@ludoforge/runner`

## Outcome

- Outcome amended: 2026-03-14

- Completion date: 2026-03-14
- What actually changed:
  - Exported `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult` from `packages/engine/src/kernel/runtime.ts` so the runner can stay on the curated `@ludoforge/engine/runtime` surface.
  - Added `advanceChooseN(...)` to `GameWorkerAPI` in `packages/runner/src/worker/game-worker-api.ts` and delegated it to the pure engine `advanceChooseN` using the worker-owned `def`, `state`, and `runtime`.
  - Added worker behavior coverage in `packages/runner/test/worker/game-worker.test.ts` for both pending and finalized `advanceChooseN` results.
  - Added structured-clone coverage in `packages/runner/test/worker/clone-compat.test.ts` for `ChooseNCommand`, `AdvanceChooseNResult`, and a real worker `advanceChooseN` round trip.
  - Updated `packages/runner/test/store/game-store.test.ts` test bridge scaffolding to include the additive `advanceChooseN` API surface.
- Deviations from original plan:
  - Expanded scope slightly into the engine package because the original ticket assumed runner-only work, but the clean architecture required exposing the new API through the curated runtime barrel rather than introducing a separate kernel-only import path for runner code.
  - Did not change `packages/runner/src/worker/game-worker.ts` or `packages/runner/src/bridge/game-bridge.ts`, because the existing Comlink exposure/wrapping model already picked up the additive worker method without extra logic.
  - Used the existing worker and clone-compat suites instead of the non-existent `packages/runner/test/worker/game-worker-api.test.ts` file named in the original ticket.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm exec vitest run test/worker/game-worker.test.ts test/worker/clone-compat.test.ts` (from `packages/runner/`)
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine test`
