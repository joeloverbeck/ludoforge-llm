# LEGACTTOO-009: Runner UI — Progressive Disclosure Tooltip + New Sub-Components

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: LEGACTTOO-008

## Problem

The runner's `ActionTooltip.tsx` renders raw DisplayNode trees (syntax-highlighted AST pseudo-code). With `ActionTooltipPayload` now available from the engine, the tooltip needs a progressive-disclosure redesign: synopsis + steps always visible, modifiers collapsible, availability indicator, and a raw AST toggle for power users. Three new sub-components are needed.

## Assumption Reassessment (2026-03-07)

1. `ActionTooltip.tsx` (132 lines) renders `AnnotatedActionDescription` via `renderGroup` / `renderNode` / `renderLine` functions. It uses Floating UI for positioning.
2. `useActionTooltip.ts` (153 lines) manages hover state, debouncing, and calls `bridge.describeAction(actionId)` which returns `AnnotatedActionDescription`.
3. `game-worker-api.ts` has `describeAction` at line 373 returning `AnnotatedActionDescription | null`. `AnnotatedActionDescription` already includes optional `tooltipPayload?: ActionTooltipPayload` (at `display-node.ts:85`).
4. `ActionTooltip.module.css` contains existing styles for `.tooltip`, `.group`, `.line`, `.keyword`, `.operator`, etc.
5. `has-displayable-content.ts` only checks `sections.length > 0 || limitUsage.length > 0` — does NOT account for `tooltipPayload` presence. Must be updated.
6. `RuleCard`, `RuleState`, `ActionTooltipPayload` use plain objects with readonly arrays — no `ReadonlyMap`, so no Comlink serialization concerns.

## Architecture Check

1. The redesign is additive: when `tooltipPayload` is present, render the new progressive-disclosure layout. When absent (older GameDefs), fall back to existing DisplayNode rendering.
2. New sub-components (`ModifiersSection`, `AvailabilitySection`, `RawAstToggle`) are pure presentational React components with no engine dependencies.
3. No changes to `DisplayNode`, `ast-to-display.ts`, or Floating UI positioning logic.
4. `tooltipPayload` is already inside `AnnotatedActionDescription` — no need to add it as a separate field in `ActionTooltipState`. The tooltip reads `description.tooltipPayload` directly. This avoids DRY violations and keeps the hook unchanged.

## What to Change

### 1. Redesign `packages/runner/src/ui/ActionTooltip.tsx`

- Read `tooltipPayload` from existing `description.tooltipPayload` (no separate prop needed).
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

### 5. Update `packages/runner/src/ui/has-displayable-content.ts`

- Account for `tooltipPayload` presence: a description with `tooltipPayload` is displayable even if `sections` and `limitUsage` are empty.

### 6. Add/update CSS modules

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
- `packages/runner/src/ui/has-displayable-content.ts` (modify — account for tooltipPayload)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify — add payload rendering tests)
- `packages/runner/test/ui/has-displayable-content.test.ts` (modify — add tooltipPayload test)
- `packages/runner/test/ui/ModifiersSection.test.ts` (new)
- `packages/runner/test/ui/AvailabilitySection.test.ts` (new)
- `packages/runner/test/ui/RawAstToggle.test.ts` (new)

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
9. `hasDisplayableContent` returns true when `tooltipPayload` is present.
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
5. `packages/runner/test/ui/has-displayable-content.test.ts` — verify tooltipPayload triggers displayable content.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

### What Changed vs Originally Planned

1. **Removed useActionTooltip state change** — ticket originally planned adding `tooltipPayload` as a separate field in `ActionTooltipState`. This was unnecessary because `tooltipPayload` already lives inside `AnnotatedActionDescription.tooltipPayload`. Accessing it from `description.tooltipPayload` is DRY-er and avoids state duplication.

2. **Removed worker serialization task** — the ticket's concern about ReadonlyMap Comlink serialization was unfounded. `RuleCard`/`RuleState` use plain objects with readonly arrays — no Map types.

3. **Added `hasDisplayableContent` update** — the ticket missed this. Without it, descriptions with `tooltipPayload` but empty `sections`/`limitUsage` would be incorrectly filtered as "no content."

4. **Extracted `display-node-renderers.tsx`** — shared render functions (`renderGroup`, `renderNode`, `renderLine`, `renderInlineNode`) extracted from `ActionTooltip.tsx` so `RawAstToggle` can reuse them without duplication.

5. **Added `tooltip-rule-card.js` to engine runtime exports** — `ContentModifier`, `RuleState`, `ActionTooltipPayload` were not exported from `@ludoforge/engine/runtime`. Added the missing re-export.

### Files Changed

- `packages/runner/src/ui/ActionTooltip.tsx` — redesigned with progressive disclosure branching
- `packages/runner/src/ui/ActionTooltip.module.css` — added synopsis, steps, modifier, availability styles
- `packages/runner/src/ui/display-node-renderers.tsx` — new shared rendering functions
- `packages/runner/src/ui/ModifiersSection.tsx` + `.module.css` — new
- `packages/runner/src/ui/AvailabilitySection.tsx` + `.module.css` — new
- `packages/runner/src/ui/RawAstToggle.tsx` + `.module.css` — new
- `packages/runner/src/ui/has-displayable-content.ts` — added tooltipPayload check
- `packages/engine/src/kernel/runtime.ts` — added tooltip-rule-card.js export
- `packages/runner/test/ui/ActionTooltip.test.ts` — added 9 progressive-disclosure tests
- `packages/runner/test/ui/ModifiersSection.test.ts` — new (10 tests)
- `packages/runner/test/ui/AvailabilitySection.test.ts` — new (8 tests)
- `packages/runner/test/ui/RawAstToggle.test.ts` — new (6 tests)
- `packages/runner/test/ui/has-displayable-content.test.ts` — added 1 test

### Verification

- Runner tests: 150 files, 1485 tests passed
- Runner typecheck: clean
- Runner lint: clean
- Engine tests: 0 failures
