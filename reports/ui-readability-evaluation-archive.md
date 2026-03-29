# UI Readability Evaluation — Archive

Archived evaluations from the FITL Train Operation UI readability evaluation series.
See `reports/ui-readability-evaluation.md` for the active rubric and recent evaluations.

---

## EVALUATION #1

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png
**Baseline**: Yes (first evaluation)

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)

**What's shown**: The Train choice panel at the very beginning. The player must select target spaces (provinces/cities) where they want to Train. No spaces are selected yet. Six zone options are displayed as checkbox buttons: Binh Dinh, Da Nang, Kontum, Pleiku Darlac, Quang Tri, Saigon.

**Issues observed**:
- The prompt reads `$target Spaces (1-6)` — this is a raw internal binding variable name (`$target`) exposed directly to the user. A player has no idea what `$target Spaces` means or why there's a dollar sign.
- The range `(1-6)` is useful information (select 1 to 6 spaces) but its meaning is not explained.
- The "Current" badge appears in the breadcrumb area but its purpose is unclear at this stage.
- A dark semi-transparent rectangle overlaps the map in the center — unclear if this is intentional UI or a rendering artifact.
- The "Confirm selection" button is correctly grayed out (nothing selected), but "Back" is also grayed out with no explanation of what "Back" would do.

#### fitl-train-2.png — Target Space Selection (3 Selected, Validation Errors)

**What's shown**: The player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). The counter reads "Selected: 3 of 1-3". Three of the six options show red exclamation marks with "This option is currently unavailable."

**Issues observed**:
- `$target Spaces (1-6)` prompt remains — same raw variable name issue.
- The range changed from `(1-6)` to showing `1-3` in the selection counter. This is confusing — did the range change? Why? The player doesn't know that the maximum was dynamically constrained.
- The error messages ("This option is currently unavailable") appear under Binh Dinh, Da Nang, and Pleiku Darlac — but these are the selected options, not the unavailable ones! This is extremely confusing. The visual styling (blue-tinted, checked) suggests they ARE selected, but the red error text says they're "unavailable."
- There's no explanation of WHY options would be unavailable (e.g., "No US pieces available to place here" or "Already at stacking limit").
- "Confirm selection" is now active, which is correct.
- The unavailable options (Kontum, Quang Tri, Saigon) have no error text but appear darker/disabled — the visual signal is subtle.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)

**What's shown**: After confirming target spaces, the player faces a binary choice: "Place Irregulars" or "Place At Base". The breadcrumb shows the previous selection.

**Issues observed**:
- The prompt reads `$train Choice` — another raw binding variable name. A player doesn't know what `$train Choice` means.
- The breadcrumb reads `$target Spaces: Binh Dinh, Da Nang, Pleiku Darlac` with a "Current" badge. The `$target Spaces` prefix is the same raw variable name.
- The two option buttons ("Place Irregulars" and "Place At Base") are actually readable and well-labeled — this is the best screen in the sequence. The action descriptions are clear.
- The panel is more compact here, which feels cleaner.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)

**What's shown**: After choosing "Place Irregulars", the player is now inside a forEach loop iterating over target spaces. They need to select source spaces (0-3) for the current iteration.

**Issues observed**:
- The prompt is catastrophically unreadable: `$ Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces (0-3)`. This is a raw AST path — the full internal traversal path through the compiled game definition. No human can parse this.
- The breadcrumb trail has grown to 5 segments: `$target Spaces: Binh Dinh, Da Nang, Pleiku Darlac` → `$train Choice: Place Irregulars` → `$train Choice: Place At Base` → `$train Choice: Place Irregulars` → `Current`. It's unclear why "Place At Base" and "Place Irregulars" appear multiple times — this may reflect the forEach iteration but is presented without any iteration context.
- The selectable options (Binh Dinh, Pleiku Darlac, Quang Tri) are readable zone names.
- "Selected: 0 of 0-3" is somewhat clear (select 0 to 3 spaces) but the `(0-3)` range in the prompt is not explained.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)

**What's shown**: The deepest level of nesting. The player is selecting sub-action spaces (0-1) within the forEach iteration.

**Issues observed**:
- The prompt reads `$sub Action Spaces (0-1)` — raw binding variable name again, though shorter than the previous screen.
- The breadcrumb trail now spans the entire panel width with 6 segments. The longest segment is the raw AST path from the previous screen: `$ Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Pleiku Darlac, Quang Tri, Binh Dinh`. This is completely illegible.
- The zone options show `Binh Dinh None`, `Da Nang None`, `Pleiku Darlac None` — the "None" suffix is confusing. It likely indicates that no specific sub-type is selected, but the player sees zone names with a mysterious "None" attached.
- The overall panel is cramped — the breadcrumb dominates the visual space, pushing the actual decision (the 3 zone checkboxes) into a small area.

### Scores

| # | Metric | Score | Justification |
|---|--------|-------|---------------|
| 1 | Decision Prompt Clarity | 2 | Raw `$variable` names and full AST paths (`$ Macro Place From Available Or Map...`) are shown as decision prompts. Only screenshot 3 has readable prompts ("Place Irregulars" / "Place At Base"). |
| 2 | Option Legibility | 5 | Zone names (Binh Dinh, Da Nang, etc.) are readable. However, the "None" suffix on zone names in screenshot 5 is confusing, and action names in breadcrumbs mix readable and raw forms. |
| 3 | Breadcrumb Navigability | 2 | Breadcrumbs contain raw `$variable` names and full AST paths. By screenshot 5, the breadcrumb is a wall of text spanning the entire width. No collapse, summarization, or grouping for forEach iterations. |
| 4 | Error Communication | 3 | "This option is currently unavailable" gives no reason. The error appears under selected (not unavailable) options in screenshot 2, which is actively misleading. No guidance on constraints. |
| 5 | Information Density | 3 | Deep decision screens are dominated by long breadcrumb trails and verbose prompts, leaving little space for the actual decision. Shallow screens (1, 3) have better density. |
| 6 | Visual Hierarchy | 4 | The panel layout exists (header, breadcrumb, options, buttons) and the "Train" badge is visually distinct. But the most important element — what the player needs to decide — competes with raw variable names and breadcrumb clutter for attention. |

| | **Average** | **3.2** | |

### Delta from Previous

N/A (baseline evaluation)

### Prioritized Recommendations

1. **[CRITICAL] Replace raw `$variable` names with human-readable prompts.**
2. **[CRITICAL] Collapse or summarize breadcrumb entries for deep decision trees.**
3. **[HIGH] Fix the misleading error display in screenshot 2.**
4. **[HIGH] Remove the "None" suffix from zone option labels.**
5. **[MEDIUM] Explain the selection range to players.**
6. **[MEDIUM] Add contextual help or tooltips for decisions.**
7. **[LOW] Investigate the dark rectangle overlay in screenshot 1.**
8. **[LOW] Improve the visual distinction between available and unavailable options.**

---

## EVALUATION #2

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the beginning. The player must select target spaces for training. No spaces selected yet. Six zone options displayed as checkbox buttons.
**Issues observed**:
- The prompt now reads "Select spaces to train in (1 to 6)" — a massive improvement over the previous raw `$target Spaces (1-6)`. This is human-readable and explains what to do.
- The "Current" badge still appears in the breadcrumb area with no prior entries, which is slightly confusing but harmless.
- The dark semi-transparent rectangle still overlaps the map canvas behind the panel — same rendering artifact as Eval #1.
- Zone names are clean and readable.

#### fitl-train-2.png — Target Space Selection (3 Selected, Validation Errors)
**What's shown**: The player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue-tinted styling with "x" marks. Three selected options show red error text.
**Issues observed**:
- The prompt "Select spaces to train in (1 to 6)" remains human-readable — good.
- The counter reads "Selected: 3 of 1-3" while the prompt says "(1 to 6)" — this mismatch is confusing.
- Error messages changed from "This option is currently unavailable" to "Does not meet current requirements" — marginally better wording, but still lacks specifics.
- The errors still appear under the SELECTED options, not the unselected ones. This remains confusing.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/disabled — subtle but present.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- The prompt now reads "Train Choice" — the `$` prefix is gone. Clear improvement.
- The breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" — the `$` prefix is removed here too. This is readable.
- Both option buttons are well-labeled with clear, understandable action names.
- The panel is compact and clean.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: After choosing "Place Irregulars", the player is inside a forEach loop and must select source spaces (0 to 3).
**Issues observed**:
- The prompt still shows a raw AST path: "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces (up to 3)". The `$` prefix is gone and the range now reads "(up to 3)" instead of "(0-3)" — both improvements — but the core AST path is still catastrophically unreadable.
- The breadcrumb now has a "..." collapse indicator at the left edge — an improvement.
- Breadcrumb entries read "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars" — the repeated "Train Choice" entries likely reflect forEach iterations but lack iteration context.
- The "(up to 3)" range format is clearer than the previous "(0-3)".
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: The deepest nesting level. Player selects sub-action spaces (0 to 1).
**Issues observed**:
- The prompt reads "Sub Action Spaces (up to 1)" — the `$` prefix is gone and the range format improved. However "Sub Action Spaces" is still internal jargon.
- The breadcrumb has "..." collapse at the start, then: the full raw AST path with values appended. The AST path entry in the breadcrumb is still a wall of text.
- The "None" suffix from Eval #1 is GONE — zone options now show clean names.
- "Selected: 0 of 0-1" uses the old range format inconsistently with the prompt's "(up to 1)".

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 5 | 2 | +3 | Screenshots 1-3 now have human-readable prompts. Screenshot 4 still shows a raw AST path. |
| 2 | Option Legibility | 7 | 5 | +2 | "None" suffix eliminated. All zone names clean. Error text still vague. |
| 3 | Breadcrumb Navigability | 4 | 2 | +2 | `$` prefix removed. "..." collapse added. Raw AST path still appears in screenshots 4-5. |
| 4 | Error Communication | 3 | 3 | 0 | Errors still appear under selected options. No progress on the core problem. |
| 5 | Information Density | 5 | 3 | +2 | Breadcrumb collapse reclaims space. Shorter prompts on most screens. |
| 6 | Visual Hierarchy | 5 | 4 | +1 | Human-readable prompts make the decision clearer on most screens. |
| | **Average** | **4.8** | **3.2** | **+1.6** | |

### Prioritized Recommendations

1. **[CRITICAL] Replace the raw AST path prompt in screenshot 4.**
2. **[CRITICAL] Eliminate the AST path from breadcrumb entries.**
3. **[HIGH] Fix error message placement and specificity.**
4. **[HIGH] Resolve the range mismatch between prompt and counter.**
5. **[MEDIUM] Add forEach iteration context to breadcrumbs.**
6. **[MEDIUM] Replace "Sub Action Spaces" with a descriptive prompt.**
7. **[LOW] Harmonize range format between prompts and counters.**
8. **[LOW] Investigate the dark rectangle overlay.**

---

## EVALUATION #3

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Select spaces to train in (1 to 6)" — human-readable, same as Eval #2.
- "Current" breadcrumb badge appears with no prior entries — mildly confusing but harmless.
- "Selected: 0 of 1-6" counter uses the "X-Y" format while the prompt uses "(1 to 6)" — minor format inconsistency.
- The dark semi-transparent rectangle overlay on the map canvas persists.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces. Selected options show blue-tinted styling with "x" marks. Unselected options appear lighter.
**Issues observed**:
- Prompt now reads "Select spaces to train in (1 to 3)" — the range dynamically updated to match the actual constraint. Major fix.
- Counter reads "Selected: 3 of 1-3" — consistent with the prompt range.
- The misleading red error messages from Eval #1 and #2 are completely gone.
- Unselected options appear lighter — visual distinction is subtle but adequate.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base".
**Issues observed**:
- Prompt now reads "How do you want to train?" — significant upgrade from Eval #2's "Train Choice". Natural language.
- Breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" with "Current" badge — clean.
- This screen is essentially fully resolved.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3).
**Issues observed**:
- Prompt reads "Select source spaces for reinforcements (up to 3)" — the catastrophic raw AST path is COMPLETELY ELIMINATED. The #1 CRITICAL issue from Eval #1-2 is resolved.
- Breadcrumb: repeated "Train Choice" entries still lack forEach iteration context.
- "Selected: 0 of 0-3" counter uses "0-3" while the prompt uses "(up to 3)" — minor inconsistency.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space (up to 1).
**Issues observed**:
- Prompt reads "Select additional space for this action (up to 1)" — fully human-readable. "Sub Action Spaces" jargon replaced.
- Breadcrumb: raw AST path replaced with clean "Source Spaces: ..." label. Major fix.
- Zone options clean — no "None" suffix.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 5 | +3 | All 5 screenshots have human-readable prompts. Catastrophic AST path eliminated. |
| 2 | Option Legibility | 8 | 7 | +1 | All zone names clean. Misleading error text gone entirely. |
| 3 | Breadcrumb Navigability | 6 | 4 | +2 | Raw AST paths eliminated. "..." collapse works. ForEach context still missing. |
| 4 | Error Communication | 6 | 3 | +3 | Misleading errors gone. Range mismatch fixed. |
| 5 | Information Density | 7 | 5 | +2 | AST paths no longer dominate. Breadcrumbs compact. |
| 6 | Visual Hierarchy | 7 | 5 | +2 | Human-readable prompts are clear focal point. Clean visual flow. |
| | **Average** | **7.0** | **4.8** | **+2.2** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.**
2. **[MEDIUM] Harmonize range format between prompts and counters.**
3. **[MEDIUM] Improve visual distinction for unavailable options.**
4. **[LOW] Investigate the dark rectangle overlay.**
5. **[LOW] Consider removing the lone "Current" badge on the first decision screen.**

---

## EVALUATION #4

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces. No spaces selected. Six zone checkbox buttons.
**Issues observed**:
- Prompt reads "Select spaces to train in (1 to 6)" — human-readable, unchanged from Eval #3.
- Counter now reads "Selected: 0 of 1 to 6" — format harmonized with prompt. Previous "0 of 1-6" is fixed.
- The lone "Current" breadcrumb badge is no longer visible. Fixed.
- Dark rectangle overlay persists.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces. Selected options show blue-tinted styling with "x" marks and strikethrough text.
**Issues observed**:
- Prompt dynamically updated to "Select spaces to train in (1 to 3)" — correct.
- Counter reads "Selected: 3 of 1 to 3" — harmonized format.
- No misleading error messages — clean.
- Selected options show strikethrough text styling.
- Unselected options remain subtly lighter.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice after selecting target spaces.
**Issues observed**:
- Prompt reads "How do you want to train?" — natural language, unchanged.
- Breadcrumb clean with "Current" badge.
- This screen remains fully resolved.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside forEach loop, player selects source spaces (up to 3).
**Issues observed**:
- Prompt reads "Select source spaces for reinforcements (up to 3)" — human-readable, unchanged.
- Counter harmonized: "Selected: 0 of up to 3" (was "0 of 0-3").
- Breadcrumb: repeated "Train Choice" entries still lack forEach iteration context — #1 issue from Eval #3, unaddressed.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space (up to 1).
**Issues observed**:
- Prompt fully human-readable, unchanged.
- Counter harmonized: "Selected: 0 of up to 1".
- Breadcrumb clean, no AST paths.
- Same forEach iteration context issue as screenshot 4.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 8 | 0 | All prompts remain human-readable. No regressions. |
| 2 | Option Legibility | 8 | 8 | 0 | Clean, no issues. Strikethrough styling effective. |
| 3 | Breadcrumb Navigability | 7 | 6 | +1 | Lone "Current" badge removed. ForEach context still missing. |
| 4 | Error Communication | 7 | 6 | +1 | Range format harmonized. No misleading messages. |
| 5 | Information Density | 8 | 7 | +1 | Harmonized counters improve readability. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | Clean flow maintained. |
| | **Average** | **7.5** | **7.0** | **+0.5** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.** (Recurring: 2 consecutive evaluations)
2. **[MEDIUM] Improve visual distinction for unavailable/unselected options.** (Carried from Eval #3)
3. **[LOW] Investigate the dark rectangle overlay.** (Recurring: 4 evaluations)
4. **[LOW] Consider adding a brief contextual subtitle on deeper decision screens.**
