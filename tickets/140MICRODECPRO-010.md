# 140MICRODECPRO-010: D6 — Worker bridge rewrite + retired-API deletion (F14 atomic)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: No — runner worker bridge only; but affects engine-exposed types through runner consumers
**Deps**: `tickets/140MICRODECPRO-006.md`, `archive/tickets/140MICRODECPRO-002.md`

## Problem

The runner worker bridge is the RPC boundary between the main thread and the kernel worker. Today it exposes `enumerateLegalMoves` / `legalChoices` / `advanceChooseN` / `applyMove` / `applyTrustedMove` / `applyTemplateMove` plus a session-tracking layer (`ChooseNSession`). All of these retire when the simulator (ticket 006) and agent API (ticket 007) lose their legacy surfaces.

This ticket rewrites `GameWorkerAPI` to expose `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` / `rewindToTurnBoundary` — the new microturn-native protocol.

F14 atomic: ~84 call sites in runner tests, concentrated in `packages/runner/test/worker/choose-n-session-integration.test.ts`, retire together. That test file deletes entirely; fresh microturn-session integration tests are authored in the same commit.

## Assumption Reassessment (2026-04-20)

1. `packages/runner/src/worker/game-worker-api.ts` currently exposes all of `legalMoves`, `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `advanceChooseNWithSession`, `createChooseNSession`, `isChooseNSessionEligible`, `isSessionValid`, `applyMove`, `applyTrustedMove`, `applyTemplateMove` — confirmed by Explore agent during reassessment (lines 96-119).
2. Types `ChoiceRequest`, `ChoicePendingChooseNRequest`, `ChooseNCommand`, `ChooseNSession`, `ChooseNTemplate` are imported and used in the bridge — confirmed (lines 25-29 imports, 98/103/244/351/357/371/373 usages).
3. `OperationStamp` currently has `{epoch, token}` — no `revision` field. Spec proposes to track revision *internally* in the bridge, not as part of the external stamp.
4. `rewindToTurnBoundary` does not currently exist.
5. Ticket 002's I3 rewiring checklist (`campaigns/phase3-microturn/worker-bridge-rewire.md`) is available — this ticket executes it.

## Architecture Check

1. F14 atomic: all deleted bridge methods plus their types retire in the same commit as the new microturn methods land. No shim, no deprecation path.
2. Mechanical uniformity per Foundation 14 exception: the 84 test-site migration is dominated by repeated patterns (`bridge.applyMove(move, opts, stamp)` → `bridge.applyDecision(moveToDecision(move), opts, stamp)`). Test-framework scaffolding retires with the deleted methods.
3. Rules-protocol unity (F5, amended D10.1): the worker bridge is now purely a transport over `publishMicroturn`/`applyDecision` — no runner-side rules reconstruction.
4. Visual separation (F3) preserved: `VisualConfigProvider` consumption is unchanged; the bridge simply delivers microturn state to the same projection layer.

## What to Change

### 1. Rewrite `packages/runner/src/worker/game-worker-api.ts`

Delete:

- `legalMoves`, `enumerateLegalMoves`
- `legalChoices`
- `advanceChooseN`, `advanceChooseNWithSession`, `createChooseNSession`, `isChooseNSessionEligible`, `isSessionValid`
- `applyMove`, `applyTrustedMove`, `applyTemplateMove`
- Type imports and usages of `ChoiceRequest`, `ChoicePendingChooseNRequest`, `ChooseNCommand`, `ChooseNSession`, `ChooseNTemplate`
- The entire session-tracking block with `revision` counter (currently around line 243-251)

Add:

```ts
export interface GameWorkerAPI {
  init(nextDef, seed, options, stamp): Promise<InitResult>;

  publishMicroturn(): Promise<MicroturnState>;
  applyDecision(
    decision: Decision,
    options: ExecutionOptions | undefined,
    stamp: OperationStamp,
  ): Promise<ApplyDecisionResult>;
  advanceAutoresolvable(stamp: OperationStamp): Promise<{
    readonly state: GameState;
    readonly autoResolvedLogs: readonly DecisionLog[];
  }>;
  rewindToTurnBoundary(turnId: TurnId, stamp: OperationStamp): Promise<GameState | null>;

  describeAction(actionId, context?): Promise<AnnotatedActionDescription | null>;
  terminalResult(): Promise<TerminalResult | null>;
  getState(): Promise<GameState>;
  getMetadata(): Promise<GameMetadata>;
  getHistoryLength(): Promise<number>;
  undo(stamp): Promise<GameState | null>;
  reset(...): Promise<InitResult>;
  loadFromUrl(...): Promise<InitResult>;
}
```

Every `applyDecision` / `advanceAutoresolvable` / `rewindToTurnBoundary` mutation invalidates any prior in-flight microturn publication (per `OperationStamp` semantics).

### 2. Implement the new methods

Each new method wraps the corresponding kernel primitive (from tickets 004/005/006) and handles serialization across the worker boundary.

`rewindToTurnBoundary(turnId)` replays from history up to the target boundary — the `history[]` array stores pre-microturn `GameState` snapshots (per spec Edge Cases); rewind walks back to the first microturn of the target turn.

### 3. Update runner source consumers (13 call sites)

Per I3 audit:
- `packages/runner/src/store/game-store.ts` (3 call sites for `enumerateLegalMoves`, 4 for `legalChoices`, 1 for `advanceChooseN`, 2 for apply variants)
- `packages/runner/src/replay/replay-runtime.ts` (1 call site for `enumerateLegalMoves`)
- `packages/runner/src/replay/replay-controller.ts` (1 call site for apply variant)
- `packages/runner/src/agents/agent-turn-orchestrator.ts` (1 call site for `enumerateLegalMoves`)

Each site migrates to the appropriate microturn method. Store state-tracking (`partialMove`, `selectedAction`, etc.) is refactored in ticket 011; this ticket just updates the bridge calls with minimum plumbing to keep the runner compiling.

### 4. Delete and replace `choose-n-session-integration.test.ts`

Delete `packages/runner/test/worker/choose-n-session-integration.test.ts` entirely (84 call sites to deleted methods).

Create `packages/runner/test/worker/microturn-session-integration.test.ts` — fresh integration tests exercising:
- `publishMicroturn()` returns a `MicroturnState` whose legal actions are directly applicable.
- Sequential `applyDecision` calls walk a compound turn frame-by-frame.
- `advanceAutoresolvable` auto-resolves chance + grant + turn-retirement contexts.
- `rewindToTurnBoundary` restores state correctly.
- `OperationStamp` invalidation: a stale stamp on `applyDecision` is rejected.

### 5. Update other runner tests

Migrate remaining runner tests that touch the deleted bridge methods (`game-worker.test.ts`, `clone-compat.test.ts`, `game-store.test.ts` bridge-facing parts). Mechanical migration similar to ticket 006's engine-test shard pattern.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify — full rewrite of public surface)
- `packages/runner/src/store/game-store.ts` (modify — bridge-call migration; deeper store refactor is ticket 011)
- `packages/runner/src/replay/replay-runtime.ts` (modify)
- `packages/runner/src/replay/replay-controller.ts` (modify)
- `packages/runner/src/agents/agent-turn-orchestrator.ts` (modify)
- `packages/runner/test/worker/choose-n-session-integration.test.ts` (delete)
- `packages/runner/test/worker/microturn-session-integration.test.ts` (new)
- `packages/runner/test/worker/game-worker.test.ts` (modify)
- `packages/runner/test/worker/clone-compat.test.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify — bridge-facing portions)

## Out of Scope

- Runner store / UI refactor (partial-move fields, action naming, UI components) — ticket 011.
- Certificate machinery retirement — ticket 012.
- Tests T6 / T9 — ticket 014.
- Engine-side `applyMove` deletion — already done in ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner build` — runner compiles with zero references to deleted bridge methods.
2. `pnpm -F @ludoforge/runner test` — migrated + fresh microturn-session tests pass.
3. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. F14 atomic: grep `packages/runner/` for `enumerateLegalMoves|legalChoices|advanceChooseN|applyMove|applyTrustedMove|applyTemplateMove|ChooseNSession|ChooseNTemplate|ChoicePendingChooseNRequest|ChooseNCommand` returns zero hits after this ticket.
2. `OperationStamp` shape is unchanged externally (still `{epoch, token}`); revision tracking is internal-only.
3. `rewindToTurnBoundary(turnId)` correctly restores state equivalent to pre-first-microturn of that turn (verified via replay test).

## Test Plan

### New/Modified Tests

- `packages/runner/test/worker/microturn-session-integration.test.ts` (new) — integration coverage of the new bridge API.
- Other runner tests migrated mechanically.

### Commands

1. `pnpm -F @ludoforge/runner build`
2. `grep -rn "enumerateLegalMoves\|legalChoices\|advanceChooseN\|applyMove\|applyTrustedMove\|applyTemplateMove\|ChooseNSession\|ChooseNTemplate" packages/runner/` — zero hits.
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
