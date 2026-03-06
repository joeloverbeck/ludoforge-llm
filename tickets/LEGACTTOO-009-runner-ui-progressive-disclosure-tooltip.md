# LEGACTTOO-009: Runner UI — Progressive Disclosure Tooltip + New Sub-Components

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: LEGACTTOO-008

## Problem

The runner's `ActionTooltip.tsx` renders raw DisplayNode trees (syntax-highlighted AST pseudo-code). With `ActionTooltipPayload` now available from the engine, the tooltip needs a progressive-disclosure redesign: synopsis + steps always visible, modifiers collapsible, availability indicator, and a raw AST toggle for power users. Three new sub-components are needed.

## Assumption Reassessment (2026-03-06)

1. `ActionTooltip.tsx` (132 lines) renders `AnnotatedActionDescription` via `renderGroup` / `renderNode` / `renderLine` functions. It uses Floating UI for positioning.
2. `useActionTooltip.ts` (153 lines) manages hover state, debouncing, and calls `bridge.describeAction(actionId)` which returns `AnnotatedActionDescription`.
3. `game-worker-api.ts` has `describeAction` at line 373 returning `AnnotatedActionDescription | null`. After LEGACTTOO-008, this includes optional `tooltipPayload`.
4. `ActionTooltip.module.css` contains existing styles for `.tooltip`, `.group`, `.line`, `.keyword`, `.operator`, etc.

## Architecture Check

1. The redesign is additive: when `tooltipPayload` is present, render the new progressive-disclosure layout. When absent (older GameDefs), fall back to existing DisplayNode rendering.
2. New sub-components (`ModifiersSection`, `AvailabilitySection`, `RawAstToggle`) are pure presentational React components with no engine dependencies.
3. No changes to `DisplayNode`, `ast-to-display.ts`, or Floating UI positioning logic.

## What to Change

### 1. Redesign `packages/runner/src/ui/ActionTooltip.tsx`

- Accept `ActionTooltipPayload | undefined` in addition to existing `AnnotatedActionDescription`.
- When `tooltipPayload` is present:
  - Render synopsis section (action name + one-line summary)
  - Render numbered steps list
  - Render `<ModifiersSection>` with modifiers from RuleCard + active flags from RuleState
  - Render `<AvailabilitySection>` with RuleState
  - Render `<RawAstToggle>` containing existing DisplayNode rendering
- When `tooltipPayload` is absent: render existing DisplayNode layout (backwards fallback).
- Preserve existing Floating UI positioning, `onPointerEnter`/`onPointerLeave` props.

### 2. Create `packages/runner/src/ui/ModifiersSection.tsx`

Props: `modifiers: ContentModifier[]`, `activeModifierIndices: readonly number[]`
- Collapsed by default if >2 modifiers; expanded if any modifier is active.
- Header: "Modifiers (N active)" with expand/collapse toggle.
- Active modifiers: checkmark icon + highlighted style.
- Inactive modifiers: muted style.

### 3. Create `packages/runner/src/ui/AvailabilitySection.tsx`

Props: `ruleState: RuleState`
- Green dot + "Available" when `ruleState.available === true`.
- Red dot + "Blocked" + blocker reason list when `ruleState.available === false`.
- Show limit usage if present: "(N remaining this turn)".

### 4. Create `packages/runner/src/ui/RawAstToggle.tsx`

Props: `sections: DisplayGroupNode[]`
- Collapsed toggle labeled "Raw AST".
- When expanded, renders the existing `renderGroup` / `renderNode` tree.
- Preserves all existing syntax highlighting styles.

### 5. Update `packages/runner/src/ui/useActionTooltip.ts`

- Update `ActionTooltipState` to include optional `tooltipPayload: ActionTooltipPayload | null`.
- In the `bridge.describeAction` callback, extract `tooltipPayload` from result.

### 6. Update `packages/runner/src/worker/game-worker-api.ts`

- The `describeAction` method already returns `AnnotatedActionDescription` which after LEGACTTOO-008 includes `tooltipPayload`. No type changes needed — just verify the payload passes through Comlink serialization (ReadonlyMaps may need plain-object conversion).

### 7. Add/update CSS modules

- `ActionTooltip.module.css` — add styles for synopsis, steps, modifiers, availability sections.
- New CSS modules for sub-components if needed.

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.tsx` (modify — redesign layout)
- `packages/runner/src/ui/ActionTooltip.module.css` (modify — add new section styles)
- `packages/runner/src/ui/ModifiersSection.tsx` (new)
- `packages/runner/src/ui/ModifiersSection.module.css` (new)
- `packages/runner/src/ui/AvailabilitySection.tsx` (new)
- `packages/runner/src/ui/AvailabilitySection.module.css` (new)
- `packages/runner/src/ui/RawAstToggle.tsx` (new)
- `packages/runner/src/ui/RawAstToggle.module.css` (new)
- `packages/runner/src/ui/useActionTooltip.ts` (modify — add tooltipPayload to state)
- `packages/runner/src/worker/game-worker-api.ts` (modify — verify Comlink serialization)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify — add payload rendering tests)
- `packages/runner/test/ui/ModifiersSection.test.ts` (new)
- `packages/runner/test/ui/AvailabilitySection.test.ts` (new)
- `packages/runner/test/ui/RawAstToggle.test.ts` (new)
- `packages/runner/test/ui/useActionTooltip.test.ts` (modify — add tooltipPayload tests)

## Out of Scope

- Engine-side tooltip pipeline (LEGACTTOO-004 through LEGACTTOO-008)
- Canvas-layer tooltip rendering (future spec)
- Keyboard navigation within tooltip (future enhancement)
- Animation/transitions for expand/collapse (keep simple toggle)
- Changes to `DisplayNode` or `ast-to-display.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `ActionTooltip` renders synopsis section when `tooltipPayload` is present.
2. `ActionTooltip` renders numbered steps list from `ruleCard.steps`.
3. `ActionTooltip` falls back to DisplayNode rendering when `tooltipPayload` is absent.
4. `ModifiersSection` collapsed by default when >2 modifiers; expanded when any active.
5. `ModifiersSection` highlights active modifiers with checkmark.
6. `AvailabilitySection` shows "Available" with green indicator when `available === true`.
7. `AvailabilitySection` shows "Blocked" with red indicator and blocker reasons when `available === false`.
8. `RawAstToggle` starts collapsed; shows DisplayNode tree when expanded.
9. `useActionTooltip` includes `tooltipPayload` in state after successful `describeAction`.
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Floating UI positioning unchanged — tooltip still anchors to action button.
2. `onPointerEnter`/`onPointerLeave` interaction unchanged — tooltip remains hoverable.
3. Fallback rendering identical to pre-change behavior when `tooltipPayload` is absent.
4. No runtime engine imports in new UI components — they receive props, not raw AST.
5. ARIA: tooltip retains `role="tooltip"` and `data-testid="action-tooltip"`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.ts` — test both payload-present and payload-absent rendering paths.
2. `packages/runner/test/ui/ModifiersSection.test.ts` — collapsed/expanded states, active highlighting.
3. `packages/runner/test/ui/AvailabilitySection.test.ts` — available/blocked states, blocker reasons, limit usage.
4. `packages/runner/test/ui/RawAstToggle.test.ts` — collapsed/expanded toggle, renders DisplayNode content.
5. `packages/runner/test/ui/useActionTooltip.test.ts` — verify tooltipPayload extraction from bridge response.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
