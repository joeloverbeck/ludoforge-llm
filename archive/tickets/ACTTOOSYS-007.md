# ACTTOOSYS-007: ActionTooltip Component and Styles

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ACTTOOSYS-001

## Problem

The display tree (`AnnotatedActionDescription`) produced by the engine and fetched by the hook needs a React component to render it as a visual tooltip. This component must recursively render the hierarchical `DisplayNode` tree with syntax highlighting (color-coded node kinds), show pass/fail badges on conditions, handle overflow for large action definitions, and be positioned via Floating UI relative to the action button.

## Assumption Reassessment (2026-02-27)

1. `@floating-ui/react-dom` is already a runner dependency. The existing `TooltipLayer.tsx` uses `useFloating` with `offset`, `flip`, `shift` middleware. Confirmed.
2. The runner uses CSS Modules (`.module.css` files). Confirmed — `TooltipLayer.module.css`, `ActionToolbar.module.css`, etc. exist.
3. `DisplayNode` types are: `DisplayGroupNode` (group with label/children), `DisplayLineNode` (line with indent + inline children), and inline nodes (`keyword`, `operator`, `value`, `reference`, `punctuation`, `annotation`). From ACTTOOSYS-001.
4. `AnnotatedActionDescription` has `sections: readonly DisplayGroupNode[]` and `limitUsage: readonly LimitUsageInfo[]`. From ACTTOOSYS-001.
5. The tooltip must be `pointer-events: none` to avoid interfering with hover events on the buttons. Confirmed from spec.

## Architecture Check

1. Pure presentational component — no data fetching, no side effects beyond Floating UI positioning.
2. Recursive rendering matches the recursive `DisplayNode` structure naturally.
3. CSS Modules for styling — scoped, no global leakage, consistent with other runner components.
4. Accessible: tooltip has `role="tooltip"` and is associated with the button via `aria-describedby` (wired in ACTTOOSYS-008).

## What to Change

### 1. Create `packages/runner/src/ui/ActionTooltip.tsx`

Export:

```typescript
interface ActionTooltipProps {
  readonly description: AnnotatedActionDescription;
  readonly anchorElement: HTMLElement;
}

function ActionTooltip({ description, anchorElement }: ActionTooltipProps): JSX.Element;
```

**Implementation:**

1. **Floating UI positioning**:
   - Use `useFloating` with `placement: 'top'`.
   - Middleware: `offset(12)`, `flip()`, `shift({ padding: 8 })`.
   - Set `refs.setReference(anchorElement)` via `useEffect` when `anchorElement` changes.
   - Apply `x`, `y`, `strategy` to the tooltip container div.

2. **Recursive renderers** (internal, not exported):
   - `renderGroup(group: DisplayGroupNode, key: string)`: Renders group label as a header row, then maps `children` through `renderNode`.
   - `renderLine(line: DisplayLineNode, key: string)`: Renders a flex row with left padding based on `indent * indentSize`. Maps `children` through `renderInlineNode`.
   - `renderInlineNode(node: DisplayInlineNode, key: string)`: Renders a `<span>` with CSS class matching `node.kind`. For `annotation` nodes, also applies `pass`/`fail`/`value`/`usage` subclass.
   - `renderNode(node: DisplayNode, key: string)`: Dispatches to `renderGroup`, `renderLine`, or `renderInlineNode` based on `node.kind`.

3. **Limit usage display**: After sections, if `limitUsage` is non-empty, render a small footer showing each limit (e.g., "Turn: 1 / 2").

4. **Container styling**:
   - `max-height: 400px; overflow-y: auto` for scrollable large tooltips.
   - `pointer-events: none` so the tooltip doesn't intercept mouse events.
   - Dark background, light text (consistent with existing game UI theme).
   - `z-index` above other UI elements.

### 2. Create `packages/runner/src/ui/ActionTooltip.module.css`

CSS classes for:
- `.tooltip` — container (background, border-radius, padding, shadow, max-height, overflow, pointer-events)
- `.group` — section group (margin-bottom between groups)
- `.groupLabel` — section header (bold, slightly larger, with optional icon)
- `.line` — single line row (flex, gap between inline nodes)
- `.keyword` — purple/violet text (DSL keywords like `if`, `forEach`, `moveToken`)
- `.operator` — neutral gray text (comparison operators, assignment)
- `.value` — green text (literals: numbers, booleans, strings)
- `.reference` — blue text (variable references, bindings)
- `.punctuation` — dim text (parentheses, commas, colons)
- `.annotation` — base annotation style
- `.annotationPass` — teal/green text or badge
- `.annotationFail` — red text or badge
- `.annotationValue` — muted informational text
- `.annotationUsage` — usage counter style
- `.limitFooter` — limit usage footer area

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.tsx` (new)
- `packages/runner/src/ui/ActionTooltip.module.css` (new)

## Out of Scope

- Data fetching or lifecycle management (that's the hook in ACTTOOSYS-006)
- Wiring into GameContainer or ActionToolbar (ACTTOOSYS-008)
- Animations or transitions (tooltip appears/disappears instantly)
- Keyboard navigation or focus management for the tooltip
- Responsive/mobile layout adaptations
- Collapsible group sections (optional enhancement for later)
- Any engine code

## Acceptance Criteria

### Tests That Must Pass

1. **Renders sections**: Given an `AnnotatedActionDescription` with Preconditions and Effects groups, the component renders both group labels.
2. **Renders inline nodes**: A `DisplayLineNode` with `keyword`, `value`, and `reference` children renders `<span>` elements with the correct CSS classes.
3. **Pass/fail annotations**: A line with a `'pass'` annotation renders with the pass CSS class. A `'fail'` annotation renders with the fail class.
4. **Limit usage footer**: When `limitUsage` is non-empty, a footer section is rendered showing the usage.
5. **Empty limitUsage**: When `limitUsage` is empty, no footer is rendered.
6. **Nested groups**: A group containing lines with further group children renders recursively without errors.
7. **Floating UI positioning**: The component renders a positioned container (verify `style` includes `position` and coordinate attributes).
8. Existing suite: `pnpm -F @ludoforge/runner test` — no regressions.

### Invariants

1. The component is pure — same props produce same output (no internal state beyond Floating UI positioning).
2. All CSS classes are scoped via CSS Modules — no global style leakage.
3. `pointer-events: none` is always set on the tooltip container.
4. The component handles empty `sections` gracefully (renders an empty tooltip, not an error).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.tsx` — render tests using `@testing-library/react`. Construct mock `AnnotatedActionDescription` objects and verify DOM output. Mock `anchorElement` as a `document.createElement('button')`.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

Implemented the `ActionTooltip` React component and CSS Module styles.

### Files Created
- `packages/runner/src/ui/ActionTooltip.module.css` — CSS classes for tooltip container (pointer-events: none, dark background, monospace font, scrollable overflow), display node kind classes (keyword purple, value green, reference blue, operator gray, punctuation dim), annotation subclasses (pass/fail/value/usage), and limit usage footer.
- `packages/runner/src/ui/ActionTooltip.tsx` — Pure presentational component that recursively renders the `AnnotatedActionDescription` display tree. Uses Floating UI (`useFloating` with offset/flip/shift) for positioning relative to anchor element. Internal renderer functions dispatch by node kind (group, line, inline). Limit usage footer shown when non-empty.
- `packages/runner/test/ui/ActionTooltip.test.ts` — 11 tests covering all acceptance criteria: section rendering, inline node CSS classes, pass/fail annotation classes, limit footer presence/absence, nested recursive groups, Floating UI positioning styles, anchor reference setup, CSS contract (pointer-events: none), and empty sections.

### Verification
- `pnpm -F @ludoforge/runner typecheck` — clean
- `pnpm -F @ludoforge/runner test` — 144 test files, 1334 tests pass, zero regressions
