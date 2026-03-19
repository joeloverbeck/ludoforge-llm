# 60RUNHOVTOOLIF-002: Centralize floating anchor resolution and safe render gating

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`

## Problem

`ActionTooltip` and `EventCardTooltip` each call `useFloating()` directly and render with `left: x ?? 0` / `top: y ?? 0`. If the anchor element is detached or position resolution is incomplete, the tooltip renders visibly at the origin instead of failing closed. The runner needs one shared anchored-floating utility that treats invalid anchor state as "render nothing".

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/ActionTooltip.tsx` and `packages/runner/src/ui/EventCardTooltip.tsx` both use the same direct `useFloating()` pattern with visible `(0, 0)` fallback.
2. The runner already has one floating/hover layer for canvas tooltips (`packages/runner/src/ui/TooltipLayer.tsx`), so a shared positioning helper fits the existing architecture.
3. The stale tooltip bug is partly lifecycle-related, but the visible upper-left rendering is specifically caused by presentational fallback behavior inside runner tooltip components.

## Architecture Check

1. A shared floating-anchor utility is cleaner than patching `x ?? 0` call sites individually because it establishes one fail-closed positioning policy for all hover popovers.
2. The utility remains a runner presentation concern; it does not alter engine-generated tooltip payloads or any game-specific data flow.
3. The work should replace duplicated `useFloating()` glue instead of adding another ad hoc wrapper per tooltip family.

## What to Change

### 1. Introduce a resolved floating-anchor utility

Add a shared UI utility/hook that:

- accepts an element or virtual reference
- validates reference liveness before render
- integrates `useFloating()` and optional `autoUpdate`
- exposes `isPositioned`
- suppresses render until coordinates are resolved

### 2. Refactor tooltip components onto the shared contract

Update `ActionTooltip` and `EventCardTooltip` so that they:

- accept a resolved anchor/reference contract instead of assuming a durable raw `HTMLElement`
- render nothing when the anchor is detached or invalid
- render nothing when coordinates are unresolved
- never set `left`/`top` to `0` as a fallback

### 3. Add render-failure regression coverage

Add tests for both tooltip components to prove:

- detached anchors do not render
- unresolved coordinates do not render
- the shared floating helper exposes the middleware/placement behavior still expected by current UI tests

## Files to Touch

- `packages/runner/src/ui/useResolvedFloatingAnchor.ts` (new)
- `packages/runner/src/ui/ActionTooltip.tsx` (modify)
- `packages/runner/src/ui/EventCardTooltip.tsx` (modify)
- `packages/runner/src/ui/TooltipLayer.tsx` (modify, only if extracting shared helper without changing canvas behavior)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify)
- `packages/runner/test/ui/EventCardTooltip.test.ts` (modify)
- `packages/runner/test/ui/TooltipLayer.test.ts` (modify only if helper extraction touches shared behavior)

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
3. If `TooltipLayer` is refactored to use the shared helper, `packages/runner/test/ui/TooltipLayer.test.ts` continues to pass unchanged in behavior.
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
3. `packages/runner/test/ui/TooltipLayer.test.ts` — confirms any shared helper extraction does not regress canvas tooltip positioning semantics.

### Commands

1. `pnpm -F @ludoforge/runner test -- ActionTooltip EventCardTooltip`
2. `pnpm -F @ludoforge/runner test -- TooltipLayer`
3. `pnpm -F @ludoforge/runner test`
