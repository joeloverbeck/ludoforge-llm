# RUNARCH-002: Introduce a Scene Reconciler and Canonical Text Runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNARCH/RUNARCH-001-make-presentation-scene-the-authoritative-canvas-frame.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-002-retained-text-runtime.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-003-frame-commit-and-disposal-lifecycle.md

## Problem

The runner still has multiple local Pixi lifecycle policies hidden behind a shared text helper. Renderers retain, detach, reattach, mutate, and destroy raw Pixi `Text` instances independently.

That is the architectural reason the `TexturePoolClass.returnTexture` crash class keeps returning: the system does not have one canonical owner for text object lifecycle relative to scene reconciliation and frame retirement.

The current `createManagedText()` / `createTextSlotPool()` layer is therefore insufficient. It centralizes construction, but not lifecycle ownership.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/canvas/text/text-runtime.ts` still exposes reusable raw Pixi `Text` instances and slot pooling with detach/reacquire behavior, so the current text layer is not a canonical backend/runtime boundary.
2. Hot-path renderers such as `table-overlay-renderer.ts`, `card-template-renderer.ts`, and `region-boundary-renderer.ts` still own direct `Text` lifecycle choices and direct style mutation.
3. The current disposal queue and safe-destroy logic are useful guardrails, but they operate after renderer-local object ownership decisions have already been made.
4. Corrected scope: the right architecture is not “more careful pooling”; it is a single scene reconciler that owns all display-object creation/update/retirement and a text runtime that no renderer can bypass.

## Architecture Check

1. A scene reconciler is cleaner than renderer-local Pixi object ownership because it gives the runner one place that decides identity, creation, update, reuse, and retirement for frame-scene entities.
2. A canonical text runtime owned by the reconciler is cleaner than ad hoc slot pooling because it removes detach/reparent/reuse semantics from individual renderers entirely.
3. This preserves the repo boundary: game-specific presentation rules still come from `visual-config.yaml`, while the reconciler/text runtime remain generic runner infrastructure.
4. No backwards-compatibility alias path should preserve direct renderer-managed `Text` ownership. Touched renderers should migrate directly to reconciler-owned scene entities.

## What to Change

### 1. Introduce a frame-scene reconciler as the sole Pixi object owner

Add a runner-only reconciler layer that consumes immutable `PresentationScene` nodes and owns:

- display-object identity
- object creation
- object updates
- end-of-frame retirement
- deterministic teardown ordering

Renderers should stop creating raw Pixi primitives directly for steady-state frame entities. Instead, they should either disappear entirely into the reconciler or become pure drawing helpers invoked by the reconciler.

### 2. Replace pooled raw `Text` ownership with a canonical text backend

Add a text runtime/backend under the reconciler that:

- accepts immutable text node specs keyed by scene identity
- decides whether a text object can be updated in place or must be replaced
- owns all style/text changes for text entities
- owns retirement of removed text nodes
- does not permit renderer-local detach/reparent/reuse of raw Pixi `Text`

The current `createTextSlotPool()` model should be removed rather than wrapped for compatibility.

### 3. Make text replacement and retirement deterministic

Document and enforce explicit rules for text identity:

- stable key means same semantic visual node
- changes that affect backend texture identity must flow through the text runtime
- removed nodes retire through one canonical path only
- no steady-state renderer code is allowed to call `destroyManagedText()` or mutate `Text.style` directly

## Files to Touch

- `packages/runner/src/canvas/text/*` (replace/expand)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/renderers/*` (modify heavily or fold into reconciler-owned helpers)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/text/*` (modify/new)
- `packages/runner/test/canvas/*` (modify where lifecycle ownership changes)

## Out of Scope

- changing game rules, `GameDef`, or engine/runtime schemas
- adding FITL-specific rendering workarounds
- browser stress verification by itself; that belongs to the dedicated regression-harness ticket

## Acceptance Criteria

### Tests That Must Pass

1. No steady-state runner frame renderer directly owns Pixi `Text` creation, detach/reacquire pooling, or direct `Text.style` mutation after the migration.
2. Reconciler/text-runtime tests prove keyed text nodes update and retire deterministically without renderer-local pooling semantics.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. The runner has exactly one steady-state owner of Pixi text lifecycle: the canonical text runtime under the scene reconciler.
2. Scene entities are immutable specs; Pixi objects are implementation details owned by reconciliation infrastructure.
3. No backwards-compatibility path preserves renderer-managed raw `Text` pooling or detach/reparent reuse.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/*` — prove keyed text creation, replacement, reuse decisions, and retirement are owned by the canonical text runtime.
2. `packages/runner/test/canvas/canvas-updater.test.ts` or successor reconciler tests — prove frame application routes through the reconciler, not renderer-local object ownership.
3. Focused renderer/reconciler tests for overlays, card text, region labels, stack badges, and announcements — prove those surfaces no longer manage raw Pixi text directly.

### Commands

1. `pnpm -F @ludoforge/runner test -- canvas-updater.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm run check:ticket-deps`
