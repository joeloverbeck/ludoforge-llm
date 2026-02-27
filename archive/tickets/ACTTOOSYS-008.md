# ACTTOOSYS-008: ActionToolbar + GameContainer Integration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ACTTOOSYS-005, ACTTOOSYS-006, ACTTOOSYS-007

## Problem

All the tooltip pieces exist (types, engine renderer, worker API, bridge prop, hook, component) but they are not wired together. The `ActionToolbar` buttons need `onPointerEnter`/`onPointerLeave` handlers, `GameContainer` needs to instantiate the `useActionTooltip` hook and render the `ActionTooltip` component, and the toolbar needs to propagate hover events up to the container.

## Assumption Reassessment (2026-02-27)

1. `ActionToolbarProps` currently has only `readonly store: StoreApi<GameStore>`. Confirmed from `ActionToolbar.tsx:8-10`.
2. Buttons are rendered in a map over `renderModel.actionGroups[].actions[]`. Each button has `key`, `disabled`, `onClick`, `data-testid`. No pointer event handlers. Confirmed.
3. `GameContainer` renders `<ActionToolbar store={store} />` inside the `bottomBarState.kind === 'actions'` branch. Confirmed.
4. `GameContainer` already renders a floating content section with `WarningsToast`, `PlayerHandPanel`, and `TooltipLayer`. The `ActionTooltip` can be added alongside these. Confirmed.
5. `GameContainer` received `bridge` prop in ACTTOOSYS-005. Confirmed (prerequisite).
6. `useActionTooltip(bridge)` returns `{ tooltipState, onActionHoverStart, onActionHoverEnd }` (ACTTOOSYS-006). Confirmed.
7. `ActionTooltip` takes `{ description, anchorElement }` (ACTTOOSYS-007). Confirmed.

## Architecture Check

1. Minimal changes to existing components — `ActionToolbar` gets two optional callback props, `GameContainer` gets hook + conditional render. No restructuring.
2. The tooltip renders in the same layer as other floating content (warnings, tooltips) — natural z-ordering.
3. Optional callbacks (`onActionHoverStart?`, `onActionHoverEnd?`) ensure `ActionToolbar` remains usable without tooltip support (backwards compatible).

## What to Change

### 1. Extend `ActionToolbarProps`

In `packages/runner/src/ui/ActionToolbar.tsx`:

```typescript
interface ActionToolbarProps {
  readonly store: StoreApi<GameStore>;
  readonly onActionHoverStart?: (actionId: string, element: HTMLElement) => void;
  readonly onActionHoverEnd?: () => void;
}
```

### 2. Add pointer event handlers to buttons

In `ActionToolbar.tsx`, on each action button:

```typescript
onPointerEnter={(e) => onActionHoverStart?.(action.actionId, e.currentTarget)}
onPointerLeave={() => onActionHoverEnd?.()}
```

Destructure `onActionHoverStart` and `onActionHoverEnd` from props.

### 3. Wire hook and component in `GameContainer`

In `packages/runner/src/ui/GameContainer.tsx`:

**Import:**
```typescript
import { useActionTooltip } from './useActionTooltip.js';
import { ActionTooltip } from './ActionTooltip.js';
```

**Hook instantiation** (inside component body):
```typescript
const { tooltipState, onActionHoverStart, onActionHoverEnd } = useActionTooltip(bridge);
```

**Pass callbacks to ActionToolbar** (in the `bottomBarState.kind === 'actions'` branch):
```typescript
<ActionToolbar
  store={store}
  onActionHoverStart={onActionHoverStart}
  onActionHoverEnd={onActionHoverEnd}
/>
```

**Conditional tooltip render** (in the floating content section, alongside existing TooltipLayer):
```typescript
{tooltipState.description && tooltipState.anchorElement && (
  <ActionTooltip
    description={tooltipState.description}
    anchorElement={tooltipState.anchorElement}
  />
)}
```

## Files to Touch

- `packages/runner/src/ui/ActionToolbar.tsx` (modify — add props, add pointer handlers)
- `packages/runner/src/ui/GameContainer.tsx` (modify — import hook + component, wire them)

## Out of Scope

- Engine changes of any kind
- Modifying the `useActionTooltip` hook or `ActionTooltip` component (created in prior tickets)
- Adding ARIA attributes to the tooltip association (can be a follow-up accessibility ticket)
- Animation/transition for tooltip show/hide
- Keyboard-triggered tooltip display
- Touch/long-press tooltip display

## Acceptance Criteria

### Tests That Must Pass

1. **Pointer events fire callbacks**: Simulating `pointerenter` on an action button calls `onActionHoverStart` with the correct `actionId` and button element. Simulating `pointerleave` calls `onActionHoverEnd`.
2. **Optional callbacks**: `ActionToolbar` renders without errors when `onActionHoverStart` and `onActionHoverEnd` are not provided (undefined).
3. **Tooltip renders on hover**: In a `GameContainer` integration test, simulating hover on an action button and advancing timers causes `ActionTooltip` to appear in the DOM.
4. **Tooltip disappears on leave**: Simulating `pointerleave` causes the tooltip to be removed from the DOM.
5. **No tooltip when loading**: While `describeAction` is pending, no tooltip content is rendered (only after response).
6. Existing suite: `pnpm -F @ludoforge/runner test` — no regressions.
7. Type-check: `pnpm -F @ludoforge/runner typecheck` — passes.

### Invariants

1. `ActionToolbar` remains functional without tooltip callbacks — existing tests must pass with props unchanged.
2. The tooltip does not interfere with button click behavior (`pointer-events: none` on tooltip, ensured by ACTTOOSYS-007).
3. No new global state or context providers introduced.
4. Rapid hover across multiple buttons does not cause stale tooltips (ensured by hook's stale-response guard in ACTTOOSYS-006).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionToolbar.test.tsx` (modify or create) — test pointer event callback props.
2. `packages/runner/test/ui/GameContainer.test.tsx` (modify if exists) — integration test: hover triggers tooltip render.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo build`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - `ActionToolbar.tsx`: Added optional `onActionHoverStart`/`onActionHoverEnd` callback props; wired `onPointerEnter`/`onPointerLeave` on each action button
  - `GameContainer.tsx`: Added `bridge` to destructuring (was declared but omitted), imported and called `useActionTooltip(bridge)`, passed callbacks to `<ActionToolbar>`, conditionally renders `<ActionTooltip>` in floating content section
  - `ActionToolbar.test.ts`: +4 tests for pointer event prop wiring and backwards compatibility
  - `GameContainer.test.ts`: Updated ActionToolbar mock to capture props, added `useActionTooltip`/`ActionTooltip` mocks, +3 integration tests for callback passing and conditional tooltip rendering
- **Deviations from original plan**:
  - Test files remained `.test.ts` (not `.test.tsx` as ticket suggested) — consistent with existing codebase convention
  - `bridge` destructuring fix was folded into this ticket (not called out as a separate fix)
- **Verification results**: 1341 tests pass, typecheck clean, build clean
