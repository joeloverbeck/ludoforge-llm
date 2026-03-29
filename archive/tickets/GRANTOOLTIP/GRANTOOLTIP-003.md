# GRANTOOLTIP-003: Expandable per-space breakdown in victory tooltip UI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only (UI)
**Deps**: GRANTOOLTIP-002

## Problem

Victory tooltip component rows still show only aggregate values with no way to inspect which spaces contribute. Players need click-to-expand per-space breakdowns to understand scoring composition and make informed strategic decisions.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/src/ui/VictoryStandingsBar.tsx` renders the tooltip via `createPortal` into `document.body` with custom `getBoundingClientRect()` positioning.
2. Runner victory standings already carry full per-component / per-space breakdowns. `RenderVictoryStandingEntry.components` is already `readonly RenderComponentBreakdown[]`; the ticket must not assume legacy `number[]` data.
3. `packages/runner/src/config/visual-config-provider.ts` already exposes `getVictoryTooltipBreakdown(seat)`, and `VictoryTooltipComponent` already supports optional `detailTemplate`.
4. FITL visual config already defines `victoryStandings.tooltipBreakdowns[*].components[*].detailTemplate`; this ticket does not need schema or game-data work.
5. The current gap is UI-only: expandable rows, per-space rendering, and keeping the tooltip open while moving from the score entry into interactive tooltip content.
6. There is currently no focused `packages/runner/test/ui/VictoryStandingsBar.test.tsx`; the existing coverage is in model/config tests, not tooltip interaction tests.

## Architecture Check

1. The proposed change remains beneficial, but only as a runner UI enhancement. The data/model architecture already provides the right generic inputs, so adding new runner-model or engine work would be architectural drift.
2. Expansion state should stay local to the tooltip UI. It should reset when the tooltip closes or a different seat becomes active; no store changes are warranted.
3. `applyDetailTemplate` is a good extraction because it keeps formatting pure, generic, and independently testable.
4. The current visual-config-to-runtime pairing is index-based. That is acceptable here, but the UI should degrade predictably if metadata and runtime component counts differ instead of emitting placeholder noise or relying on perfect parity.
5. No game-specific identifiers or rules logic should be added to UI code; labels, descriptions, and templates stay driven by visual config (Foundations 1 and 3).

## What to Change

### 1. Template substitution utility

Create a small utility function in `packages/runner/src/utils/`:

```typescript
export function applyDetailTemplate(
  template: string,
  factors: Readonly<Record<string, number>>,
  contribution: number,
): string
```

Replaces `{key}` tokens with factor values and `{contribution}` with the contribution number. Unknown keys are left as-is.

### 2. Expandable component rows in `VictoryStandingsBar.tsx`

- Add local expansion state for the active tooltip.
- Render a toggle control (`▶` / `▼`) for rows that have space breakdown data.
- Toggle expansion by component index.
- Reset expansion state when the tooltip closes or a different seat is hovered.
- Render available rows predictably even if visual metadata and runtime component counts are not perfectly aligned.

### 3. Expanded breakdown section

When a component index is expanded:

- Filter `entry.components[i].spaces` to only spaces with `contribution > 0`.
- Sort contributing spaces by `contribution` descending.
- Render each space line as `{displayName}` plus formatted detail from `applyDetailTemplate(detailTemplate, factors, contribution)`.
- If no `detailTemplate` is configured, fall back to a simple contribution-only string.
- Render a summary line: `(N of M spaces contribute)`, where `M` is the total number of spaces before zero filtering.

### 4. CSS styling

- Add an indented breakdown block.
- Use smaller/dimmer typography for space detail lines and summary text.
- Make the toggle visibly interactive.
- Keep the styling minimal and consistent with the existing tooltip.

### 5. Tooltip interaction fix

Make the tooltip interactive without introducing timer-driven behavior:

- Tooltip stays open when the pointer moves from the score entry into the tooltip body.
- Tooltip dismisses when the pointer leaves both the active score entry and the tooltip body.
- Prefer explicit anchor/tooltip hover coordination over global listeners or close delays.

## Files to Touch

- `packages/runner/src/ui/VictoryStandingsBar.tsx` (modify)
- `packages/runner/src/ui/VictoryStandingsBar.module.css` (modify)
- `packages/runner/src/utils/apply-detail-template.ts` (new)
- `packages/runner/test/utils/apply-detail-template.test.ts` (new)
- `packages/runner/test/ui/VictoryStandingsBar.test.tsx` (new)

## Out of Scope

- Kernel breakdown computation
- Runner/model/schema work already completed by prior tickets
- Accessibility announcements for expanded content
- Keyboard navigation for expand/collapse
- Animation polish beyond straightforward UI feedback

## Acceptance Criteria

### Tests That Must Pass

1. `applyDetailTemplate` substitutes factor keys and `{contribution}` correctly.
2. `applyDetailTemplate` leaves unknown keys unchanged.
3. Component row click toggles expanded state.
4. Expanded section shows only non-zero contributing spaces.
5. Expanded space rows are sorted by contribution descending.
6. Summary line shows correct `N / M` counts.
7. Tooltip remains open while interacting with expanded content.
8. `pnpm -F @ludoforge/runner test`
9. `pnpm turbo test`
10. `pnpm turbo lint`
11. `pnpm turbo typecheck`

### Invariants

1. No game-specific identifiers in UI component code (Foundation 1).
2. All formatting remains driven by visual config templates (Foundation 3).
3. Expansion state remains local to the UI component.
4. Ticket scope remains runner-only unless code inspection reveals a real architectural defect outside the UI.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/utils/apply-detail-template.test.ts` — token substitution, `{contribution}`, missing-key behavior, and contribution-only fallback inputs.
2. `packages/runner/test/ui/VictoryStandingsBar.test.tsx` — expand/collapse toggle, zero filtering, descending sort, summary line, and pointer movement between entry and tooltip.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Added `packages/runner/src/utils/apply-detail-template.ts` for pure tooltip detail formatting.
  - Updated `packages/runner/src/ui/VictoryStandingsBar.tsx` to support expandable per-component breakdowns, contribution filtering/sorting, contribution summaries, and interactive tooltip hover handoff between the score entry and tooltip body.
  - Updated `packages/runner/src/ui/VictoryStandingsBar.module.css` with minimal expansion and interactive tooltip styling.
  - Added focused regression coverage in `packages/runner/test/ui/VictoryStandingsBar.test.tsx` and `packages/runner/test/utils/apply-detail-template.test.ts`.
- Deviations from original plan:
  - No runner-model, schema, or visual-config data work was needed; those assumptions were stale and were corrected in the ticket before implementation.
  - Tooltip interaction was implemented with explicit anchor/tooltip hover coordination and a contiguous interactive root, not timer-based close delays.
  - Runtime/config mismatch handling now falls back to generic component labels instead of assuming perfect index parity.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
