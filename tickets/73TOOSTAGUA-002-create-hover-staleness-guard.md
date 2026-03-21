# 73TOOSTAGUA-002: Create HoverStalenessGuard pure logic module

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 73TOOSTAGUA-001 (needs `clearAll`, `getActiveTargetCount`, `getActiveTargets`, `removeTarget`)

## Problem

Canvas tooltips get stuck visible when `pointerleave` events fail to fire (during viewport panning, rapid pointer exit, or DOM/canvas transitions). There is no safety net to clear stale hover targets. This ticket creates the core staleness guard logic as a pure, dependency-injected module with no PixiJS or DOM imports.

## Assumption Reassessment (2026-03-21)

1. `HoveredCanvasTarget` type is `{ kind: 'zone' | 'token'; id: string }` in `packages/runner/src/canvas/hover-anchor-contract.ts` — confirmed.
2. `ScreenRect` is already exported from `packages/runner/src/canvas/coordinate-bridge.ts` with `x, y, width, height, left, top, right, bottom` — confirmed.
3. The spec defines `ScreenRect` in the guard's interface, but the existing `ScreenRect` from `coordinate-bridge.ts` already has those fields. The guard should import and reuse the existing `ScreenRect` type rather than redefining it.
4. The guard uses `setInterval`/`clearInterval` for the periodic sweep — injecting the timer via deps would complicate the interface for minimal test benefit. Instead, the guard accepts `sweepIntervalMs` and tests use `vi.useFakeTimers()` to control `setInterval`.

## Architecture Check

1. Pure dependency injection: all external interactions (reading targets, clearing, pointer position, canvas bounds, screen bounds resolution) are injected as functions — the module is 100% unit-testable without DOM, PixiJS, or browser APIs.
2. Runner-only concern — no engine/GameDef/GameSpecDoc boundaries affected.
3. No backwards-compatibility shims — this is a brand-new file.

## What to Change

### 1. Create `HoverStalenessGuard` factory module

New file: `packages/runner/src/canvas/interactions/hover-staleness-guard.ts`

**Exports**:
- `HoverStalenessGuardDeps` interface (all injected dependencies)
- `HoverStalenessGuard` interface (`onViewportMoving`, `onCanvasPointerLeave`, `onHoverStateChanged`, `destroy`)
- `createHoverStalenessGuard(deps)` factory function

**Types to import** (not redefine):
- `HoveredCanvasTarget` from `../hover-anchor-contract.js`
- `ScreenRect` from `../coordinate-bridge.js`

**Deps interface**:

```typescript
interface HoverStalenessGuardDeps {
  readonly getActiveTargetCount: () => number;
  readonly getActiveTargets: () => ReadonlyMap<string, HoveredCanvasTarget>;
  readonly removeTarget: (key: string) => void;
  readonly clearAll: () => void;
  readonly getPointerScreenPosition: () => { readonly x: number; readonly y: number } | null;
  readonly getCanvasBounds: () => { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null;
  readonly resolveTargetScreenBounds: (target: HoveredCanvasTarget) => ScreenRect | null;
  readonly sweepIntervalMs?: number; // default 500
}
```

**Behavior**:
- `onViewportMoving()`: calls `clearAll()` immediately.
- `onCanvasPointerLeave()`: calls `clearAll()` immediately.
- `onHoverStateChanged()`: starts sweep interval when `getActiveTargetCount() > 0` and no interval is running; stops interval when count is 0.
- **Sweep tick**: get pointer position; if `null` or outside canvas bounds, `clearAll()`. Otherwise iterate `getActiveTargets()`, resolve each target's screen bounds, remove any whose bounds do not contain the pointer. A point `(px, py)` is inside `ScreenRect` when `px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom`.
- `destroy()`: clear any running interval, mark destroyed, all methods become no-ops.

### 2. Create comprehensive test suite

New file: `packages/runner/test/canvas/interactions/hover-staleness-guard.test.ts`

## Files to Touch

- `packages/runner/src/canvas/interactions/hover-staleness-guard.ts` (new)
- `packages/runner/test/canvas/interactions/hover-staleness-guard.test.ts` (new)

## Out of Scope

- Modifying `hover-target-controller.ts` (done in 73TOOSTAGUA-001)
- Wiring into `game-canvas-runtime.ts` (done in 73TOOSTAGUA-003)
- DOM event listeners (`pointermove`, `pointerleave` on canvas element)
- Viewport `moved` event handler changes
- Any changes to `coordinate-bridge.ts` or `hover-anchor-contract.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `onViewportMoving()` calls `clearAll()` immediately
2. `onCanvasPointerLeave()` calls `clearAll()` immediately
3. `onHoverStateChanged()` starts sweep interval when `getActiveTargetCount() > 0`
4. `onHoverStateChanged()` stops sweep interval when `getActiveTargetCount()` returns 0
5. Sweep removes targets whose screen bounds do not contain the pointer position
6. Sweep calls `clearAll()` when pointer position is `null` (left window)
7. Sweep calls `clearAll()` when pointer is outside canvas bounds
8. Sweep keeps targets whose bounds still contain the pointer
9. `destroy()` clears any running interval (no further sweep ticks)
10. No sweep runs when `getActiveTargetCount()` is 0 (no unnecessary timers — verify `setInterval` not called)
11. Multiple rapid `onViewportMoving()` calls are safe (idempotent — `clearAll` called each time but no crash)
12. After `destroy()`, all methods are no-ops (no `clearAll` calls, no interval starts)

### Invariants

1. The module has zero imports from PixiJS, DOM APIs, or any browser-only module — only type imports from sibling modules
2. All external interactions go through the `deps` object — no global state
3. The sweep interval is only active when `activeTargetCount > 0` (zero idle cost)
4. `resolveTargetScreenBounds` returning `null` for a target causes that target to be removed (treat unresolvable as stale)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/interactions/hover-staleness-guard.test.ts` — full test suite using `vi.useFakeTimers()` to control the sweep interval, `vi.fn()` mocks for all deps

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/interactions/hover-staleness-guard.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
