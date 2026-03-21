# 71OPSTOOCOM-005: Wire companion actions resolution into GameContainer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 71OPSTOOCOM-002 (hiddenActionsByClass on RenderModel), 71OPSTOOCOM-003 (resolveCompanionActions utility), 71OPSTOOCOM-004 (ActionTooltip companionActions prop)

## Problem

The `ActionTooltip` now supports a `companionActions` prop (ticket 004), the render model carries `hiddenActionsByClass` (ticket 002), and `resolveCompanionActions` can look up the right actions (ticket 003). But nothing connects them. This ticket wires the resolution logic into `GameContainer.tsx` where `ActionTooltip` is rendered, completing the data flow.

## Assumption Reassessment (2026-03-21)

1. `GameContainer.tsx` renders `ActionTooltip` at lines 446-452, conditional on `bottomBarKind === 'actions'` and tooltip state — confirmed.
2. `actionTooltipState` comes from `useActionTooltip(bridge)` hook (line 225) — confirmed.
3. `actionTooltipState` has a `sourceKey` with `groupKey` — need to verify structure. The spec references `actionTooltipState.sourceKey.groupKey`.
4. `visualConfigProvider` is available in GameContainer scope — confirmed (it's passed down or created from the store).
5. `renderModel` is available in GameContainer scope — confirmed (derived from the store).
6. After ticket 002, `renderModel.hiddenActionsByClass` will be available — to be delivered.
7. After ticket 003, `resolveCompanionActions` will be importable — to be delivered.
8. After ticket 004, `ActionTooltip` accepts `companionActions` and `companionGroupName` props — to be delivered.
9. `formatIdAsDisplayName` is available for deriving the companion group name from the action class.

## Architecture Check

1. GameContainer is the correct integration point — it already owns the tooltip state and the render model.
2. The resolution is done at render time with no new state — just deriving companion actions from existing data.
3. No new hooks or state management needed — pure derivation from existing props/state.

## What to Change

### 1. Import `resolveCompanionActions` and `formatIdAsDisplayName` — `GameContainer.tsx`

Add imports for the new utility and the display name formatter.

### 2. Resolve companion actions at the ActionTooltip render site — `GameContainer.tsx`

Before the `<ActionTooltip>` JSX, compute companion actions:

```typescript
const companionActions = resolveCompanionActions(
  actionTooltipState.sourceKey?.groupKey ?? '',
  visualConfigProvider.getActionGroupPolicy() ?? null,
  renderModel.hiddenActionsByClass,
);

const companionGroupName = companionActions.length > 0
  ? formatIdAsDisplayName(companionActions[0].actionClass ?? '')
  : undefined;
```

### 3. Pass props to `ActionTooltip`

Add `companionActions` and `companionGroupName` to the existing `<ActionTooltip>` JSX:

```tsx
<ActionTooltip
  description={actionTooltipState.description}
  anchorElement={actionTooltipState.anchorElement}
  companionActions={companionActions}
  companionGroupName={companionGroupName}
  onPointerEnter={onTooltipPointerEnter}
  onPointerLeave={onTooltipPointerLeave}
/>
```

### 4. Verify `sourceKey` shape

Confirm that `actionTooltipState.sourceKey` carries `groupKey`. If the tooltip state doesn't currently track which group the hovered action belongs to, this may need a small addition to the tooltip state/hook. Document findings during implementation.

## Files to Touch

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- Possibly `packages/runner/src/ui/useActionTooltip.ts` (modify — if `sourceKey.groupKey` is not already tracked)

## Out of Scope

- Changes to ActionTooltip component itself (done in ticket 004)
- Changes to resolveCompanionActions utility (done in ticket 003)
- Changes to render-model.ts or project-render-model.ts (done in ticket 002)
- Engine, kernel, or compiler changes
- Manual testing / visual verification (documented in spec verification section, not this ticket)
- Per-special-activity descriptions within companion section (future enhancement)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — no type errors from new imports and prop passing
2. `pnpm turbo build` — clean build
3. `pnpm -F @ludoforge/runner test` — all runner tests pass
4. `pnpm turbo lint` — no lint issues

### Invariants

1. When `actionGroupPolicy` has no `appendTooltipFrom`, companion actions array is empty and no companion section renders — tooltip behavior identical to before
2. When `hiddenActionsByClass` is empty (no hidden actions), companion actions array is empty
3. `GameContainer` does not introduce new state or hooks beyond the existing tooltip state — companion resolution is pure derivation
4. The wiring works for any game with `appendTooltipFrom` config — not FITL-specific logic

## Test Plan

### New/Modified Tests

1. Integration verification via existing runner test suite. The individual unit tests in tickets 002, 003, and 004 cover the logic. This ticket's primary verification is type safety and correct prop plumbing.
2. If `useActionTooltip` needs changes to track `groupKey`, add a test for that in `packages/runner/test/ui/useActionTooltip.test.ts`.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/runner test`
