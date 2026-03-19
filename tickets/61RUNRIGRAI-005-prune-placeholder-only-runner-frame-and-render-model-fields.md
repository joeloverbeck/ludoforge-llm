# 61RUNRIGRAI-005: Prune Placeholder-Only Runner-Frame and Render-Model Fields

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner projection cleanup only
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, tickets/61RUNRIGRAI-003-delete-variables-panel-and-variables-visual-config-contract.md, tickets/61RUNRIGRAI-004-delete-scoreboard-and-global-markers-placeholder-widgets.md

## Problem

Spec 61 requires dead placeholder-only projection plumbing to be removed once the associated widgets are gone. The current runner-frame/render-model boundary still carries `globalVars`, `playerVars`, `globalMarkers`, and `tracks`, and some of those may now exist only because deleted widgets used them.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/model/runner-frame.ts`, `render-model.ts`, and `project-render-model.ts` still define and project `globalVars`, `playerVars`, `globalMarkers`, and `tracks`.
2. Non-placeholder consumers still exist for at least some variable data today, including table-overlay and presentation-scene code paths, so this cleanup must be evidence-driven rather than blanket deletion.
3. Corrected scope: this ticket should remove only fields proven to be placeholder-only after Tickets 003 and 004, while preserving any remaining production consumers.

## Note

This ticket is the final architectural cleanup pass for Spec 61. Tickets 003 and 004 remove the placeholder UI surfaces; this ticket must then prove which of these projection fields remain justified:

- `globalVars`
- `playerVars`
- `globalMarkers`
- `tracks`

If a field survives, the ticket should document the real production consumer explicitly. If no such consumer remains, the field should be deleted rather than preserved as speculative API surface.

## Architecture Check

1. A dedicated projection-cleanup pass is safer than deleting model fields opportunistically during UI component removal, because it forces explicit proof of which consumers remain.
2. The work stays within runner projection/presentation boundaries and preserves game-agnostic engine/runtime responsibilities.
3. No dead field should survive "for later," but no live field should be removed just because its original widget disappeared.

## What to Change

### 1. Audit projection consumers

Trace all remaining uses of:

- `globalVars`
- `playerVars`
- `globalMarkers`
- `tracks`

Classify each as surviving production consumer vs placeholder-only residue.

### 2. Remove dead model fields and projection steps

Delete any runner-frame/render-model fields and `project-render-model` mapping logic that are proven to exist only for removed placeholder widgets. Update helper fixtures and model test data accordingly.

### 3. Tighten projection-boundary tests

Update model tests so they assert only the surviving runner-frame/render-model contract. If a field remains because it still powers a production surface, make that explicit in the tests instead of carrying broad placeholder-oriented fixtures.

## File List

- `packages/runner/src/model/runner-frame.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/project-render-model.ts` (modify)
- `packages/runner/test/model/runner-frame-projection-boundary.test.ts` (modify)
- `packages/runner/test/model/render-model-types.test.ts` (modify)
- `packages/runner/test/model/project-render-model-state.test.ts` (modify)
- `packages/runner/test/model/project-render-model-structural-sharing.test.ts` (modify as needed)
- `packages/runner/test/model/runner-frame-structural-sharing.test.ts` (modify as needed)
- `packages/runner/test/ui/helpers/render-model-fixture.ts` (modify as needed)

## Out of Scope

- deleting variable data still used by `packages/runner/src/presentation/presentation-scene.ts` or table overlays
- changing store serialization, engine game state, or worker contracts
- reintroducing replacement widgets for deleted placeholder fields
- modifying event-log dock layout

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/model/runner-frame-projection-boundary.test.ts` and `packages/runner/test/model/render-model-types.test.ts` prove the public runner-frame/render-model contracts no longer include fields that are dead after widget removal.
2. `packages/runner/test/model/project-render-model-state.test.ts` proves any remaining variable/marker/track fields still map only because an active production consumer requires them.
3. Existing suite: `pnpm -F @ludoforge/runner test -- project-render-model`
4. Existing suite: `pnpm -F @ludoforge/runner test -- runner-frame`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `RunnerFrame` and `RenderModel` contain no fields that exist solely for removed placeholder widgets.
2. Any surviving variable/marker/track projection remains justified by an active non-placeholder production surface.
3. The cleanup does not alter engine `GameDef`, simulation, compiler, or kernel contracts.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/runner-frame-projection-boundary.test.ts` — projection boundary after placeholder-field pruning.
2. `packages/runner/test/model/render-model-types.test.ts` — public render-model surface after cleanup.
3. `packages/runner/test/model/project-render-model-state.test.ts` — surviving projection behavior and explicit justification.
4. `packages/runner/test/ui/helpers/render-model-fixture.ts` — test fixture alignment with the reduced model shape.

### Commands

1. `pnpm -F @ludoforge/runner test -- project-render-model`
2. `pnpm -F @ludoforge/runner test -- runner-frame`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
