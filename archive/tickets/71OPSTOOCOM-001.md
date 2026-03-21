# 71OPSTOOCOM-001: Add tooltip companion metadata for synthesized action groups

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None (first ticket in series)

## Problem

FITL uses `actionGroupPolicy` to synthesize `operationPlusSpecialActivity` from `operation` while hiding `specialActivity`. The current runner architecture drops hidden action classes during render-model projection, so the tooltip layer has no access to the hidden special activities that should accompany the synthesized Op+SA group. Adding `appendTooltipFrom` to the schema alone would leave the feature non-functional.

## Assumption Reassessment (2026-03-21)

1. `ActionGroupSynthesizeEntrySchema` is defined in `packages/runner/src/config/visual-config-types.ts` and currently contains only `fromClass` and `intoGroup` — confirmed.
2. `VisualConfigProvider.getActionGroupPolicy()` already exposes the parsed policy generically from `packages/runner/src/config/visual-config-provider.ts`; no provider API expansion is needed — confirmed.
3. `projectActionGroups()` in `packages/runner/src/model/project-render-model.ts` currently hides configured classes by `continue`-ing when `hiddenClasses.has(actionClass)` — confirmed. Hidden actions are not preserved anywhere today.
4. `ActionTooltipSourceKey` already includes `groupKey`, so tooltip companion resolution can key off the hovered toolbar group without changing the hover contract — confirmed.
5. Existing runner tests already cover synthesis and hide behavior in `packages/runner/test/model/project-render-model-state.test.ts`; the ticket’s prior claim that config-loading tests were sufficient was incorrect.
6. FITL `data/games/fire-in-the-lake/visual-config.yaml` currently synthesizes `operation -> operationPlusSpecialActivity` and hides `specialActivity`, but has no `appendTooltipFrom` declaration yet — confirmed.

## Architecture Reassessment

The proposed change is beneficial relative to the current architecture.

1. The current architecture is incomplete: once hidden actions are dropped during projection, no later UI layer can recover them generically.
2. The clean, extensible fix is to preserve hidden actions as render-model metadata keyed by class, then let tooltip composition resolve companions from visual-config policy.
3. This keeps game-specific behavior in `visual-config.yaml` and runner config types, which aligns with `docs/FOUNDATIONS.md` sections 1, 3, 9, and 10.
4. A schema-only change would be a dead configuration field. A FITL-specific tooltip branch would be a worse architecture because it hardcodes one game’s policy into UI code.
5. No backwards-compatibility layer is required. The field is optional, but once added the render-model and tooltip pipeline should treat it as first-class architecture rather than an alias or special case.

## Scope

This ticket owns the full runner path needed to make `appendTooltipFrom` real:

1. Visual-config schema support
2. FITL visual-config adoption
3. Render-model preservation of hidden actions for tooltip-only use
4. Generic companion-action resolution for synthesized groups
5. Tooltip rendering for companion actions
6. Tests proving the new invariant

## What to Change

### 1. Extend the visual-config schema

File: `packages/runner/src/config/visual-config-types.ts`

Add `appendTooltipFrom: z.array(z.string()).optional()` to `ActionGroupSynthesizeEntrySchema`.

### 2. Update FITL visual config

File: `data/games/fire-in-the-lake/visual-config.yaml`

Update the existing synthesize rule to declare:

```yaml
appendTooltipFrom:
  - specialActivity
```

### 3. Preserve hidden actions in the render model

Files:
- `packages/runner/src/model/render-model.ts`
- `packages/runner/src/model/project-render-model.ts`

Introduce `hiddenActionsByClass` on `RenderModel` and have `projectActionGroups()` return both:

1. visible `actionGroups`
2. hidden actions grouped by their original `actionClass`

The hidden actions must remain absent from the toolbar while still being available to tooltip composition.

### 4. Resolve companion actions generically from policy

Files:
- `packages/runner/src/ui/GameContainer.tsx`
- a small helper colocated with tooltip code if needed

Use the hovered `groupKey`, `visualConfigProvider.getActionGroupPolicy()`, and `renderModel.hiddenActionsByClass` to resolve companion actions for synthesized groups with `appendTooltipFrom`.

### 5. Render companion actions in the tooltip

Files:
- `packages/runner/src/ui/ActionTooltip.tsx`
- `packages/runner/src/ui/ActionTooltip.module.css`

Add a generic companion-actions section that:

1. appears only when companion actions exist
2. uses generic display naming, not FITL-specific strings
3. visually distinguishes unavailable companion actions

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts`
- `data/games/fire-in-the-lake/visual-config.yaml`
- `packages/runner/src/model/render-model.ts`
- `packages/runner/src/model/project-render-model.ts`
- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/src/ui/ActionTooltip.tsx`
- `packages/runner/src/ui/ActionTooltip.module.css`
- relevant runner tests

## Out of Scope

- Any engine, kernel, compiler, or GameSpecDoc changes
- Per-companion rich rule descriptions inside the tooltip; this ticket only surfaces companion action names and availability
- Interactive selection of companion actions directly inside the tooltip

## Acceptance Criteria

### Functional

1. FITL Op+SA toolbar actions show operation tooltip content plus companion special-activity entries sourced from hidden actions.
2. Hidden action classes remain hidden from the toolbar itself.
3. Games without `appendTooltipFrom` behave exactly as before.

### Structural

1. `ActionGroupSynthesizeEntry` remains Zod-inferred; no parallel manual type is introduced.
2. Hidden actions are preserved in a generic render-model structure, not recomputed through FITL-specific logic.
3. Tooltip companion resolution is driven by `actionGroupPolicy`, not hardcoded group names.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/project-render-model-state.test.ts`
   - add coverage that hidden classes are preserved for tooltip use while remaining absent from visible groups
   - extend synthesis/hide assertions to cover `hiddenActionsByClass`
2. `packages/runner/test/ui/ActionTooltip.test.ts`
   - add coverage for the companion-actions section rendering and absence behavior
3. `packages/runner/test/ui/GameContainer.test.ts`
   - add coverage that the container resolves companion actions from the hovered synthesized group and passes them into `ActionTooltip`

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/runner test`

## Rationale

This architecture is cleaner than the current one because it fixes the underlying data-loss boundary instead of teaching the tooltip to guess what was hidden earlier. It is also more extensible: any future game can attach tooltip companions to synthesized groups by configuration alone, without adding new branches to runner UI code.

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - added `appendTooltipFrom` to the visual-config synthesize schema
  - updated FITL visual config to append hidden `specialActivity` actions to the synthesized `operationPlusSpecialActivity` tooltip
  - preserved hidden actions in `RenderModel.hiddenActionsByClass` during projection instead of dropping them
  - added generic tooltip companion resolution keyed by synthesize policy and hovered `groupKey`
  - rendered companion action groups in `ActionTooltip` with availability styling
  - strengthened runner tests around projection, tooltip rendering, and container wiring
- Deviations from original plan:
  - the original ticket treated this as a schema-only change; the implemented solution expanded scope to fix the actual architectural gap in render-model projection and tooltip composition
  - companion actions were implemented as grouped metadata by action class rather than a flat list so multiple `appendTooltipFrom` classes remain composable
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo typecheck`
  - `pnpm turbo build`
  - `pnpm turbo lint`
  - `pnpm turbo test`
