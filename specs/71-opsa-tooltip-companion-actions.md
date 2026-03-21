# Spec 71 — Op+SA Tooltip Companion Actions

## Problem

When hovering over an operation (e.g., Train) in the "Operation + Special Activity" toolbar group, the tooltip shows only the operation steps — identical to the "Operation" group tooltip. Players choosing the Op+SA path should see what special activities are available alongside the operation to make an informed decision.

The FITL rules state the operation itself is identical in both paths; the difference is that Op+SA also grants a special activity (interleaved before/during/after the operation per Section 4.1). Currently, special activity actions exist in the engine's legal move enumeration but are hidden from the toolbar by `visual-config.yaml`'s `hide: [specialActivity]` rule and **completely dropped** from the render model during projection (`project-render-model.ts` line 162-163).

## FOUNDATIONS Alignment

- **F1 (Engine Agnosticism)**: No engine changes — all work is in the runner visual layer.
- **F3 (Visual Separation)**: New config lives in `visual-config.yaml`, not GameSpecDoc.
- **F10 (Architectural Completeness)**: Generic mechanism usable by any game, not FITL-specific.

## Approach: UI-Layer Composition

Instead of dropping hidden actions entirely, preserve them in the render model as companion data. A new `appendTooltipFrom` property on synthesize rules declares which hidden action classes should appear as supplementary tooltip content for a synthesized group.

### Data Flow

```
Engine enumerates legal moves (includes operations + special activities)
  ↓
deriveActionGroups groups by actionClass → "operation" group + "specialActivity" group
  ↓
projectActionGroups applies visual config:
  - Synthesizes "operation" → "operationPlusSpecialActivity" group
  - Hides "specialActivity" → TODAY: dropped. AFTER: preserved in hiddenActionsByClass
  ↓
ActionToolbar renders groups. User hovers action in Op+SA group.
  ↓
useActionTooltip fetches description (unchanged — engine API stays the same)
  ↓
GameContainer resolves companion actions:
  sourceKey.groupKey → synthesize rule → appendTooltipFrom → hiddenActionsByClass lookup
  ↓
ActionTooltip renders operation description + companion "Special Activities" section
```

## Changes

### 1. Visual config — `data/games/fire-in-the-lake/visual-config.yaml`

Add `appendTooltipFrom` to the existing synthesize rule (lines 476-481):

```yaml
actionGroupPolicy:
  synthesize:
    - fromClass: operation
      intoGroup: operationPlusSpecialActivity
      appendTooltipFrom:
        - specialActivity
  hide:
    - specialActivity
```

### 2. VisualConfigProvider types — `packages/runner/src/config/visual-config-provider.ts`

Add `appendTooltipFrom?: readonly string[]` to the synthesize rule type definition. Update any Zod schema or type that validates the visual config to accept this new optional field.

### 3. RenderModel type — `packages/runner/src/model/render-model.ts`

Add a new field after `actionGroups` (line ~93):

```typescript
readonly hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>;
```

This carries hidden actions keyed by their `actionClass`, making them available to the tooltip system without displaying them in the toolbar.

### 4. `projectActionGroups` — `packages/runner/src/model/project-render-model.ts`

Change the function to return both `actionGroups` and `hiddenActionsByClass`. At the hidden-action branch (line 162-163), instead of `continue`, collect into a map:

```typescript
if (actionClass !== undefined && hiddenClasses.has(actionClass)) {
  const bucket = hiddenByClass.get(actionClass) ?? [];
  hiddenByClass.set(actionClass, [...bucket, {
    ...action,
    displayName: visualConfigProvider.getActionDisplayName(action.actionId)
      ?? formatIdAsDisplayName(action.actionId),
  }]);
  continue;
}
```

### 5. Wire into RenderModel — `packages/runner/src/model/project-render-model.ts`

Where `projectRenderModel` constructs the final `RenderModel`, include `hiddenActionsByClass` from step 4.

### 6. Companion actions resolution utility

Create a small utility function `resolveCompanionActions` (can live in a new file or alongside `ActionTooltip.tsx`):

```typescript
function resolveCompanionActions(
  groupKey: string,
  policy: ActionGroupPolicy | null,
  hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>,
): readonly RenderAction[] {
  if (policy === null) return [];
  const rule = policy.synthesize?.find((r) => r.intoGroup === groupKey);
  if (rule?.appendTooltipFrom === undefined) return [];
  return rule.appendTooltipFrom.flatMap(
    (cls) => hiddenActionsByClass.get(cls) ?? [],
  );
}
```

### 7. `ActionTooltip` — `packages/runner/src/ui/ActionTooltip.tsx`

Add a new optional prop `companionActions` and render a supplementary section after existing tooltip content. The section header should be derived generically via `formatIdAsDisplayName(actionClass)`, not hardcoded.

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

### 8. `GameContainer` — `packages/runner/src/ui/GameContainer.tsx`

When rendering `ActionTooltip` (lines 446-452), resolve companion actions:

1. Read `actionTooltipState.sourceKey.groupKey`
2. Look up synthesize rules via `visualConfigProvider.getActionGroupPolicy()`
3. Find `appendTooltipFrom` classes for that group
4. Look up in `renderModel.hiddenActionsByClass`
5. Pass as `companionActions` prop

### 9. CSS — `packages/runner/src/ui/ActionTooltip.module.css`

Add styles for `companionSection`, `companionHeader`, `companionList`, `companionAvailable`, `companionUnavailable`. Follow existing tooltip styling patterns. Unavailable actions should be visually dimmed (e.g., reduced opacity).

### 10. Tests

| Test file | Scope |
|-----------|-------|
| `packages/runner/test/model/project-render-model.test.ts` | `hiddenActionsByClass` populated when actions hidden; empty when none hidden |
| `packages/runner/test/ui/ActionTooltip.test.tsx` | Companion section renders when prop provided; absent when not |
| New: `resolveCompanionActions` unit test | Correct resolution from policy + hidden map |

## Files Summary

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake/visual-config.yaml` | Add `appendTooltipFrom: [specialActivity]` to synthesize rule |
| `packages/runner/src/config/visual-config-provider.ts` | Add `appendTooltipFrom` to synthesize rule type |
| `packages/runner/src/model/render-model.ts` | Add `hiddenActionsByClass` to `RenderModel` |
| `packages/runner/src/model/project-render-model.ts` | Preserve hidden actions in map, return with model |
| `packages/runner/src/ui/ActionTooltip.tsx` | Add companion actions section |
| `packages/runner/src/ui/ActionTooltip.module.css` | Add companion section styles |
| `packages/runner/src/ui/GameContainer.tsx` | Resolve companion actions, pass to tooltip |
| Test files (see above) | New/updated tests |

## Verification

1. `pnpm turbo build` — type changes compile
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint issues
4. `pnpm -F @ludoforge/runner test` — all runner tests pass
5. `pnpm -F @ludoforge/runner dev` — manual verification:
   - Hover Train in "Operation" group → operation steps only (no companion section)
   - Hover Train in "Operation + Special Activity" group → operation steps + "Special Activities" section listing available SAs with availability indicators
   - Other games (Texas Hold'em) unaffected (no `appendTooltipFrom` in their visual config)

## Out of Scope

- Changing the engine's `describeAction()` API
- Per-special-activity tooltip descriptions within the companion section (future enhancement)
- Interactive selection of special activities from within the tooltip
- Any changes to GameSpecDoc or the kernel
