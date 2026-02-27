# ACTTOOLTIP-003: Harden action tooltip horizontal overflow behavior

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`ActionTooltip.module.css` constrains width/height and enables `overflow-y: auto`, but it does not set horizontal overflow or long-token wrapping. For pathological inline content (for example, very long unbroken identifiers), this can cause horizontal overflow behavior that is brittle across browsers.

The tooltip should preserve a stable box model (never introduce horizontal scrolling) while still preferring readable wrapped content over clipping.

## Assumption Reassessment (2026-02-27)

1. `.tooltip` currently has `overflow-y: auto` and no explicit `overflow-x` — confirmed at `packages/runner/src/ui/ActionTooltip.module.css:6`.
2. `.line` uses `display: flex` + `flex-wrap: wrap` — confirmed at `packages/runner/src/ui/ActionTooltip.module.css:34-35`.
3. Inline nodes render as `<span>` text fragments in `ActionTooltip.tsx` (`renderInlineNode`) — confirmed at `packages/runner/src/ui/ActionTooltip.tsx:37-42`.
4. Current tests already include CSS contract assertions by reading stylesheet text (for `pointer-events: auto`) in `packages/runner/test/ui/ActionTooltip.test.ts:267-274`.

## Architecture Reassessment

1. `overflow-x: hidden` is necessary as a hard guardrail against horizontal scrollbar regressions.
2. `overflow-x: hidden` alone can clip important content when a single token is unbreakable; that is robust for layout but weaker for readability.
3. A cleaner long-term contract is:
   - prevent horizontal scrolling (`overflow-x: hidden`), and
   - proactively allow aggressive line-breaking for inline spans (`overflow-wrap: anywhere`).

This keeps tooltip layout deterministic and improves resilience for future, game-agnostic display payloads without engine-level special-casing.

## Scope

### 1. Tooltip CSS hardening

In `packages/runner/src/ui/ActionTooltip.module.css`:
1. Add `overflow-x: hidden;` to `.tooltip`.
2. Add an inline-node wrapping rule under `.line` children to ensure long unbroken tokens can wrap (for example `.line > span { overflow-wrap: anywhere; }`).

### 2. Test hardening

In `packages/runner/test/ui/ActionTooltip.test.ts`:
1. Add CSS contract assertions for `overflow-x: hidden;` in `.tooltip`.
2. Add CSS contract assertions for the long-token wrapping rule in `.line > span`.

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.module.css` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify)

## Out of Scope

- Reworking tooltip layout architecture (`display: flex`/indent model)
- Non-tooltip UI styling changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner test`

### Invariants

1. Tooltip never exposes horizontal scrolling.
2. Tooltip still supports vertical scrolling when content exceeds `max-height`.
3. Long unbroken inline tokens are allowed to wrap instead of forcing overflow.

## Test Plan

### New/Modified Tests

1. Extend `ActionTooltip.test.ts` CSS contract coverage to include horizontal overflow and long-token wrapping declarations.

### Commands

1. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-27
- What changed:
  - Added `overflow-x: hidden;` to `.tooltip` in `ActionTooltip.module.css`.
  - Added `.line > span { overflow-wrap: anywhere; }` to allow wrapping of long unbroken inline tokens.
  - Extended `ActionTooltip.test.ts` with CSS contract assertions for both declarations.
- Deviations from original plan:
  - The original plan proposed only `overflow-x: hidden` and no test updates.
  - Reassessment expanded scope to include long-token wrapping and explicit test hardening.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
