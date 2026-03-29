---
name: train-operation-ui-evaluate
description: Use when new UI screenshots have been captured and need evaluation. Reads screenshots/fitl-train-*.png, scores 6 readability metrics, and appends the next EVALUATION #N to reports/ui-readability-evaluation.md. Invoke after manually capturing screenshots of the Train operation.
---

# UI Readability Evaluation

Score the current UI state from screenshots and append a structured evaluation to the report.

## Checklist

1. Read `reports/ui-readability-evaluation.md` — absorb the rubric and the last 2-3 evaluations. The file grows with each evaluation; use this strategy:
   - Read the first ~30 lines for the rubric and scoring guide
   - Read backward from the end of the file in ~100-line chunks until you have the last 2-3 complete evaluations (each evaluation is ~70-100 lines)
   - Skip intermediate evaluations unless checking recurring issue history
2. Glob for `screenshots/fitl-train-*.png` to discover all available screenshots, then read them in **parallel batches of 5-6** (use multiple Read tool calls in a single message). This minimizes tool call rounds.
3. Determine the next evaluation number from the last `## EVALUATION #N` heading
4. **If the screenshot count changed** from the previous evaluation, note this prominently. Explain what new screenshots capture and add a comparability caveat (see Screenshot Set Changes below).
5. For each screenshot, write a paragraph describing what's shown and listing specific issues
6. Score all 6 metrics (1-10) with brief justification per metric
7. Compute score deltas from the previous evaluation
8. List resolved issues from the previous evaluation (see template)
9. Write prioritized recommendations tagged CRITICAL / HIGH / MEDIUM / LOW
10. Flag recurring issues — note how many consecutive evaluations each issue has persisted
11. If 5+ evaluations exist, include a Score Trend table (see template)
12. Append the complete evaluation section to `reports/ui-readability-evaluation.md`

## Evaluation Template

Append exactly this structure:

```markdown
---

## EVALUATION #N

**Date**: YYYY-MM-DD
**Screenshots analyzed**: fitl-train-1.png through fitl-train-N.png
[If screenshot count changed: **Screenshot set change**: Expanded from M to N screenshots. New screenshots capture [brief description]. Scores may reflect newly visible issues, not regressions — see comparability note below.]

### Screenshot Analysis

#### fitl-train-1.png — [Brief title]
**What's shown**: [1-2 sentences]
**Issues observed**: [bullet list]

[...repeat for each screenshot...]

### Resolved Since Previous

- [Issue description] — was [SEVERITY] in Eval #M, now fixed. [Brief description of the fix.]
[If none: "No issues from the previous evaluation were resolved."]

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

[If screenshot set changed: **Comparability note**: This evaluation covers N screenshots (previous: M). Score changes may partly reflect expanded coverage revealing pre-existing issues rather than regressions introduced since the last evaluation.]

### Score Trend (include if 5+ evaluations exist)

| Eval | Avg | Delta |
|------|-----|-------|
| #N-4 | X.X | +/-Z.Z |
| #N-3 | X.X | +/-Z.Z |
| #N-2 | X.X | +/-Z.Z |
| #N-1 | X.X | +/-Z.Z |
| #N   | X.X | +/-Z.Z |

[If the trend shows oscillation (alternating positive/negative deltas for 4+ evaluations), note this explicitly: "The score is oscillating — fixes are likely introducing regressions. Consider a more cautious implementation approach."]

### Prioritized Recommendations

1. **[CRITICAL]** ... *(Recurring: N consecutive evaluations)* | *(New regression — major: -2 or more on metric X)*
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

- Raw internal identifiers exposed to the player (AST paths, binding names, internal jargon)
- Breadcrumb entries that are walls of unreadable text or lack iteration context
- Missing or misleading error explanations
- Formatting artifacts on labels (duplicated prefixes, trailing suffixes, "None" appended to names)
- Cramped layout where breadcrumbs dominate over the actual decision
- Unclear selection ranges without context
- Visual clutter competing with the primary decision
- Semantically misleading styling (e.g., strikethrough on selected items)
- **Regressions** — issues that were absent in previous evaluations but appeared after recent changes

## Screenshot Set Changes

When the number of screenshots changes between evaluations:
- Note the change in the evaluation header
- Describe what the new (or removed) screenshots capture
- Mark issues found only in new screenshots as "newly visible" rather than "regression" — these issues may have always existed but were not captured before
- Scores may drop due to expanded coverage without any code change. Add the comparability note to the scores section to prevent misinterpreting this as a regression.

## Regression Severity

Classify regressions by the metric score drop they cause:
- **Major regression** (metric drops by 2+): Tag as `*(Major regression: -N on [Metric])*`. These indicate a fix broke something substantially.
- **Minor regression** (metric drops by 1): Tag as `*(Regression: -1 on [Metric])*`. These may be acceptable trade-offs.
- Regressions that affect multiple metrics simultaneously are especially concerning — call this out.

## Recurring Issue Tracking

When writing recommendations, check prior evaluations to determine if each issue is new or recurring:
- If an issue appeared in the previous evaluation, note it as "Recurring: N consecutive evaluations"
- Issues persisting for 3+ evaluations should be *considered* for escalation — weigh both persistence and impact severity when deciding (a LOW cosmetic issue persisting for 5 evaluations doesn't automatically become CRITICAL)
- New regressions (issues not present in the previous evaluation) should be called out explicitly as regressions
- If a previously reported issue is now resolved, note this in the "Resolved Since Previous" section

## Stagnation Detection

Stagnation occurs when **both** conditions are met:
1. The same issue has been the top actionable recommendation for 3+ consecutive evaluations
2. The average score has not improved by 0.5+ points across those evaluations

When stagnation is detected, note it explicitly and suggest shifting to the `train-operation-ui-implement` skill to address the structural issues before running another evaluation cycle.

If the Score Trend shows oscillation (alternating positive/negative deltas for 4+ evaluations), this suggests fixes are introducing regressions. Note this pattern and recommend a more cautious, incremental implementation approach.

## Report File Maintenance

When the report file exceeds ~500 lines or ~10 evaluations, archive older evaluations:
- Keep the rubric and the last 5 evaluations in the active file
- Move archived evaluations to `reports/ui-readability-evaluation-archive.md`
- Preserve the archive file's existing content (append, don't overwrite)
