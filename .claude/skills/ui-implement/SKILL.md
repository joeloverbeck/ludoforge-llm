---
name: ui-implement
description: Use when the latest UI evaluation is ready and improvements need to be implemented. Reads the most recent EVALUATION from reports/ui-readability-evaluation.md, brainstorms solutions for the lowest-scoring metrics, and implements changes to the runner UI choice panel components.
---

# UI Readability Implementation

Improve the runner UI based on the latest evaluation's scores and recommendations.

## Checklist

1. Read `reports/ui-readability-evaluation.md` — focus on the latest EVALUATION #N
2. Identify the CRITICAL and HIGH recommendations
3. Note which metrics scored lowest — these are the priority targets
4. Read the relevant source files (see Key Files below)
5. Brainstorm approaches for the top 2-3 recommendations before implementing
6. Implement changes, focusing on the highest-impact items first
7. Run verification: `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test`
8. Do NOT update the evaluation report — that happens in the next evaluate session

## Key Files

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Choice panel layout, breadcrumb rendering, option buttons, header |
| `packages/runner/src/ui/ChoicePanel.module.css` | All choice panel styling — colors, spacing, typography |
| `packages/runner/src/model/project-render-model.ts` | Display name resolution for zones, tokens, breadcrumbs, choice options |
| `packages/runner/src/utils/format-display-name.ts` | ID-to-display-name conversion (kebab-case, camelCase, snake_case) |
| `packages/runner/src/model/choice-value-utils.ts` | Choice value formatting with fallback strategies |
| `packages/runner/src/canvas/visual-config-provider.ts` | Visual config overrides (zone labels, display names) |
| `packages/runner/src/ui/GameContainer.tsx` | Top-level layout that positions the choice panel |
| `data/games/fire-in-the-lake/fitl-visual-config.json` | FITL-specific visual configuration overrides |

## Architecture Context

The choice panel display name resolution has 3 layers:
1. **Visual config override** — `visualConfigProvider.getZoneLabel(zoneId)` checks game-specific config
2. **Render model projection** — `projectRenderModel()` resolves display names for zones, tokens, breadcrumbs
3. **Fallback formatter** — `formatIdAsDisplayName()` converts raw IDs to Title Case

Raw `$variable` names and AST paths appear when the render model falls back to formatting raw internal decision keys as display names. The fix usually involves either:
- Adding display name resolution logic in `project-render-model.ts`
- Adding visual config overrides in the game's `fitl-visual-config.json`
- Improving the fallback formatting in `format-display-name.ts`
- Note: we have comprehensive raw AST humanization code that we use for action tooltips. If possible, it could be reused and improved.

Breadcrumb entries come from `frame.choiceBreadcrumb` in the render model. Grouping by `iterationGroupId` already exists but may need better formatting.

## Scope Constraints

- Changes should improve ALL operations, not just Train — focus on shared primitives
- Do not modify engine code (`packages/engine/`) — UI-only changes
- Do not change game logic or game spec YAML — only rendering and display
- Keep CSS changes within the existing design token system (`--bg-panel`, `--accent`, etc.)
- The proposed changes should align with docs/FOUNDATIONS.md
