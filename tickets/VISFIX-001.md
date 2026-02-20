# VISFIX-001: CSS Reset — Fix Scrollbar Overflow

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The runner page shows browser-default scrollbars and layout overflow because `html`, `body`, and `#root` lack a CSS reset. This causes a visible scrollbar artifact in the browser runner and prevents the canvas from filling the viewport cleanly.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/tokens.css` exists and defines `:root` CSS custom properties but does NOT include any global reset rules for `html`, `body`, or `#root`.
2. No other global CSS file in the runner provides a reset (Vite default entry is `main.tsx` which imports `tokens.css`).
3. No mismatch — the fix adds reset rules that are currently absent.

## Architecture Check

1. A minimal CSS reset at the top of the existing `tokens.css` is the simplest approach — no new files, no build changes. Alternative (a separate `reset.css`) adds unnecessary file count for 4 lines of CSS.
2. This is purely a runner presentation concern — no engine, GameSpecDoc, or GameDef boundaries are affected.
3. No backwards-compatibility shims — additive CSS only.

## What to Change

### 1. Add global reset rules to `tokens.css`

Add the following rule block **before** the `:root` block in `packages/runner/src/ui/tokens.css`:

```css
html, body, #root {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  height: 100%;
}
```

## Files to Touch

- `packages/runner/src/ui/tokens.css` (modify)

## Out of Scope

- General CSS architecture refactoring
- Adding a CSS framework or normalize.css
- Responsive breakpoints or mobile layout

## Acceptance Criteria

### Tests That Must Pass

1. Visual inspection: no scrollbars appear when the runner loads at any viewport size
2. Canvas fills the full viewport without clipping or overflow
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No existing component layout is broken by the reset
2. `:root` custom properties remain unchanged

## Test Plan

### New/Modified Tests

1. No new automated tests required — this is a CSS-only change best validated visually

### Commands

1. `pnpm -F @ludoforge/runner dev` — visual inspection
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
