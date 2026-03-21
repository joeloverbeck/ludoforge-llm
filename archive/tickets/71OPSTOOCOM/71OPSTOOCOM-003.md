# 71OPSTOOCOM-003: Reassess companion-action resolver ticket against shipped runner architecture

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/71OPSTOOCOM-001.md`, `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-002.md`

## Problem

This ticket originally proposed a new flat `resolveCompanionActions` helper in `packages/runner/src/model/`. That assumption is stale. The current runner already implements the companion-action resolution path, but it does so with a stronger architecture than this ticket described.

## Assumption Reassessment (2026-03-21)

### Original ticket assumptions that were wrong

1. There was no resolver utility yet.
   Reality: the repository already contains [`packages/runner/src/ui/tooltip-companion-actions.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/tooltip-companion-actions.ts) with `resolveTooltipCompanionGroups()`.
2. The helper should return a flat `readonly RenderAction[]`.
   Reality: the shipped resolver returns grouped companion data (`TooltipCompanionGroup[]`) keyed by `actionClass` and labeled with generic display names.
3. The helper belonged under `packages/runner/src/model/`.
   Reality: the implemented resolver sits in the tooltip/UI composition layer, which is a better fit because it converts render-model metadata into tooltip-specific grouped presentation data.
4. Dependencies 001 and 002 still needed to land.
   Reality: those tickets are already completed and archived; `appendTooltipFrom` and `hiddenActionsByClass` already exist in the codebase.
5. The new tests belonged in `packages/runner/test/model/resolve-companion-actions.test.ts`.
   Reality: the relevant existing test file is [`packages/runner/test/ui/tooltip-companion-actions.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/tooltip-companion-actions.test.ts).

### Confirmed current code state

1. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) already supports `appendTooltipFrom` on synthesize rules.
2. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) already exposes `hiddenActionsByClass`.
3. [`packages/runner/src/ui/tooltip-companion-actions.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/tooltip-companion-actions.ts) already resolves grouped companion tooltip content from the hovered `groupKey`, action-group policy, and hidden-action buckets.
4. [`packages/runner/src/ui/GameContainer.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/GameContainer.tsx) already wires those companion groups into [`packages/runner/src/ui/ActionTooltip.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ActionTooltip.tsx).
5. Existing tests already covered declaration-order resolution and deduplication; this pass additionally hardens null-policy and unmatched-rule branches in the resolver tests.

## Architecture Reassessment

The proposed implementation in the original ticket is not better than the current architecture.

1. A flat `readonly RenderAction[]` return type throws away grouping information that the tooltip UI actually needs. The current grouped return shape is more extensible because multiple hidden classes can be appended in a stable, generic order without inventing alias fields or FITL-specific headers later.
2. Locating the resolver in the UI tooltip composition layer is cleaner than placing it in the render-model layer. `RenderModel` should expose generic data; the tooltip layer should transform that data into tooltip presentation groups.
3. The current architecture aligns better with `docs/FOUNDATIONS.md`: no game-specific UI branches, no backwards-compatibility aliases, and no data-loss boundary that later layers must work around.

## Corrected Scope

This ticket does not require code implementation of a new resolver. Its corrected scope is:

1. document that the resolver already exists in a better architectural form
2. verify the current tests against the stale assumptions in the ticket
3. harden resolver test coverage for the missing null-policy and non-matching-rule branches

## New/Modified Tests

1. [`packages/runner/test/ui/tooltip-companion-actions.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/tooltip-companion-actions.test.ts)
   Rationale: adds explicit coverage for `null` policy, unmatched synthesize rule, and missing `appendTooltipFrom` so the resolver contract is proven against the stale branches the original ticket called out.

## Out of Scope

1. Creating a new flat `resolveCompanionActions` helper
2. Moving the shipped resolver out of the UI layer
3. Any engine, kernel, compiler, or GameSpecDoc changes
4. Any backwards-compatibility alias or shim for the old ticket design

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - corrected the ticket to match the repository state
  - documented that companion-action resolution is already implemented as grouped tooltip composition in `packages/runner/src/ui/tooltip-companion-actions.ts`
  - strengthened resolver tests for null-policy, unmatched-rule, and missing-`appendTooltipFrom` branches
- Deviations from original plan:
  - no new resolver file was created because the repository already has the cleaner, more extensible implementation
  - the canonical resolver remains grouped and UI-layer owned instead of becoming a flat model-layer helper
- Verification results:
  - `pnpm -F @ludoforge/runner test -- test/ui/tooltip-companion-actions.test.ts test/ui/GameContainer.test.ts test/ui/ActionTooltip.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
