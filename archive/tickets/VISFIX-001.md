# VISFIX-001: CSS Reset — Fix Scrollbar Overflow

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The runner shows browser-default scrollbars around canvas screens because `body` keeps its default margin while `GameContainer` uses `100vw/100vh`. That margin creates viewport overflow and visible scrollbar artifacts.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/tokens.css` exists, defines `:root` tokens, and currently has no global root reset rules.
2. `packages/runner/src/main.tsx` imports only `./ui/tokens.css`; no other global reset is loaded.
3. The original proposal to set `overflow: hidden` on `html/body/#root` is too broad for current architecture: `GameSelectionScreen` is document-flow content and may need page scrolling when lists grow.
4. The root cause for the scrollbar artifact is default `body` margin against `100vw/100vh` canvas layout, not missing global overflow suppression.

## Architecture Check

1. Keep the fix in existing `tokens.css` (single global stylesheet import, no build/runtime indirection).
2. Use a narrow root reset (`margin: 0`, full-height root chain) instead of global overflow suppression. This resolves canvas overflow while preserving scroll behavior on non-canvas screens.
3. Add a small CSS contract test to prevent regressions in this reset behavior.
4. This is purely a runner presentation concern — no engine, GameSpecDoc, or GameDef boundaries are affected.
5. No backwards-compatibility shims — additive CSS only.

## What to Change

### 1. Add global reset rules to `tokens.css`

Add the following rule block **before** the `:root` block in `packages/runner/src/ui/tokens.css`:

```css
html, body, #root {
  margin: 0;
  width: 100%;
  height: 100%;
}

*, *::before, *::after {
  box-sizing: border-box;
}
```

### 2. Strengthen CSS regression coverage

Update `packages/runner/test/ui/tokens.test.ts` to assert the global reset contract directly from source CSS:
1. root selector block exists and includes `margin: 0`, `width: 100%`, `height: 100%`
2. root selector block does not include `overflow: hidden`
3. global `box-sizing: border-box` selector exists

## Files to Touch

- `packages/runner/src/ui/tokens.css` (modify)
- `packages/runner/test/ui/tokens.test.ts` (modify)

## Out of Scope

- General CSS architecture refactoring
- Adding a CSS framework or normalize.css
- Responsive breakpoints or mobile layout
- Reworking existing screen containers from `100vh/100vw` to alternative layout primitives

## Acceptance Criteria

### Tests That Must Pass

1. Visual inspection: no scrollbars appear when the runner loads at any viewport size
2. Canvas fills the full viewport without clipping or overflow
3. Non-canvas screens (for example game selection) still allow page scroll when content exceeds viewport
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No existing component layout is broken by the reset
2. `:root` custom properties remain unchanged

## Test Plan

### New/Modified Tests

1. Modify `packages/runner/test/ui/tokens.test.ts` to validate reset contract and guard against accidental global overflow suppression

### Commands

1. `pnpm -F @ludoforge/runner dev` — visual inspection
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Actually changed:
  - Added a narrow global reset in `packages/runner/src/ui/tokens.css` for `html, body, #root` (`margin: 0`, full-height/width chain).
  - Added global `box-sizing: border-box` contract via `*, *::before, *::after`.
  - Strengthened `packages/runner/test/ui/tokens.test.ts` to assert reset presence and explicitly guard against root-level `overflow: hidden`.
- Deviations from original plan:
  - Did not implement `overflow: hidden` on `html/body/#root`; this was intentionally rejected as architecturally too broad because it can block legitimate scrolling on non-canvas screens.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
