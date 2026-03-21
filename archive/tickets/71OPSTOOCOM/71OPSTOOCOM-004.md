# 71OPSTOOCOM-004: Complete companion action rendering in `ActionTooltip`

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-002.md`

Dependency note: the broader tooltip-companion architecture from Spec 71 is already present in the runner; this ticket now covers the remaining tooltip rendering gap and test hardening.

## Problem

`ActionTooltip` already accepts companion data and renders it for progressive-disclosure tooltips (`tooltipPayload` present). However, the component drops companion groups when a tooltip falls back to legacy section rendering (`description.sections` / `limitUsage` only). That means the tooltip API is not branch-agnostic, and synthesized-group companion data can disappear depending on which description shape `describeAction()` returns.

## Assumption Reassessment (2026-03-21)

1. `ActionTooltipProps` already exposes `companionGroups?: readonly TooltipCompanionGroup[]`; there is no missing prop-design work here.
2. `ActionTooltip` already renders the companion section, but only inside the `tooltipPayload !== undefined` branch.
3. `ActionTooltip.module.css` already contains the companion section styles needed for this UI.
4. `tooltip-companion-actions.ts` already exists and resolves group labels generically via `formatIdAsDisplayName`.
5. `RenderModel.hiddenActionsByClass`, `actionGroupPolicy.synthesize[].appendTooltipFrom`, FITL visual config wiring, and `GameContainer` companion-group resolution are already implemented.
6. Existing tests already cover:
   - hidden action preservation in `project-render-model-state.test.ts`
   - companion-group resolution in `tooltip-companion-actions.test.ts`
   - `GameContainer` prop wiring in `GameContainer.test.ts`
   - progressive-disclosure companion rendering in `ActionTooltip.test.ts`
7. Missing coverage: no test currently proves companion groups still render when `ActionTooltip` falls back to legacy section rendering.

## Architecture Check

1. The current architecture is directionally correct: hidden actions are preserved in the render model, resolved in `GameContainer`, and passed into a pure presentational tooltip.
2. The remaining defect is local to `ActionTooltip`: companion rendering is incorrectly tied to one description representation instead of the component contract.
3. The clean fix is to render companion groups independently of whether the main body came from progressive disclosure or legacy display nodes.
4. No compatibility layer or alternate alias path is needed; the existing `companionGroups` API should remain the single source of truth.

## What to Change

### 1. Make companion rendering branch-agnostic — `ActionTooltip.tsx`

Move or factor the companion-section JSX so it can render after either main tooltip body:

- progressive disclosure (`tooltipPayload`)
- legacy display-node rendering (`sections` / `limitUsage`)

The component should not care which description representation was used to produce the main body.

### 2. Strengthen tests — `ActionTooltip.test.ts`

Add failing-first coverage for the legacy branch:

- companion groups render when `tooltipPayload` is absent but `sections` are present
- companion groups render after legacy content, not instead of it
- no companion section renders when `companionGroups` is `undefined` or empty in the legacy branch

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.tsx` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify)

## Out of Scope

- Any further render-model, visual-config, or `GameContainer` wiring changes unless testing proves a separate defect
- Engine, kernel, or compiler changes
- Per-action tooltip descriptions within the companion section
- Interactive selection from within the tooltip

## Acceptance Criteria

### Tests That Must Pass

1. **New test**: When `companionGroups` is provided and `tooltipPayload` is absent, `[data-testid="tooltip-companion-actions"]` is present
2. **New test**: Legacy tooltip content still renders alongside the companion section
3. **New test**: When `companionGroups` is `undefined` in the legacy branch, no companion section renders
4. **New test**: When `companionGroups` is an empty array in the legacy branch, no companion section renders
5. Existing progressive-disclosure companion tests continue to pass unchanged
6. Existing `GameContainer`, resolver, and render-model tests continue to pass unchanged
7. `pnpm -F @ludoforge/runner test` — all pass
8. `pnpm turbo typecheck` — no type errors
9. `pnpm turbo lint` — no lint issues

### Invariants

1. `ActionTooltip` remains a pure presentational component
2. Companion rendering is controlled only by `companionGroups`, not by the specific description branch
3. The companion section appears after the main tooltip body in both branches
4. When `companionGroups` is absent or empty, the tooltip renders identically to prior behavior

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.ts` (modify) — add legacy-branch companion rendering coverage

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - narrowed the ticket to the real remaining defect after reassessing the current runner architecture
  - updated `ActionTooltip` so companion groups render after both progressive-disclosure and legacy tooltip bodies
  - added legacy-branch regression tests for present, undefined, and empty companion-group inputs
- Deviations from original plan:
  - did not change visual-config wiring, render-model types, `GameContainer`, or the companion-group resolver because those pieces were already implemented and covered
  - did not modify CSS because the companion section styling already existed and was sufficient
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
