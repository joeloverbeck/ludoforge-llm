# Spec 52: Choice UI Legibility Improvements

**Status**: Draft
**Priority**: P2
**Complexity**: L
**Dependencies**: Spec 39 (React DOM UI layer), Spec 42 (visual config)
**Estimated effort**: 5-8 days
**Ticket prefix**: CHOICEUI

## Overview

The runner's action/choice UI progressively loses legibility as users drill into multi-step actions. Using FITL's US Train as a case study: the top-level action bar is decent, but once the user enters the choice flow, context vanishes -- no action name header, no decision prompt, opaque breadcrumbs (`[Da Nang None, Kontum None, ...]`), no indication of which space a per-space sub-choice applies to, and a stale-state bug allowing over-selection past bounds.

This spec covers 7 layers of improvements to the runner package, with minimal engine changes. The result is a choice UI that maintains full context throughout multi-step decision flows.

## Scope

### In Scope

- Remove vestigial action hint numbers from `ActionToolbar`
- Add contextual header to choice panel showing action name, decision prompt, and bounds
- Improve breadcrumb rendering with resolved entity names and iteration grouping
- Extract iteration context from kernel `decisionId` patterns
- Extend visual config schema with action/choice display labels
- Add FITL action labels to FITL visual config
- Fix `MultiSelectMode` stale state bug on decision transitions

### Out of Scope

- Full `describeDecision()` API for sub-choice tooltips (deferred to future spec)
- `describeAction()` extension for sub-choices
- Canvas-layer choice rendering (out of scope for this UI spec)
- Action tooltip content beyond what visual config `description` provides

## Layer 1: Remove Action Hint Numbers

### Problem

`ActionToolbar.tsx` renders sequential numeric hints (`1`, `2`, `3`, ...) next to each action button. These serve no functional purpose (no keyboard shortcut binding) and add visual noise.

### Changes

**`packages/runner/src/ui/ActionToolbar.tsx`**:
- Delete `hint` counter variable (line 32)
- Delete `displayHint` assignment and increment (lines 41-42)
- Delete `<span className={styles.hint}>{displayHint}</span>` (line 62)

**`packages/runner/src/ui/ActionToolbar.module.css`**:
- Delete `.hint` class (lines 61-67)

**Tests**: Update any ActionToolbar tests that assert on hint elements.

## Layer 2: Choice Context Header

### Problem

When the user selects an action and enters the choice flow, there is no header indicating which action they're building, what the current decision asks, or what the bounds are. The user must remember context from the action bar.

### New Type: `RenderChoiceContext`

Added to `render-model.ts` as an optional field on `RenderModel`:

```typescript
export interface RenderChoiceContext {
  /** Display name of the selected action, e.g. "Train" */
  readonly actionDisplayName: string;
  /** Human-readable decision prompt, e.g. "Select target spaces" */
  readonly decisionPrompt: string;
  /** Raw parameter name from the kernel, e.g. "targetSpaces" */
  readonly decisionParamName: string;
  /** Formatted bounds for chooseN, e.g. "1-6"; null for chooseOne */
  readonly boundsText: string | null;
  /** Current entity label when inside a forEach iteration, e.g. "Da Nang" */
  readonly iterationLabel: string | null;
  /** Progress indicator when inside forEach, e.g. "1 of 3" */
  readonly iterationProgress: string | null;
}
```

Add to `RenderModel`:
```typescript
readonly choiceContext: RenderChoiceContext | null;
```

### New Function: `deriveChoiceContext()`

Added to `derive-render-model.ts`. Logic:

1. If `context.selectedAction` is null or `context.choicePending` is null, return `null`.
2. Format action display name: look up `visualConfigProvider.getActionDisplayName(selectedAction)`, fallback to `formatIdAsDisplayName(selectedAction)`.
3. Format decision prompt: look up `visualConfigProvider.getChoicePrompt(selectedAction, choicePending.name)`, fallback to `formatIdAsDisplayName(choicePending.name)`.
4. For `chooseN` decisions: format bounds as `"{min}-{max}"` using `choicePending.min`/`choicePending.max`.
5. Extract iteration context from `choicePending.decisionId` using the iteration context utility (Layer 4).

### New Sub-Component: `ChoiceContextHeader`

Rendered at the top of `ChoicePanel`, inside the `.panel` section, before the breadcrumb:

```
[Train]                          <- action name badge
Select target spaces (1-6)       <- decision prompt with bounds
```

When inside a `forEach` iteration with iteration context available:
```
[Train]                          <- action name badge
Da Nang: Choose placement (1 of 3) <- iteration label + prompt + progress
```

For `discreteMany` mode, the existing `Selected: 0 of 1-6` counter in `MultiSelectMode` is retained (it provides live feedback on selection count). The header shows the static bounds context.

### CSS

New classes in `ChoicePanel.module.css`:
- `.choiceContextHeader` -- flex column container
- `.actionBadge` -- pill-shaped badge for action name
- `.decisionPrompt` -- secondary text for prompt + bounds
- `.iterationLabel` -- accent-colored label for current iteration entity

### Files

| File | Change |
|------|--------|
| `packages/runner/src/model/render-model.ts` | Add `RenderChoiceContext` interface, add `choiceContext` to `RenderModel` |
| `packages/runner/src/model/derive-render-model.ts` | Add `deriveChoiceContext()` function, wire into `deriveRenderModel()` |
| `packages/runner/src/ui/ChoicePanel.tsx` | Add `ChoiceContextHeader` sub-component |
| `packages/runner/src/ui/ChoicePanel.module.css` | Add header styles |

## Layer 3: Breadcrumb Improvements

### Problem 3a: Opaque breadcrumb values

`deriveChoiceBreadcrumb()` uses `formatChoiceValueFallback()` which produces `[Da Nang None, Kontum None, ...]` for array values. Zone IDs like `da-nang:none` are formatted as "Da Nang None" instead of the zone's actual display name.

### Problem 3b: Missing decision name context

Breadcrumb pills show only the chosen value, not which decision it answered. A pill showing "Da Nang, Kontum" gives no context about _what_ was chosen.

### Problem 3c: No visual grouping for forEach iterations

When a `chooseN` result triggers per-element sub-choices (e.g., "for each selected space, choose placement"), the breadcrumb is a flat list with no indication of the iteration structure.

### Solution 3a: `formatChoiceValueResolved()`

New function in `choice-value-utils.ts`:

```typescript
export function formatChoiceValueResolved(
  value: MoveParamValue,
  zonesById: ReadonlyMap<string, RenderZone>,
): string
```

For scalar string values: look up zone display name in `zonesById`, fallback to `formatIdAsDisplayName()`. For arrays: map each element through the same resolution, join with ", ". For non-string scalars: delegate to existing `formatChoiceScalar()`.

### Solution 3b: Decision name in breadcrumb pills

Change breadcrumb rendering from `step.chosenDisplayName` to `"{step.displayName}: {step.chosenDisplayName}"`.

### Solution 3c: Iteration group rendering

Add fields to `RenderChoiceStep`:

```typescript
export interface RenderChoiceStep {
  // ... existing fields ...
  /** Group ID for forEach iteration grouping; null when not in an iteration */
  readonly iterationGroupId: string | null;
  /** Display label for this iteration step, e.g. "Da Nang" */
  readonly iterationLabel: string | null;
}
```

In breadcrumb rendering, detect consecutive steps sharing an `iterationGroupId` and render them nested:

```
Target Spaces: Da Nang, Kontum, Pleiku Darlac
  Da Nang: Place Irregulars
  Kontum: Place At Base
  Pleiku Darlac: Place Irregulars
```

The parent breadcrumb pill (the `chooseN` result) renders at normal indent. Child steps (per-element sub-choices sharing the same `iterationGroupId`) render indented beneath.

### Files

| File | Change |
|------|--------|
| `packages/runner/src/model/render-model.ts` | Add `iterationGroupId`, `iterationLabel` to `RenderChoiceStep` |
| `packages/runner/src/model/derive-render-model.ts` | Pass `zonesById` to breadcrumb derivation, populate iteration fields |
| `packages/runner/src/model/choice-value-utils.ts` | Add `formatChoiceValueResolved()` |
| `packages/runner/src/ui/ChoicePanel.tsx` | Grouped breadcrumb rendering with indentation |
| `packages/runner/src/ui/ChoicePanel.module.css` | Indentation + group styling for nested breadcrumbs |

## Layer 4: Iteration Context Extraction

### Background

The kernel encodes iteration context in `decisionId` via `composeScopedDecisionId()` in `packages/engine/src/kernel/decision-id.ts`:

- `composeDecisionId()` appends `::resolvedBind` when a bind template is resolved (e.g., `decision:abc::da-nang:none`)
- `scopeDecisionIdForIteration()` appends `[N]` when no template resolution happened (e.g., `decision:abc[0]`)
- `extractResolvedBindFromDecisionId()` already exists to extract the resolved bind

### Engine Change

`extractResolvedBindFromDecisionId` is currently **not** exported from the engine's runtime barrel (`packages/engine/src/kernel/index.ts`). It must be added to the barrel export so the runner can import it.

This is a read-only utility function, no behavioral change to the engine.

### New Utility: `iteration-context.ts`

New file at `packages/runner/src/model/iteration-context.ts`:

```typescript
import type { PartialChoice } from '../store/store-types.js';
import type { RenderZone } from './render-model.js';

export interface IterationContext {
  /** Zero-based index of the current iteration */
  readonly iterationIndex: number;
  /** Total number of iterations (length of the chooseN result being iterated) */
  readonly iterationTotal: number;
  /** Raw entity ID from the iteration, e.g. "da-nang:none" */
  readonly currentEntityId: string;
  /** Resolved display name, e.g. "Da Nang" */
  readonly currentEntityDisplayName: string;
}

/**
 * Parse iteration context from the current decisionId and choice stack.
 *
 * Finds the most recent chooseN result in the choice stack (the array the
 * kernel is iterating over). Matches the iteration index from the decisionId
 * pattern (`[N]` suffix or `::resolvedBind` matching the Nth element of the
 * array). Resolves the Nth element against zone display names.
 *
 * Returns null if the current decision is not inside a forEach iteration.
 */
export function parseIterationContext(
  decisionId: string,
  choiceStack: readonly PartialChoice[],
  zonesById: ReadonlyMap<string, RenderZone>,
): IterationContext | null
```

### Implementation Logic

1. Use `extractResolvedBindFromDecisionId(decisionId)` to get the resolved bind (e.g., `"da-nang:none"`).
2. If no resolved bind, check for `[N]` suffix pattern on the decisionId.
3. Search `choiceStack` in reverse for the most recent entry whose `value` is an array (the `chooseN` result).
4. If resolved bind found: find its index in the array. If `[N]` found: use N directly.
5. Resolve the entity ID to a display name via `zonesById` lookup, fallback to `formatIdAsDisplayName()`.
6. Return `{ iterationIndex, iterationTotal: array.length, currentEntityId, currentEntityDisplayName }`.

### Files

| File | Change |
|------|--------|
| `packages/runner/src/model/iteration-context.ts` | NEW: `parseIterationContext()`, `IterationContext` type |
| `packages/engine/src/kernel/index.ts` | Export `extractResolvedBindFromDecisionId` from barrel |
| `packages/runner/src/model/derive-render-model.ts` | Import and use `parseIterationContext()` in context/breadcrumb derivation |

## Layer 5: Visual Config Extensions

### Problem

Action and choice option display names are currently auto-derived from IDs via `formatIdAsDisplayName()`. This produces reasonable but imprecise names. Game designers need control over action labels, decision prompts, and choice option names.

### Schema Additions

New `actions` section in `visual-config-types.ts`:

```typescript
const ActionChoiceOptionVisualSchema = z.object({
  displayName: z.string().optional(),
});

const ActionChoiceVisualSchema = z.object({
  prompt: z.string().optional(),
  description: z.string().optional(),
  options: z.record(z.string(), ActionChoiceOptionVisualSchema).optional(),
});

const ActionVisualSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  choices: z.record(z.string(), ActionChoiceVisualSchema).optional(),
});
```

Add to `VisualConfigSchema`:
```typescript
actions: z.record(z.string(), ActionVisualSchema).optional(),
```

### Provider Methods

New methods on `VisualConfigProvider`:

```typescript
getActionDisplayName(actionId: string): string | null
getActionDescription(actionId: string): string | null
getChoicePrompt(actionId: string, paramName: string): string | null
getChoiceOptionDisplayName(actionId: string, paramName: string, optionValue: string): string | null
```

All methods return `null` when no config is present, allowing callers to fall back to auto-derived names.

### FITL Visual Config

Add `actions` section to `data/games/fire-in-the-lake/visual-config.yaml`:

```yaml
actions:
  us-train:
    displayName: "Train"
    description: "Place ARVN forces in spaces with ARVN pieces"
    choices:
      targetSpaces:
        prompt: "Select spaces to train in"
      trainChoice:
        prompt: "Choose placement type"
        options:
          place-irregulars:
            displayName: "Place Irregulars"
          place-at-base:
            displayName: "Place at Base"
  us-patrol:
    displayName: "Patrol"
    choices:
      targetSpaces:
        prompt: "Select spaces to patrol through"
  us-sweep:
    displayName: "Sweep"
    choices:
      targetSpaces:
        prompt: "Select spaces to sweep"
  us-assault:
    displayName: "Assault"
    choices:
      targetSpaces:
        prompt: "Select spaces to assault"
  arvn-train:
    displayName: "Train"
    choices:
      targetSpaces:
        prompt: "Select spaces to train in"
  arvn-patrol:
    displayName: "Patrol"
    choices:
      targetSpaces:
        prompt: "Select spaces to patrol through"
  arvn-sweep:
    displayName: "Sweep"
    choices:
      targetSpaces:
        prompt: "Select spaces to sweep"
  arvn-assault:
    displayName: "Assault"
    choices:
      targetSpaces:
        prompt: "Select spaces to assault"
  nva-rally:
    displayName: "Rally"
    choices:
      targetSpaces:
        prompt: "Select spaces to rally in"
  nva-march:
    displayName: "March"
    choices:
      targetSpaces:
        prompt: "Select destination spaces"
  nva-attack:
    displayName: "Attack"
    choices:
      targetSpaces:
        prompt: "Select spaces to attack"
  nva-terror:
    displayName: "Terror"
    choices:
      targetSpaces:
        prompt: "Select spaces for terror"
  vc-rally:
    displayName: "Rally"
    choices:
      targetSpaces:
        prompt: "Select spaces to rally in"
  vc-march:
    displayName: "March"
    choices:
      targetSpaces:
        prompt: "Select destination spaces"
  vc-attack:
    displayName: "Attack"
    choices:
      targetSpaces:
        prompt: "Select spaces to attack"
  vc-terror:
    displayName: "Terror"
    choices:
      targetSpaces:
        prompt: "Select spaces for terror"
```

Note: The above is a representative initial set. Additional actions (special activities, event choices) will be added incrementally as their choice parameters are confirmed.

### Files

| File | Change |
|------|--------|
| `packages/runner/src/config/visual-config-types.ts` | Add `ActionChoiceOptionVisualSchema`, `ActionChoiceVisualSchema`, `ActionVisualSchema`; add `actions` to `VisualConfigSchema`; export derived types |
| `packages/runner/src/config/visual-config-provider.ts` | Add `getActionDisplayName()`, `getActionDescription()`, `getChoicePrompt()`, `getChoiceOptionDisplayName()` |
| `data/games/fire-in-the-lake/visual-config.yaml` | Add `actions` section with FITL action labels |

## Layer 6: Sub-Choice Tooltips (Design Decision)

This spec explicitly does **not** extend `describeAction()` for sub-choices. The visual config's `choices[paramName].description` field (Layer 5) provides static descriptions for choice parameters. A full `describeDecision(partialMove, decisionId)` API that generates dynamic context-aware descriptions is deferred to a future spec.

## Layer 7: MultiSelectMode Stale State Bug

### Problem

`MultiSelectMode`'s `selectedChoiceValueIds` state (line 109 of `ChoicePanel.tsx`) persists across decision changes. When the kernel sends a new `chooseN` decision with different bounds but overlapping option IDs, stale selections carry over past the new max.

The existing `useEffect` (lines 111-113) filters out options that are no longer legal, but it does not reset selections when the _decision itself_ changes -- only when the legal option set changes.

### Root Cause

React preserves component state when the component identity (type + position in tree) doesn't change. Since `MultiSelectMode` always renders in the same position within `ChoicePanel`, state persists even when the underlying decision transitions.

### Fix

1. Add `decisionId` to the `discreteMany` and `discreteOne` variants of `RenderChoiceUi`:

```typescript
export type RenderChoiceUi =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'discreteOne';
      readonly decisionId: string;
      readonly options: readonly RenderChoiceOption[];
    }
  | {
      readonly kind: 'discreteMany';
      readonly decisionId: string;
      readonly options: readonly RenderChoiceOption[];
      readonly min: number | null;
      readonly max: number | null;
    }
  | { readonly kind: 'numeric'; readonly domain: RenderChoiceDomain }
  | { readonly kind: 'confirmReady' }
  | { readonly kind: 'invalid'; readonly reason: RenderChoiceUiInvalidReason };
```

2. In `ChoicePanel.tsx`, pass `decisionId` as the React `key` prop on `MultiSelectMode`:

```tsx
{choiceUi.kind === 'discreteMany' ? (
  <MultiSelectMode
    key={choiceUi.decisionId}
    choiceUi={choiceUi}
    chooseN={async (selectedValues) => {
      await store.getState().chooseN(selectedValues);
    }}
  />
) : null}
```

This forces React to unmount/remount `MultiSelectMode` when the decision changes, cleanly resetting all local state (`selectedChoiceValueIds`, `useState` defaults).

### Files

| File | Change |
|------|--------|
| `packages/runner/src/model/render-model.ts` | Add `decisionId` to `discreteOne` and `discreteMany` variants |
| `packages/runner/src/model/derive-render-model.ts` | Populate `decisionId` from `context.choicePending.decisionId` |
| `packages/runner/src/ui/ChoicePanel.tsx` | Pass `key={choiceUi.decisionId}` on `MultiSelectMode` |

## Implementation Sequence

| Phase | Layer | Dependencies | Tickets | Parallelizable |
|-------|-------|-------------|---------|----------------|
| 1 | L1: Remove hints | none | CHOICEUI-001 | yes |
| 1 | L7: Bug fix | none | CHOICEUI-002 | yes |
| 2 | L5: Visual config schema + provider | none | CHOICEUI-003 | yes (after phase 1) |
| 2 | L5: FITL action labels | CHOICEUI-003 | CHOICEUI-004 | no |
| 3 | L4: Iteration context utility | none | CHOICEUI-005 | yes (after phase 1) |
| 3 | L2: Choice context header | CHOICEUI-003, CHOICEUI-005 | CHOICEUI-006 | no |
| 4 | L3a-b: Breadcrumb name resolution | CHOICEUI-005 | CHOICEUI-007 | no |
| 4 | L3c: Breadcrumb iteration grouping | CHOICEUI-007 | CHOICEUI-008 | no |

Phases 1 tickets are independent and can be done in parallel. Phase 2-4 follow the dependency chain.

## Ticket Summaries

### CHOICEUI-001: Remove Action Hint Numbers (L1)

Remove numeric hint counter from `ActionToolbar.tsx` and `.hint` CSS class from `ActionToolbar.module.css`. Update tests.

### CHOICEUI-002: Fix MultiSelectMode Stale State (L7)

Add `decisionId` to `discreteOne`/`discreteMany` variants of `RenderChoiceUi`. Populate in `derive-render-model.ts`. Pass as `key` prop on `MultiSelectMode` in `ChoicePanel.tsx`. Add regression test.

### CHOICEUI-003: Visual Config Action Schema (L5)

Add `ActionVisualSchema`, `ActionChoiceVisualSchema`, `ActionChoiceOptionVisualSchema` to `visual-config-types.ts`. Add `actions` to `VisualConfigSchema`. Add provider methods (`getActionDisplayName`, `getActionDescription`, `getChoicePrompt`, `getChoiceOptionDisplayName`) to `VisualConfigProvider`. Unit tests for all provider methods.

### CHOICEUI-004: FITL Action Labels (L5)

Add `actions` section to `data/games/fire-in-the-lake/visual-config.yaml` with display names and choice prompts for all FITL operations (US, ARVN, NVA, VC). Validate the visual config still parses.

### CHOICEUI-005: Iteration Context Utility (L4)

Create `packages/runner/src/model/iteration-context.ts` with `parseIterationContext()` and `IterationContext` type. Export `extractResolvedBindFromDecisionId` from engine kernel barrel. Unit tests for parsing `::resolvedBind` and `[N]` patterns.

### CHOICEUI-006: Choice Context Header (L2)

Add `RenderChoiceContext` type to `render-model.ts`. Add `deriveChoiceContext()` to `derive-render-model.ts`. Add `ChoiceContextHeader` sub-component to `ChoicePanel.tsx` with styles. Wire into render model. Unit tests for derivation and component rendering.

### CHOICEUI-007: Breadcrumb Name Resolution (L3a-b)

Add `formatChoiceValueResolved()` to `choice-value-utils.ts`. Update `deriveChoiceBreadcrumb()` to pass `zonesById` and use resolved names. Change breadcrumb pill rendering to `"{decisionName}: {chosenValue}"`. Unit tests for name resolution.

### CHOICEUI-008: Breadcrumb Iteration Grouping (L3c)

Add `iterationGroupId` and `iterationLabel` to `RenderChoiceStep`. Detect consecutive steps sharing an iteration group in `ChoicePanel.tsx` breadcrumb rendering. Render nested groups with indentation. CSS for group styling. Unit tests.

## Verification

1. `pnpm turbo typecheck` -- all types compile
2. `pnpm turbo test` -- all existing tests pass
3. `pnpm -F @ludoforge/runner test` -- runner tests pass
4. Manual verification: load FITL, play as US, select Train, verify:
   - No numeric hints on action buttons
   - "Train" header visible in choice panel
   - "Select target spaces (1-6)" prompt shown
   - Breadcrumb shows resolved zone names, not raw IDs with `:none` suffixes
   - Per-space sub-choices show "Da Nang:" context with iteration progress
   - `MultiSelectMode` resets properly on decision change (no stale selections)

## Critical Files Summary

| File | Layers | Change Type |
|------|--------|-------------|
| `packages/runner/src/model/render-model.ts` | L2, L3, L7 | Add types |
| `packages/runner/src/model/derive-render-model.ts` | L2, L3, L7 | Derivation logic |
| `packages/runner/src/model/iteration-context.ts` | L4 | NEW |
| `packages/runner/src/model/choice-value-utils.ts` | L3 | Add function |
| `packages/runner/src/ui/ActionToolbar.tsx` | L1 | Remove hints |
| `packages/runner/src/ui/ActionToolbar.module.css` | L1 | Remove class |
| `packages/runner/src/ui/ChoicePanel.tsx` | L2, L3, L7 | Header, breadcrumb, key fix |
| `packages/runner/src/ui/ChoicePanel.module.css` | L2, L3 | Styles |
| `packages/runner/src/config/visual-config-types.ts` | L5 | Schema |
| `packages/runner/src/config/visual-config-provider.ts` | L5 | Provider methods |
| `data/games/fire-in-the-lake/visual-config.yaml` | L5 | Action labels |
| `packages/engine/src/kernel/index.ts` | L4 | Barrel export |
| `packages/engine/src/kernel/decision-id.ts` | L4 | No changes (already correct) |
