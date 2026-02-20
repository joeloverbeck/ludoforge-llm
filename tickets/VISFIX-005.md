# VISFIX-005: Stack Visuals for Hidden Zones (Deck, Burn, Muck)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: VISFIX-002 (badge removal avoids duplicate count display)

## Problem

Hidden zones (deck, burn, muck) in Texas Hold'em show as empty rectangles with no visual indication of how many cards they contain. Players cannot tell at a glance whether the deck is full, nearly empty, or how many cards have been burned/mucked. A stack visual — 3–5 offset face-down card shapes with a count badge — provides an intuitive representation of hidden card piles.

## Assumption Reassessment (2026-02-20)

1. `RenderZone` already has `hiddenTokenCount: number` (render-model.ts:39) which is populated by `derive-render-model.ts` for zones with `visibility: 'hidden'` or `'owner'`.
2. `canvas-equality.ts` implements shallow-equality checks for render model diffing — any new fields on `RenderZone` must be included.
3. `canvas-updater.ts` orchestrates zone/token/adjacency rendering updates and would need to invoke the stack renderer for zones with hidden tokens.
4. `GameCanvas.tsx` creates renderer instances and wires them into the update cycle.
5. VISFIX-002 removes the zone-level token count badge, so the stack renderer's own count badge is the sole source of count information for hidden zones.

## Architecture Check

1. A dedicated `stack-renderer.ts` is cleaner than extending `zone-renderer.ts` — zone rendering is already complex, and stack visuals have distinct lifecycle (create/destroy offset card shapes based on count). Separation of concerns is maintained.
2. The render model already provides `hiddenTokenCount` — no engine or GameSpecDoc changes needed. The stack renderer is purely a canvas presentation layer addition.
3. No backwards-compatibility shims — new renderer activates only when `hiddenTokenCount > 0`.

## What to Change

### 1. Add `hiddenTokenShape` to RenderZone (optional enhancement)

In `packages/runner/src/model/render-model.ts`, consider adding an optional `hiddenTokenShape` field to `RenderZone` if the stack renderer needs shape hints (e.g. card vs generic token). If the stack renderer can infer shape from zone metadata or visual config, this may be unnecessary — evaluate during implementation.

### 2. Create stack-renderer.ts

New file: `packages/runner/src/canvas/renderers/stack-renderer.ts`

Responsibilities:
- Accept a `RenderZone` with `hiddenTokenCount > 0`
- Render 3–5 offset rectangles (face-down card shapes) using PixiJS Graphics
- Apply slight rotation and offset to each successive shape for a stacked look
- Show a count badge (small text) displaying the total hidden token count
- Clamp displayed shapes to `min(hiddenTokenCount, 5)` — don't render 52 individual shapes
- Use the same face-down card color scheme as `MiniCard.module.css` `.cardBack`

### 3. Update canvas-equality.ts

In `packages/runner/src/canvas/canvas-equality.ts`, ensure `hiddenTokenCount` is included in zone equality checks (it likely already is if using shallow comparison on `RenderZone`, but verify).

### 4. Update canvas-updater.ts

In `packages/runner/src/canvas/canvas-updater.ts`:
- Import and invoke the stack renderer for zones where `hiddenTokenCount > 0`
- Position the stack visual centered within the zone bounds
- Destroy/recreate stack visuals when `hiddenTokenCount` changes

### 5. Wire into GameCanvas.tsx

In `packages/runner/src/canvas/GameCanvas.tsx`:
- Instantiate the stack renderer alongside zone/token renderers
- Pass it into the canvas updater lifecycle

## Files to Touch

- `packages/runner/src/canvas/renderers/stack-renderer.ts` (new)
- `packages/runner/src/model/render-model.ts` (modify — if `hiddenTokenShape` is added)
- `packages/runner/src/model/derive-render-model.ts` (modify — if computing `hiddenTokenShape`)
- `packages/runner/src/canvas/canvas-equality.ts` (modify — verify/add equality check)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)

## Out of Scope

- Animating card movement into/out of the stack (future animation work)
- Face-up stack rendering (e.g. discard pile showing top card)
- Making stack count position configurable via visual config
- Stack visuals for non-card games

## Acceptance Criteria

### Tests That Must Pass

1. Zones with `hiddenTokenCount > 0` display a stack of 3–5 offset face-down card shapes
2. A count badge shows the total hidden token count (e.g. "48")
3. Zones with `hiddenTokenCount === 0` do not display any stack visual
4. Stack visual updates correctly when `hiddenTokenCount` changes (cards dealt, burned, etc.)
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Stack renderer does not modify the render model — it is a pure view layer
2. No engine/kernel/GameSpecDoc changes required
3. Zone renderer continues to handle all non-stack zone visuals unchanged

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/stack-renderer.test.ts` — unit tests for stack shape creation, count badge, clamping at 5 shapes, zero-count behavior
2. `packages/runner/test/canvas/canvas-updater.test.ts` — verify stack renderer is invoked for zones with hidden tokens

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
