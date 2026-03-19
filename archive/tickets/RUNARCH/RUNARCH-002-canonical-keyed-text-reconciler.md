# RUNARCH-002: Introduce a Canonical Keyed Text Reconciler for Runner Scene Text

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-002-retained-text-runtime.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-003-frame-commit-and-disposal-lifecycle.md

## Problem

The runner already has a canonical immutable `PresentationScene` build step in `canvas-updater.ts`, but it still delegates steady-state Pixi text lifecycle to individual renderers.

Today, `table-overlay-renderer.ts` and `card-template-renderer.ts` still rely on index-based text slot pooling, while other scene-driven renderers such as `region-boundary-renderer.ts` directly create and retire raw Pixi `Text` nodes. That means keyed scene identity is not the owner of text instance identity, and renderer-local detach/reacquire semantics remain in the hot path.

That architectural split is the real source of the recurring text lifecycle fragility. The missing piece is not a second scene layer; it is one canonical keyed text reconciler/runtime for steady-state scene text.

## Assumption Reassessment (2026-03-19)

1. Corrected: `packages/runner/src/canvas/canvas-updater.ts` already acts as the top-level frame application coordinator and already builds immutable `PresentationScene` data before delegating to renderers.
2. Confirmed: `packages/runner/src/canvas/text/text-runtime.ts` still exposes `createTextSlotPool()` with detach/reacquire behavior, so the current text layer still centralizes construction more than ownership.
3. Confirmed: `table-overlay-renderer.ts` and `card-template-renderer.ts` still rely on pooled `Text` slots indexed by render order rather than semantic scene keys.
4. Confirmed: `region-boundary-renderer.ts` still owns text creation and retirement directly for steady-state scene labels.
5. Corrected scope: this ticket should not add a second generic scene reconciler beside `PresentationScene` + `canvas-updater`; it should add a canonical keyed text reconciler/runtime and migrate the scene-driven text surfaces that currently bypass it.
6. Explicit non-goal for this ticket: ephemeral animation text such as `action-announcement-renderer.ts`, and per-container one-off labels that are created once and retained entirely inside a single owning visual, can be left for follow-up tickets if they do not use detach/reacquire pooling semantics.

## Architecture Check

1. Adding a second full scene reconciler on top of the existing `PresentationScene` pipeline would duplicate responsibilities that the runner already has, widen the API surface, and make long-term maintenance worse rather than better.
2. A canonical keyed text reconciler is a cleaner fit: it makes scene identity, not renderer-local slot position, the owner of text instance identity.
3. The reconciler should be generic runner infrastructure. It must not encode overlay-, region-, or card-specific behavior; those renderers should supply immutable keyed text specs only.
4. No compatibility alias should preserve slot-pool detach/reacquire semantics for the migrated surfaces. The old slot-pool path should be removed, not retained behind wrappers.

## What to Change

### 1. Replace slot pooling with a keyed text reconciler/runtime

Add a canonical runner text reconciler that:

- consumes immutable keyed text specs
- creates one Pixi `Text` per semantic key
- updates retained nodes in place when safe
- replaces the node when an explicit backend/instance identity changes
- retires removed keys through one canonical path

### 2. Route steady-state scene text through the canonical runtime

Migrate the scene-driven text surfaces that currently bypass canonical ownership:

- table overlays
- card template fields
- region labels

Those renderers may still own their non-text graphics/containers, but they should stop owning text slot pooling or renderer-local text retirement policy.

### 3. Preserve the current top-level scene architecture

Do not introduce a second full scene graph or another top-level frame reconciler. `canvas-updater.ts` should remain the place that builds and applies the immutable `PresentationScene`; this ticket improves text lifecycle ownership underneath that existing architecture.

## Files to Touch

- `packages/runner/src/canvas/text/*`
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`
- `packages/runner/src/canvas/renderers/card-template-renderer.ts`
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`
- `packages/runner/src/presentation/presentation-scene.ts` if stable keyed overlay identity needs to be made explicit
- `packages/runner/test/canvas/text/*`
- `packages/runner/test/canvas/renderers/*`

## Out of Scope

- adding a second scene reconciler beside the current `PresentationScene` pipeline
- changing game rules, `GameDef`, or engine/runtime schemas
- FITL-specific rendering workarounds
- browser stress verification by itself; that belongs to the dedicated regression-harness ticket
- migrating ephemeral announcement text or every single direct `Text` allocation in the runner in one sweep

## Acceptance Criteria

### Tests That Must Pass

1. Migrated scene-driven text surfaces no longer use detach/reacquire text slot pooling.
2. Canonical text-runtime tests prove keyed text creation, update, optional replacement, and retirement are owned by the runtime rather than by renderer-local slot indexes.
3. `table-overlay-renderer.ts`, `card-template-renderer.ts`, and `region-boundary-renderer.ts` route steady-state text lifecycle through the canonical runtime.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. For migrated scene text, semantic key owns `Text` instance identity.
2. Removed text nodes retire through exactly one runtime-controlled path.
3. Renderer-local detach/reacquire pooling is not retained as a compatibility path.
4. The runner continues to use the existing `PresentationScene` build/apply architecture rather than introducing a second scene abstraction.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/*` — prove keyed creation, in-place update, explicit replacement, and retirement in the canonical text runtime.
2. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — prove overlay text instances are keyed/reused by semantic identity, not by slot index.
3. `packages/runner/test/canvas/renderers/card-template-renderer.test.ts` — prove card field text is retained/reconciled by field key and removed deterministically when fields disappear.
4. `packages/runner/test/canvas/renderers/region-boundary-renderer.test.ts` — prove region label lifecycle follows keyed reconciliation rather than renderer-local destroy/recreate churn.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - added a canonical keyed text reconciler in `packages/runner/src/canvas/text/text-runtime.ts`
  - removed slot-pool-based text ownership from `table-overlay-renderer.ts` and `card-template-renderer.ts`
  - moved `region-boundary-renderer.ts` label lifecycle onto the canonical text reconciler while leaving graphics ownership local to that renderer
  - added explicit stable overlay keys in `presentation-scene.ts`
  - updated runner tests to cover keyed creation, update, replacement, retirement, and semantic-key retention behavior
- Deviations from original plan:
  - did not add a second full scene reconciler because `canvas-updater.ts` + `PresentationScene` already provide the top-level scene application architecture
  - kept ephemeral announcement text and one-off per-container labels out of scope because this ticket targeted the scene-driven text surfaces that were still using pooled/detached lifecycle semantics
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --runInBand`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
