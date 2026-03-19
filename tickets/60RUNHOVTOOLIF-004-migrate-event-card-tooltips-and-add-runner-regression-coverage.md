# 60RUNHOVTOOLIF-004: Migrate event-card tooltips and add runner regression coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`, `tickets/60RUNHOVTOOLIF-002-centralize-floating-anchor-resolution-and-safe-render-gating.md`, `tickets/60RUNHOVTOOLIF-003-invalidate-action-tooltips-on-action-surface-lifecycle-changes.md`

## Problem

Spec 60 explicitly requires action and event-card hover tooltips to share the same lifecycle architecture. The shared hover-session primitive and shared anchored-floating resolver now exist, but the final runner integration pass still needs to ensure event-card tooltip wiring stays aligned with the post-`003` action-tooltip contract and that the stale-tooltip regression is locked at the container level.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/useCardTooltip.ts` no longer owns its own debounce/grace state machine; it already delegates to `packages/runner/src/ui/useHoverPopoverSession.ts`.
2. `packages/runner/src/ui/EventCardTooltip.tsx` also no longer owns bespoke floating-position glue; it already delegates to `packages/runner/src/ui/useResolvedFloatingAnchor.ts`.
3. `GameContainer` still wires both action and card tooltip hooks, so final convergence on one shared hover contract remains entirely in runner UI code.
4. The spec’s final acceptance criteria still require architectural consistency across action and event-card hover tooltips, not just a one-off action bug fix.

## Architecture Check

1. This ticket should no longer claim to introduce the shared session primitive or shared anchor resolver for cards; that work is already done.
2. The remaining architectural value is to keep `GameContainer` and card-tooltip wiring aligned with the final post-`003` contract, so the runner ends with one coherent hover-popover model instead of parallel contracts.
3. Card tooltip lifecycle stays generic presentation logic and does not add any card- or game-specific branching outside existing render-model data.
4. Final regression coverage is valuable only after shared lifecycle, anchor gating, and action invalidation are in place, so this ticket still belongs at the end of the sequence.

## What to Change

### 1. Align event-card tooltip contract with the final shared hover model

After `003` lands, update any remaining card-tooltip state naming or prop contracts so card tooltips follow the same runner-level hover session model as action tooltips without introducing aliases or compatibility layers.

### 2. Align `GameContainer` card-tooltip wiring with the final shared contract

Ensure card tooltip state passed through `GameContainer` uses the same session/anchor model as action tooltips, including any renamed props or resolved-anchor types introduced earlier in the sequence.

### 3. Add final regression coverage for Spec 60

Add or update a runner integration-style test that matches the reported bug sequence:

1. hover action button
2. wait for tooltip to appear
3. execute and confirm action
4. action surface refreshes
5. tooltip remains absent unless a new live hover begins

Also keep card tooltip behavior covered so the shared lifecycle architecture stays enforced.

## Files to Touch

- `packages/runner/src/ui/useCardTooltip.ts` (modify only if post-003 contract alignment requires it)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/EventCardTooltip.tsx` (modify only if final shared contract requires it)
- `packages/runner/test/ui/useCardTooltip.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/EventCardTooltip.test.ts` (modify only if final shared contract requires it)

## Out of Scope

- introducing new tooltip content fields or new event-card visual design
- additional action-tooltip API redesign beyond what Tickets 001-003 already require
- canvas hover behavior or overlay panel changes unrelated to tooltip lifecycle
- engine/runtime/schema/game-data modifications

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/useCardTooltip.test.ts` verifies the card tooltip hook now uses the shared lifecycle semantics for debounce, grace, and explicit invalidation.
2. `packages/runner/test/ui/GameContainer.test.ts` includes the end-to-end stale-tooltip regression sequence from Spec 60 and keeps card-tooltip wiring covered.
3. `packages/runner/test/ui/EventCardTooltip.test.ts` still passes against the final shared contract.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- GameContainer useCardTooltip EventCardTooltip`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Action and event-card hover tooltips share the same lifecycle architecture; no duplicated timer/state machine remains.
2. A hover session only remains visible while backed by a live source and a valid resolved anchor.
3. No FITL-specific or game-specific conditions are introduced anywhere in runner or engine code to satisfy this ticket.

## Notes

1. `useCardTooltip()` already uses `useHoverPopoverSession()`. Do not re-implement or re-wrap card debounce/grace logic in this ticket.
2. `EventCardTooltip` already uses the shared resolved-anchor hook. Do not add a second anchor abstraction here.
3. If `003` lands with a cleaner shared tooltip-session type or naming scheme, prefer converging card wiring onto that contract directly rather than preserving pre-`003` names for compatibility.
4. The end state should be one runner hover-popover architecture. If `003` fully eliminates any remaining action/card contract divergence, this ticket may collapse mostly into regression tests and `GameContainer` cleanup.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useCardTooltip.test.ts` — proves card tooltips now run on the same session lifecycle contract as action tooltips.
2. `packages/runner/test/ui/GameContainer.test.ts` — locks the reported stale-tooltip scenario at the container integration level.
3. `packages/runner/test/ui/EventCardTooltip.test.ts` — confirms final contract compatibility for the card tooltip component.

### Commands

1. `pnpm -F @ludoforge/runner test -- useCardTooltip EventCardTooltip`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
