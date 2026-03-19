# 60RUNHOVTOOLIF-004: Migrate event-card tooltips and add runner regression coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`, `tickets/60RUNHOVTOOLIF-002-centralize-floating-anchor-resolution-and-safe-render-gating.md`, `tickets/60RUNHOVTOOLIF-003-invalidate-action-tooltips-on-action-surface-lifecycle-changes.md`

## Problem

Spec 60 explicitly requires action and event-card hover tooltips to share the same lifecycle architecture. Fixing action tooltips alone would remove the immediate stale-tooltip bug, but it would leave `useCardTooltip()` on the older duplicated lifecycle path and preserve inconsistent hover policy across the runner.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/useCardTooltip.ts` still owns its own debounce/grace state machine today.
2. `GameContainer` already wires both action and card tooltip hooks, so convergence on one shared hover lifecycle can happen entirely in runner UI code.
3. The spec’s final acceptance criteria require architectural consistency across action and event-card hover tooltips, not just a one-off action bug fix.

## Architecture Check

1. Migrating event-card tooltips after the shared primitive exists is cleaner than leaving a second legacy hook in place; it removes duplicate lifecycle policy entirely.
2. Card tooltip lifecycle stays generic presentation logic and does not add any card- or game-specific branching outside existing render-model data.
3. Regression coverage at the end of the sequence is valuable only after shared lifecycle, anchor gating, and action invalidation are already in place.

## What to Change

### 1. Move event-card hover lifecycle onto the shared session primitive

Refactor `useCardTooltip()` to consume the shared hover-popover controller/hook rather than managing its own timers directly.

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

- `packages/runner/src/ui/useCardTooltip.ts` (modify)
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

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useCardTooltip.test.ts` — proves card tooltips now run on the same session lifecycle contract as action tooltips.
2. `packages/runner/test/ui/GameContainer.test.ts` — locks the reported stale-tooltip scenario at the container integration level.
3. `packages/runner/test/ui/EventCardTooltip.test.ts` — confirms final contract compatibility for the card tooltip component.

### Commands

1. `pnpm -F @ludoforge/runner test -- useCardTooltip EventCardTooltip`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
