# 62BINCCHOPRO-005: Runner worker/bridge — add `advanceChooseN` RPC method

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: tickets/62BINCCHOPRO-004.md

## Problem

The runner's Web Worker and Comlink bridge have no method to invoke `advanceChooseN`. The runner currently communicates `chooseN` decisions as one-shot arrays through `legalChoices` + `applyTemplateMove`. To enable incremental selection, the worker API needs a new method that forwards `ChooseNCommand` to the kernel's `advanceChooseN` and returns the result.

## Assumption Reassessment (2026-03-14)

1. `GameWorkerAPI` is defined in `packages/runner/src/worker/game-worker-api.ts` (~100+ lines). It exposes `legalChoices`, `applyTemplateMove`, `legalMoves` via Comlink. Confirmed.
2. The bridge is in `packages/runner/src/bridge/game-bridge.ts` (67 lines). It wraps the worker with Comlink `wrap()`. Confirmed.
3. Worker methods are async (run off-main-thread). The bridge exposes them as `Remote<GameWorkerAPI>`. Confirmed.
4. The worker holds `GameDef`, `GameState`, and `GameDefRuntime` internally. It has access to everything `advanceChooseN` needs. Confirmed.

## Architecture Check

1. The new worker method follows the same pattern as `legalChoices` — receives parameters, calls a kernel function, returns the result.
2. `advanceChooseN` is pure and does not mutate state. The worker calls it with its internal def/state/runtime and the caller-provided parameters.
3. The bridge simply proxies the call — no logic in the bridge layer.
4. Comlink handles serialization of the `ChooseNCommand` and `AdvanceChooseNResult` types automatically (they are plain objects).

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

### 2. Verify bridge access

The bridge (`game-bridge.ts`) uses `Comlink.wrap<GameWorkerAPI>()`, so the new method is automatically available. No bridge code changes should be needed, but verify the type is correctly inferred.

### 3. Add worker tests

Test the new worker method in the runner test suite.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify — add method)
- `packages/runner/src/worker/game-worker.ts` (modify — if worker entry re-exports or registers methods)
- `packages/runner/test/worker/game-worker-api.test.ts` (modify or new — test the new method)

## Out of Scope

- Kernel `advanceChooseN` implementation (ticket 62BINCCHOPRO-004)
- Runner store changes (ticket 62BINCCHOPRO-006)
- Runner UI changes (ticket 62BINCCHOPRO-007)
- Engine type changes (ticket 62BINCCHOPRO-001)
- Any modification to `legalChoices` or `applyTemplateMove`
- Changing the existing `chooseN` one-shot path (it continues to work for AI agents)

## Acceptance Criteria

### Tests That Must Pass

1. Worker `advanceChooseN` method exists and is callable via Comlink proxy
2. Worker delegates to kernel `advanceChooseN` with correct parameters (def, state, partialMove, decisionKey, currentSelected, command, runtime)
3. Worker returns `AdvanceChooseNResult` correctly for both `{ done: false }` and `{ done: true }` cases
4. Existing worker methods (`legalChoices`, `applyTemplateMove`, `legalMoves`) are unaffected
5. `pnpm -F @ludoforge/runner typecheck` succeeds
6. `pnpm -F @ludoforge/runner test` — no regressions

### Invariants

1. The bridge remains a thin Comlink wrapper — no business logic in the bridge layer
2. Existing worker API contract is unchanged — all current methods continue to work
3. No game-specific identifiers in worker code

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker-api.test.ts` — verify `advanceChooseN` delegation and return types

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
