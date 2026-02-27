# ACTTOOSYS-005: Bridge Prop Threading — GameContainer Receives bridge

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ACTTOOSYS-004

## Problem

The `useActionTooltip` hook (ACTTOOSYS-006) needs access to the `GameBridge` (Comlink `Remote<GameWorkerAPI>`) to call `describeAction`. Currently, `GameContainer` does not receive the bridge as a prop — it only receives `store` and `visualConfigProvider`. The bridge must be threaded from `App.tsx` through `GameContainer` so that child components can call worker methods for tooltip data.

## Assumption Reassessment (2026-02-27)

1. `GameContainerProps` (from `GameContainer.tsx:45-54`) currently has: `store`, `visualConfigProvider`, `readOnlyMode?`, `onReturnToMenu?`, `onNewGame?`, `onQuit?`, `onSave?`, `onLoad?`. No `bridge` prop. Confirmed.
2. `App.tsx` creates game runtimes via `useActiveGameRuntime()` which returns `activeRuntime` containing `store`, `visualConfigProvider`, and `bridgeHandle`. The `bridgeHandle` shape includes `bridge` (the Comlink Remote). Confirmed.
3. `GameBridge` type is `Comlink.Remote<GameWorkerAPI>` — this is the type used in the runner's bridge module. Need to verify exact type name and import path.
4. `GameContainer` is rendered in `App.tsx` in the active-game view branch. Confirmed.

## Architecture Check

1. Threading the bridge as a prop is the simplest approach — no context providers or additional state management. The bridge is already available at the `App` level.
2. The bridge prop is `readonly` and typed to `GameBridge` (or equivalent Comlink Remote type), maintaining type safety.
3. No behavioral change to existing components — purely additive prop.

## What to Change

### 1. Add `bridge` prop to `GameContainerProps`

In `packages/runner/src/ui/GameContainer.tsx`:

```typescript
interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
  readonly bridge: GameBridge;  // NEW
  readonly visualConfigProvider: VisualConfigProvider;
  // ... existing optional props unchanged
}
```

Destructure `bridge` from props in the component body. It is not used in this ticket — it will be consumed by the tooltip hook in ACTTOOSYS-008.

Determine the correct import path for `GameBridge` type. Likely from `packages/runner/src/bridge/` or from the worker types. If no `GameBridge` type alias exists, use `Comlink.Remote<GameWorkerAPI>` directly, importing `Remote` from `comlink` and `GameWorkerAPI` from the worker module.

### 2. Pass `bridge` from `App.tsx`

In `packages/runner/src/App.tsx`, where `GameContainer` is rendered:

```typescript
<GameContainer
  store={activeRuntime.store}
  bridge={activeRuntime.bridgeHandle.bridge}
  visualConfigProvider={activeRuntime.visualConfigProvider}
  // ... existing props unchanged
/>
```

### 3. Update any test mocks for GameContainer

If `packages/runner/test/ui/GameContainer.test.tsx` or similar tests render `GameContainer` directly, they need to pass a mock `bridge` prop. A minimal mock: `{ describeAction: async () => null } as unknown as GameBridge`.

## Files to Touch

- `packages/runner/src/ui/GameContainer.tsx` (modify — add prop to interface, destructure)
- `packages/runner/src/App.tsx` (modify — pass bridge prop)

## Out of Scope

- Creating a React context for the bridge (not needed — prop drilling is sufficient for one level)
- Using the bridge prop in any component (that's ACTTOOSYS-008)
- Modifying the bridge or worker implementation
- Changing the `useActiveGameRuntime` hook or its return type
- Any engine code

## Acceptance Criteria

### Tests That Must Pass

1. **Type-check**: `pnpm -F @ludoforge/runner typecheck` passes — `bridge` prop is correctly typed and passed.
2. **Existing GameContainer tests**: Any existing tests for `GameContainer` pass after updating props.
3. **App renders without error**: The app compiles and renders the game view without runtime errors.
4. Existing suite: `pnpm -F @ludoforge/runner test` — no regressions.

### Invariants

1. `GameContainer` behavior is unchanged — the `bridge` prop is accepted but not used in this ticket.
2. No new runtime behavior, side effects, or network calls introduced.
3. The bridge prop type matches the actual Comlink Remote type used in the codebase.

## Test Plan

### New/Modified Tests

1. If `packages/runner/test/ui/GameContainer.test.tsx` exists, update mock props to include `bridge`. Otherwise, type-check verification is sufficient.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo build`
