# 68RUNPRESLIFE-002: Replace Ad Hoc Pixi Text Ownership with a Retained Text Runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, tickets/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/tickets/RENDERLIFE-001.md

## Problem

The current runner creates and mutates Pixi `Text` objects in multiple independent places:

- `packages/runner/src/canvas/renderers/zone-renderer.ts`
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts`
- `packages/runner/src/canvas/renderers/card-template-renderer.ts`

That fragmentation is the clearest architectural match to the crash in [`logs/fitl-logs.log`](/home/joeloverbeck/projects/ludoforge-llm/logs/fitl-logs.log): multiple code paths can create, destroy, restyle, or reparent text nodes without a single lifecycle owner.

## Assumption Reassessment (2026-03-18)

1. Text reuse exists only in narrow pockets today. `text-slot-pool.ts` pools card-template text, but overlays, badges, announcements, region labels, and zone labels still own their own `Text` instances — confirmed in the files listed above.
2. Some update paths replace style objects wholesale or mutate text style fields during normal rendering updates, which increases texture churn and makes lifecycle ordering harder to reason about — confirmed in `token-renderer.ts`, `card-template-renderer.ts`, and `table-overlay-renderer.ts`.
3. `safeDestroyDisplayObject()` is currently the safety net when text teardown goes wrong, but that is a fallback after the text system is already in an invalid state — confirmed in `safe-destroy.ts`.
4. Archived ticket `68RUNPRESLIFE-001` only migrated overlays and region boundaries onto canonical scene nodes. Token grouping/layout and action-announcement scene migration remain outstanding, so this ticket must consume that completed scene boundary rather than smuggling new scene logic into the text runtime itself.

## Architecture Check

1. A dedicated retained text runtime is cleaner than asking every renderer to be a miniature text engine. It gives the runner one place to own pooling, style signatures, glyph backend choice, and destruction ordering.
2. Text remains presentation-only data. The runtime consumes scene text nodes derived from `visual-config.yaml` and render state; it does not add game semantics to `GameDef` or simulation.
3. No backwards-compatibility layer should preserve direct renderer-managed `new Text(...)` ownership. The canonical path should be text-runtime handles only.
4. Scene derivation and text ownership must stay separate. This ticket should not become the place where token layout grouping or announcement anchor semantics are derived; it should consume canonical scene text specs produced upstream.

## What to Change

### 1. Introduce a retained text runtime

Add a runner-only `TextRuntime` / `LabelRuntime` layer that:

- receives immutable text-node specs from the presentation scene
- allocates stable handles for labels
- pools label objects by style signature and usage class
- updates text content and style only through the runtime
- owns detachment, parking, and final destruction

### 2. Move all text-bearing surfaces onto the runtime

Migrate at least these surfaces:

- zone name labels
- zone marker labels and hidden-stack counts
- token stack badges
- card-template text fields
- table overlay text and marker labels
- AI action announcements
- region labels

No renderer should directly construct or destroy Pixi `Text` after this ticket.

If a text-bearing surface is not yet represented as a canonical scene node when this ticket starts, land that scene migration first rather than embedding scene derivation into the text runtime.

### 3. Normalize typography through visual-config-backed tokens

Add a small, generic typography token layer inside runner visual config so repeated font decisions are not duplicated across renderers. The runtime should resolve tokens into concrete backend styles and cache them.

This must stay generic and presentation-only. FITL-specific typography choices belong in `visual-config.yaml`, not in runner branches.

## Files to Touch

- `packages/runner/src/canvas/text/*` or equivalent new runtime module (new)
- `packages/runner/src/canvas/renderers/text-slot-pool.ts` (replace or fold into runtime)
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
2. New runtime tests prove label parking/reuse across update, hide, and removal cycles.
3. Runner tests cover repeated FITL-scale label churn without `safe-destroy` being part of the expected path.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All runner text surfaces flow through one retained text runtime.
2. Typography decisions are data-driven and generic.
3. Normal label lifecycle does not depend on `safeDestroyDisplayObject()` fallback behavior.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/text-runtime.test.ts` — retained-label allocation, reuse, and retirement
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — stack badge migration to text runtime
3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — zone labels and hidden-stack badges via text runtime
4. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` and `action-announcement-renderer.test.ts` — overlays and announcements via text runtime

### Commands

1. `pnpm -F @ludoforge/runner test -- text-runtime.test.ts token-renderer.test.ts zone-renderer.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
