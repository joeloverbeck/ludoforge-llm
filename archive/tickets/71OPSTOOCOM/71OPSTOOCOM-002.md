# 71OPSTOOCOM-002: Preserve hidden actions in RenderModel for tooltip companion resolution

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/71OPSTOOCOM-001.md`

## Problem

`specs/71-opsa-tooltip-companion-actions.md` depends on hidden action classes remaining available after runner projection so synthesized toolbar groups can append companion tooltip content. The original ticket assumed this work was still pending.

That assumption is no longer true. The current runner already preserves hidden actions in the render model, resolves companion tooltip groups from visual-config policy, and passes those groups into the tooltip UI.

## Assumption Reassessment (2026-03-21)

### Original ticket assumptions that were wrong

1. The feature was still pending.
   Reality: already implemented in the runner.
2. Only `RenderModel` and `project-render-model.ts` needed changes.
   Reality: the shipped solution also includes visual-config schema support, FITL visual-config data, tooltip companion-group resolution, `GameContainer` wiring, tooltip rendering, and tests.
3. `project-render-model.test.ts` was the likely test target.
   Reality: the relevant model coverage lives in `packages/runner/test/model/project-render-model-state.test.ts`.
4. `ActionTooltip.test.tsx` would need to be created or changed.
   Reality: the existing file is `packages/runner/test/ui/ActionTooltip.test.ts` and it already covers companion rendering.

### Confirmed current code state

1. [`packages/runner/src/model/render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/render-model.ts) already includes `hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>`.
2. [`packages/runner/src/model/project-render-model.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/model/project-render-model.ts) already preserves hidden actions while still excluding them from visible `actionGroups`.
3. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) already supports `appendTooltipFrom` on synthesize rules.
4. [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) already declares `appendTooltipFrom: [specialActivity]` for the synthesized `operationPlusSpecialActivity` group.
5. [`packages/runner/src/ui/tooltip-companion-actions.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/tooltip-companion-actions.ts) already resolves companion tooltip groups from policy plus `hiddenActionsByClass`.
6. [`packages/runner/src/ui/GameContainer.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/GameContainer.tsx) already wires resolved companion groups into [`ActionTooltip.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/ui/ActionTooltip.tsx).
7. Existing tests already cover model preservation, resolver behavior, `GameContainer` wiring, and tooltip rendering.

## Architecture Reassessment

The implemented architecture is better than the original ticket’s narrower proposal.

1. Preserving hidden actions in `RenderModel` is the right boundary. It keeps the engine untouched, keeps game-specific policy in visual config, and gives the UI a generic companion-data source.
2. The shipped resolver returns grouped companion data instead of a single flat list. That is more extensible than the original plan because multiple hidden classes can be appended in a stable order without hardcoding section names in the tooltip.
3. The design honors the repo’s “no backwards compatibility / no aliasing” rule. There is one canonical policy field, one canonical render-model field, and one canonical tooltip-resolution path.

No architectural correction is needed in code for this ticket. The current runner shape is clean, generic, and aligned with Spec 71.

## Corrected Scope

This ticket is no longer an implementation ticket. Its corrected purpose is to document that the runner-side hidden-action preservation work required by Spec 71 has already landed and is verified.

## Relevant Existing Tests

1. [`packages/runner/test/model/project-render-model-state.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/model/project-render-model-state.test.ts)
   Covers:
   - no-policy baseline keeps `specialActivity` visible and leaves `hiddenActionsByClass` empty
   - policy-driven hide/synthesize behavior preserves hidden actions under `hiddenActionsByClass`
   - hidden actions stay out of visible synthesized groups
   - hidden action display names and classes are preserved correctly
2. [`packages/runner/test/ui/tooltip-companion-actions.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/tooltip-companion-actions.test.ts)
   Covers:
   - declaration-order companion resolution
   - deduplication of repeated `appendTooltipFrom` classes
   - missing hidden-action buckets are ignored safely
3. [`packages/runner/test/ui/GameContainer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/GameContainer.test.ts)
   Covers:
   - companion groups are passed to `ActionTooltip` for synthesized tooltip policies
4. [`packages/runner/test/ui/ActionTooltip.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/ui/ActionTooltip.test.ts)
   Covers:
   - companion-action section renders when companion groups are provided
   - unavailable companion actions get the unavailable styling
   - companion section is absent when no companion groups are provided

## Out of Scope

1. Any further changes to hidden-action preservation logic
2. Any engine, kernel, or compiler changes
3. Any alias or compatibility path for older tooltip behavior

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  The ticket document was corrected to match the repository state. No code changes were required because the hidden-action preservation architecture and downstream tooltip flow were already implemented.
- Deviations from original plan:
  The original plan was stale. The shipped solution is broader and better factored than the ticket proposed: it includes visual-config schema support, FITL config wiring, grouped tooltip companion resolution, `GameContainer` integration, tooltip rendering, and test coverage.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --runInBand`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  All passed on 2026-03-21.
