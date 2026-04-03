# 65INTINTDOM-005: Runner zone and ID migration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `tickets/65INTINTDOM-004.md`

## Problem

The runner directly imports engine branded types (`ZoneId`, `ActionId`, `SeatId`) in 10 files with 45 occurrences. After `ZoneId` changes from `Brand<string>` to `Brand<number>`, all runner code that operates on ZoneId values must be updated. The runner uses ZoneId for canvas rendering, layout computation, animation, and visual config validation.

## Assumption Reassessment (2026-04-03)

1. Runner files importing engine branded types (confirmed via grep):
   - `canvas/renderers/zone-renderer.ts` (13 occurrences)
   - `layout/compute-layout.ts` (11 occurrences)
   - `layout/layout-cache.ts` (3 occurrences)
   - `layout/layout-helpers.ts` (3 occurrences)
   - `animation/animation-controller.ts` (4 occurrences)
   - `animation/animation-types.ts` (1 occurrence)
   - `animation/trace-to-descriptors.ts` (1 occurrence)
   - `animation/timeline-builder.ts` (3 occurrences)
   - `canvas/renderers/adjacency-renderer.ts` (4 occurrences)
   - `config/validate-visual-config-refs.ts` (2 occurrences)
2. The runner consumes both direct engine types (ZoneId in render model) AND serialized traces (string zone names in trace events). The render model uses integer ZoneIds; trace deserialization may need intern calls.
3. Visual config (`visual-config.yaml`) uses string zone names — the runner must intern these when looking up zone-specific visual properties.

## Architecture Check

1. The runner importing engine branded types is architecturally correct — it shares the type system with the engine. Changing the type from string to number propagates cleanly.
2. Visual config stays in string zone names (Foundation 3: Visual Separation). The runner interns visual config zone references at config load time, not at render time.
3. No game-specific logic — the runner treats all ZoneIds generically. Foundation 1 preserved.

## What to Change

### 1. Fix compilation errors in runner zone-renderer and adjacency-renderer

These files use ZoneId extensively for canvas rendering. Fix string-based operations (template literals for labels, Map key usage) to work with integer ZoneIds. Zone labels for display use extern function.

### 2. Fix compilation errors in layout modules

`compute-layout.ts`, `layout-cache.ts`, `layout-helpers.ts` use ZoneId for layout graph operations. Fix Map/Set operations and zone ID comparisons.

### 3. Fix compilation errors in animation modules

`animation-controller.ts`, `animation-types.ts`, `trace-to-descriptors.ts`, `timeline-builder.ts` use ZoneId for animation targeting. Fix zone references.

### 4. Update visual config zone reference resolution

`validate-visual-config-refs.ts` validates that visual config zone references exist in the game. Zone references in visual config remain strings — the validator must intern them before comparison.

### 5. Update runner tests

Fix all runner test files that construct or compare ZoneId values. Runner uses Vitest, not node --test.

## Files to Touch

- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `packages/runner/src/layout/compute-layout.ts` (modify)
- `packages/runner/src/layout/layout-cache.ts` (modify)
- `packages/runner/src/layout/layout-helpers.ts` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/src/animation/animation-types.ts` (modify)
- `packages/runner/src/animation/trace-to-descriptors.ts` (modify)
- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- Runner test files referencing ZoneId (modify)

## Out of Scope

- Engine kernel changes (tickets 001-004)
- ActionId/PhaseId/SeatId runner migration (ticket 007 covers engine; runner follows)
- Visual config format changes — visual config YAML stays string-based (Foundation 3)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner typecheck` passes with zero errors
2. Runner renders zones correctly with integer ZoneIds
3. Visual config validation works with string zone names interned to integer IDs
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Visual config YAML continues to use string zone names (Foundation 3: Visual Separation)
2. Zone labels displayed to users show human-readable names (via extern function)
3. All runner ZoneId operations use integer comparisons, not string

## Test Plan

### New/Modified Tests

1. `packages/runner/test/` — update all tests constructing ZoneId from string to use integer + intern table
2. `packages/runner/test/config/validate-visual-config-refs.test.ts` — verify string zone names in visual config are correctly interned

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo test`
