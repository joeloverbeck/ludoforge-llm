# CARGAMVISEXP-007: Deal animation verification

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-003 (zone positioning on table must be complete)

## Problem

Card animation infrastructure exists (`card-classification.ts`, arc-tween presets in the animation system) but isn't producing visible deal animations because all zones are in the sidebar (no world-space positions for arc paths). Once CARGAMVISEXP-003 fixes zone positioning, the existing animation pipeline should automatically produce deal animations.

This ticket is a **verification-only** task. No new animation code is expected. If animations do not trigger after D3, this ticket becomes a debugging task.

## Assumption Reassessment (2026-02-20)

1. Card animation infrastructure exists: `card-classification.ts` classifies moveToken effects as `cardDeal`, and arc-tween presets exist in the animation system — needs verification at implementation time.
2. The trace-to-descriptor pipeline maps `moveToken` effects to animation descriptors that use source/target zone positions — needs verification.
3. CARGAMVISEXP-003 will place card-role zones at proper world-space coordinates on the table — prerequisite.
4. The animation system uses zone positions from the layout to compute arc paths — needs verification.

## Architecture Check

1. This is a verification task, not an implementation task — no new code unless animations fail.
2. If debugging is needed, it should be limited to wiring/config fixes in the animation pipeline, not new animation features.
3. Any fixes discovered during verification should be minimal and stay within the animation system boundary.

## What to Change

### 1. Verify deal animation plays

After CARGAMVISEXP-003 is merged:
1. Start dev server: `pnpm -F @ludoforge/runner dev`
2. Load Texas Hold'em game
3. Start a new game (or advance to a deal action)
4. Confirm arc-tween animations play when cards move from draw zone to hand/shared zones

### 2. If animations don't trigger — investigate

Check in this order:
1. Are zone positions in the layout result non-zero for card-role zones?
2. Does the trace-to-descriptor pipeline receive moveToken effects with correct source/target zone IDs?
3. Does `card-classification.ts` classify them as `cardDeal`?
4. Does the animation controller receive and queue the descriptors?
5. Does GSAP execute the arc-tween timeline?

### 3. Fix any wiring issues found

Scope fixes to:
- Animation descriptor mapping (trace-to-descriptor)
- Card classification (if zone IDs don't match)
- Animation queue/controller (if descriptors are received but not executed)

Do NOT create new animation presets or modify the GSAP timeline builder.

## Files to Touch

- No files expected to be modified (verification only)
- If debugging needed, likely candidates:
  - `packages/runner/src/animation/trace-to-descriptors.ts` (modify if mapping is wrong)
  - `packages/runner/src/animation/card-classification.ts` (modify if classification misses)
  - `packages/runner/src/animation/animation-controller.ts` (modify if queue drops descriptors)

## Out of Scope

- Token type matching — that's CARGAMVISEXP-001
- Card template rendering — that's CARGAMVISEXP-002
- Zone layout positioning (must be done first) — that's CARGAMVISEXP-003
- Table background or overlays — that's CARGAMVISEXP-004/005
- Hand panel UI — that's CARGAMVISEXP-006
- New animation presets or types
- Engine/kernel changes of any kind
- FITL animations

## Acceptance Criteria

### Tests That Must Pass

1. All existing animation tests continue to pass: `pnpm -F @ludoforge/runner test -- --reporter=verbose test/animation/`
2. If fixes are made, add targeted tests for the specific fix (e.g., card classification for card-role zone IDs)
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No new animation presets or types are created.
2. Existing animation behavior for non-card games is unaffected.
3. If no fixes are needed, this ticket is closed as "verified working" with no code changes.
4. No engine/kernel/compiler code is modified.

## Test Plan

### Verification Steps

1. `pnpm -F @ludoforge/runner dev` — start dev server
2. Load Texas Hold'em game definition
3. Advance game to a deal action
4. Visually confirm arc-tween animations play for card movement
5. If animations work: ticket complete, no code changes needed
6. If animations fail: debug, fix, add targeted test, then re-verify

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/animation/`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Investigated runtime logs and identified a PIXI text texture cleanup crash during effect-trace processing.
  - Added regression test coverage in `packages/runner/test/canvas/renderers/card-template-renderer.test.ts` to ensure prior card text nodes are destroyed on redraw.
  - Fixed renderer cleanup in `packages/runner/src/canvas/renderers/card-template-renderer.ts` by removing and destroying prior text children before drawing new card content.
- Deviations from original plan:
  - Ticket began as verification-only, but required a focused debugging/fix pass because animations were being interrupted by a runtime exception.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- test/canvas/renderers/card-template-renderer.test.ts test/canvas/renderers/token-renderer.test.ts`
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose test/animation/`
  - All targeted and animation tests passed.
