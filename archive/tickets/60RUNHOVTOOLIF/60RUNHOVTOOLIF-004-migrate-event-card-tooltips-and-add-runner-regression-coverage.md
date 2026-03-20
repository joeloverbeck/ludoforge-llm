# 60RUNHOVTOOLIF-004: Migrate event-card tooltips and add runner regression coverage

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `archive/specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-002-centralize-floating-anchor-resolution-and-safe-render-gating.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-003-invalidate-action-tooltips-on-action-surface-lifecycle-changes.md`

## Problem

Spec 60 explicitly requires action and event-card hover tooltips to share the same lifecycle architecture. The shared hover-session primitive and shared anchored-floating resolver now exist, but the final runner integration pass still needs to ensure event-card tooltip wiring stays aligned with the post-`003` action-tooltip contract and that the stale-tooltip regression is locked at the container level.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/useCardTooltip.ts` no longer owns its own debounce/grace state machine; it already delegates to `packages/runner/src/ui/useHoverPopoverSession.ts`.
2. `packages/runner/src/ui/EventCardTooltip.tsx` and `packages/runner/src/ui/ActionTooltip.tsx` already share the same resolved-anchor positioning policy via `packages/runner/src/ui/useResolvedFloatingAnchor.ts`.
3. `packages/runner/src/ui/ActionToolbar.tsx` already emits structured `ActionTooltipSourceKey` metadata, including `surfaceRevision`.
4. `packages/runner/src/ui/GameContainer.tsx` already invalidates action tooltips when the action surface leaves `'actions'` or the rendered action surface revision changes.
5. The stale action-tooltip regression sequence from Spec 60 is already covered in `packages/runner/test/ui/GameContainer.chrome.test.tsx`.
6. The remaining gap is narrower than originally written: verify and preserve the shared architecture, strengthen card-side runner coverage, and avoid churn-only contract renames that do not improve correctness.

## Architecture Check

1. This ticket must not claim to introduce the shared hover-session primitive, structured action source key, shared anchor resolver, or action-surface invalidation; those are already implemented.
2. A broader production refactor to force action and card tooltip state into identical field names is not justified unless it removes real duplicated logic or fixes a demonstrated behavior gap. Today the card hook is already a thin adapter over the shared session hook, so renaming alone would be churn.
3. The remaining architectural value is to keep `GameContainer` and card-tooltip wiring honest against the shared hover model and to lock that behavior with regression tests.
4. Card tooltip lifecycle must stay generic presentation logic and must not add game-specific branching outside existing render-model data.
5. Final regression coverage is still valuable at the end of the sequence because it confirms the intended end state without reopening already-solved architecture.

## What to Change

### 1. Re-scope the work to real remaining gaps

Do not refactor runner production code merely to rename card-tooltip fields into action-tooltip field names. Only change production code if current card wiring fails to uphold the shared hover-session invariants or if test coverage exposes a real behavioral gap.

### 2. Strengthen card-side coverage around the shared hover model

Add or update tests that prove:

1. `useCardTooltip()` still exposes the shared session controls correctly, including explicit invalidation/dismiss semantics.
2. `GameContainer` still wires card tooltip state and pointer handlers into `EventCardTooltip` correctly.
3. Card tooltip rendering still respects resolved-anchor gating and never falls back to origin placement.

### 3. Preserve the existing Spec 60 stale-action regression coverage

Keep the existing runner integration-style regression that matches the reported stale action-tooltip bug sequence. This ticket no longer needs to add that test from scratch; it needs to ensure later card-side changes do not regress the shared architecture.

## Files to Touch

- `packages/runner/src/ui/useCardTooltip.ts` (modify only if post-003 contract alignment requires it)
- `packages/runner/src/ui/GameContainer.tsx` (modify only if test coverage exposes a real wiring gap)
- `packages/runner/src/ui/EventCardTooltip.tsx` (modify only if coverage exposes a real resolved-anchor contract gap)
- `packages/runner/test/ui/useCardTooltip.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify)
- `packages/runner/test/ui/EventCardTooltip.test.ts` (keep or modify only if final shared contract requires it)

## Out of Scope

- introducing new tooltip content fields or new event-card visual design
- additional action-tooltip API redesign beyond what Tickets 001-003 already require
- canvas hover behavior or overlay panel changes unrelated to tooltip lifecycle
- engine/runtime/schema/game-data modifications

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/useCardTooltip.test.ts` verifies the card tooltip hook still exposes shared lifecycle semantics for debounce, grace, explicit invalidation, and explicit dismiss.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` keeps the existing end-to-end stale action-tooltip regression sequence and adds card-tooltip wiring coverage at the runner container level.
3. `packages/runner/test/ui/EventCardTooltip.test.ts` still passes against the resolved-anchor contract.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- useCardTooltip EventCardTooltip GameContainer`
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Lint: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Action and event-card hover tooltips share the same lifecycle architecture; no duplicated timer/state machine remains.
2. A hover session only remains visible while backed by a live source and a valid resolved anchor.
3. No FITL-specific or game-specific conditions are introduced anywhere in runner or engine code to satisfy this ticket.
4. Do not introduce alias layers or compatibility shims solely to preserve stale pre-shared-session naming.

## Notes

1. `useCardTooltip()` already uses `useHoverPopoverSession()`. Do not re-implement or re-wrap card debounce/grace logic in this ticket.
2. `EventCardTooltip` already uses the shared resolved-anchor hook. Do not add a second anchor abstraction here.
3. The end state should be one runner hover-popover architecture. Because that architecture is already in place, this ticket should prefer proof and cleanup over speculative rewrites.
4. If coverage does not expose a real production gap, keep the existing thin card adapter and avoid renames that only reshuffle field names.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useCardTooltip.test.ts` — proves the card hook still forwards shared session lifecycle controls, including explicit dismiss/invalidation behavior.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — keeps the stale action-tooltip regression locked and verifies card-tooltip wiring at the container integration level.
3. `packages/runner/test/ui/EventCardTooltip.test.ts` — confirms the resolved-anchor contract for the card tooltip component remains intact.

### Commands

1. `pnpm -F @ludoforge/runner test -- useCardTooltip EventCardTooltip GameContainer`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completed: 2026-03-19
- What changed: reassessed the ticket against the implemented runner architecture, narrowed the scope away from unnecessary production refactors, added `useCardTooltip` regression coverage for explicit dismiss and hover replacement, and added `GameContainer` runner-level coverage that card tooltip state and pointer handlers are wired into `EventCardTooltip`.
- Deviations from original plan: no production runner code changes were needed. The shared hover-session model, structured action source key, resolved-anchor policy, and stale action-tooltip invalidation/regression coverage were already in place, so forcing additional action/card contract renames would have added churn without improving architecture.
- Verification: `pnpm -F @ludoforge/runner test -- useCardTooltip EventCardTooltip GameContainer`, `pnpm -F @ludoforge/runner test`, and `pnpm -F @ludoforge/runner lint` all passed.
