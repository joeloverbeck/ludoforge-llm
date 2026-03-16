# 63MCTSRUNMOVCLA-001: Remove `concreteActionIds` from `GameDefRuntime`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel `gamedef-runtime.ts`, MCTS agent modules
**Deps**: None

## Problem

`concreteActionIds` on `GameDefRuntime` conflates compile-time action structure (no template params) with runtime move readiness. Actions without template params can still have inline `chooseN`/`chooseOne` decisions discovered at runtime. This field is consumed exclusively by MCTS code and must be removed before the new runtime classification can replace it.

## Assumption Reassessment (2026-03-16)

1. `concreteActionIds` is defined as `ReadonlySet<string>` on `GameDefRuntime` in `packages/engine/src/kernel/gamedef-runtime.ts` (line ~25-26) — **confirmed**.
2. Computed in `createGameDefRuntime()` by filtering `action.params.length === 0` — **confirmed**.
3. Consumed only by MCTS code: `materialization.ts` (1 site), `search.ts` (3 sites) — **confirmed**. No kernel, compiler, simulator, or runner code reads it.

## Architecture Check

1. Removing a misleading abstraction is cleaner than adding workarounds. Runtime classification (next ticket) replaces this with `legalChoicesEvaluate`.
2. No game-specific logic involved — purely engine-internal plumbing.
3. No backwards-compatibility shims. All consumers updated in this ticket or subsequent tickets in the series.

## What to Change

### 1. Remove `concreteActionIds` from `GameDefRuntime` interface

In `packages/engine/src/kernel/gamedef-runtime.ts`:
- Delete the `concreteActionIds` field from the `GameDefRuntime` interface.
- Delete the `concreteActionIds` computation loop from `createGameDefRuntime()`.
- Delete the `concreteActionIds` property from the return object.

### 2. Remove `concreteActionIds` consumers in MCTS (compile-time stubs)

Since tickets 002–005 will replace the logic, this ticket must make the code **compile** without `concreteActionIds`. The minimal approach:

- **`materialization.ts`**: In `materializeOrFastPath()`, remove the `concreteActionIds`-based fast-path check. Make it always take the "slow path" (call `materializeConcreteCandidates`). This is a temporary bridge — ticket 003 replaces the function entirely.
- **`search.ts`**: Remove the `concreteActionIds`-based partition loop. Temporarily treat all moves as "template" (send all to `materializeOrFastPath` which now always does full classification). This is a temporary bridge — ticket 004 replaces this block.
- **`search.ts` visitor emissions**: Replace `concreteCount`/`templateCount` with placeholder `0` values. Ticket 006 replaces these properly.

### 3. Update `gamedef-runtime.test.ts`

Remove any assertion on `concreteActionIds` existing on the runtime object. Add assertion that the property does NOT exist.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — remove field + computation)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — remove fast-path guard)
- `packages/engine/src/agents/mcts/search.ts` (modify — remove partition, stub visitor counts)
- `packages/engine/test/unit/kernel/gamedef-runtime.test.ts` (modify — update assertions)
- `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (modify or delete — fast path no longer exists)

## Out of Scope

- Implementing `classifyMovesForSearch` (ticket 002)
- Implementing `materializeMovesForRollout` (ticket 003)
- Rewriting `search.ts` move handling (ticket 004)
- Rewriting `rollout.ts` (ticket 005)
- Visitor event renames (ticket 006)
- FITL MCTS fast validation (ticket 007)
- Any changes to kernel modules other than `gamedef-runtime.ts`
- Any changes to compiler, simulator, runner, or CLI code

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/kernel/gamedef-runtime.test.ts` — `createGameDefRuntime` succeeds without `concreteActionIds`; runtime object has no `concreteActionIds` property.
2. `pnpm -F @ludoforge/engine build` — project compiles cleanly (no TypeScript errors).
3. `pnpm -F @ludoforge/engine test` — all existing tests pass (some materialization-fastpath tests may need removal/update since the fast path is gone).

### Invariants

1. `GameDefRuntime` interface no longer contains `concreteActionIds`.
2. No kernel, compiler, simulator, or runner code is affected.
3. The MCTS agent still functions (though possibly slower without fast path) — no crashes, no behavioral regression for games that were already working (Texas Hold'em, simple test fixtures).
4. No game-specific identifiers introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/gamedef-runtime.test.ts` — assert `concreteActionIds` absent from runtime
2. `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` — remove or rewrite tests that assert fast-path behavior

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
