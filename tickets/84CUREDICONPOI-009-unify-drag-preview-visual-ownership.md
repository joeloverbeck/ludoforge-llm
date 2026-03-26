# 84CUREDICONPOI-009: Unify Drag Preview Visual Ownership

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`, `archive/tickets/MAPEDIT/84CUREDICONPOI-005-live-tangent-line-updates.md`

## Problem

Map-editor drag preview visuals are still owned by more than one mechanism:

1. Drag handlers imperatively move handle display objects during pointer movement.
2. The handle renderer derives tangent lines and handle placement from preview geometry in store-driven renders.
3. Future transient drag visuals, such as the angle indicator in `84CUREDICONPOI-007`, would otherwise introduce a third bespoke ownership path.

This split works today, but it is not the cleanest long-term architecture. It increases the chance that one drag artifact updates while another lags or uses a slightly different geometry source. The runner should have one coherent owner for drag-preview visuals so future editing features stay robust and extensible.

## Assumption Reassessment (2026-03-26)

1. `curvature` controls, preview-state route updates, and drag-time curve redraws already exist in the current codebase; the missing issue is architectural consistency, not missing core functionality.
2. `84CUREDICONPOI-005` fixed tangent-line lag by syncing existing tangent Graphics from preview geometry during drag, but it intentionally preserved the current mixed ownership model to keep the fix small and safe.
3. No active ticket currently owns the broader cleanup of drag-preview visual ownership. `84CUREDICONPOI-006` is about a route-preview behavior that appears already satisfied, and `84CUREDICONPOI-007` is a narrower UX add-on.

## Architecture Check

1. The cleaner design is to centralize drag-preview visuals behind one runner-only abstraction that derives all transient route-editing visuals from the same preview inputs, instead of letting drag handlers, handle renderers, and future labels each manage their own geometry updates.
2. This stays fully inside runner/editor presentation code. No game-specific logic moves into engine/compiler/runtime layers, so `GameDef` and simulation remain game-agnostic in line with `docs/FOUNDATIONS.md`.
3. No backwards-compatibility paths or alias APIs should be introduced. The old ad hoc drag-visual ownership should be removed or subsumed as part of the refactor.

## What to Change

### 1. Introduce a dedicated drag-preview visual owner

Create a runner-only abstraction responsible for transient drag visuals for selected route editing. It should own, at minimum:

- control-handle drag preview synchronization
- tangent-line synchronization
- angle-indicator support hooks for zone-edge anchor drag

This owner may live inside `map-editor-handle-renderer.ts` or as a focused helper module, but it must be the single place that redraws drag-time handle-layer visuals.

### 2. Reduce imperative visual mutations in drag handlers

Refactor `map-editor-drag.ts` so drag handlers stop directly acting as the long-term owner of handle-layer visuals where preview geometry can drive them instead. Pointer handlers should primarily:

- manage pointer session lifecycle
- update preview state
- report any minimal transient metadata required for visuals

They should not remain the source of truth for drag-preview geometry if the renderer can derive that geometry from preview state plus session metadata.

### 3. Define the contract needed for future transient visuals

Establish a small, explicit contract for transient drag metadata that is not part of persisted document state, such as:

- active drag kind
- active route/point/segment identity
- current anchor angle, if needed for label display

Keep this contract runner-local and ephemeral. Do not pollute persisted visual config or engine-side schemas with editor-only drag data.

### 4. Prepare `84CUREDICONPOI-007` to build on the shared path

Once the shared drag-preview owner exists, `84CUREDICONPOI-007` should implement its angle label using that path rather than introducing a parallel label lifecycle in the drag handler.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` (modify)
- `packages/runner/src/map-editor/map-editor-drag.ts` (modify)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify only if minimal ephemeral UI-state support is required)
- `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-drag.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` (modify if needed to prove unchanged route-preview behavior)

## Out of Scope

- Changing route topology, control schemas, or export formats
- Modifying game data in `visual-config.yaml`
- Introducing engine/compiler/runtime changes
- Adding new game-specific branching
- Solving unrelated map-editor selection or viewport concerns

## Acceptance Criteria

### Tests That Must Pass

1. Control-point drag updates handle-layer visuals from one shared drag-preview path without display-object drift between handle position and tangent geometry.
2. Zone-edge anchor drag can consume the same shared drag-preview path without introducing a second geometry-resolution flow.
3. Existing route-preview behavior remains unchanged for selected routes during drag.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Persisted document state remains the source of truth for previewable route geometry; ephemeral drag metadata stays runner-local and non-persistent.
2. There is exactly one current architecture for drag-preview visual ownership in the handle layer after the refactor.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — prove control handles and tangent lines stay synchronized through the shared drag-preview owner.
2. `packages/runner/test/map-editor/map-editor-drag.test.ts` — prove drag handlers manage session lifecycle without retaining bespoke geometry ownership.
3. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` or `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — prove existing live route preview behavior is preserved while ownership is consolidated.

### Commands

1. `pnpm -F @ludoforge/runner test -- --run packages/runner/test/map-editor/map-editor-handle-renderer.test.ts packages/runner/test/map-editor/map-editor-drag.test.ts packages/runner/test/map-editor/map-editor-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
