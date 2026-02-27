# ACTTOOSYS-006: useActionTooltip Hook

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ACTTOOSYS-004, ACTTOOSYS-005

## Problem

The tooltip UI needs a React hook that manages the complete hover lifecycle: tracking which action button is hovered, debouncing the hover delay (200ms), calling the worker's `describeAction`, handling stale responses (user moved away before response arrived), and exposing clean state for the tooltip renderer. Without this hook, the tooltip logic would be scattered across multiple components.

## Assumption Reassessment (2026-02-27)

1. The bridge type (`GameBridge` or `Comlink.Remote<GameWorkerAPI>`) exposes `describeAction(actionId: string): Promise<AnnotatedActionDescription | null>` after ACTTOOSYS-004. Confirmed.
2. `AnnotatedActionDescription` is imported from `@ludoforge/engine/runtime`. Confirmed.
3. The runner uses React 19 with standard hooks (`useState`, `useRef`, `useCallback`). Confirmed.
4. Existing tooltip infrastructure in `TooltipLayer.tsx` uses a separate mechanism (store-based hover target from canvas). The action tooltip is independent — different data source, different anchor mechanism. Confirmed.
5. `@floating-ui/react-dom` is already a runner dependency (used by `TooltipLayer`). Confirmed.

## Architecture Check

1. Single-responsibility: the hook manages data fetching lifecycle; the component (ACTTOOSYS-007) handles rendering. Clean separation.
2. The hook is framework-agnostic in its logic (debounce + fetch + stale detection) — only the React state management is React-specific.
3. No game-specific logic — works with any `actionId` string.

## What to Change

### 1. Create `packages/runner/src/ui/useActionTooltip.ts`

Export:

```typescript
interface ActionTooltipState {
  readonly actionId: string | null;
  readonly description: AnnotatedActionDescription | null;
  readonly loading: boolean;
  readonly anchorElement: HTMLElement | null;
}

function useActionTooltip(bridge: GameBridge): {
  tooltipState: ActionTooltipState;
  onActionHoverStart: (actionId: string, element: HTMLElement) => void;
  onActionHoverEnd: () => void;
}
```

**Implementation details:**

1. **State**: `actionId`, `description`, `loading`, `anchorElement` — all in a single `useState` or `useReducer`.

2. **`onActionHoverStart(actionId, element)`**:
   - Store `actionId` and `anchorElement` immediately (so UI can show loading indicator at the right position).
   - Clear any pending debounce timer (via `useRef` for timer ID).
   - Start a new 200ms `setTimeout`.
   - After timeout: set `loading: true`, call `bridge.describeAction(actionId)`.
   - On response: check that `actionId` still matches current state (stale guard via request counter `useRef`). If matches, set `description` and `loading: false`. If stale, discard.

3. **`onActionHoverEnd()`**:
   - Clear the debounce timer.
   - Increment the request counter (to invalidate any in-flight request).
   - Reset all state to `null`/`false`.

4. **Cleanup**: `useEffect` cleanup cancels any pending timer on unmount.

5. **Stale response guard**: Use an incrementing counter ref. Each `onActionHoverStart` bumps the counter. The response handler compares its captured counter value to the current ref — if they differ, the response is stale and discarded.

## Files to Touch

- `packages/runner/src/ui/useActionTooltip.ts` (new)

## Out of Scope

- ActionTooltip rendering component (ACTTOOSYS-007)
- ActionToolbar integration / wiring (ACTTOOSYS-008)
- Keyboard-triggered tooltips (hover only for this spec)
- Caching or memoizing `describeAction` responses (can be added later if needed)
- Touch/mobile interactions (pointer events only)
- Any engine code

## Acceptance Criteria

### Tests That Must Pass

1. **Debounce**: Calling `onActionHoverStart` and then `onActionHoverEnd` before 200ms elapses does not trigger a `bridge.describeAction` call.
2. **Fetch after debounce**: Calling `onActionHoverStart` and waiting 200ms triggers exactly one `bridge.describeAction` call with the correct `actionId`.
3. **Stale response discard**: Calling `onActionHoverStart('A', el)`, waiting for fetch, then calling `onActionHoverStart('B', el2)` before 'A' response arrives — when 'A' response arrives, it is discarded and `description` remains `null` until 'B' response arrives.
4. **Hover end clears state**: After `onActionHoverEnd`, `tooltipState` has `actionId: null`, `description: null`, `loading: false`, `anchorElement: null`.
5. **Loading state**: Between debounce expiry and response arrival, `loading` is `true`.
6. **Null response**: If `bridge.describeAction` returns `null`, `description` is `null` and `loading` is `false`.
7. Existing suite: `pnpm -F @ludoforge/runner test` — no regressions.

### Invariants

1. At most one `describeAction` call is in flight at any time (previous calls are invalidated, not cancelled — but their responses are discarded).
2. No memory leaks: timers are cleared on unmount and on state transitions.
3. `anchorElement` is always an `HTMLElement` reference (from `e.currentTarget`) or `null` — never a stale/detached DOM node (cleared on hover end).
4. The hook does not manage DOM positioning — that's the component's job.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useActionTooltip.test.ts` — test the hook using `@testing-library/react` `renderHook`. Mock the bridge with a jest/vitest mock. Use fake timers for debounce testing.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
