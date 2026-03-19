# Spec 60 — Runner Hover Tooltip Lifecycle

## Status

Proposed

## Summary

The runner currently allows action tooltips to outlive the action-button hover session that created them. When a human executes an action and the runner re-derives the action surface, the old hovered button can disappear while the tooltip state remains populated. `ActionTooltip` still renders, but its anchor element is no longer a valid live reference, so Floating UI falls back to unresolved coordinates and the tooltip appears at the upper-left corner of the screen.

This is a runner UI lifecycle bug, not a Fire in the Lake rules bug. The fix must live in `packages/runner` and must not introduce game-specific behavior into `GameSpecDoc`, `visual-config.yaml`, `GameDef`, simulation, or kernel/runtime logic.

## Root Cause

### Observed Behavior

- Hovering an action button correctly shows the tooltip over the button.
- After the action is executed and confirmed, a tooltip can reappear pinned near the top-left corner.
- The pinned tooltip persists until additional pointer activity eventually dismisses it.

### Concrete Failure Mode

The current action-tooltip flow is:

1. `ActionToolbar` emits `onPointerEnter` with an `HTMLElement`.
2. `useActionTooltip()` stores that raw `HTMLElement` plus fetched description state.
3. `GameContainer` renders `ActionTooltip` whenever:
   - bottom bar kind is still `'actions'`
   - tooltip description is non-null
   - anchor element is non-null
4. `ActionTooltip` calls `useFloating()` and falls back to `left: 0`, `top: 0` when `x` or `y` is unresolved.

This creates two architectural problems:

- Tooltip visibility is not tied to the lifetime of the hovered source element.
- Tooltip positioning is allowed to render with unresolved coordinates.

The result is a stale tooltip session rendering against a dead anchor.

## Architectural Diagnosis

### Problem 1: Tooltip State Is Owned Independently From Surface State

`useActionTooltip()` is a component-local state machine with debounce/grace timers, but it has no concept of:

- action-surface revision
- source element invalidation
- render-model transition
- move-confirm lifecycle

So the tooltip can survive a state transition that destroys the control which originated it.

### Problem 2: Raw DOM Elements Are Treated As Durable Identity

The hook stores `anchorElement: HTMLElement` as if it were a stable reference. It is not. Action buttons are ephemeral render artifacts. After action confirmation, the toolbar can be rebuilt and the stored element may be detached or semantically stale.

### Problem 3: Tooltip Components Render Before Anchor Validity Is Established

`ActionTooltip` and `EventCardTooltip` render with:

- `left: x ?? 0`
- `top: y ?? 0`

This means invalid anchor state degrades into visible UI at `(0, 0)` instead of a safe no-render state.

### Problem 4: Hover Controllers Are Duplicated And Inconsistent

Canvas hover already has a dedicated controller with deterministic precedence semantics. Action and card tooltips instead use duplicated hook-local timer/state logic. The runner lacks one coherent model for transient hover-owned floating UI.

## Goals

- Eliminate stale action tooltips after action execution, confirmation, cancellation, undo, turn change, and action-surface refresh.
- Make tooltip lifetime explicitly dependent on a live hover source.
- Prevent any tooltip from rendering at fallback origin coordinates when anchor resolution is invalid or incomplete.
- Establish one reusable runner pattern for hover-owned floating UI.
- Keep the solution entirely inside runner presentation/state architecture.

## Non-Goals

- No FITL-specific conditions or special cases.
- No GameSpecDoc changes.
- No `visual-config.yaml` changes for this bug.
- No `GameDef`, kernel, simulation, or legal-move behavior changes.
- No backward-compatibility layer for the current tooltip API if a cleaner runner contract replaces it.

## Proposed Architecture

### 1. Introduce A Generic Hover Popover Session Model

Replace ad hoc tooltip state with a reusable runner primitive, conceptually:

```ts
interface HoverPopoverSession<TContent, TSourceKey> {
  readonly status: 'idle' | 'pending' | 'visible';
  readonly sourceKey: TSourceKey | null;
  readonly anchor: HoverAnchorSnapshot | null;
  readonly content: TContent | null;
  readonly interactionOwner: 'source' | 'popover' | 'grace' | null;
  readonly revision: number;
}

interface HoverAnchorSnapshot {
  readonly kind: 'element' | 'virtual';
  readonly element: HTMLElement | null;
  readonly rect: DOMRectReadOnly | null;
}
```

Responsibilities:

- track the current hovered source identity
- debounce content loading
- manage grace period between source and popover
- invalidate the session on source or surface change
- expose explicit `dismiss()` and `invalidate()` operations

This should be implemented as a generic hook or controller used by action and card tooltips, rather than leaving each tooltip family to invent its own lifecycle.

### 2. Define Tooltip Identity By Source Key, Not By DOM Node

For action tooltips, identity must be based on the action surface:

```ts
type ActionTooltipSourceKey = {
  readonly playerId: number | null;
  readonly groupKey: string;
  readonly actionId: string;
  readonly surfaceRevision: number;
};
```

`surfaceRevision` must change whenever the rendered action surface meaningfully changes. At minimum it should derive from current action groups and active player. If the revision changes, any active action-tooltip session is invalid and must be dismissed immediately.

The DOM element remains only a positioning aid, never the source of truth.

### 3. Add Explicit Surface Invalidation In `GameContainer`

`GameContainer` already derives bottom-bar state from the current render model. It should also derive an `actionSurfaceRevision` and pass it into the hover-popover controller.

When any of the following occurs, the action-tooltip session must be invalidated synchronously:

- `renderModel.activePlayerID` changes
- action groups change
- bottom bar leaves `'actions'`
- a move is confirmed
- a move is cancelled
- undo changes the action surface

This ensures tooltip lifecycle follows UI lifecycle, not just pointer events.

### 4. Make Tooltip Rendering Conditional On Anchor Validity

`ActionTooltip` and `EventCardTooltip` should become pure presentational components over a resolved anchor contract:

- no raw `HTMLElement` assumptions inside the component
- no rendering when anchor resolution is invalid
- no `x ?? 0` / `y ?? 0` fallback rendering

Preferred contract:

```ts
interface ResolvedFloatingAnchor {
  readonly reference: HTMLElement | VirtualElement;
}
```

If anchor resolution fails, the tooltip host renders nothing.

### 5. Centralize Floating Position Policy

Introduce a shared runner utility for anchored floating UI:

- validates reference liveness before render
- optionally uses `autoUpdate`
- returns `isPositioned`
- suppresses render until coordinates are ready

This should be shared by:

- action tooltips
- event-card tooltips
- future hover popovers

The positioning layer should never translate invalid geometry into visible origin placement.

### 6. Treat Pointer-Grace As Transitional, Not Authoritative

The grace period is useful only for moving pointer focus from source to tooltip. It must not keep a session alive after source invalidation. Once the source key or surface revision becomes stale, grace ownership is void and the session is dismissed.

Priority order:

1. surface invalidation
2. source invalidation
3. pointer ownership
4. debounce/grace timers

This ordering prevents stale pinned popovers.

## Concrete Refactor Plan

### Runner State / Hooks

- Replace `useActionTooltip()` with a generic hover-popover controller or refactor it on top of one.
- Refactor `useCardTooltip()` to use the same controller.
- Expose an explicit `invalidate()` API in addition to hover enter/leave callbacks.

### `ActionToolbar`

- Emit structured source metadata, not only `(actionId, element)`.
- Source metadata must include enough information to reconstruct action identity across renders.

### `GameContainer`

- Derive `actionSurfaceRevision`.
- Invalidate action tooltip on any action-surface transition.
- Own the coupling between render-model transitions and tooltip-session invalidation.

### Tooltip Components

- Replace `anchorElement: HTMLElement` prop with resolved anchor/reference contract.
- Do not render when positioning data is not ready.
- Move shared floating-position setup into a utility/hook instead of duplicating `useFloating()` glue.

## Testing Requirements

### Unit Tests

Add tests for the new hover-popover controller:

- dismisses when source revision changes
- dismisses when source key changes before response resolves
- ignores stale async description responses
- does not remain visible after explicit invalidation
- grace period does not override invalidation

### `GameContainer` Tests

Add tests that verify action tooltip invalidation on:

- transition from one action surface to another while staying in `'actions'`
- confirm move
- cancel move
- undo
- active-player change
- transition out of `'actions'`

### Tooltip Rendering Tests

Add tests ensuring:

- tooltip does not render when anchor is detached
- tooltip does not render when coordinates are unresolved
- tooltip never falls back to visible `(0, 0)` placement

### Regression Scenario

Add a runner integration test matching the real bug:

1. hover action button
2. tooltip appears
3. execute and confirm action
4. action surface refreshes
5. tooltip is absent unless a new live hover begins

## Acceptance Criteria

1. Executing or confirming an action cannot leave a stale action tooltip visible anywhere on screen.
2. Tooltip visibility is always tied to a live source session.
3. Detached or invalid anchors never render at `(0, 0)`.
4. Action and event-card hover tooltips share the same lifecycle architecture.
5. No FITL-specific logic is added anywhere in runner, engine, or data.
6. No changes are required to `GameSpecDoc`, `visual-config.yaml`, or `GameDef`.

## Implementation Notes

- This issue should be treated as a transient UI ownership problem, not a tooltip-content problem.
- The correct abstraction boundary is runner hover/floating UI infrastructure.
- The engine remains fully game-agnostic.
- `visual-config.yaml` remains reserved for intentional game-specific presentation data, not bug workarounds for generic tooltip lifecycle.
