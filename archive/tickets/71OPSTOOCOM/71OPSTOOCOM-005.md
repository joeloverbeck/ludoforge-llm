# 71OPSTOOCOM-005: Reassess and finalize tooltip companion action wiring

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None unless reassessment exposes a real regression
**Deps**: `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-002.md`, `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-003.md`, `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-004.md`

Dependency notes: hidden-action projection, tooltip companion resolution, and tooltip companion rendering are already present in the current runner codebase. This ticket exists to correct stale assumptions, verify the current architecture, strengthen any narrow missing test coverage, and archive the work cleanly.

## Problem

The original ticket assumed the tooltip companion pipeline still needed to be wired in `GameContainer`. That assumption is no longer accurate. The current code already wires tooltip companion data into the runner, but it does so with a better architecture than the ticket originally proposed:

- `GameContainer.tsx` resolves tooltip companion data at render time.
- The resolver is `resolveTooltipCompanionGroups`, not a single-list `resolveCompanionActions`.
- `ActionTooltip` consumes `companionGroups`, not a flat `companionActions` list plus a separate name prop.

The remaining work is to document the real architecture, confirm the implementation is preferable to the original plan, add coverage only if a real invariant is under-tested, and finish archival.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/ui/GameContainer.tsx` already resolves tooltip companion data and passes it into `ActionTooltip` as `companionGroups` — confirmed.
2. `packages/runner/src/ui/useActionTooltip.ts` already carries `sourceKey.groupKey` through tooltip state via `ActionTooltipSourceKey` — confirmed.
3. `packages/runner/src/ui/action-tooltip-source-key.ts` already defines `groupKey` on the tooltip source key — confirmed.
4. `packages/runner/src/ui/tooltip-companion-actions.ts` already exists and resolves companion groups from `appendTooltipFrom` plus `renderModel.hiddenActionsByClass` — confirmed.
5. `packages/runner/src/model/render-model.ts` already carries `hiddenActionsByClass` — confirmed.
6. `packages/runner/src/model/project-render-model.ts` already preserves hidden actions for tooltip companion use instead of dropping them — confirmed.
7. `packages/runner/src/ui/ActionTooltip.tsx` already renders companion content, but the public prop shape is the more general `companionGroups` API — confirmed.
8. `packages/runner/src/config/visual-config-types.ts` and `data/games/fire-in-the-lake/visual-config.yaml` already support `appendTooltipFrom` — confirmed.
9. The current code and tests have already moved beyond the original single-companion-group design described in this ticket and in the early spec draft — confirmed.

## Architecture Check

1. The current architecture is better than the original proposal.
2. Using `companionGroups` instead of `companionActions` plus `companionGroupName` is cleaner because it:
   - supports multiple appended hidden-action classes without redesign,
   - keeps display naming coupled to the resolved action class,
   - avoids a fragile “first action decides the label” convention,
   - and keeps `ActionTooltip` generic for future grouped companion content.
3. Keeping resolution in `GameContainer` remains the correct integration point because that component already owns tooltip state, render model access, and visual-config access.
4. Preserving hidden actions in `renderModel.hiddenActionsByClass` is architecturally preferable to re-querying engine state or teaching the tooltip to understand game-specific rules.
5. No backwards-compatibility aliases should be introduced. The older single-list API should stay retired; tests should lock in the grouped design instead.

## What to Change

### 1. Correct this ticket to describe the shipped architecture

Replace stale assumptions about missing wiring with the actual grouped-companion implementation that exists today.

### 2. Verify whether any focused test gap still exists

Review current runner coverage for:

- hidden action preservation in render-model projection,
- grouped companion resolution order and deduplication,
- `GameContainer` prop plumbing into `ActionTooltip`,
- `ActionTooltip` rendering for companion groups.

Only add or strengthen tests where the grouped architecture exposes an invariant that is not already proven.

### 3. Finalize and archive after verification

If the reassessment finds no implementation regression, complete this ticket through:

- ticket correction,
- any narrow missing test coverage,
- verification commands,
- completed-status update,
- archival of this ticket and `specs/71-opsa-tooltip-companion-actions.md`.

## Files to Touch

- `tickets/71OPSTOOCOM-005.md` (required)
- `packages/runner/test/ui/ActionTooltip.test.ts` (only if a real grouped-rendering invariant needs stronger coverage)
- `packages/runner/test/ui/GameContainer.test.ts` (only if prop-plumbing coverage is actually missing)
- `specs/71-opsa-tooltip-companion-actions.md` (status/outcome before archival)

## Out of Scope

- Re-implementing already-landed runner wiring
- Reverting the grouped companion design back to the earlier single-list API
- Engine, kernel, or compiler changes unless reassessment finds a real failing invariant
- FITL-specific tooltip logic in runner code
- Manual-only verification as a substitute for automated proof

## Acceptance Criteria

### Tests That Must Pass

1. This ticket accurately documents the current runner implementation and no longer claims the wiring is still missing.
2. The grouped companion architecture is explicitly retained as the preferred design over the original single-list proposal.
3. Runner tests prove hidden actions, companion-group resolution, `GameContainer` plumbing, and tooltip rendering continue to work.
4. `pnpm -F @ludoforge/runner test`, `pnpm turbo build`, `pnpm turbo typecheck`, and `pnpm turbo lint` pass.

### Invariants

1. Companion tooltip content remains generic and config-driven via `appendTooltipFrom`.
2. `GameContainer` remains a pure integration point with no new companion-specific state.
3. Hidden action preservation stays in the render model rather than being reconstructed ad hoc at tooltip render time.
4. The runner continues to support multiple companion groups even though FITL currently uses one.

## Test Plan

### New/Modified Tests

1. Ticket document itself — corrected assumptions, architecture notes, and scope.
2. Add one focused grouped-companion rendering assertion only if reassessment finds a real missing invariant.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Corrected the ticket to match the current runner implementation instead of the superseded “missing wiring” assumption.
  - Verified that tooltip companion support is already implemented through `hiddenActionsByClass`, `resolveTooltipCompanionGroups`, `GameContainer`, and `ActionTooltip`.
  - Added one focused runner test in `packages/runner/test/ui/ActionTooltip.test.ts` proving the grouped companion architecture renders multiple companion groups in declaration order.
- Deviations from original plan:
  - No runner source changes were needed because the integration had already landed.
  - The shipped architecture is stronger than the original ticket proposal: it uses grouped companion data rather than a single flat companion-action list.
  - `useActionTooltip` did not need any changes because `sourceKey.groupKey` was already present.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --runInBand` ✅
  - `pnpm turbo build` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
