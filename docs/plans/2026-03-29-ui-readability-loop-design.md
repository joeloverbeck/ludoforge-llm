# UI Readability Iterative Improvement Loop — Design

## Overview

A human-orchestrated, Claude-evaluated, Claude-implemented loop for improving the FITL game UI readability. The Train operation (US faction) serves as the focus case; improvements to shared choice panel primitives automatically benefit all operations.

## Loop Structure

Each iteration has 3 phases:

```
PHASE 1: CAPTURE (Human)
  Play through the US Train operation in the browser.
  Take 5 screenshots at key decision points.
  Save as screenshots/fitl-train-1.png through fitl-train-5.png (overwriting previous).

PHASE 2: EVALUATE (Claude Session A)
  Read reports/ui-readability-evaluation.md (rubric + prior evaluations).
  Read all screenshots/fitl-train-*.png.
  Append EVALUATION #N following the established format.

PHASE 3: IMPLEMENT (Claude Session B)
  Read the latest EVALUATION #N from reports/ui-readability-evaluation.md.
  Brainstorm and implement UI improvements targeting lowest-scoring metrics.
  Run typecheck and tests to verify.

Then return to PHASE 1.
```

## Evaluation Metrics (1-10)

| # | Metric | What It Measures |
|---|--------|-----------------|
| 1 | Decision Prompt Clarity | Is the prompt human-readable? Does it explain what the player needs to decide? |
| 2 | Option Legibility | Can you understand what each choice means? Are zone names, token types, action names clear? |
| 3 | Breadcrumb Navigability | Is the decision trail comprehensible? Can you understand where you are in the decision tree? |
| 4 | Error Communication | Are errors, constraints, and unavailability explained clearly? |
| 5 | Information Density | Is there too much or too little information? Is screen space used well? |
| 6 | Visual Hierarchy | Do your eyes know where to look? Is the most important information prominent? |

### Scoring Guide

- **1-3**: Unusable — raw internal names, incomprehensible layout
- **4-5**: Poor — partially readable but confusing
- **6-7**: Adequate — functional but not intuitive
- **8-9**: Good — clear, intuitive, well-organized
- **10**: Excellent — a player unfamiliar with the game could understand the UI

## Evaluator Session Prompt

Copy-paste this to start an evaluation session:

> Read `reports/ui-readability-evaluation.md` for the evaluation rubric and all prior evaluations. Then analyze all `screenshots/fitl-train-*.png` screenshots (there should be 5). Append the next EVALUATION #N following the established format:
>
> 1. Per-screenshot analysis: describe what's shown, list issues observed
> 2. Score table: rate each of the 6 metrics (1-10) with brief justification
> 3. Delta: compare scores against the previous evaluation
> 4. Prioritized recommendations: tag each as CRITICAL, HIGH, MEDIUM, or LOW
>
> Be specific about what's wrong and reference exact UI elements. Focus on what a human player would experience.

## Implementer Session Prompt

Copy-paste this to start an implementation session:

> Read the latest evaluation in `reports/ui-readability-evaluation.md`. Implement UI improvements targeting the CRITICAL and HIGH recommendations. Focus changes on the runner UI choice panel components:
>
> - `packages/runner/src/ui/ChoicePanel.tsx` — main choice panel component
> - `packages/runner/src/ui/ChoicePanel.module.css` — choice panel styling
> - `packages/runner/src/model/project-render-model.ts` — render model (display names, breadcrumbs)
> - `packages/runner/src/utils/format-display-name.ts` — ID-to-display-name formatting
> - `packages/runner/src/model/choice-value-utils.ts` — choice value formatting
> - `packages/runner/src/canvas/renderers/` — canvas-side rendering if relevant
>
> After implementing, run `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test` to verify.

## Key Runner Files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/ChoicePanel.tsx` | Main choice panel React component — header, breadcrumb, options, buttons |
| `packages/runner/src/ui/ChoicePanel.module.css` | CSS modules for choice panel styling |
| `packages/runner/src/model/project-render-model.ts` | Transforms GameState into UI-friendly RenderModel (display names, breadcrumbs) |
| `packages/runner/src/model/render-model.ts` | Type definitions for RenderModel |
| `packages/runner/src/utils/format-display-name.ts` | Converts internal IDs to human-readable display names |
| `packages/runner/src/model/choice-value-utils.ts` | Formats choice values with fallback strategies |
| `packages/runner/src/canvas/visual-config-provider.ts` | Configuration lookup for zone labels, display overrides |
| `packages/runner/src/ui/GameContainer.tsx` | Top-level layout that positions the choice panel |

## Differences from improve-loop

| Aspect | improve-loop | This loop |
|--------|-------------|-----------|
| Evaluation | Automated harness (script returning a number) | Claude session reading screenshots |
| Accept/Reject | Automated gate with MAD/UCB1 | Human orchestrates, scores track progress |
| Rollback | git checkout/reset in worktree | Standard git workflow on a branch |
| Iteration trigger | Autonomous (never stops) | Human captures screenshots to start next cycle |
| Strategy shifts | Plateau detection, backtracking | Evaluator recommendations guide priorities |
| Metric type | Quantitative (ms, pass/fail) | Qualitative (1-10 human-judged scores) |

## Report File

Single append-only file: `reports/ui-readability-evaluation.md`

Structure:
1. Static rubric header (metrics, scoring guide)
2. Separator
3. EVALUATION #1 (baseline)
4. EVALUATION #2 (after first implementation round)
5. ...and so on
