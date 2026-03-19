# 60RUNHOVTOOLIF-002: Centralize floating anchor resolution and safe render gating

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`

## Problem

`ActionTooltip` and `EventCardTooltip` each call `useFloating()` directly and render with `left: x ?? 0` / `top: y ?? 0`. If the anchor element is detached or position resolution is incomplete, the tooltip renders visibly at the origin instead of failing closed. The runner needs one shared anchored-floating utility that treats invalid anchor state as "render nothing".

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/ActionTooltip.tsx`, `packages/runner/src/ui/EventCardTooltip.tsx`, and `packages/runner/src/ui/TooltipLayer.tsx` all still call `useFloating()` directly and all still render visible `left: x ?? 0` / `top: y ?? 0` fallback coordinates.
2. The runner no longer needs a new shared hover-session controller here: `packages/runner/src/ui/useHoverPopoverSession.ts` already exists from `60RUNHOVTOOLIF-001` and is already used by `useActionTooltip()` and `useCardTooltip()`.
3. The stale tooltip bug described by Spec 60 still has a broader lifecycle/invalidation dimension in `GameContainer`, but the visible upper-left rendering is a separate presentation bug caused by fail-open coordinate fallback inside tooltip components.
4. Because `TooltipLayer` already resolves a virtual anchor from `anchorRect`, it belongs in the same shared anchored-floating policy. Leaving it on separate glue would preserve duplicated fail-open positioning logic in the runner.

## Architecture Check

1. A shared floating-anchor utility is cleaner than patching individual `x ?? 0` call sites because it establishes one fail-closed positioning policy for all anchored runner popovers.
2. The utility remains a runner presentation concern; it does not alter engine-generated tooltip payloads or any game-specific data flow.
3. The work should replace duplicated `useFloating()` glue in `ActionTooltip`, `EventCardTooltip`, and `TooltipLayer` instead of adding another ad hoc wrapper per tooltip family.
4. This ticket should stay focused on anchor resolution and render gating. It should not reopen the already-completed shared hover-session extraction from `60RUNHOVTOOLIF-001`, and it should not silently expand into `GameContainer` invalidation work.

## What to Change

### 1. Introduce a resolved floating-anchor utility

Add a shared UI utility/hook that:

- accepts an element or virtual reference
- validates reference liveness before render
- integrates `useFloating()`
- exposes whether the anchor is valid and coordinates are resolved
- suppresses render until coordinates are resolved

### 2. Refactor tooltip components onto the shared contract

Update `ActionTooltip`, `EventCardTooltip`, and `TooltipLayer` so that they:

- route all anchored-position setup through the shared helper instead of duplicating `useFloating()` wiring
- render nothing when the anchor/reference is detached or invalid
- render nothing when coordinates are unresolved
- never set `left`/`top` to `0` as a fallback

### 3. Add render-failure regression coverage

Add tests for the shared anchored-tooltip behavior to prove:

- detached DOM anchors do not render
- unresolved coordinates do not render
- `TooltipLayer` still renders when given a valid virtual anchor
- the shared floating helper preserves the middleware/placement behavior expected by current UI tests

## Files to Touch

- `packages/runner/src/ui/useResolvedFloatingAnchor.ts` (new)
- `packages/runner/src/ui/ActionTooltip.tsx` (modify)
- `packages/runner/src/ui/EventCardTooltip.tsx` (modify)
- `packages/runner/src/ui/TooltipLayer.tsx` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify)
- `packages/runner/test/ui/EventCardTooltip.test.ts` (modify)
- `packages/runner/test/ui/TooltipLayer.test.ts` (modify)

## Out of Scope

- action-surface revision invalidation in `GameContainer`
- `ActionToolbar` hover source metadata
- action/card session-controller semantics beyond what is needed to consume the new anchor contract
- any canvas tooltip behavior changes unrelated to helper extraction
- engine, schema, or game-data changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/ActionTooltip.test.ts` explicitly verifies that detached anchors and unresolved coordinates produce no rendered tooltip.
2. `packages/runner/test/ui/EventCardTooltip.test.ts` explicitly verifies that detached anchors and unresolved coordinates produce no rendered tooltip.
3. `packages/runner/test/ui/TooltipLayer.test.ts` explicitly verifies that unresolved coordinates produce no rendered tooltip while valid virtual-anchor rendering still works.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- ActionTooltip EventCardTooltip TooltipLayer`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No runner tooltip component may render visible fallback placement at `(0, 0)` when anchor resolution fails.
2. Placement policy remains generic and shared; it must not encode action-specific or card-specific exceptions.
3. Tooltip content rendering stays unchanged aside from render gating around invalid anchors/coordinates.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.ts` — locks the fail-closed rendering contract for action tooltips.
2. `packages/runner/test/ui/EventCardTooltip.test.ts` — locks the same contract for event-card tooltips.
3. `packages/runner/test/ui/TooltipLayer.test.ts` — confirms the shared helper preserves canvas tooltip behavior for valid virtual anchors while failing closed on unresolved positioning.

### Commands

1. `pnpm -F @ludoforge/runner test -- ActionTooltip EventCardTooltip`
2. `pnpm -F @ludoforge/runner test -- TooltipLayer`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - added `packages/runner/src/ui/useResolvedFloatingAnchor.ts` as the shared anchored-floating resolver for DOM and virtual references
  - rewired `ActionTooltip`, `EventCardTooltip`, and `TooltipLayer` onto that shared resolver
  - removed visible `left: x ?? 0` / `top: y ?? 0` fallback rendering from those runner tooltip components
  - fail-closed rendering now suppresses output for detached DOM anchors and unresolved floating coordinates
  - strengthened tooltip tests to require live DOM anchors for positive cases and to cover detached-anchor / unresolved-coordinate regressions
- Deviations from original plan:
  - kept the work strictly in the presentation/positioning layer because `useHoverPopoverSession` already exists from `60RUNHOVTOOLIF-001`
  - explicitly included `TooltipLayer` in the helper extraction because it duplicated the same fail-open floating glue
  - did not expand into `GameContainer` action-surface invalidation; that remains separate architectural follow-up work from Spec 60
- Verification results:
  - `pnpm -F @ludoforge/runner test -- ActionTooltip EventCardTooltip TooltipLayer`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
