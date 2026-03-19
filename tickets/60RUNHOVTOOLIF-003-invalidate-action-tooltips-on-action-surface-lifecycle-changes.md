# 60RUNHOVTOOLIF-003: Invalidate action tooltips on action-surface lifecycle changes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`, `archive/tickets/60RUNHOVTOOLIF/60RUNHOVTOOLIF-001-add-shared-hover-popover-session-controller.md`, `tickets/60RUNHOVTOOLIF-002-centralize-floating-anchor-resolution-and-safe-render-gating.md`

## Problem

The actual stale-tooltip bug occurs because action tooltip lifetime is not bound to the lifetime of the action surface that created it. `ActionToolbar` currently emits only `(actionId, element, actorPlayer?)`, `useActionTooltip()` treats the raw `HTMLElement` as durable identity, and `GameContainer` does not synchronously invalidate tooltip state when the action surface changes. That allows a tooltip session to survive confirm/cancel/undo/turn-change transitions.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/ActionToolbar.tsx` currently emits only `actionId`, `HTMLElement`, and optional actor player on hover start.
2. `packages/runner/src/ui/GameContainer.tsx` currently renders `ActionTooltip` whenever bottom-bar mode is `'actions'` and tooltip state still contains `description` plus `anchorElement`; there is no explicit action-surface revision invalidation.
3. The fix belongs in runner UI lifecycle/wiring only; the action descriptions themselves still come from `bridge.describeAction(...)` and no engine move legality or game rules change is needed.

## Architecture Check

1. Deriving an explicit action-surface revision in `GameContainer` is cleaner than trying to infer stale state from DOM-node liveness because surface lifecycle is the actual source of truth.
2. Structured source keys keep identity generic and presentation-level; they do not leak game-specific concepts into `GameDef`, kernel, or YAML.
3. The change should remove dependence on raw DOM element identity as tooltip truth, not add another guardrail around the current brittle contract.

## What to Change

### 1. Define structured action hover source keys

Update the action tooltip flow so hover start includes enough identity to detect surface invalidation across renders:

- `playerId`
- `groupKey`
- `actionId`
- `surfaceRevision`

The element reference remains only a positioning aid.

### 2. Derive and own action-surface revision in `GameContainer`

Add an `actionSurfaceRevision` derived from the current render model and bottom-bar action surface. The revision must change whenever any of the following changes the rendered action surface:

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

### 4. Add focused container-level regression coverage

Add tests that simulate the relevant lifecycle edges:

1. hover an action
2. tooltip resolves
3. confirm/cancel/undo/active-player-change/surface transition occurs
4. tooltip is absent immediately until a new live hover starts

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

- migrating event-card tooltips onto the shared lifecycle architecture
- changing tooltip component content layout or visual styling
- canvas hover controller behavior
- any game-specific `visual-config.yaml`, `GameSpecDoc`, or engine/runtime changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.test.ts` verifies action tooltip invalidation on:
   - action-surface transition while staying in `'actions'`
   - move confirm
   - move cancel
   - undo
   - active-player change
   - transition out of `'actions'`
2. `packages/runner/test/ui/useActionTooltip.test.ts` verifies stale async descriptions are ignored when the source key or surface revision changes.
3. `packages/runner/test/ui/ActionToolbar.test.ts` verifies hover events now emit structured source metadata with stable group/action identity.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- GameContainer ActionToolbar useActionTooltip`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Action tooltip visibility is always tied to a live action-surface session, not to the lifetime of a detached DOM node.
2. `GameContainer` owns surface invalidation policy; lower-level tooltip components do not infer game-state transitions on their own.
3. No engine action semantics, legal-move rules, or action-description payload schema are changed.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — verifies lifecycle-driven invalidation at the container boundary where render-model transitions occur.
2. `packages/runner/test/ui/useActionTooltip.test.ts` — verifies request invalidation and grace ordering against the new source key contract.
3. `packages/runner/test/ui/ActionToolbar.test.ts` — verifies emitted hover metadata is sufficient to reconstruct stable action identity.
4. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — updates mocks only if the container wiring contract changes.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner test -- ActionToolbar useActionTooltip`
3. `pnpm -F @ludoforge/runner test`
