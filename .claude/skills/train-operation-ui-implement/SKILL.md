---
name: train-operation-ui-implement
description: Use when the latest UI evaluation is ready and improvements need to be implemented. Reads the most recent EVALUATION from reports/ui-readability-evaluation.md, brainstorms solutions for the lowest-scoring metrics, and implements changes to the runner UI choice panel components.
---

# UI Readability Implementation

Improve the runner UI based on the latest evaluation's scores and recommendations.

## Checklist

1. Read `reports/ui-readability-evaluation.md` — focus on the latest EVALUATION #N
2. Identify the CRITICAL and HIGH recommendations
3. Note which metrics scored lowest — these are the priority targets
4. Read the relevant source files (see Key Files below)
5. Trace the data flow (see Data Flow Reference) and use Fix Category Triage to classify each issue as data pipeline or display logic
6. For the top 2-3 recommendations, identify the specific file and function to change before writing code
7. Implement changes, focusing on the highest-impact items first
8. Run verification: `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test`
9. Do NOT update the evaluation report — that happens in the next evaluate session

## Key Files

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/model/render-model.ts` | Type definitions for `RenderChoiceContext`, `RenderModel`, `RenderChoiceOption`, etc. |
| `packages/runner/src/model/runner-frame.ts` | Intermediate types — `RunnerChoiceStep` (breadcrumb entry shape), `RunnerChoiceContext`, `RunnerFrame` |
| `packages/runner/src/model/project-render-model.ts` | Display name resolution for zones, tokens, breadcrumbs, choice options |
| `packages/runner/src/model/derive-runner-frame.ts` | Derives `RunnerFrame` from engine state — source of `choiceContext`, breadcrumb steps, `iterationEntityId` |
| `packages/runner/src/model/iteration-context.ts` | `parseIterationContext()` — extracts iteration index, total, and entity ID from decision keys and the choice stack |
| `packages/runner/src/ui/ChoicePanel.tsx` | Choice panel layout, breadcrumb rendering, option buttons, header |
| `packages/runner/src/ui/ChoicePanel.module.css` | All choice panel styling — colors, spacing, typography |
| `packages/runner/src/utils/format-display-name.ts` | ID-to-display-name conversion (kebab-case, camelCase, snake_case) |
| `packages/runner/src/model/choice-value-utils.ts` | Choice value formatting with fallback strategies |
| `packages/runner/src/config/visual-config-types.ts` | Zod schemas for visual config (`ActionChoiceVisualSchema`, `ActionVisualSchema`, etc.) — must be updated when extending the config contract |
| `packages/runner/src/config/visual-config-provider.ts` | Visual config accessor methods (zone labels, display names, choice prompts, choice labels) |
| `packages/runner/src/ui/GameContainer.tsx` | Top-level layout that positions the choice panel |
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL-specific visual configuration overrides |

## Key Test Files

| File | What It Covers |
|------|---------------|
| `packages/runner/test/model/project-render-model-state.test.ts` | Render model projection tests — `choiceContext`, `decisionPrompt`, `decisionLabel`, breadcrumbs |
| `packages/runner/test/ui/ChoicePanel.test.ts` | ChoicePanel component rendering — `ChoiceContextHeader`, breadcrumb display, multi-select mode |

## Data Flow Reference

Understanding where values originate is critical for fixing display issues:

```
Engine ChoicePending (name, decisionKey, options)
  -> derive-runner-frame.ts -> RunnerFrame.choiceContext / choiceBreadcrumb
       (sets: decisionParamName, iterationEntityId, iterationGroupId)
    -> project-render-model.ts -> RenderModel.choiceContext / choiceBreadcrumb
         (resolves: decisionLabel, decisionPrompt, iterationLabel, displayName)
      -> ChoicePanel.tsx -> ChoiceContextHeader / CollapsedBreadcrumb
           (composes final display text from label + prompt + bounds + iteration)
```

Key transform points:
- `derive-runner-frame.ts` extracts `iterationEntityId` from `parseDecisionKey(decisionKey)` — this is where forEach iteration context enters. The breadcrumb entry type is `RunnerChoiceStep` (from `runner-frame.ts`).
- `iteration-context.ts` contains `parseIterationContext()` which maps decision key iteration paths to entity IDs via the choice stack — the core function for breadcrumb forEach context.
- `project-render-model.ts` resolves display names via visual config -> humanize -> formatId fallback chain
- `ChoicePanel.tsx` (`ChoiceContextHeader`) concatenates `decisionLabel`, `decisionPrompt`, bounds, `iterationLabel`, and `iterationProgress` into the final prompt string

### Fix Category Triage

Most eval issues fall into one of two categories:

- **Data pipeline fix** (wrong *content*): The rendered values are incorrect, duplicated, or missing. Fix in `derive-runner-frame.ts` (entity extraction) or `project-render-model.ts` (display name resolution). Examples: raw AST paths, missing iteration labels, duplicated label suffixes.
- **Display logic fix** (wrong *presentation*): The values are correct but shown poorly. Fix in `ChoicePanel.tsx` (layout, concatenation) or `ChoicePanel.module.css` (spacing, colors, typography). Examples: cramped breadcrumbs, weak visual distinction, layout hierarchy issues.

## Architecture Context

The choice panel display name resolution has 3 layers:
1. **Visual config override** — `visualConfigProvider.getZoneLabel(zoneId)` checks game-specific config
2. **Render model projection** — `projectRenderModel()` resolves display names for zones, tokens, breadcrumbs
3. **Fallback formatter** — `formatIdAsDisplayName()` converts raw IDs to Title Case

Raw `$variable` names and AST paths appear when the render model falls back to formatting raw internal decision keys as display names. The fix usually involves either:
- Adding display name resolution logic in `project-render-model.ts`
- Adding visual config overrides in the game's `visual-config.yaml`
- Improving the fallback formatting in `format-display-name.ts`
- Note: we have comprehensive raw AST humanization code (`humanizeDecisionParamName` in `format-display-name.ts`) that extracts the last meaningful segment from AST paths. Use this instead of `formatIdAsDisplayName` when the input might be an AST path.

### Extending Visual Config

When the existing visual config schema doesn't have the field you need (e.g., overriding a decision *label* rather than just a *prompt*), follow this pattern:

1. **Schema** (`visual-config-types.ts`): Add the field to the relevant Zod schema (e.g., `ActionChoiceVisualSchema`). Use `z.string().optional()` for new optional fields.
2. **Accessor** (`visual-config-provider.ts`): Add a getter method (e.g., `getChoiceLabel(actionId, paramName)`) that reads the new field from `this.config`.
3. **Consumer** (`project-render-model.ts`): Call the new accessor in the projection function, preferring the config value over the auto-generated fallback.
4. **Game config** (`data/games/fire-in-the-lake/visual-config.yaml`): Add the actual override values under the appropriate action/choice path.

### iterationLabel rendering path

`iterationLabel` comes from `iterationEntityId` in `derive-runner-frame.ts`. If the entity is a zone, it gets the zone's display name from `zonesById`. If not (e.g., an internal AST path segment), the fallback formatter runs on the raw entity ID. The `ChoiceContextHeader` renders `iterationLabel` alongside `decisionLabel` and `decisionPrompt`, so raw AST paths in `iterationLabel` leak directly into the prompt display.

Breadcrumb entries come from `frame.choiceBreadcrumb` in the render model. Grouping by `iterationGroupId` already exists but may need better formatting.

## Common Pitfalls

- **Label duplication**: Don't embed labels into `decisionPrompt` if `iterationLabel` or the `ChoiceContextHeader` also renders a label. There should be exactly one place that controls label display.
- **iterationLabel/decisionLabel deduplication**: `iterationEntityId` can resolve (via zone lookup or `humanizeDecisionParamName`) to the same string as the decision label (e.g., both become "Target Spaces"). The render model in `projectChoiceContext` suppresses `iterationLabel` when it matches `decisionLabel` — don't remove this check, or all prompts will show a redundant trailing "— Label" suffix.
- **AST path fallback**: `formatIdAsDisplayName()` does NOT strip AST path prefixes. Use `humanizeDecisionParamName()` when the input might be an AST path (e.g., `iterationEntityId` fallback, breadcrumb step names).
- **Prompt composition check**: When changing how `decisionPrompt`, `decisionLabel`, or `iterationLabel` are set, always verify what `ChoiceContextHeader` concatenates — it combines multiple fields into one visible string.
- **Test field contracts**: `RenderChoiceContext` is constructed directly in `ChoicePanel.test.ts` — any new fields added to the interface must also be added to those test fixtures.

## Scope Constraints

- Changes should improve ALL operations, not just Train — focus on shared primitives
- Do not modify engine code (`packages/engine/`) — UI-only changes
- Do not change game logic or game spec YAML — only rendering and display
- Keep CSS changes within the existing design token system (`--bg-panel`, `--accent`, etc.)
- The proposed changes should align with docs/FOUNDATIONS.md
