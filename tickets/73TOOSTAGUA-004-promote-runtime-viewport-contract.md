# 73TOOSTAGUA-004: Promote runtime viewport contract into viewport-setup

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/73TOOSTAGUA-003-wire-staleness-guard-into-runtime.md, archive/specs/73-tooltip-staleness-guard.md

## Problem

`game-canvas-runtime.ts` currently narrows `viewportResult.viewport` to an ad hoc object shape just to get typed `on('moved')` / `off('moved')` access. That local narrowing also forces the runtime to bolt `moving?: boolean` back onto the same cast even though the underlying `pixi-viewport` type already exposes `moving`.

This is a small but real architectural leak:

- the runtime is depending on a third-party object through an unowned, call-site-specific cast;
- the subset of viewport behavior the runner actually relies on is not expressed in the runner's own seam;
- tests have to mirror the cast instead of a stable local contract.

The goal of this ticket is to move that contract into `viewport-setup.ts`, where the runner already owns the viewport wrapper boundary.

## Assumption Reassessment (2026-03-21)

1. `pixi-viewport`'s `Viewport` type already declares `moving?: boolean` in `packages/runner/node_modules/pixi-viewport/dist/Viewport.d.ts`; the problem is not missing upstream typing.
2. `packages/runner/src/canvas/viewport-setup.ts` currently exports `ViewportResult` with `viewport: Viewport`, but `game-canvas-runtime.ts` still adds a local cast to regain a smaller event-friendly shape.
3. `packages/runner/test/canvas/viewport-setup.test.ts` already exists and is the correct place to prove the wrapper exports the runner-owned contract.
4. `packages/runner/test/canvas/GameCanvas.test.ts` currently mirrors the runtime's cast by manually adding `moving?: boolean` to the fixture viewport shape. That test seam should instead follow the contract exported by `viewport-setup.ts`.
5. No active ticket currently owns this cleanup. The prior ticket fixed the runtime wiring correctly but left this cast in place as a follow-up architectural refinement.

## Architecture Check

1. The clean boundary is `viewport-setup.ts`: it is already the runner-owned adapter around `pixi-viewport`, so the runner's viewport contract belongs there, not in a one-off cast inside the runtime.
2. Exposing a focused runner-local viewport interface is cleaner than leaking the full third-party `Viewport` surface through unrelated consumers. It narrows dependencies while preserving the exact runtime features the runner actually uses.
3. This stays fully within the runner and does not touch GameSpecDoc, GameDef, compiler, kernel, or simulation boundaries, which keeps alignment with `docs/FOUNDATIONS.md` sections 1, 4, 8, and 10.
4. No backwards-compatibility aliases or duplicate interfaces should be introduced. The old ad hoc runtime cast should be removed, not preserved beside the new contract.

## What to Change

### 1. Define a runner-owned runtime viewport interface

In `packages/runner/src/canvas/viewport-setup.ts`:

- Add a focused exported interface for the viewport surface the runner uses, for example:
  - position (`x`, `y`)
  - scale (`scale.x`, `scale.y`)
  - motion state (`moving?: boolean`)
  - moved-event subscription methods (`on` / `off` for `'moved'`)
- Update `ViewportResult` so `viewport` is typed as that runner-owned interface instead of exposing the raw `Viewport` type to downstream runtime code.
- Keep `setupViewport()` free to instantiate and return the real `Viewport`; the new interface is a structural contract, not a wrapper class.

### 2. Remove the ad hoc cast from game-canvas-runtime

In `packages/runner/src/canvas/game-canvas-runtime.ts`:

- Delete the current local cast that rebuilds an event-listener shape and re-adds `moving?: boolean`.
- Consume `viewportResult.viewport` directly through the contract exported by `viewport-setup.ts`.
- Preserve the existing staleness-guard behavior unchanged: publish hover anchor on `'moved'`, then clear hover state when `viewport.moving === true`.

### 3. Align tests to the owned contract

In `packages/runner/test/canvas/viewport-setup.test.ts`:

- Add or strengthen assertions that the returned `viewport` contract supports the runtime-required surface, especially `moving` passthrough and `'moved'` event subscription availability.

In `packages/runner/test/canvas/GameCanvas.test.ts`:

- Update the fixture typing so it conforms to the viewport contract exported by `viewport-setup.ts`, rather than reproducing a private cast shape inline.
- Keep the existing runtime behavior tests passing without changing their behavioral intent.

## Files to Touch

- `packages/runner/src/canvas/viewport-setup.ts` (modify)
- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/viewport-setup.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)

## Out of Scope

- Changing viewport behavior, drag/deceleration semantics, or the tooltip staleness logic itself
- Introducing a new wrapper class around `pixi-viewport`
- Refactoring other canvas consumers unless they need minimal type updates to compile
- Any engine, schema, or game-definition changes

## Acceptance Criteria

### Tests That Must Pass

1. `viewport-setup.test.ts` proves the exported viewport contract includes the runtime-required surface (`moving`, `on('moved')`, `off('moved')`, transform state)
2. `GameCanvas.test.ts` passes without any local viewport cast shape defined just for runtime wiring
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `game-canvas-runtime.ts` does not define its own viewport contract via local type assertion; it consumes the contract exported by `viewport-setup.ts`
2. `viewport-setup.ts` remains the single runner-owned seam for third-party viewport typing
3. No duplicate compatibility interfaces or alias types remain after the cleanup

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/viewport-setup.test.ts` — prove the wrapper exports the runtime-required viewport surface from the owned seam
2. `packages/runner/test/canvas/GameCanvas.test.ts` — keep runtime hover/viewport tests aligned to the shared viewport contract instead of a private cast

### Commands

1. `pnpm -F @ludoforge/runner test -- viewport-setup.test.ts`
2. `pnpm -F @ludoforge/runner test -- GameCanvas.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`
