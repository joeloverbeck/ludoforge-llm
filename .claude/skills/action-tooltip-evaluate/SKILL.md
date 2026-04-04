---
name: action-tooltip-evaluate
description: Use when new action tooltip screenshots have been captured and need evaluation. Reads screenshots/action-tooltips/*.png, scores 8 readability metrics, and appends the next EVALUATION #N to reports/action-tooltip-evaluation.md. Invoke after manually capturing screenshots of action tooltips from the runner.
---

# Action Tooltip Readability Evaluation

Score the current action tooltip rendering from screenshots and append a structured evaluation to the report.

## Baseline Evaluation (EVALUATION #1)

When performing the first evaluation (no prior evaluations exist):
- **Verify Screenshot Reference**: After discovering screenshots via glob, check that the Screenshot Reference section in the rubric header matches the actual files. Update it if inaccurate (e.g., if the rubric says `fitl-train.png` but the actual files are `fitl-train-1.png` and `fitl-train-2.png`).
- **Deltas**: Use `—` for all Previous and Delta columns.
- **Resolved Since Previous**: Write "No previous evaluation exists — this is the baseline evaluation."
- **Recurring Issue Tracking**: Skip — all issues are new by definition.
- **Score Trend**: Skip — requires 3+ evaluations.

## Checklist

1. Read `reports/action-tooltip-evaluation.md` — absorb the rubric and the last 2-3 evaluations. The file grows with each evaluation; use this strategy:
   - If the file has fewer than 400 lines, read the entire file in one pass.
   - Otherwise: read the first ~50 lines for the rubric, metrics, and scoring guide. Count total lines (`wc -l`), then read from `offset = totalLines - 250` to get the last 2-3 evaluations in one pass (each evaluation is ~80-120 lines).
   - To build the Score Trend table efficiently, grep for `\*\*Average\*\*` in the report file — this returns all historical averages in one pass.
   - Skip intermediate evaluations unless checking recurring issue history.
2. Discover and read all current screenshots:
   - Glob `screenshots/action-tooltips/*.png` to find all current screenshots.
   - Read all discovered screenshots in **parallel** (all Read tool calls in a single message).
   - **Baseline only**: Verify the Screenshot Reference section in the rubric header matches the discovered files. Update if inaccurate.
3. Determine the next evaluation number from the last `## EVALUATION #N` heading.
4. **If the screenshot count changed** from the previous evaluation, note this prominently. Explain what new screenshots capture, add a comparability caveat (see Screenshot Set Changes below), and update the **Screenshot Reference** section at the top of the report file to describe all current screenshots.
5. For each screenshot, write a paragraph describing what's shown and listing specific issues related to the 8 metrics. Focus on:
   - Does the text read like a game manual or a database query?
   - Are internal identifiers, `$variables`, filter predicates, or kebab-case IDs visible?
   - Are step headers descriptive or generic?
   - Are costs, optional steps, and mandatory steps visually distinguishable?
   - Can the tooltip be understood in 5 seconds of scanning?
   - **Multi-screenshot tooltips**: When multiple screenshots capture the same tooltip at different scroll positions (e.g., `fitl-train-1.png` and `fitl-train-2.png`), analyze them as a single combined entry with a header like `fitl-train-1.png + fitl-train-2.png — Train Tooltip`. Deduplicate observations — list each issue once with a note about which screenshot(s) show it.
6. Score all 8 metrics (1-10) with brief justification per metric.
7. Compute score deltas from the previous evaluation. "Previous evaluation" means the most recent *scored* evaluation — skip any No Change stubs when looking up previous scores. For the first evaluation, use `—` for Previous and Delta columns.
8. List resolved issues from the previous evaluation (see template). For the first evaluation, write: "No previous evaluation exists — this is the baseline evaluation."
9. Write prioritized recommendations tagged CRITICAL / HIGH / MEDIUM / LOW. Recommendations should describe **what the player sees** and **why it's a problem**, not how to fix it. Do not include root cause analysis, file-level attributions, or implementation approach suggestions (e.g., "via verbalization data", "by target type"). The `action-tooltip-plan` skill determines the how. Example: write "Filter predicates shown as raw text to the player" not "tooltip-template-realizer.ts serializes filter AST" and not "resolve via verbalization labels".
10. Flag recurring issues — note how many consecutive evaluations each issue has persisted.
11. If 3+ evaluations exist, include a Score Trend table (see template).
12. Append the complete evaluation section to `reports/action-tooltip-evaluation.md`.

## Evaluation Template

Append exactly this structure:

```markdown
---

## EVALUATION #N

**Date**: YYYY-MM-DD
**Screenshots analyzed**: [list of screenshot filenames]
[If screenshot count changed: **Screenshot set change**: Expanded from M to N screenshots. New screenshots capture [brief description]. Scores may reflect newly visible issues, not regressions — see comparability note below.]

### Screenshot Analysis

For each screenshot analyzed, add a section:

#### [screenshot-filename] — [Action Name] Tooltip
**What's shown**: [1-2 sentences describing the tooltip state — action type, step count, scroll length]
**Issues observed**: [bullet list of specific issues related to the 8 metrics]

### Cross-Tooltip Consistency

[Check these elements for cross-tooltip consistency: step header conventions, cost positioning, optionality markers, modifier display, identifier humanization. Note any inconsistencies — e.g., costs at step 5 in one tooltip but step 8 in another, or different header styles for semantically similar steps. If all tooltips are consistent, write: "Structural elements are consistent across all analyzed tooltips."]

### Resolved Since Previous

- [Issue description] — was [SEVERITY] in Eval #M, now fixed. [Brief description of the fix.]
[If none: "No issues from the previous evaluation were resolved." Optionally add context.]

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | X | Y | +/-Z | [brief] |
| 2 | Step Semantic Clarity | X | Y | +/-Z | [brief] |
| 3 | Information Hierarchy | X | Y | +/-Z | [brief] |
| 4 | Terminology Consistency | X | Y | +/-Z | [brief] |
| 5 | Progressive Disclosure | X | Y | +/-Z | [brief] |
| 6 | Visual Scannability | X | Y | +/-Z | [brief] |
| 7 | Cost Transparency | X | Y | +/-Z | [brief] |
| 8 | Optional/Mandatory Distinction | X | Y | +/-Z | [brief] |
| | **Average** | **X.X** | **Y.Y** | **+/-Z.Z** | |

[If screenshot set changed: **Comparability note**: This evaluation covers N screenshots (previous: M). Score changes may partly reflect expanded coverage revealing pre-existing issues rather than regressions introduced since the last evaluation.]

### Score Trend (include if 3+ evaluations exist)

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

## Correction Protocol

If the user disputes part of an already-appended evaluation:
1. Do NOT append a new evaluation — edit the existing one in-place.
2. Re-read any additional screenshots or evidence the user points to.
3. Update the specific observations, scores, and recommendations that are affected.
4. Re-verify the average and delta calculations after any score change.
5. Add a `**Corrections**` line immediately after the `**Date**` line: `**Corrections**: [YYYY-MM-DD] Revised [metric name] score from X to Y after reviewing [screenshot/evidence]. [Brief reason.]`

## Scoring Guide

- **1-3**: Unusable — raw engine output, filter predicates as text ("Faction eq us and type in troops"), `$variable` names, kebab-case capability IDs, magic numbers ("Select up to 99")
- **4-5**: Poor — some humanization but still reads like technical output, generic "Select spaces" headers, internal jargon mixed with readable text
- **6-7**: Adequate — mostly readable, occasional jargon leaks, step grouping could be clearer, costs not visually prominent
- **8-9**: Good — reads like a board game reference card, clear step headers, prominent costs, optional steps marked, minimal technical artifacts
- **10**: Excellent — indistinguishable from a professionally written game manual tooltip, perfect visual hierarchy, instant scannability

When an issue is partially resolved, score based on the **current player experience**, not on the effort applied. A humanized-but-meaningless string ("Cap Assault Cobras Shaded Cost") is better than a raw identifier ("Cap-assault-cobras-shaded-cost") but still fails the "reads like a game manual" test — score accordingly.

## What to Look For

### Language & Content Issues
- Filter predicates exposed as text: "Faction eq us and type in troops, police"
- Raw `$variable` references: "$cube", "$troop", "$transferAmount"
- Kebab-case capability/modifier IDs: "Cap-sweep-cobras-unshaded-removal"
- Magic numbers: "Select up to 99" (meaning "unlimited"), "Select 1-99"
- Internal property names: "m48patrol Moved eq true"
- Database-query-style boolean operators: "and", "eq", "in" used as filter syntax

### Structure & Organization Issues
- Repetitive generic step headers: all steps labeled "Select spaces"
- Steps that mix selection, payment, and placement without clear grouping
- Missing distinction between mandatory and optional steps
- Costs buried in mid-sequence steps rather than prominently displayed
- Deeply nested sub-steps that obscure the main action flow

### Visual & Presentation Issues
- No visual hierarchy — all text same weight and style
- Tooltip requires excessive scrolling without collapsible sections
- Costs not visually distinguished from action steps
- No visual indicator for optional vs mandatory steps
- Dense monospace text walls without visual anchors

### Regressions
- Issues absent in previous evaluations that appeared after recent changes

## Screenshot Set Changes

When the number of screenshots changes between evaluations:
- Note the change in the evaluation header
- Describe what the new (or removed) screenshots capture
- Update the **Screenshot Reference** section near the top of the report file to describe all current screenshots
- Mark issues found only in new screenshots as "newly visible" rather than "regression"
- Add the comparability note to the scores section

## Regression Severity

Classify regressions by the metric score drop they cause:
- **Major regression** (metric drops by 2+): Tag as `*(Major regression: -N on [Metric])*`. These indicate a fix broke something substantially.
- **Minor regression** (metric drops by 1): Tag as `*(Regression: -1 on [Metric])*`. These may be acceptable trade-offs.
- Regressions that affect multiple metrics simultaneously are especially concerning — call this out.

## Recurring Issue Tracking

When writing recommendations, check prior evaluations to determine if each issue is new or recurring:
- If an issue appeared in the previous evaluation, note it as "Recurring: N consecutive evaluations"
- When tagging recurring issues, note whether the associated metric is stable, improving, or declining. Escalation at 3+ evaluations is a consideration trigger, not an automatic action — weigh persistence alongside metric trajectory
- New regressions should be called out explicitly
- If a previously reported issue is now resolved, note this in the "Resolved Since Previous" section

## Stagnation Detection

### Overall stagnation

Stagnation occurs when **both** conditions are met:
1. The same issue has been the top actionable recommendation for 3+ consecutive evaluations
2. The average score has not improved by 0.5+ points across those evaluations

When stagnation is detected, note it explicitly and suggest that the `action-tooltip-plan` skill research alternative approaches before the next implementation cycle.

### Per-metric stagnation

If any individual metric has a delta of 0 (unchanged score) for 3+ consecutive evaluations, note this in the recommendations section as per-metric stagnation — even if the issue is not the top recommendation and the overall average is improving. Example: "Terminology Consistency has been unchanged at 4 for 3 evaluations — consider focused attention in the next plan."

When multiple metrics stagnate simultaneously and all share the same layer dependency (e.g., all require runner-layer changes but only engine-layer changes have been made), note this pattern explicitly and recommend a layer shift in the next plan iteration.

### Oscillation

If the Score Trend shows oscillation (alternating positive/negative deltas for 4+ evaluations), this suggests fixes are introducing regressions. Note this pattern and recommend a more cautious, incremental implementation approach.

## Report File Maintenance

When the report file exceeds ~500 lines or ~10 evaluations, archive older evaluations.

**What to keep in the active file**: The rubric/header (everything before the first `---` separator) and the last 5 evaluations.

**Archival procedure**:
1. Identify which evaluations to archive — keep the rubric + last 5 evaluations
2. Grep for `^## EVALUATION #` to find all evaluation line numbers
3. Find the line number of the `---` separator immediately before the oldest evaluation to keep
4. Read the content to be archived
5. Write or append to `reports/action-tooltip-evaluation-archive.md`:
   - If the archive file does not exist, create it with a header: `# Action Tooltip Evaluation — Archive`
   - If it already exists, append the new archived evaluations after the existing content
6. Archive evaluations **verbatim** — do not condense or summarize
7. Remove the archived evaluations from the active file
8. Verify: grep for `## EVALUATION #` in both files to confirm the correct split

## Graduation

If the average score reaches **8.0+** and no CRITICAL or HIGH recommendations remain, note in the evaluation that the action tooltip readability has graduated to acceptable quality. Further evaluations are optional — invoke only after significant tooltip rendering changes.

## Unchanged Rendering

Before concluding "no change," explicitly check each metric against the most recent scored evaluation's description:

1. **Language Naturalness**: Are filter predicates, $variables, and raw identifiers the same?
2. **Step Semantic Clarity**: Are step headers the same labels?
3. **Information Hierarchy**: Is the visual weight distribution the same?
4. **Terminology Consistency**: Are the same internal terms leaking?
5. **Progressive Disclosure**: Is the tooltip length and collapsibility the same?
6. **Visual Scannability**: Is the typography and spacing the same?
7. **Cost Transparency**: Are costs displayed in the same position and style?
8. **Optional/Mandatory Distinction**: Is optionality marked the same way?

Only if all 8 checks confirm no visible change should the no-change stub be used.

If both rendering AND screenshots are unchanged since the previous evaluation, append a brief stub:

```markdown
---

## EVALUATION #N — No Change

**Date**: YYYY-MM-DD
**Screenshots analyzed**: [list]

Rendering and screenshot set unchanged since Eval #N-1. No new evaluation needed. Re-evaluate after the next implementation cycle.
```

## Scope

This skill evaluates action tooltips from `screenshots/action-tooltips/*.png`. The 8 metrics are scoped to action tooltip readability — measuring how well the tooltips present action instructions to players. For other evaluation needs (map rendering, choice panel UI), use the appropriate evaluation skill.
