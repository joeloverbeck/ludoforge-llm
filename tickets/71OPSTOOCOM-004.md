# 71OPSTOOCOM-004: Add companion actions section to `ActionTooltip` component

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/71OPSTOOCOM/71OPSTOOCOM-002.md`

Dependency note: needs `RenderAction` available for the tooltip companion prop shape.

## Problem

`ActionTooltip` currently renders only the operation description. When a user hovers over an action in a synthesized group (e.g., "Operation + Special Activity"), there is no visual indication of the companion actions (e.g., available special activities). This ticket adds an optional `companionActions` prop and a new rendered section to display them.

## Assumption Reassessment (2026-03-21)

1. `ActionTooltipProps` in `packages/runner/src/ui/ActionTooltip.tsx` (lines 16-21) has `description`, `anchorElement`, `onPointerEnter?`, `onPointerLeave?` — confirmed.
2. `ActionTooltip` renders progressive disclosure content (synopsis, steps, modifiers, availability) at lines 23-85 — confirmed.
3. `ActionTooltip.module.css` has styles for `.tooltip`, `.synopsis`, `.stepsList`, `.stepDetails`, etc. — confirmed.
4. `ActionTooltip.test.ts` (270+ lines) covers legacy rendering, progressive disclosure, and event handlers — confirmed.
5. `RenderAction` has `actionId`, `displayName`, `isAvailable`, optional `actionClass` — confirmed.
6. `formatIdAsDisplayName` from `packages/runner/src/utils/display-name.ts` is used elsewhere for generic label formatting — confirmed.

## Architecture Check

1. Adding an optional prop is backwards-compatible — all existing call sites pass no companion actions and get no companion section.
2. The companion section header uses `formatIdAsDisplayName(actionClass)` — generic, not hardcoded to "Special Activities".
3. The companion list renders `RenderAction` items with availability styling — consistent with existing action rendering patterns.

## What to Change

### 1. Add `companionActions` prop to `ActionTooltipProps` — `ActionTooltip.tsx`

```typescript
interface ActionTooltipProps {
  readonly description: AnnotatedActionDescription;
  readonly anchorElement: HTMLElement;
  readonly companionActions?: readonly RenderAction[];
  readonly companionGroupName?: string;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
}
```

### 2. Render companion section — `ActionTooltip.tsx`

After the existing tooltip content (progressive disclosure or legacy), render:

```tsx
{companionActions !== undefined && companionActions.length > 0 && (
  <div className={styles.companionSection} data-testid="tooltip-companion-actions">
    <p className={styles.companionHeader}>{companionGroupName}</p>
    <ul className={styles.companionList}>
      {companionActions.map((action) => (
        <li
          key={action.actionId}
          className={action.isAvailable ? styles.companionAvailable : styles.companionUnavailable}
        >
          {action.displayName}
        </li>
      ))}
    </ul>
  </div>
)}
```

### 3. Add CSS styles — `ActionTooltip.module.css`

Add styles for the companion section:

- `.companionSection` — top border separator, padding-top, margin-top
- `.companionHeader` — bold header (font-weight: 600, follow existing `.synopsis` pattern but smaller)
- `.companionList` — list-style: none, padding: 0
- `.companionAvailable` — normal text color
- `.companionUnavailable` — dimmed opacity (e.g., `opacity: 0.5`)

Follow existing tooltip styling patterns (colors, spacing, font sizes from CSS variables).

### 4. Update tests — `ActionTooltip.test.ts`

Add test cases for the companion section.

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.tsx` (modify)
- `packages/runner/src/ui/ActionTooltip.module.css` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify)

## Out of Scope

- Wiring companion actions from GameContainer (that's ticket 005)
- Changes to `resolveCompanionActions` utility (that's ticket 003)
- Changes to `render-model.ts` or `project-render-model.ts`
- Engine, kernel, or compiler changes
- Per-action tooltip descriptions within the companion section (future enhancement per spec)
- Interactive selection of special activities from within the tooltip (future enhancement per spec)

## Acceptance Criteria

### Tests That Must Pass

1. **New test**: When `companionActions` prop is provided with actions, `[data-testid="tooltip-companion-actions"]` is present in the DOM
2. **New test**: When `companionActions` prop is `undefined`, no companion section renders
3. **New test**: When `companionActions` prop is an empty array, no companion section renders
4. **New test**: Companion section header displays `companionGroupName`
5. **New test**: Each companion action renders its `displayName`
6. **New test**: Available companion actions have the `companionAvailable` class
7. **New test**: Unavailable companion actions have the `companionUnavailable` class
8. All existing `ActionTooltip` tests pass unchanged (no regression)
9. `pnpm turbo typecheck` — no type errors
10. `pnpm -F @ludoforge/runner test` — all pass

### Invariants

1. When `companionActions` is not provided, ActionTooltip renders identically to before
2. The companion section always appears AFTER the main tooltip content (operation description)
3. The companion header is derived generically (via prop), not hardcoded to any game-specific string
4. The component remains a pure presentational component — no data fetching or state management

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.ts` (modify) — Add new describe block "companion actions section" with the test cases listed above

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
