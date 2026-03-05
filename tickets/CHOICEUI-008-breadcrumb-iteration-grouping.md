# CHOICEUI-008: Breadcrumb Iteration Grouping

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: None -- runner-only
**Deps**: CHOICEUI-007

## Problem

When a `chooseN` result triggers per-element sub-choices (e.g., "for each selected space, choose placement type"), the breadcrumb displays a flat list of pills with no visual grouping. The user sees:

```
[Da Nang, Kontum, Pleiku] [Place Irregulars] [Place At Base] [Place Irregulars]
```

It's unclear which sub-choice belongs to which space. The expected display is:

```
Target Spaces: Da Nang, Kontum, Pleiku Darlac
  Da Nang: Place Irregulars
  Kontum: Place At Base
  Pleiku Darlac: Place Irregulars
```

## Assumption Reassessment (2026-03-05)

1. `RenderChoiceStep` in `render-model.ts` (line 177) does not currently have `iterationGroupId` or `iterationLabel` fields.
2. The `PartialChoice` type in `store-types.ts` stores the `decisionId` and `value` for each choice in the stack.
3. `parseIterationContext()` from CHOICEUI-005 can extract iteration index, total, and entity display name from a `decisionId`.
4. Consecutive breadcrumb steps from the same forEach iteration will share a common `decisionId` base (before the `::` or `[N]` suffix).

## Architecture Check

1. Adding `iterationGroupId` and `iterationLabel` to `RenderChoiceStep` keeps iteration metadata in the data model, not in the UI component. The UI only needs to group by `iterationGroupId`.
2. The grouping logic in the React component is a pure rendering concern -- map steps into groups, render with indentation.
3. No new state management needed; grouping is derived from the immutable render model on each render.

## What to Change

### 1. Extend `RenderChoiceStep` in `render-model.ts`

Add two fields:

```typescript
export interface RenderChoiceStep {
  // ... existing fields ...
  readonly iterationGroupId: string | null;
  readonly iterationLabel: string | null;
}
```

- `iterationGroupId`: A shared identifier for breadcrumb steps belonging to the same forEach iteration parent. Derived from the base `decisionId` before iteration scoping. `null` for non-iteration steps.
- `iterationLabel`: Human-readable label for this step's iteration entity (e.g., "Da Nang"). `null` for non-iteration steps and for the parent `chooseN` step.

### 2. Populate iteration fields in `derive-render-model.ts`

When building `RenderChoiceStep` objects in breadcrumb derivation:

1. For each step, try `parseIterationContext(step.decisionId, choiceStackUpToThisPoint, zonesById)`.
2. If iteration context is found:
   - `iterationGroupId`: the base `decisionId` stripped of `::resolvedBind` or `[N]` suffix (i.e., the `decisionId` of the forEach's internal decision template).
   - `iterationLabel`: `iterationContext.currentEntityDisplayName`.
3. If no iteration context: both fields are `null`.

### 3. Render grouped breadcrumbs in `ChoicePanel.tsx`

Replace the flat breadcrumb map with a grouping pass:

1. Iterate through `choiceModel.choiceBreadcrumb` and collect consecutive runs sharing the same non-null `iterationGroupId`.
2. For non-grouped steps (null `iterationGroupId`): render as current flat pills.
3. For grouped steps: render the parent pill (the preceding `chooseN` result) at normal level, then render child pills indented with the iteration label prefix.

Structure:
```tsx
<div className={styles.breadcrumbGroup}>
  {/* Parent step (chooseN result) renders normally */}
  <button className={styles.breadcrumbStep}>Target Spaces: Da Nang, Kontum, Pleiku</button>
  {/* Grouped children render indented */}
  <div className={styles.breadcrumbGroupChildren}>
    <button className={styles.breadcrumbStepIndented}>Da Nang: Place Irregulars</button>
    <button className={styles.breadcrumbStepIndented}>Kontum: Place At Base</button>
    <button className={styles.breadcrumbStepIndented}>Pleiku: Place Irregulars</button>
  </div>
</div>
```

### 4. Add CSS styles to `ChoicePanel.module.css`

New classes:
- `.breadcrumbGroup` -- flex column container for a parent + its children
- `.breadcrumbGroupChildren` -- left-padded container for indented iteration steps
- `.breadcrumbStepIndented` -- same styling as `.breadcrumbStep` but with left margin for visual nesting

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` (modify)
- `packages/runner/src/ui/ChoicePanel.module.css` (modify)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modify)
- `packages/runner/test/ui/ChoicePanel.test.ts` (modify)
- `packages/runner/test/ui/helpers/render-model-fixture.ts` (modify)

## Out of Scope

- Deep nesting (iterations within iterations). Only one level of grouping is supported in this ticket.
- Token-level iteration resolution (only zone entities are resolved).
- Collapsing/expanding breadcrumb groups (static rendering only).
- Changing breadcrumb rewind logic -- click targets and `rewindChoiceToBreadcrumb()` behavior are unchanged.
- Choice context header changes (CHOICEUI-006).

## Acceptance Criteria

### Tests That Must Pass

1. `RenderChoiceStep` objects from non-iteration decisions have `iterationGroupId: null` and `iterationLabel: null`.
2. `RenderChoiceStep` objects from forEach iterations have a shared `iterationGroupId` and a resolved `iterationLabel`.
3. Consecutive breadcrumb steps with the same `iterationGroupId` render inside a `.breadcrumbGroupChildren` container.
4. Non-grouped steps render as flat pills (no wrapping container).
5. Indented steps show the iteration label prefix (e.g., "Da Nang: Place Irregulars").
6. Breadcrumb click handlers on indented steps still trigger `rewindChoiceToBreadcrumb()` with the correct index.
7. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. Breadcrumb step count (and step indices for rewind) is unchanged -- grouping is visual only.
2. `RenderChoiceStep.decisionId` and `chosenValueId` remain the canonical identifiers for each step.
3. Non-iteration breadcrumbs render identically to pre-ticket behavior (with the decision name prefix from CHOICEUI-007).
4. Determinism: same `choiceStack` + same zone data produce same grouping.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model-state.test.ts` -- test `iterationGroupId` and `iterationLabel` population for iteration and non-iteration steps.
2. `packages/runner/test/ui/ChoicePanel.test.ts` -- component tests: grouped steps render with indentation container, non-grouped steps render flat, click handlers work on indented steps.
3. `packages/runner/test/ui/helpers/render-model-fixture.ts` -- add `iterationGroupId`/`iterationLabel` to breadcrumb step fixtures.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
