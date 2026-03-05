# CHOICEUI-006: Choice Context Header

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None -- runner-only
**Deps**: CHOICEUI-003, CHOICEUI-005

## Problem

When the user selects an action and enters the choice flow, the `ChoicePanel` provides no header indicating which action is being built, what the current decision asks, or what the selection bounds are. The user must remember context from the action bar. For multi-step actions (e.g., FITL Train), this becomes confusing as the user drills into per-space sub-choices with no indication of which action or which decision step they are on.

## Assumption Reassessment (2026-03-05)

1. `RenderModel` in `render-model.ts` has no `choiceContext` field.
2. `RenderContext` in `store-types.ts` provides `selectedAction`, `choicePending`, and `choiceStack` -- all needed to derive choice context.
3. `ChoicePendingRequest` (from engine) has `name` (param name), `decisionId`, and for `chooseN`: `min`/`max` bounds.
4. `VisualConfigProvider` will have `getActionDisplayName()` and `getChoicePrompt()` after CHOICEUI-003.
5. `parseIterationContext()` will be available after CHOICEUI-005.

## Architecture Check

1. Follows the established pattern: derive data in `deriveRenderModel()`, render it in a React component. No new state management needed.
2. The `RenderChoiceContext` type is a pure data projection -- no side effects, easily testable.
3. The `ChoiceContextHeader` is a stateless sub-component inside `ChoicePanel` -- does not introduce new component files.

## What to Change

### 1. Add `RenderChoiceContext` type to `render-model.ts`

```typescript
export interface RenderChoiceContext {
  readonly actionDisplayName: string;
  readonly decisionPrompt: string;
  readonly decisionParamName: string;
  readonly boundsText: string | null;
  readonly iterationLabel: string | null;
  readonly iterationProgress: string | null;
}
```

Add to `RenderModel`:
```typescript
readonly choiceContext: RenderChoiceContext | null;
```

### 2. Add `deriveChoiceContext()` to `derive-render-model.ts`

New function:

```typescript
function deriveChoiceContext(
  context: RenderContext,
  zonesById: ReadonlyMap<string, RenderZone>,
): RenderChoiceContext | null
```

Logic:
1. If `context.selectedAction` is null or `context.choicePending` is null, return `null`.
2. Action display name: `context.visualConfigProvider.getActionDisplayName(selectedAction) ?? formatIdAsDisplayName(selectedAction)`.
3. Decision prompt: `context.visualConfigProvider.getChoicePrompt(selectedAction, choicePending.name) ?? formatIdAsDisplayName(choicePending.name)`.
4. Bounds text: if `choicePending.min` or `choicePending.max` is defined, format as `"{min}-{max}"` or just `"{max}"` if min equals max. Null otherwise.
5. Iteration context: call `parseIterationContext(choicePending.decisionId, context.choiceStack, zonesById)`. If non-null, extract `iterationLabel` and format `iterationProgress` as `"{index + 1} of {total}"`.

Wire `deriveChoiceContext()` into the `deriveRenderModel()` return object.

### 3. Add `ChoiceContextHeader` sub-component to `ChoicePanel.tsx`

Render at the top of the `.panel` section, before the breadcrumb, when `choiceModel.choiceContext` is non-null:

```tsx
function ChoiceContextHeader({ context }: { context: RenderChoiceContext }): ReactElement {
  return (
    <div className={styles.choiceContextHeader} data-testid="choice-context-header">
      <span className={styles.actionBadge} data-testid="choice-context-action">
        {context.actionDisplayName}
      </span>
      <span className={styles.decisionPrompt} data-testid="choice-context-prompt">
        {context.iterationLabel != null ? `${context.iterationLabel}: ` : ''}
        {context.decisionPrompt}
        {context.boundsText != null ? ` (${context.boundsText})` : ''}
        {context.iterationProgress != null ? ` - ${context.iterationProgress}` : ''}
      </span>
    </div>
  );
}
```

### 4. Add CSS styles to `ChoicePanel.module.css`

New classes:
- `.choiceContextHeader` -- flex column, gap, margin-bottom
- `.actionBadge` -- pill shape, accent border, bold text
- `.decisionPrompt` -- secondary color, smaller font
- `.iterationLabel` -- accent color (inline within prompt)

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/src/ui/ChoicePanel.module.css` (modify)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modify)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify)
- `packages/runner/test/ui/helpers/render-model-fixture.ts` (modify)

## Out of Scope

- Breadcrumb improvements (CHOICEUI-007, CHOICEUI-008).
- Action tooltip content or `describeAction()` extensions.
- Canvas-layer rendering of choice context.
- Modifying `MultiSelectMode` internal selection counter (it stays as-is for live feedback).
- Modifying `ActionToolbar` in any way.

## Acceptance Criteria

### Tests That Must Pass

1. `deriveChoiceContext` returns `null` when `selectedAction` is null.
2. `deriveChoiceContext` returns `null` when `choicePending` is null.
3. `deriveChoiceContext` returns correct `actionDisplayName` from visual config when available.
4. `deriveChoiceContext` falls back to `formatIdAsDisplayName` when visual config has no action entry.
5. `deriveChoiceContext` returns correct `decisionPrompt` from visual config when available.
6. `deriveChoiceContext` returns correct `boundsText` for `chooseN` decisions (e.g., `"1-6"`).
7. `deriveChoiceContext` returns `null` `boundsText` for `chooseOne` decisions.
8. `deriveChoiceContext` populates `iterationLabel` and `iterationProgress` when inside a forEach iteration.
9. `ChoiceContextHeader` renders action badge and decision prompt with `data-testid` attributes.
10. `ChoiceContextHeader` is not rendered when `choiceContext` is `null`.
11. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `RenderModel.choiceContext` is null when no choice is pending (no phantom headers).
2. `deriveRenderModel` determinism preserved: same inputs produce same `choiceContext`.
3. Existing `ChoicePanel` layout (breadcrumb, options, navigation) is not repositioned -- header is prepended above.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model-state.test.ts` -- unit tests for `deriveChoiceContext` covering all acceptance criteria scenarios.
2. `packages/runner/test/ui/ChoicePanel.test.ts` -- component tests: header renders when context non-null, hidden when null, correct text content.
3. `packages/runner/test/ui/helpers/render-model-fixture.ts` -- add `choiceContext` to fixture helpers.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
