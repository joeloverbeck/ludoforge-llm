---
name: train-operation-ui-evaluate
description: Use when new UI screenshots have been captured and need evaluation. Reads screenshots/fitl-train-*.png, scores 6 readability metrics, and appends the next EVALUATION #N to reports/ui-readability-evaluation.md. Invoke after manually capturing screenshots of the Train operation.
---

# UI Readability Evaluation

Score the current UI state from screenshots and append a structured evaluation to the report.

## Checklist

1. Read `reports/ui-readability-evaluation.md` — absorb the rubric and all prior evaluations
2. Read all `screenshots/fitl-train-*.png` files (use the Read tool — they are images)
3. Determine the next evaluation number from the last `## EVALUATION #N` heading
4. For each screenshot, write a paragraph describing what's shown and listing specific issues
5. Score all 6 metrics (1-10) with brief justification per metric
6. Compute score deltas from the previous evaluation
7. Write prioritized recommendations tagged CRITICAL / HIGH / MEDIUM / LOW
8. Append the complete evaluation section to `reports/ui-readability-evaluation.md`

## Evaluation Template

Append exactly this structure:

```markdown
---

## EVALUATION #N

**Date**: YYYY-MM-DD
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — [Brief title]
**What's shown**: [1-2 sentences]
**Issues observed**: [bullet list]

[...repeat for each screenshot...]

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | X | Y | +/-Z | [brief] |
| 2 | Option Legibility | X | Y | +/-Z | [brief] |
| 3 | Breadcrumb Navigability | X | Y | +/-Z | [brief] |
| 4 | Error Communication | X | Y | +/-Z | [brief] |
| 5 | Information Density | X | Y | +/-Z | [brief] |
| 6 | Visual Hierarchy | X | Y | +/-Z | [brief] |
| | **Average** | **X.X** | **Y.Y** | **+/-Z.Z** | |

### Prioritized Recommendations

1. **[CRITICAL]** ...
2. **[HIGH]** ...
3. **[MEDIUM]** ...
4. **[LOW]** ...
```

## Scoring Guide

- **1-3**: Unusable — raw internal names, incomprehensible layout
- **4-5**: Poor — partially readable but confusing
- **6-7**: Adequate — functional but not intuitive
- **8-9**: Good — clear, intuitive, well-organized
- **10**: Excellent — a player unfamiliar with the game could understand the UI

## What to Look For

- Raw `$variable` names or AST paths exposed to the player
- Breadcrumb entries that are walls of unreadable text
- Missing or misleading error explanations
- "None" suffixes or other formatting artifacts on zone/token names
- Cramped layout where breadcrumbs dominate over the actual decision
- Unclear selection ranges (e.g., `(0-3)` without context)
- Visual clutter competing with the primary decision
