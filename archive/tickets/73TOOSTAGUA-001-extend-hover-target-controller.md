# 73TOOSTAGUA-001: Extend HoverTargetController with guard-facing target management methods

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The `HoverTargetController` interface only supports individual `onHoverEnter`/`onHoverLeave` operations. Spec 73's staleness guard needs to clear stale hover state wholesale, inspect the currently active hovered targets, and remove a specific stale target without reimplementing controller state in the runtime.

The original ticket proposed exposing the controller's internal `Map<string, HoveredCanvasTarget>` and its string key format. That is a leaky abstraction: it hard-codes private storage details into a public contract, makes the guard depend on stringly-typed keys, and adds surface area that is not otherwise valuable. The guard only needs domain-level operations over `HoveredCanvasTarget`, not the controller's internal indexing strategy.

## Assumption Reassessment (2026-03-21)

1. `HoverTargetController` interface is defined in `packages/runner/src/canvas/interactions/hover-target-controller.ts` and exposes `getCurrentTarget`, `onHoverEnter`, `onHoverLeave`, `destroy` — confirmed.
2. `activeTargets` is a `Map<string, HoveredCanvasTarget>` keyed by `${kind}:${id}` via `toTargetKey()` — confirmed.
3. `schedulePublish()` is the batched publish mechanism that picks the highest-priority target and calls `onTargetChange` — confirmed.
4. Existing controller tests in `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` cover enter/leave/priority — confirmed (3 tests).
5. Existing runtime tests in `packages/runner/test/canvas/GameCanvas.test.ts` already verify hover-anchor emission, overlap precedence, and leave ordering. The ticket must preserve these higher-level behaviors, not just controller-local invariants.
6. `ReadonlyMap` would not provide meaningful immutability at runtime because callers would still receive the live `Map` instance. A snapshot-based API is safer.

## Architecture Check

1. Adding guard-facing methods to the existing factory function keeps hover-state ownership in one place — no new files are needed for this ticket.
2. The public API should stay domain-oriented. Expose hovered targets as `HoveredCanvasTarget` values, not storage keys or collection internals.
3. All new methods are runner-only canvas interaction concerns; no engine/GameDef/GameSpecDoc boundaries are affected.
4. No backwards-compatibility shims — the interface gains new required members and the single implementation is updated in place.

## What to Change

### 1. Extend the `HoverTargetController` interface

Add three new methods to the exported interface:

```typescript
clearAll(): void;
getActiveTargets(): readonly HoveredCanvasTarget[];
removeTarget(target: HoveredCanvasTarget): void;
```

### 2. Implement the methods in `createHoverTargetController`

- `clearAll()`: If destroyed, no-op. Otherwise clear the `activeTargets` map and call `schedulePublish()`.
- `getActiveTargets()`: Return a snapshot array of the current hovered targets in deterministic insertion order (`Array.from(activeTargets.values())`).
- `removeTarget(target)`: If destroyed or the target is absent, no-op. Otherwise delete the matching entry by `toTargetKey(target)` and call `schedulePublish()`.

### 3. Preserve batching and ownership

- `schedulePublish()` remains the only way `onTargetChange` fires.
- `activeTargets` remains private implementation detail owned by the controller.
- The new methods must not let callers mutate internal controller state directly.

## Files to Touch

- `packages/runner/src/canvas/interactions/hover-target-controller.ts` (modify)
- `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` (modify)

## Out of Scope

- Creating the `HoverStalenessGuard` module (ticket 73TOOSTAGUA-002)
- Wiring anything into `game-canvas-runtime.ts` (ticket 73TOOSTAGUA-003)
- Changing hover anchor publishing logic
- Modifying `hover-anchor-contract.ts`
- Any DOM or PixiJS event listener changes

## Acceptance Criteria

### Tests That Must Pass

1. `clearAll()` empties all targets and publishes `null` via `onTargetChange`
2. `clearAll()` when already empty is a no-op (no `onTargetChange` call beyond initial)
3. `getActiveTargets()` returns a snapshot of current entries without exposing mutable controller internals
4. `removeTarget(target)` removes a specific entry and republishes the highest-priority remaining target
5. `removeTarget(target)` with absent target is a no-op (no publish)
6. All 3 existing controller tests continue to pass unchanged
7. Existing runtime hover-anchor tests that depend on overlap precedence and leave ordering continue to pass unchanged

### Invariants

1. `onTargetChange` is never called synchronously — all publishes go through `schedulePublish` (microtask batching preserved)
2. After `destroy()`, all new methods are no-ops (no throws, no publishes)
3. `getActiveTargets()` returns a detached snapshot — callers cannot mutate the controller's internal state through it
4. The controller remains the single owner of hover-target prioritization and target identity normalization

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` — add tests for `clearAll()`, `getActiveTargets()`, `removeTarget(target)`, destroyed-state no-ops, and the detached-snapshot invariant
2. `packages/runner/test/canvas/GameCanvas.test.ts` — no new tests required for this ticket, but the existing hover-anchor tests remain part of the verification set because they cover the real behavior boundary

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/interactions/hover-target-controller.test.ts`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - `HoverTargetController` was extended with `clearAll()`, `getActiveTargets()`, and `removeTarget(target)`.
  - The controller kept its private `Map`-based indexing and microtask publish batching.
  - The controller test suite was expanded to cover bulk clear, detached snapshots, targeted removal, absent-target no-ops, and destroyed-state no-ops.
- Deviations from original plan:
  - The original ticket proposed `getActiveTargetCount()`, `getActiveTargets(): ReadonlyMap<string, HoveredCanvasTarget>`, and `removeTarget(key: string)`.
  - Implementation intentionally did not expose the internal `Map` or string key format. The final API uses domain objects (`HoveredCanvasTarget`) and detached snapshots instead.
  - Existing runtime hover-anchor tests were treated as part of the verification set because they already cover the real behavior boundary.
  - The documented focused `pnpm -F @ludoforge/runner test -- <file>` command shape executed the full runner Vitest suite in this repo state rather than filtering to a single file.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/interactions/hover-target-controller.test.ts` ✅ passed, but executed the full runner suite (`174` files / `1757` tests).
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.test.ts` ✅ passed, but executed the full runner suite (`174` files / `1757` tests).
  - `pnpm -F @ludoforge/runner typecheck` ✅ passed.
  - `pnpm -F @ludoforge/runner lint` ✅ passed.
