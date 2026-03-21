# 73TOOSTAGUA-001: Extend HoverTargetController with bulk-clear and introspection methods

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The `HoverTargetController` interface only supports individual `onHoverEnter`/`onHoverLeave` operations. The upcoming staleness guard (Spec 73) needs the ability to bulk-clear all targets, remove individual targets by key, and introspect the active target map. Without these methods, the guard cannot operate.

## Assumption Reassessment (2026-03-21)

1. `HoverTargetController` interface is defined in `packages/runner/src/canvas/interactions/hover-target-controller.ts` and exposes `getCurrentTarget`, `onHoverEnter`, `onHoverLeave`, `destroy` — confirmed.
2. `activeTargets` is a `Map<string, HoveredCanvasTarget>` keyed by `${kind}:${id}` via `toTargetKey()` — confirmed.
3. `schedulePublish()` is the batched publish mechanism that picks the highest-priority target and calls `onTargetChange` — confirmed.
4. Existing tests in `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` cover enter/leave/priority — confirmed (3 tests).

## Architecture Check

1. Adding methods to the existing factory function keeps the module cohesive — no new files needed.
2. All new methods are runner-only canvas interaction concerns; no engine/GameDef/GameSpecDoc boundaries affected.
3. No backwards-compatibility shims — the interface gains new required members; the single implementation gains them too.

## What to Change

### 1. Extend the `HoverTargetController` interface

Add four new methods to the exported interface:

```typescript
clearAll(): void;
getActiveTargetCount(): number;
getActiveTargets(): ReadonlyMap<string, HoveredCanvasTarget>;
removeTarget(key: string): void;
```

### 2. Implement the four methods in `createHoverTargetController`

- `clearAll()`: If destroyed, no-op. Otherwise clear the `activeTargets` map and call `schedulePublish()`.
- `getActiveTargetCount()`: Return `activeTargets.size`.
- `getActiveTargets()`: Return `activeTargets` cast as `ReadonlyMap` (it already is a `Map`; the `ReadonlyMap` type prevents callers from mutating).
- `removeTarget(key)`: If destroyed or key not in map, no-op. Otherwise delete the entry and call `schedulePublish()`.

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
3. `getActiveTargetCount()` returns correct count after enter/leave sequences
4. `getActiveTargets()` returns a readable snapshot of current entries (verify map contents)
5. `removeTarget(key)` removes a specific entry and republishes highest-priority remaining target
6. `removeTarget(key)` with nonexistent key is a no-op (no publish)
7. All 3 existing tests continue to pass unchanged

### Invariants

1. `onTargetChange` is never called synchronously — all publishes go through `schedulePublish` (microtask batching preserved)
2. After `destroy()`, all new methods are no-ops (no throws, no publishes)
3. `getActiveTargets()` returns a `ReadonlyMap` — callers cannot mutate the internal map

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` — add a new `describe` block for the 4 new methods with the 6 test cases listed above

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/interactions/hover-target-controller.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
