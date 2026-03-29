---
name: train-operation-ui-implement
description: Use when the latest UI evaluation is ready and improvements need to be implemented. Reads the most recent EVALUATION from reports/ui-readability-evaluation.md, brainstorms solutions for the lowest-scoring metrics, and implements changes to the runner UI choice panel components.
---

# UI Readability Implementation

Improve the runner UI based on the latest evaluation's scores and recommendations.

> **Note**: The skill is named "train-operation" because Train is the evaluation vehicle, but the choice panel is shared across all operations. Fixes should target shared primitives — not Train-specific logic. After implementing, check other operations for the same gaps (see Cross-Operation Check below).

## Checklist

1. Read `reports/ui-readability-evaluation.md` — focus on the latest EVALUATION #N
2. Identify the CRITICAL and HIGH recommendations
3. Note which metrics scored lowest — these are the priority targets
4. Read the relevant source files (see Key Files below)
5. Trace the data flow (see Data Flow Reference) and use Fix Category Triage to classify each issue as data pipeline or display logic
6. For the top 2-3 recommendations, identify the specific file and function to change before writing code
7. If a fix approach is ambiguous, apply the 1-3-1 rule (1 problem, 3 options, 1 recommendation) before proceeding — per Foundation #10 (Architectural Completeness)
8. Implement changes, focusing on the highest-impact items first
9. **Cross-Operation Check**: After implementing visual config additions, grep for similar param names across other operations in `visual-config.yaml`. If a param like `subAction` or `pacLevels` appears in Rally, Sweep, etc., add config entries for those too.
10. Run verification: `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test`
11. Do NOT update the evaluation report — that happens in the next evaluate session

## Key Files

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/model/render-model.ts` | Type definitions for `RenderChoiceContext`, `RenderModel`, `RenderChoiceOption`, etc. |
| `packages/runner/src/model/runner-frame.ts` | Intermediate types — `RunnerChoiceStep` (breadcrumb entry shape), `RunnerChoiceContext`, `RunnerFrame` |
| `packages/runner/src/model/project-render-model.ts` | Display name resolution for zones, tokens, breadcrumbs, choice options. Contains `resolveIterationEntityDisplayName` (zone-only iteration label lookup) and `resolveChoiceOptionDisplayName` (visual config option overrides). |
| `packages/runner/src/model/derive-runner-frame.ts` | Derives `RunnerFrame` from engine state — source of `choiceContext`, breadcrumb steps, `iterationEntityId`. Contains `isKnownZone` (base-ID prefix matching for zone validation). |
| `packages/runner/src/model/iteration-context.ts` | `parseIterationContext()` — extracts iteration index, total, and entity ID from decision keys and the choice stack |
| `packages/runner/src/ui/ChoicePanel.tsx` | Choice panel layout, breadcrumb rendering, option buttons, header, multi-select counter bounds |
| `packages/runner/src/ui/ChoicePanel.module.css` | All choice panel styling — colors, spacing, typography |
| `packages/runner/src/utils/format-display-name.ts` | ID-to-display-name conversion (kebab-case, camelCase, snake_case) |
| `packages/runner/src/model/choice-value-utils.ts` | Choice value formatting with fallback strategies |
| `packages/runner/src/config/visual-config-types.ts` | Zod schemas for visual config (`ActionChoiceVisualSchema`, `ActionVisualSchema`, etc.) — must be updated when extending the config contract |
| `packages/runner/src/config/visual-config-provider.ts` | Visual config accessor methods (zone labels, display names, choice prompts, choice labels, choice option display names) |
| `packages/runner/src/ui/GameContainer.tsx` | Top-level layout that positions the choice panel |
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL-specific visual configuration overrides |

## Key Test Files

| File | What It Covers |
|------|---------------|
| `packages/runner/test/model/project-render-model-state.test.ts` | Render model projection tests — `choiceContext`, `decisionPrompt`, `decisionLabel`, breadcrumbs, `iterationLabel` |
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
- `project-render-model.ts` resolves display names via visual config -> zone lookup -> null (non-zone entities are suppressed)
- `ChoicePanel.tsx` (`ChoiceContextHeader`) concatenates `decisionLabel`, `decisionPrompt`, bounds, `iterationLabel`, and `iterationProgress` into the final prompt string

### Multi-Select Counter Bounds

The multi-select counter ("Selected: X of Y") computes its bounds separately from the header prompt. The bounds path is:

```
ChoicePanel.tsx effectiveContext useMemo
  -> deriveMultiSelectBounds(min, max, effectiveLegalCount) -> boundsText for prompt
MultiSelectMode component
  -> deriveMultiSelectBounds(min, max, effectiveOptionCount) -> bounds for counter text
```

Both call `deriveMultiSelectBounds(min, max, optionCount)` where `optionCount` caps the `max` value. When computing `optionCount`, **include options that are already selected** — otherwise the count drops to 0 when all options are selected and their legality changes to `illegal` (since they can't be re-added). The effective count formula is: options where `legality !== 'illegal'` OR `choiceValueId` is in the selected set.

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

Per Foundation #3 (Visual Separation), when a display issue involves a *missing* visual config entry, the fix is always a config addition + optional accessor wiring in the runner — never an engine change or GameSpecDoc modification.

### Extending Visual Config

When the existing visual config schema doesn't have the field you need (e.g., overriding a decision *label* rather than just a *prompt*), follow this pattern:

1. **Schema** (`visual-config-types.ts`): Add the field to the relevant Zod schema (e.g., `ActionChoiceVisualSchema`). Use `z.string().optional()` for new optional fields.
2. **Accessor** (`visual-config-provider.ts`): Add a getter method (e.g., `getChoiceLabel(actionId, paramName)`) that reads the new field from `this.config`.
3. **Consumer** (`project-render-model.ts`): Call the new accessor in the projection function, preferring the config value over the auto-generated fallback.
4. **Game config** (`data/games/fire-in-the-lake/visual-config.yaml`): Add the actual override values under the appropriate action/choice path.

### Option Display Name Overrides

Choice option display names (e.g., "None" -> "Skip") are resolved through visual config. The flow:

1. `ActionChoiceVisualSchema` has an `options` field: `z.record(z.string(), ActionChoiceOptionVisualSchema)` where each entry has an optional `displayName`.
2. `visualConfigProvider.getChoiceOptionDisplayName(actionId, paramName, optionValue)` reads the override.
3. `resolveChoiceOptionDisplayName()` in `project-render-model.ts` checks the visual config override FIRST, before the zone/token/fallback chain.

To add a new option override, add it to `visual-config.yaml`:
```yaml
actionId:
  choices:
    paramName:
      options:
        optionValue:
          displayName: Human-Friendly Label
```

### iterationLabel rendering path

`iterationLabel` comes from `iterationEntityId` in `derive-runner-frame.ts`. The render model resolves it via `resolveIterationEntityDisplayName()`:
- If the entity matches a zone in `zonesById` (exact match or base-ID prefix match), the zone's display name is used.
- If the entity is NOT a known zone (e.g., a decision param name fallback), `null` is returned — the label is suppressed to prevent internal jargon from leaking into the UI.
- The `ChoiceContextHeader` renders non-null `iterationLabel` as ` — ${iterationLabel}` after the prompt.

Breadcrumb entries use the same zone-only resolution. When `iterationLabel` is null for grouped breadcrumb entries, the fallback rendering shows `(1/3)` numbering instead.

The `deriveChoiceBreadcrumb` function has three fallbacks for setting `iterationEntityId`:
1. `parseIterationContext()` — forEach path in decision key
2. `resolvedBind` from `parseDecisionKey()` — only if the bind is a known zone (validated via `isKnownZone()`)
3. Array-index lookup — walks backward through the choice stack, finds the most recent array-valued choice, and indexes into it using the step's position within its group

If fallback #2 sets a non-zone value (e.g., a param name), it blocks fallback #3 from running. That's why #2 validates against `zonesById` first.

## Known Gotchas

These are hard-won lessons from previous implementation sessions. Check this section before implementing any fix.

### Zone ID composite key mismatch

`zonesById` in the render model uses **composite keys** (`zoneId:owner`, e.g., `table:none`, `binh-dinh:none`). But engine iteration entities and choice stack values use **base zone IDs** (`table`, `binh-dinh`). When checking if an entity is a known zone:
- Try `zonesById.get(entityId)` first (exact match)
- Fall back to prefix matching: check if any zone ID starts with `entityId + ':'`
- Helper functions exist: `isKnownZone()` in `derive-runner-frame.ts` and `resolveIterationEntityDisplayName()` in `project-render-model.ts`

### Counter bounds must include selected items

`deriveMultiSelectBounds(min, max, legalOptionCount)` uses `legalOptionCount` to cap `max`. When all options are selected, the engine may mark them `illegal` (can't add more), dropping `legalOptionCount` to 0. This produces "Selected: 3 of 0". Always compute `legalOptionCount` as options that are either legal OR in the selected set.

### iterationLabel deduplication still applies

`projectChoiceContext` suppresses `iterationLabel` when it matches `decisionLabel` (e.g., both resolve to "Target Spaces"). Don't remove this check or all prompts will show a redundant trailing "— Label" suffix.

### resolvedBind is not always a zone

`parseDecisionKey(key).resolvedBind` can be a zone ID (e.g., `binh-dinh`) or a decision param name (e.g., `trainChoice`). The 2nd fallback in `deriveChoiceBreadcrumb` must validate it against `zonesById` before using it as `iterationEntityId` — otherwise the 3rd fallback (array-index lookup, which correctly finds the target zone) is blocked.

## Common Pitfalls

- **Label duplication**: Don't embed labels into `decisionPrompt` if `iterationLabel` or the `ChoiceContextHeader` also renders a label. There should be exactly one place that controls label display.
- **AST path fallback**: `formatIdAsDisplayName()` does NOT strip AST path prefixes. Use `humanizeDecisionParamName()` when the input might be an AST path (e.g., `iterationEntityId` fallback, breadcrumb step names).
- **Prompt composition check**: When changing how `decisionPrompt`, `decisionLabel`, or `iterationLabel` are set, always verify what `ChoiceContextHeader` concatenates — it combines multiple fields into one visible string.
- **Test field contracts**: `RenderChoiceContext` is constructed directly in `ChoicePanel.test.ts` — any new fields added to the interface must also be added to those test fixtures.

## Scope Constraints

- Changes should improve ALL operations, not just Train — focus on shared primitives
- Do not modify engine code (`packages/engine/`) — UI-only changes (Foundation #3: Visual Separation)
- Do not change game logic or game spec YAML — only rendering and display
- Keep CSS changes within the existing design token system (`--bg-panel`, `--accent`, etc.)
- The proposed changes should align with docs/FOUNDATIONS.md
