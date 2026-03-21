# 73TOOSTAGUA-004: Remove redundant runtime viewport cast

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/73TOOSTAGUA-003-wire-staleness-guard-into-runtime.md, archive/specs/73-tooltip-staleness-guard.md

## Problem

`game-canvas-runtime.ts` still locally casts `viewportResult.viewport` into a hand-written event-listener shape just to call `on('moved')`, `off('moved')`, and read `moving`.

That cast is redundant and architecturally misleading:

- `ViewportResult.viewport` is already typed as `Viewport` from `pixi-viewport`;
- the installed `pixi-viewport` type already declares `moving?: boolean`;
- `Viewport` already exposes the event methods the runtime uses through its inherited Pixi container surface;
- the local cast falsely suggests that `viewport-setup.ts` is missing a contract when the real problem is that runtime code is bypassing the existing one.

The goal of this ticket is to remove the redundant cast, keep `viewport-setup.ts` as the single setup seam, and align tests with the actual shared type surface.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/canvas/viewport-setup.ts` currently exports `ViewportResult` with `viewport: Viewport`. That typing is already the active contract consumed by downstream runner code.
2. `packages/runner/node_modules/pixi-viewport/dist/Viewport.d.ts` declares `moving?: boolean` on `Viewport`; upstream typing is not missing that property.
3. `game-canvas-runtime.ts` still contains a local cast around `viewportResult.viewport` solely for `'moved'` event subscription and `moving` access. That cast is unnecessary under the current types.
4. `packages/runner/test/canvas/viewport-setup.test.ts` exists, but it currently focuses on viewport setup behavior rather than proving anything about a runner-owned substitute interface.
5. `packages/runner/test/canvas/GameCanvas.test.ts` currently inlines a viewport fixture shape that mirrors the old cast instead of deriving its type from the shared `ViewportResult['viewport']` seam.

## Architecture Check

1. Introducing a second runner-owned viewport interface here would duplicate an existing seam rather than improve it. The runner already owns the setup boundary in `viewport-setup.ts`, and that seam already returns the concrete `Viewport` type it constructs.
2. The clean fix is to remove the ad hoc cast in `game-canvas-runtime.ts` and let the runtime consume `ViewportResult['viewport']` directly.
3. Tests should share the same type source as production code. Where test doubles need only part of the viewport behavior, they should still anchor themselves to `ViewportResult['viewport']` rather than recreating a private shape.
4. This remains aligned with `docs/FOUNDATIONS.md`, especially sections 9 and 10: no compatibility alias, no duplicate abstraction, and fix the real architectural leak instead of adding a parallel contract.
5. A more invasive abstraction would only be justified if multiple runner modules needed a stable local viewport protocol independent of `pixi-viewport`. Current code does not justify that extra layer.

## What to Change

### 1. Remove the redundant runtime cast

In `packages/runner/src/canvas/game-canvas-runtime.ts`:

- Delete the local cast around `viewportResult.viewport`.
- Subscribe to `'moved'` and read `moving` directly from `viewportResult.viewport`.
- Preserve the existing staleness-guard behavior unchanged: publish hover anchor on viewport movement, then clear hover state when `viewport.moving === true`.

### 2. Align tests to the real shared seam

In `packages/runner/test/canvas/GameCanvas.test.ts`:

- Replace the inline viewport fixture type that mirrors the removed cast.
- Type the viewport fixture from `ViewportResult['viewport']` (or a narrowly extended test helper derived from it) so the test follows the same seam as production code.
- Keep the existing hover-anchor and viewport snapshot behavior tests intact.

In `packages/runner/test/canvas/viewport-setup.test.ts`:

- Do not add a second contract assertion layer.
- Add only the minimum regression coverage that helps prove the setup result still exposes the real viewport instance used by the runtime, if that coverage is not already implicit.

## Files to Touch

- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/viewport-setup.test.ts` (modify only if a small regression assertion is needed)

## Out of Scope

- Introducing a new wrapper class or duplicate viewport interface
- Refactoring `coordinate-bridge.ts` or other canvas modules to a new local viewport abstraction
- Changing viewport movement behavior, drag/deceleration semantics, or tooltip staleness logic
- Any engine, schema, or game-definition changes

## Acceptance Criteria

### Tests That Must Pass

1. `GameCanvas.test.ts` passes with the runtime consuming `viewportResult.viewport` directly and without any local runtime viewport cast shape.
2. `viewport-setup.test.ts` continues to pass, with any added assertion limited to the real setup seam.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `game-canvas-runtime.ts` does not define its own viewport contract via local type assertion.
2. `ViewportResult['viewport']` remains the single shared type seam used by runtime code and its tests.
3. No duplicate compatibility interfaces or alias types are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.test.ts` — align the runtime fixture to `ViewportResult['viewport']` and preserve the moved-event / hover-staleness regression coverage.
2. `packages/runner/test/canvas/viewport-setup.test.ts` — only add a minimal assertion if needed to prove the setup seam still returns the real viewport instance used downstream.

### Commands

1. `pnpm -F @ludoforge/runner test -- viewport-setup.test.ts`
2. `pnpm -F @ludoforge/runner test -- GameCanvas.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - corrected the ticket scope before implementation: the right architectural fix was to remove the redundant cast in `game-canvas-runtime.ts`, not introduce a duplicate runner-owned viewport interface
  - removed the local viewport cast in `packages/runner/src/canvas/game-canvas-runtime.ts` and consumed `viewportResult.viewport` directly
  - updated `packages/runner/test/canvas/GameCanvas.test.ts` so the runtime fixture derives from `ViewportResult['viewport']` instead of recreating the removed private shape
  - strengthened `packages/runner/test/canvas/viewport-setup.test.ts` with a minimal regression assertion that `moving` passes through on the real viewport instance returned by setup
- Deviations from original plan:
  - did not add a new viewport contract in `viewport-setup.ts` because current code already exposes the concrete `Viewport` seam and duplicating it would add an unnecessary parallel abstraction
  - no `viewport-setup.ts` production change was needed once the assumptions were corrected
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner test` ✅
