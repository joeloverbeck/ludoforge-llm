# GRANTOOLTIP-003: Expandable per-space breakdown in victory tooltip UI

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only (UI)
**Deps**: GRANTOOLTIP-002

## Problem

Victory tooltip component rows show only aggregate values with no way to inspect which spaces contribute. Players need click-to-expand per-space breakdowns to understand scoring composition and make informed strategic decisions.

## Assumption Reassessment (2026-03-28)

1. `VictoryStandingsBar.tsx` renders tooltip using `createPortal` to `document.body` with custom DOM positioning — verified.
2. Tooltip iterates `breakdown.components` paired with `entry.components` (currently `number[]`, will be `RenderComponentBreakdown[]` after GRANTOOLTIP-002).
3. `getVictoryTooltipBreakdown(seat)` returns `VictoryTooltipComponent[]` with `label`, `description`, and (after GRANTOOLTIP-002) `detailTemplate`.
4. No Floating UI used for victory tooltip — custom positioning via `getBoundingClientRect()`.
5. Tooltip opens on pointer enter, dismisses on pointer leave — expandable rows need the tooltip to stay open during interaction.

## Architecture Check

1. Click-to-expand is local component state (React `useState`) — no store changes needed. Expansion state resets when tooltip closes (pointer leaves the score indicator).
2. Template substitution is a pure function: `(template: string, factors: Record<string, number>, contribution: number) => string`. Can be extracted as a utility and unit tested independently.
3. No game-specific logic in UI code — formatting is driven by visual config templates (Foundation 1, 3).

## What to Change

### 1. Template substitution utility

Create a small utility function (in `packages/runner/src/ui/` or `packages/runner/src/utils/`):

```typescript
export function applyDetailTemplate(
  template: string,
  factors: Readonly<Record<string, number>>,
  contribution: number,
): string
```

Replaces `{key}` tokens with factor values and `{contribution}` with the contribution number. Unknown keys are left as-is.

### 2. Expandable component rows in VictoryStandingsBar.tsx

- Add `expandedIndices: Set<number>` local state (per tooltip open)
- Each component row renders a clickable `▶` (collapsed) or `▼` (expanded) toggle
- Click handler toggles the index in `expandedIndices`
- Reset `expandedIndices` when tooltip target changes (different seat hovered)

### 3. Expanded breakdown section

When a component index is in `expandedIndices`, render below the component row:
- Filter `entry.components[i].spaces` to only spaces with `contribution > 0`
- Sort by `contribution` descending
- Each space line: `{displayName}` + formatted detail from `applyDetailTemplate(detailTemplate, factors, contribution)`
- If no `detailTemplate` in visual config, fallback: `-> {contribution}`
- Summary line at bottom: `(N of M spaces contribute)` where M is total spaces count (before zero-filtering)

### 4. CSS styling

- Indented breakdown list (left padding or margin)
- Smaller/dimmer font for space detail lines
- Subtle separator or background difference for the breakdown section
- Toggle indicator styled as interactive (cursor pointer)
- Smooth height transition for expand/collapse (optional, CSS `max-height` transition)

### 5. Tooltip interaction fix

Currently tooltip dismisses on pointer leave of the score indicator. With interactive content inside the tooltip, ensure:
- Tooltip stays open when pointer moves from indicator into tooltip body
- Tooltip dismisses when pointer leaves both indicator and tooltip body
- This may require tracking pointer position relative to both elements

## Files to Touch

- `packages/runner/src/ui/VictoryStandingsBar.tsx` (modify)
- `packages/runner/src/ui/VictoryStandingsBar.module.css` (modify — add expandable row styles)
- `packages/runner/src/utils/apply-detail-template.ts` (new — template substitution utility)
- `packages/runner/test/utils/apply-detail-template.test.ts` (new — template utility tests)
- `packages/runner/test/ui/VictoryStandingsBar.test.tsx` (modify — expand/collapse interaction tests)

## Out of Scope

- Kernel breakdown computation (GRANTOOLTIP-001)
- Runner model and visual config changes (GRANTOOLTIP-002)
- Accessibility (screen reader announcements for expanded content) — can be a follow-up
- Keyboard navigation for expand/collapse — can be a follow-up
- Animation/transition polish — keep expand/collapse instant for now

## Acceptance Criteria

### Tests That Must Pass

1. `applyDetailTemplate` correctly substitutes factor keys and `{contribution}`
2. `applyDetailTemplate` handles missing keys gracefully (leaves `{unknown}` as-is)
3. Component row click toggles expanded state
4. Expanded section shows only non-zero contributing spaces
5. Spaces are sorted by contribution descending
6. Summary line shows correct N/M counts
7. Tooltip remains open when interacting with expanded content
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No game-specific identifiers in UI component code (Foundation 1)
2. All formatting driven by visual config templates (Foundation 3)
3. Expansion state is local to component — no global store pollution

## Test Plan

### New/Modified Tests

1. `packages/runner/test/utils/apply-detail-template.test.ts` — template substitution with various factor combinations, missing keys, contribution-only templates
2. `packages/runner/test/ui/VictoryStandingsBar.test.tsx` — expand/collapse toggle, zero filtering, sort order, summary line content

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
