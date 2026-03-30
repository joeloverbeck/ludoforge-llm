---
name: map-representation-evaluate
description: Use when new map screenshots have been captured and need evaluation. Reads screenshots/fitl-game-map*.png and screenshots/fitl-map-editor*.png, scores 4 map representation metrics, and appends the next EVALUATION #N to reports/map-representation-evaluation.md. Invoke after manually capturing screenshots of the FITL game map and map editor.
---

# Map Representation Evaluation

Score the current FITL map rendering state from screenshots and append a structured evaluation to the report.

## Checklist

1. Read `reports/map-representation-evaluation.md` — absorb the rubric and the last 2-3 evaluations. The file grows with each evaluation; use this strategy:
   - If the file has fewer than ~300 lines, read the entire file in one pass — the two-pass strategy below is unnecessary.
   - Otherwise: read the first ~40 lines for the rubric, metrics, and scoring guide. Count total lines (`wc -l`), then read from `offset = totalLines - 200` to get the last 2-3 evaluations in one pass (each evaluation is ~60-80 lines).
   - To build the Score Trend table efficiently, grep for `\*\*Average\*\*` in the report file — this returns all historical averages in one pass.
   - Skip intermediate evaluations unless checking recurring issue history.
2. Discover and read all current screenshots:
   - Glob `screenshots/fitl-game-map*.png` and `screenshots/fitl-map-editor*.png` to find all current screenshots. The minimum expected set is `fitl-game-map.png` and `fitl-map-editor.png` — any additional matches (e.g., `fitl-game-map-overview.png`) must also be read and evaluated.
   - Run `ls -la screenshots/fitl-*.png screenshots/fitl-*.jpg` to verify freshness — if any screenshot is older than 24 hours, warn the user that it may not reflect the current rendering state. (The Glob discovers the file list; `ls` is solely for timestamps.)
   - Read all discovered screenshots in **parallel** (all Read tool calls in a single message). Also read `screenshots/FITL_SC1.jpg` (physical board reference) — **required** for the first evaluation to establish the ground truth baseline. For subsequent evaluations, read it only when evaluating geographic layout fidelity or when a recommendation references the physical board layout.
3. Determine the next evaluation number from the last `## EVALUATION #N` heading.
4. **If the screenshot count changed** from the previous evaluation, note this prominently. Explain what new screenshots capture, add a comparability caveat (see Screenshot Set Changes below), and update the **Screenshot Reference** section at the top of the report file to describe all current screenshots.
5. For each screenshot, write a paragraph describing what's shown and listing specific issues related to the 4 metrics.
6. Score all 4 metrics (1-10) with brief justification per metric.
7. Compute score deltas from the previous evaluation. For the first evaluation, use `—` for Previous and Delta columns.
8. List resolved issues from the previous evaluation (see template). For the first evaluation, write: "No previous evaluation exists — this is the baseline evaluation."
9. Write prioritized recommendations tagged CRITICAL / HIGH / MEDIUM / LOW.
10. Flag recurring issues — note how many consecutive evaluations each issue has persisted.
11. If 5+ evaluations exist, include a Score Trend table (see template).
12. Append the complete evaluation section to `reports/map-representation-evaluation.md`.

## Evaluation Template

Append exactly this structure:

```markdown
---

## EVALUATION #N

**Date**: YYYY-MM-DD
**Screenshots analyzed**: fitl-game-map.png, fitl-map-editor.png
[If screenshot count changed: **Screenshot set change**: Expanded from M to N screenshots. New screenshots capture [brief description]. Scores may reflect newly visible issues, not regressions — see comparability note below.]

### Screenshot Analysis

For each screenshot analyzed, add a section:

#### [screenshot-filename] — [View Description]
**What's shown**: [1-2 sentences describing the view state]
**Issues observed**: [bullet list of specific issues related to the 4 metrics]

### Cross-View Consistency

[Note any discrepancies between the game canvas and editor rendering of the same geographic area — e.g., different polygon shapes, missing routes, color mismatches, or elements visible in one view but absent in the other. If views are consistent, write: "Game canvas and editor views are consistent for the overlapping area."]

### Resolved Since Previous

- [Issue description] — was [SEVERITY] in Eval #M, now fixed. [Brief description of the fix.]
[If none: "No issues from the previous evaluation were resolved." Optionally add context: e.g., "rendering unchanged", "no implementation cycle between evaluations".]

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | X | Y | +/-Z | [brief] |
| 2 | Road/River Integration | X | Y | +/-Z | [brief] |
| 3 | Terrain Distinction | X | Y | +/-Z | [brief] |
| 4 | Label/Token Readability | X | Y | +/-Z | [brief] |
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

## Correction Protocol

If the user disputes part of an already-appended evaluation:
1. Do NOT append a new evaluation — edit the existing one in-place.
2. Re-read any additional screenshots or evidence the user points to.
3. Update the specific observations, scores, and recommendations that are affected.
4. Re-verify the average and delta calculations after any score change.
5. Add a `**Corrections**` line immediately after the `**Date**` line: `**Corrections**: [YYYY-MM-DD] Revised [metric name] score from X to Y after reviewing [screenshot/evidence]. [Brief reason.]`
6. Move any newly-resolved items to the "Resolved Since Previous" section if the correction reveals they were already fixed.

## Scoring Guide

- **1-3**: Unusable — rectangles with disconnected lines, no spatial relationship between provinces
- **4-5**: Poor — some improvement but provinces still feel like isolated boxes
- **6-7**: Adequate — provinces have territory-like shapes, adjacencies partially implied by borders
- **8-9**: Good — provinces share borders naturally, routes flow through territories, terrain is clear
- **10**: Excellent — a player familiar with the physical board would recognize the map immediately

## What to Look For

- Provinces that lack shared borders — isolated shapes (rectangles, disconnected polygons) with gaps between them (worst case: uniform rectangles floating in empty space)
- Adjacency conveyed only through explicit lines rather than implied by geography (shared borders, proximity)
- Routes (roads, rivers) that terminate at province edges rather than flowing naturally through territory
- Route types that are visually indistinguishable from each other (roads vs. rivers should have distinct styling)
- Terrain types that are indistinguishable (all same shade/color regardless of terrain category)
- Province labels obscured by shape borders, tokens, or adjacency lines
- Token stacks that overflow province boundaries
- Wasted space between provinces where borders should be shared
- Missing or misleading adjacency connections
- Routes that cross provinces they shouldn't pass through
- Cities (circles) feeling disconnected from their surrounding provinces
- Province shapes that don't support natural route flow-through
- **Regressions** — issues absent in previous evaluations that appeared after recent changes

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

Stagnation occurs when **both** conditions are met:
1. The same issue has been the top actionable recommendation for 3+ consecutive evaluations
2. The average score has not improved by 0.5+ points across those evaluations

When stagnation is detected, note it explicitly and suggest that the `map-representation-plan` skill research alternative approaches before the next implementation cycle.

If the Score Trend shows oscillation (alternating positive/negative deltas for 4+ evaluations), this suggests fixes are introducing regressions. Note this pattern and recommend a more cautious, incremental implementation approach.

## Report File Maintenance

When the report file exceeds ~500 lines or ~10 evaluations, archive older evaluations.

**What to keep in the active file**: The rubric/header (everything before the first `---` separator) and the last 5 evaluations.

**Archival procedure**:
1. Identify which evaluations to archive — keep the rubric + last 5 evaluations
2. Grep for `^## EVALUATION #` to find all evaluation line numbers
3. Find the line number of the `---` separator immediately before the oldest evaluation to keep
4. Read the content to be archived
5. Write or append to `reports/map-representation-evaluation-archive.md`:
   - If the archive file does not exist, create it with a header: `# Map Representation Evaluation — Archive`
   - If it already exists, append the new archived evaluations after the existing content
6. Archive evaluations **verbatim** — do not condense or summarize
7. Remove the archived evaluations from the active file
8. Verify: grep for `## EVALUATION #` in both files to confirm the correct split

## Graduation

If the average score reaches **8.0+** and no CRITICAL or HIGH recommendations remain, note in the evaluation that the map representation has graduated to acceptable quality. Further evaluations are optional — invoke only after significant rendering changes.

## Screenshot Expectations

Screenshots should capture the full visible map at default zoom level. If only a portion of the map is visible, note which region is shown and caveat that scores reflect the visible portion only. Both the game canvas and map editor screenshots should show the same (or overlapping) geographic area to enable cross-view comparison.

## Score Adjustment Policy for Coverage Changes

When expanded screenshot coverage reveals pre-existing issues not visible before, scores SHOULD be adjusted to reflect the full-map reality. Tag each adjusted score with `*(Comparability adjustment — not a code regression)*` in the justification. This prevents artificial inflation from partial visibility while preserving trend interpretability through explicit tagging.

Conversely, if screenshots are removed (e.g., a view is deprecated), do not inflate scores to compensate — note the reduced coverage and score only what is visible.

## Unchanged Rendering

If the rendering appears unchanged from the previous evaluation but the screenshot set changed, proceed with a full evaluation — the new screenshots may reveal previously invisible issues.

If both rendering AND screenshots are unchanged since the previous evaluation, append a brief stub instead of a full evaluation:

```markdown
---

## EVALUATION #N — No Change

**Date**: YYYY-MM-DD
**Screenshots analyzed**: [list]

Rendering and screenshot set unchanged since Eval #N-1. No new evaluation needed. Re-evaluate after the next implementation cycle.
```

## Coverage Metrics

When polygon territory rendering is a key differentiator (as in FITL), include a coverage line after the scores table:

```markdown
**Polygon coverage**: N/M province zones rendered as territories (vs. rectangles).
```

This gives a quantitative progress indicator beyond the subjective 1-10 scores and directly tracks progress on recommendations to extend polygon treatment.

## Scope

This skill is scoped to the FITL game map (`screenshots/fitl-game-map*.png` and `screenshots/fitl-map-editor*.png`). The 4 metrics are specific to map territory rendering. For other evaluation needs (e.g., UI readability), use the appropriate evaluation skill.
