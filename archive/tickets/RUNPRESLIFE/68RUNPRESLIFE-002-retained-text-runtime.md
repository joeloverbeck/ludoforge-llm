# 68RUNPRESLIFE-002: Replace Ad Hoc Pixi Text Ownership with a Retained Text Runtime

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/tickets/RENDERLIFE-001.md

## Problem

The current runner creates and mutates Pixi `Text` objects in multiple independent places:

- `packages/runner/src/canvas/renderers/zone-renderer.ts`
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`
- `packages/runner/src/canvas/renderers/card-template-renderer.ts`

That fragmentation is still a plausible architectural contributor to the crash in [`logs/fitl-logs.log`](/home/joeloverbeck/projects/ludoforge-llm/logs/fitl-logs.log): multiple code paths can create, destroy, restyle, or reparent text nodes with inconsistent conventions and no shared canvas-text ownership utilities.

## Assumption Reassessment (2026-03-18)

1. Text reuse exists only in narrow pockets today. `text-slot-pool.ts` pools card-template text, table overlays retain their own ad hoc slot arrays, and zone badges, token badges, hidden-stack counts, announcements, and region labels still own raw `Text` instances directly — confirmed in the files listed above.
2. Some update paths replace style objects wholesale or mutate text style fields during normal rendering updates, which increases texture churn and makes lifecycle ordering harder to reason about — confirmed in `token-renderer.ts`, `card-template-renderer.ts`, `table-overlay-renderer.ts`, and `region-boundary-renderer.ts`.
3. `safeDestroyDisplayObject()` is currently the safety net when text teardown goes wrong, but that is a fallback after the text system is already in an invalid state — confirmed in `safe-destroy.ts`.
4. Archived tickets `68RUNPRESLIFE-001` and `68RUNPRESLIFE-006` are already complete. Overlays and regions already consume canonical frame-scene nodes, token grouping/layout already lives in presentation code, and action announcements already consume immutable presentation specs. This ticket must therefore stay focused on canvas text ownership and not reopen presentation-layer migrations that have already landed.

## Architecture Check

1. A shared canvas-text ownership layer is cleaner than asking every renderer to be a miniature text engine. The runner needs one place for Pixi `Text` creation defaults, pooled-slot behavior, and safe teardown.
2. A new semantic scene-wide text contract is not cleaner than the current architecture. Tokens, overlays, regions, and announcements already have the right presentation-layer owners; duplicating that with a second text-specific contract would add indirection without removing real complexity.
3. No backwards-compatibility layer should preserve direct renderer-managed `new Text(...)` ownership. The canonical path should be shared canvas-text helpers only.
4. Scene derivation and text ownership must stay separate. This ticket should not become the place where token layout grouping or announcement anchor semantics are derived, because that work already lives upstream in presentation code.

## What to Change

### 1. Introduce shared canvas text ownership primitives

Add a runner-only `packages/runner/src/canvas/text/*` layer that:

- centralizes Pixi `Text` creation defaults
- provides reusable retained-slot pooling for ordered text collections
- provides shared destruction helpers for text nodes
- gives renderers one generic place to create labels instead of calling `new Text(...)` directly

### 2. Move all text-bearing surfaces onto the runtime

Migrate at least these surfaces:

- zone name labels
- zone marker labels and hidden-stack counts
- token stack badges
- card-template text fields
- table overlay text and marker labels
- AI action announcements
- region labels

No renderer should directly construct or destroy Pixi `Text` after this ticket. They may still own higher-level render-time behavior such as queueing, positioning, or animation, but text-node lifecycle must flow through the shared canvas-text layer.

### 3. Normalize typography through visual-config-backed tokens

Normalize repeated typography defaults where it is clearly beneficial, but keep this proportional to the current code. Existing card field layout, stack badge styling, and overlay config already encode some font decisions in the right layer, so this ticket should only extract generic shared defaults that actually reduce duplication without inventing a parallel style system.

This must stay generic and presentation-only. FITL-specific typography choices belong in `visual-config.yaml`, not in runner branches.

## Files to Touch

- `packages/runner/src/canvas/text/*` (new)
- `packages/runner/src/canvas/renderers/text-slot-pool.ts` (replace or fold into shared canvas-text layer)
- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/card-template-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/test/canvas/text/*` or equivalent (new)
- focused canvas renderer tests listed above (modify)

## Out of Scope

- replacing every non-text Pixi primitive
- changing game rules or data schemas outside runner visual config
- introducing FITL-only label logic

## Acceptance Criteria

### Tests That Must Pass

1. No canvas renderer directly owns Pixi `Text` construction/destruction after the migration.
2. New canvas-text tests prove shared text helpers handle retained-slot allocation, hide/reuse, and teardown correctly.
3. Focused renderer tests cover the migrated text surfaces and guard the expected no-direct-destroy update paths.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. All runner text surfaces flow through one shared canvas-text ownership layer.
2. Typography decisions remain generic and data-driven where configuration already owns them.
3. Normal label lifecycle does not depend on `safeDestroyDisplayObject()` fallback behavior.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/text-runtime.test.ts` — shared canvas-text creation, retained-slot allocation, reuse, and teardown
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — stack badge lifecycle through shared canvas-text helpers
3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` and `hidden-zone-stack.test.ts` — zone labels and hidden-stack badges through shared canvas-text helpers
4. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`, `action-announcement-renderer.test.ts`, `region-boundary-renderer.test.ts`, and `card-template-renderer.test.ts` — migrated text creation/destruction paths stay retained and deterministic

### Commands

1. `pnpm -F @ludoforge/runner test -- text-runtime.test.ts token-renderer.test.ts zone-renderer.test.ts hidden-zone-stack.test.ts table-overlay-renderer.test.ts action-announcement-renderer.test.ts region-boundary-renderer.test.ts card-template-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - added `packages/runner/src/canvas/text/text-runtime.ts` as the shared canvas-text ownership module for Pixi `Text` creation, retained-slot pooling, and safe teardown
  - removed `packages/runner/src/canvas/renderers/text-slot-pool.ts` and migrated card-template rendering onto the shared canvas-text layer
  - migrated zone labels, hidden-stack count labels, token stack badges, table overlay text, overlay marker labels, action announcements, and region labels so renderer code no longer directly constructs or destroys Pixi `Text`
  - added `packages/runner/test/canvas/text/text-runtime.test.ts` to lock down shared text-helper invariants and removed the old card-only pool test surface
  - corrected stale dependency paths to archived ticket `68RUNPRESLIFE-006` in active tickets `003`, `004`, and `005` so ticket integrity checks remain green
- What changed versus the original plan:
  - the implementation did not introduce a second scene-level text contract; it introduced a shared canvas-text ownership layer, which is the cleaner architectural fit now that scene and announcement presentation contracts already exist
  - typography normalization stayed intentionally small; existing visual-config-owned font decisions were preserved rather than forcing a new global style-token system into this ticket
- Verification results:
  - `pnpm -F @ludoforge/runner test -- text-runtime.test.ts token-renderer.test.ts zone-renderer.test.ts hidden-zone-stack.test.ts table-overlay-renderer.test.ts action-announcement-renderer.test.ts region-boundary-renderer.test.ts card-template-renderer.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm run check:ticket-deps` ✅
