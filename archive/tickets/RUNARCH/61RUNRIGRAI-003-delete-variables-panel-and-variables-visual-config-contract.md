# 61RUNRIGRAI-003: Delete Variables Panel and Variables Visual-Config Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only UI/config cleanup
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md

## Problem

`VariablesPanel` is one of the placeholder widgets Spec 61 removes globally, but the current runner still ships the component, its tests, and the `visual-config` schema/provider contracts that exist only to feed that panel. Leaving any of this in place would preserve dead architecture.

## Assumption Reassessment (2026-03-19)

1. After archived Tickets `61RUNRIGRAI-001` and `61RUNRIGRAI-002`, the event-log dock work is already implemented and covered by tests. This ticket is not the first remaining cleanup slice after the dock refactor; it is a later, narrower cleanup slice focused specifically on the variables panel path.
2. `packages/runner/src/ui/GameContainer.tsx` still registers `VariablesPanel` in the right rail alongside `Scoreboard`, `GlobalMarkersBar`, and `ActiveEffectsPanel`. Removing `VariablesPanel` will improve the architecture, but it will not by itself complete the broader Spec 61 right-rail cleanup.
3. `packages/runner/src/ui/VariablesPanel.tsx` is still the only runtime consumer of `visualConfigProvider.getVariablesConfig()`.
4. `packages/runner/src/config/visual-config-types.ts`, `visual-config-provider.ts`, and `validate-visual-config-refs.ts` still define and validate `variables.prominent`, `variables.panels`, and `variables.formatting`.
5. `packages/runner/test/ui/GameContainer.test.ts`, `packages/runner/test/config/visual-config-schema.test.ts`, `packages/runner/test/config/visual-config-provider.test.ts`, and `packages/runner/test/config/validate-visual-config-refs.test.ts` still encode the presence of the variables panel contract. `packages/runner/test/ui/GameContainer.chrome.test.tsx` currently mocks `VariablesPanel` but does not assert any variables-specific behavior.
6. Corrected scope: this ticket should remove only the variables-panel surface and its config contract. `Scoreboard`, `GlobalMarkersBar`, and any later render-model/frame cleanup remain follow-up work, not silent scope creep here.

## Note

This ticket should be treated as the authoritative removal point for:

- `VariablesPanel`,
- the `variables` visual-config schema/provider contract,
- any right-rail registration and test scaffolding that exists only for that panel.

## Architecture Check

1. Removing the entire variable-panel pipeline is cleaner than preserving unused schema/provider APIs "for later" with no runtime consumer.
2. The cleanup stays in runner presentation/config code and preserves the repository rule that gameplay semantics live in `GameSpecDoc`/game data while agnostic runtime stays generic.
3. No compatibility shim should continue accepting `variables` as a valid runner visual-config surface after the panel is deleted.
4. This cleanup is worthwhile under the current architecture because the variables config API has a single presentation consumer and no surviving semantic responsibility. Keeping it would preserve dead surface area without increasing extensibility.
5. The ideal end state for Spec 61 is still cleaner than the post-ticket architecture because `Scoreboard`, `GlobalMarkersBar`, and any now-dead projections should eventually be removed too. That broader cleanup should happen through explicit follow-up tickets rather than by widening this ticket informally.

## What to Change

### 1. Delete the variables panel surface

Remove `VariablesPanel` from `GameContainer` registration and delete its component, CSS module, and dedicated UI tests.

### 2. Remove the `variables` config shape

Delete `VariablesConfigSchema`, exported variable-panel-related types, provider accessors, and ref-validation logic that only supported the panel.

### 3. Tighten config tests

Update schema/provider/ref-validation tests so `variables` is rejected or absent from the supported config contract. Remove any fixtures or assertions that still treat `variables` as valid. Also remove stale `GameContainer` assertions that expect the variables panel to remain registered.

## File List

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/VariablesPanel.tsx` (delete)
- `packages/runner/src/ui/VariablesPanel.module.css` (delete)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify only if a stale `VariablesPanel` mock/import becomes dead)
- `packages/runner/test/ui/VariablesPanel.test.ts` (delete)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify)

## Out of Scope

- deleting `Scoreboard` or `GlobalMarkersBar`
- removing runner-frame/render-model fields such as `globalVars` or `playerVars`
- changing table overlay or presentation-scene variable consumers
- adding any replacement generic inspector UI

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.test.ts` proves `VariablesPanel` is no longer registered in the right rail.
2. `packages/runner/test/config/visual-config-schema.test.ts` and `packages/runner/test/config/validate-visual-config-refs.test.ts` prove `variables` is no longer part of the accepted runner visual-config contract.
3. `packages/runner/test/config/visual-config-provider.test.ts` proves the provider no longer exposes a variables-panel accessor.
4. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config`
5. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`
7. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. No runner UI surface depends on `visual-config.variables` after this ticket lands.
2. Presentation-only config remains optional and generic; removing the variables panel does not move data requirements into engine/runtime layers.
3. Variable data still remains available to real consumers such as table overlays or other surviving projections until a later ticket removes only truly dead fields.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — absence of `VariablesPanel` in overlay registration.
2. `packages/runner/test/config/visual-config-schema.test.ts` — schema rejects deleted `variables` section.
3. `packages/runner/test/config/visual-config-provider.test.ts` — provider API cleanup.
4. `packages/runner/test/config/validate-visual-config-refs.test.ts` — deleted variable-ref validation path.
5. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — only if needed to remove dead mocks/import assumptions after deleting `VariablesPanel`.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner test -- visual-config`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Removed `VariablesPanel` from `GameContainer` right-rail registration and deleted the component, stylesheet, and dedicated test file.
  - Removed the `variables` visual-config contract from the root schema, provider API, and reference-validation path.
  - Tightened the root `VisualConfigSchema` to reject deleted top-level surfaces such as `variables` instead of silently accepting and stripping them.
  - Updated runner tests so the right rail no longer expects `VariablesPanel`, schema parsing rejects `variables`, and provider/ref-validation coverage matches the reduced contract.
- Deviations from original plan:
  - The ticket was corrected before implementation because its original reassessment understated repo progress: the event-log dock work from Tickets `61RUNRIGRAI-001` and `61RUNRIGRAI-002` was already complete.
  - The broader Spec 61 placeholder-widget cleanup remains intentionally split: `Scoreboard`, `GlobalMarkersBar`, and any later dead projection cleanup were not pulled into this ticket.
  - `packages/runner/test/ui/GameContainer.chrome.test.tsx` only needed dead-mock cleanup; no new chrome behavior assertions were required for the variables removal itself.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- GameContainer`
  - `pnpm -F @ludoforge/runner test -- visual-config`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm run check:ticket-deps`
