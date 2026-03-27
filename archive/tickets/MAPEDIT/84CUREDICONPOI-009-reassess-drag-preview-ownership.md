# 84CUREDICONPOI-009: Reassess Drag Preview Visual Ownership

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`, `archive/tickets/MAPEDIT/84CUREDICONPOI-005-live-tangent-line-updates.md`, `archive/tickets/84CUREDICONPOI-007-angle-indicator-during-anchor-drag.md`

## Problem

This ticket originally assumed the map editor still needed a broader refactor to introduce a single new drag-preview visual owner. The current codebase no longer matches that assumption. Before any runner code changes, the ticket itself needs to reflect the real architecture and only ask for work that still adds value.

## Assumption Reassessment (2026-03-26)

1. The broader drag-preview path already exists in the current runner architecture.
   - `map-editor-route-renderer.ts` already redraws selected-route curve geometry from previewed `connectionRoutes`.
   - `map-editor-handle-renderer.ts` already owns tangent-line sync during drag and the transient angle label overlay.
   - `map-editor-drag.ts` already limits store-local drag metadata to the zone-edge anchor case where the renderer needs extra overlay data.
2. The ticket's proposed refactor is no longer a missing feature.
   - `84CUREDICONPOI-005` already addressed tangent synchronization.
   - `84CUREDICONPOI-007` already introduced the angle-indicator path without creating a parallel label lifecycle in the drag handler.
3. The remaining imperative handle mutation in `map-editor-drag.ts` is intentional and still architecturally sound.
   - The dragged Pixi handle display object moves immediately under the pointer for responsiveness.
   - Persisted/previewed route geometry still remains store-backed.
   - This is a narrow UI-session concern, not competing ownership of persisted geometry.
4. A new dedicated drag-preview visual owner would now be a net loss.
   - It would centralize responsibilities that are already cleanly split between pointer-session control (`map-editor-drag.ts`), route rendering (`map-editor-route-renderer.ts`), and handle-layer overlays (`map-editor-handle-renderer.ts`).
   - It would likely duplicate existing geometry-resolution work or introduce extra indirection without improving correctness, extensibility, or testability.

## Architecture Decision

Do not implement the original unification refactor.

The cleaner long-term architecture is the current one:

1. `map-editor-drag.ts` owns pointer-session lifecycle and direct movement of the actively dragged handle display object.
2. The store owns previewed document geometry plus the minimal ephemeral `dragPreview` metadata required for overlay-only visuals.
3. `map-editor-route-renderer.ts` owns route redraws from store-backed geometry.
4. `map-editor-handle-renderer.ts` owns transient handle-layer visuals derived from store-backed geometry or store-local drag metadata.

This is already robust, extensible, and aligned with `docs/FOUNDATIONS.md`:

- no engine/compiler/runtime coupling
- no backwards-compatibility aliases
- no duplicate geometry source for persisted route state

## What to Change

Narrow this ticket to validation and regression coverage for the current architecture.

### 1. Lock in the current ownership boundaries with tests

Add or strengthen runner tests proving:

- route geometry redraw remains driven by store-backed route preview state, not by ephemeral drag metadata
- handle-layer overlay behavior can react to `dragPreview` without forcing a broader ownership abstraction
- active dragged handle display objects can stay imperatively positioned during drag without creating route/tangent drift

### 2. Do not introduce a new drag-preview abstraction

Do not add:

- a new visual-owner coordinator layer
- additional generic drag metadata that current visuals do not need
- alternative geometry-resolution paths for control-point or route preview rendering

## Files to Touch

- `tickets/84CUREDICONPOI-009-unify-drag-preview-visual-ownership.md` (update)
- `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` (modify)

## Out of Scope

- Refactoring `map-editor-drag.ts` to remove immediate handle-position updates
- Introducing a new shared drag-preview owner abstraction
- Modifying persisted route/control schemas
- Changing route topology, visual-config export, or engine/compiler/runtime code
- Reworking already-completed Spec 84 deliverables beyond targeted regression coverage

## Acceptance Criteria

### Tests That Must Pass

1. `map-editor-route-renderer.test.ts` proves route redraw does not respond to `dragPreview` changes alone.
2. `map-editor-handle-renderer.test.ts` proves drag-preview overlay updates do not force a full handle rebuild during active drag.
3. Existing selected-route preview behavior remains unchanged.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Store-backed `connectionRoutes` remain the only source of route-preview geometry.
2. `dragPreview` remains minimal ephemeral UI metadata, not a second persisted geometry model.
3. Drag handlers may continue moving the actively dragged handle display object directly as a latency/UX optimization.
4. No new abstraction is introduced unless a future feature exposes a real architectural gap.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` — prove `dragPreview` changes alone do not redraw route geometry.
2. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` — prove zone-edge drag preview updates can change overlay state without replacing the active handle objects.

### Commands

1. `pnpm -F @ludoforge/runner test -- --run packages/runner/test/map-editor/map-editor-handle-renderer.test.ts packages/runner/test/map-editor/map-editor-route-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date:** 2026-03-26
- **What actually changed:** Reassessed the ticket against the live runner architecture, removed the stale refactor scope, and narrowed the work to regression coverage that locks in the current ownership boundaries. Added tests proving `map-editor-route-renderer.ts` ignores `dragPreview` metadata when route geometry is unchanged and `map-editor-handle-renderer.ts` can update zone-edge drag overlays without rebuilding the active handle objects.
- **Deviations from original plan:** Did not introduce a new drag-preview visual owner. The current architecture already cleanly separates pointer-session logic, store-backed route preview geometry, and handle-layer overlays, so the larger refactor would have added indirection without improving robustness or extensibility.
- **Verification results:** `pnpm -F @ludoforge/runner test` passed; `pnpm -F @ludoforge/runner typecheck` passed; `pnpm -F @ludoforge/runner lint` passed.
