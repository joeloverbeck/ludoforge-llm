# 60RUNHOVTOOLIF-003: Invalidate action tooltips on action-surface lifecycle changes

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`, `tickets/60RUNHOVTOOLIF-002-centralize-floating-anchor-resolution-and-safe-render-gating.md`

## Problem

The actual stale-tooltip bug occurs because action tooltip lifetime is not bound to the lifetime of the action surface that created it. `ActionToolbar` currently emits only `(actionId, element, actorPlayer?)`, `useActionTooltip()` treats the raw `HTMLElement` as durable identity, and `GameContainer` does not synchronously invalidate tooltip state when the action surface changes. That allows a tooltip session to survive confirm/cancel/undo/turn-change transitions.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/ActionToolbar.tsx` still emits only `actionId`, `HTMLElement`, and optional actor player on hover start. It does not emit stable action-surface identity such as `groupKey` or a container-owned revision.
2. `packages/runner/src/ui/useActionTooltip.ts` is no longer a bespoke timer state machine. It already delegates to the shared `useHoverPopoverSession()` controller, so the shared hover-popover architecture from Spec 60 is partially implemented.
3. `packages/runner/src/ui/ActionTooltip.tsx` already uses `useResolvedFloatingAnchor()` and suppresses render when the anchor is detached or coordinates are unresolved. The old `(0, 0)` fallback rendering problem described in Spec 60 has already been addressed.
4. `packages/runner/src/ui/GameContainer.tsx` still renders `ActionTooltip` based on bottom-bar mode plus tooltip state, but it does not own an explicit action-surface revision or invalidate tooltip state when the rendered action surface is rebuilt.
5. The remaining fix is still runner-only. Action descriptions continue to come from `bridge.describeAction(...)`; no engine/runtime/legal-move/YAML changes are needed.

## Architecture Check

1. Keeping the existing generic `useHoverPopoverSession()` infrastructure is cleaner than replacing it again. The bug is now at the contract boundary between container-owned action-surface lifecycle and action-tooltip source identity.
2. Deriving an explicit action-surface revision in `GameContainer` is cleaner than trying to infer stale state from DOM-node liveness because surface lifecycle is the actual source of truth.
3. Structured source keys keep identity generic and presentation-level; they do not leak game-specific concepts into `GameDef`, kernel, or YAML.
4. The change should remove dependence on raw DOM element identity as tooltip truth, not add another guardrail around the current brittle contract.

## What to Change

### 1. Define structured action hover source keys

Update the action tooltip flow so hover start includes enough identity to detect surface invalidation across renders:

- `playerId`
- `groupKey`
- `actionId`
- `surfaceRevision`

The element reference remains only a positioning aid.

### 2. Derive and own action-surface revision in `GameContainer`

Add an `actionSurfaceRevision` owned by `GameContainer` and tied to the currently rendered action surface. The revision must change whenever the rendered action surface is rebuilt or replaced. At minimum it must invalidate on:

- active player
- action groups
- transition out of `'actions'`
- move confirm
- move cancel
- undo / surface rebuild

`GameContainer` must explicitly invalidate the action tooltip session when the current surface revision no longer matches the hovered source.

### 3. Rewire action tooltip state to use the structured identity contract

Update `useActionTooltip()` and `ActionToolbar` so that:

- hover start passes the structured source key
- stale async description responses are ignored when the source key/revision changes
- grace period cannot keep a tooltip alive after explicit invalidation

Do not replace `useHoverPopoverSession()`; adapt `useActionTooltip()` on top of the existing shared controller.

### 4. Add focused container-level regression coverage

Add tests that simulate the relevant lifecycle edges:

1. hover an action
2. tooltip resolves
3. confirm/cancel/undo/active-player-change/surface transition occurs
4. tooltip is absent immediately until a new live hover starts

Use a mounted jsdom container test (`GameContainer.chrome.test.tsx` or equivalent) for invalidation assertions because the invalidation policy is effect-driven and cannot be verified by the existing static-markup `GameContainer.test.ts`.

## Files to Touch

- `packages/runner/src/ui/ActionToolbar.tsx` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/useActionTooltip.ts` (modify)
- `packages/runner/src/ui/action-tooltip-source-key.ts` (new)
- `packages/runner/test/ui/ActionToolbar.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/useActionTooltip.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify only if current mocked contract changes)

## Out of Scope

- replacing or redesigning `useHoverPopoverSession()`
- changing `ActionTooltip` / `EventCardTooltip` floating-anchor rendering contracts that are already fixed
- migrating event-card tooltips onto a different shared lifecycle architecture
- changing tooltip component content layout or visual styling
- canvas hover controller behavior
- any game-specific `visual-config.yaml`, `GameSpecDoc`, or engine/runtime changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.chrome.test.tsx` verifies action tooltip invalidation on:
   - action-surface transition while staying in `'actions'`
   - move confirm
   - move cancel
   - undo
   - active-player change
   - transition out of `'actions'`
2. `packages/runner/test/ui/useActionTooltip.test.ts` verifies stale async descriptions are ignored when the source key or surface revision changes and that explicit invalidation wins over grace.
3. `packages/runner/test/ui/ActionToolbar.test.ts` verifies hover events now emit structured source metadata with stable group/action identity.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- GameContainer.chrome ActionToolbar useActionTooltip`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Action tooltip visibility is always tied to a live action-surface session, not to the lifetime of a detached DOM node.
2. `GameContainer` owns surface invalidation policy; lower-level tooltip components do not infer game-state transitions on their own.
3. The existing generic hover-popover session controller remains the shared lifecycle primitive.
4. No engine action semantics, legal-move rules, or action-description payload schema are changed.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — verifies lifecycle-driven invalidation at the container boundary where render-model transitions occur.
2. `packages/runner/test/ui/useActionTooltip.test.ts` — verifies request invalidation and grace ordering against the new structured source key contract.
3. `packages/runner/test/ui/ActionToolbar.test.ts` — verifies emitted hover metadata is sufficient to reconstruct stable action identity.
4. `packages/runner/test/ui/GameContainer.test.ts` — updates static render-contract expectations only if the toolbar or tooltip prop contract changes.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer.chrome`
2. `pnpm -F @ludoforge/runner test -- ActionToolbar useActionTooltip`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - `ActionToolbar` now emits a structured action tooltip source key with `playerId`, `groupKey`, `actionId`, and `surfaceRevision`.
  - `useActionTooltip()` now keys tooltip session state off that structured source metadata while continuing to use the shared `useHoverPopoverSession()` controller.
  - `GameContainer` now owns an action-surface revision and explicitly invalidates stale action tooltips when the action surface rebuilds or leaves `'actions'`.
  - Runner tests were updated to cover the new hover contract and container-level invalidation behavior.
- Deviations from original plan:
  - The ticket originally assumed the shared hover-popover controller and safe floating-anchor render gating still needed architectural work. Those pieces were already present, so the implementation stayed narrower and reused the existing architecture rather than replacing it.
  - Container lifecycle invalidation coverage was added in `GameContainer.chrome.test.tsx` instead of the static-markup `GameContainer.test.ts` because the invalidation policy is effect-driven.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- ActionToolbar useActionTooltip GameContainer.chrome`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
