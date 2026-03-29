# UI Readability Evaluation — FITL Train Operation

## Evaluation Rubric

### Metrics (1-10 scale)

1. **Decision Prompt Clarity**: Is the prompt human-readable? Does it explain what the player needs to decide?
2. **Option Legibility**: Can you understand what each choice means? Are zone names, token types, action names clear?
3. **Breadcrumb Navigability**: Is the decision trail comprehensible? Can you understand where you are in the decision tree?
4. **Error Communication**: Are errors, constraints, and unavailability explained clearly?
5. **Information Density**: Is there too much or too little information? Is screen space used well?
6. **Visual Hierarchy**: Do your eyes know where to look? Is the most important information prominent?

### Scoring Guide

- **1-3**: Unusable — raw internal names, incomprehensible layout, a player cannot understand what to do
- **4-5**: Poor — partially readable but confusing, requires prior knowledge to interpret
- **6-7**: Adequate — functional but not intuitive, a player can use it with some effort
- **8-9**: Good — clear, intuitive, well-organized, minimal friction
- **10**: Excellent — a player unfamiliar with the game could understand the UI immediately

### Screenshot Reference

Screenshots are taken at key decision points during the US Train operation:
- `fitl-train-1.png`: Initial target space selection (no spaces selected yet)
- `fitl-train-2.png`: Target space selection with some spaces chosen (showing validation)
- `fitl-train-3.png`: Sub-choice after selecting spaces (Place Irregulars vs Place At Base)
- `fitl-train-4.png`: Deep nested choice — source space selection within a forEach iteration
- `fitl-train-5.png`: Deepest nested choice — sub-action space selection with full breadcrumb trail

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

1. **[CRITICAL] Replace raw `$variable` names with human-readable prompts.** The `$target Spaces`, `$train Choice`, `$sub Action Spaces` binding names and especially the full AST path `$ Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces` must never be shown to players. These should be replaced with contextual descriptions like "Choose provinces to Train in", "How do you want to Train?", "Select source spaces for reinforcements". This likely requires changes to `project-render-model.ts` (the `formatIdAsDisplayName` fallback path) or adding display-name overrides in the visual config. Alternatively, the Game Spec YAML could define `displayName` properties on decisions, or the render model could detect and rewrite known patterns.

2. **[CRITICAL] Collapse or summarize breadcrumb entries for deep decision trees.** By screenshot 5, the breadcrumb is a wall of unreadable text. Options: (a) collapse forEach iterations into a grouped entry like "Place Irregulars x3", (b) show only the last 2-3 breadcrumb steps with a "..." indicator, (c) hide intermediate AST-path entries entirely. The breadcrumb grouping logic already exists (`iterationGroupId` in `ChoicePanel.tsx`) but the raw names make it useless.

3. **[HIGH] Fix the misleading error display in screenshot 2.** The red "This option is currently unavailable" text appears under selected options, not under the actually unavailable ones. Either the error placement is wrong, or the error text needs to explain what's happening (e.g., "Cannot Train here — no available US pieces" or "Maximum selections reached").

4. **[HIGH] Remove the "None" suffix from zone option labels.** In screenshot 5, options show "Binh Dinh None", "Da Nang None", etc. The "None" likely comes from a missing sub-type or property being formatted as a display name. This should be suppressed or replaced with just the zone name.

5. **[MEDIUM] Explain the selection range to players.** The `(1-6)` and `(0-3)` range indicators are useful but cryptic. Consider rephrasing to "Select 1 to 6 spaces" or showing "Choose up to 3 source spaces (optional)" for ranges starting at 0.

6. **[MEDIUM] Add contextual help or tooltips for decisions.** Players navigating deep decision trees lose track of what they're deciding and why. A brief contextual sentence below the prompt (e.g., "Choose where to place US Irregular troops from Available Forces") would significantly improve comprehension.

7. **[LOW] Investigate the dark rectangle overlay in screenshot 1.** A semi-transparent dark rectangle overlaps the map canvas behind the choice panel. This may be a tooltip container, a z-index issue, or a rendering artifact. It adds visual noise.

8. **[LOW] Improve the visual distinction between available and unavailable options.** In screenshot 2, unavailable options (Kontum, Quang Tri, Saigon) are only subtly dimmed. A stronger visual signal (strikethrough, grayed-out text, or an explicit "unavailable" icon) would make the distinction clearer.

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
- The counter reads "Selected: 3 of 1-3" while the prompt says "(1 to 6)" — this mismatch is confusing. The dynamic constraint narrowed the range but the prompt wasn't updated.
- Error messages changed from "This option is currently unavailable" to "Does not meet current requirements" — marginally better wording, but still lacks specifics (WHY doesn't it meet requirements?).
- The errors still appear under the SELECTED options (Binh Dinh, Da Nang, Pleiku Darlac), not the unselected ones. This remains confusing — the player selected these spaces and now sees red warnings under them without understanding what went wrong.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/disabled — subtle but present.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- The prompt now reads "Train Choice" — the `$` prefix is gone. Clear improvement.
- The breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" — the `$` prefix is removed here too. This is readable.
- Both option buttons are well-labeled with clear, understandable action names.
- The panel is compact and clean. This is the best screen in the sequence — essentially resolved.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: After choosing "Place Irregulars", the player is inside a forEach loop and must select source spaces (0 to 3).
**Issues observed**:
- The prompt still shows a raw AST path: "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces (up to 3)". The `$` prefix is gone and the range now reads "(up to 3)" instead of "(0-3)" — both improvements — but the core AST path is still catastrophically unreadable.
- The breadcrumb now has a "..." collapse indicator at the left edge — an improvement over Eval #1 where all entries were fully expanded.
- Breadcrumb entries read "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars" — the repeated "Train Choice" entries likely reflect forEach iterations but lack iteration context (e.g., "Iteration 1 of 3: Binh Dinh").
- The "(up to 3)" range format is clearer than the previous "(0-3)" — signals optionality better.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: The deepest nesting level. Player selects sub-action spaces (0 to 1).
**Issues observed**:
- The prompt reads "Sub Action Spaces (up to 1)" — the `$` prefix is gone and the range format improved. However "Sub Action Spaces" is still internal jargon that doesn't explain what the player is choosing.
- The breadcrumb has "..." collapse at the start, then: "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → the full raw AST path with values appended ("Macro Place From Available Or Map...Source Spaces: Quang Tri, Pleiku Darlac, Binh Dinh") → "Current". The AST path entry in the breadcrumb is still a wall of text spanning most of the panel width.
- The "None" suffix from Eval #1 is GONE — zone options now show clean names: "Binh Dinh", "Da Nang", "Pleiku Darlac". This is a direct fix from Recommendation #4.
- "Selected: 0 of 0-1" uses the old range format inconsistently with the prompt's "(up to 1)".

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 5 | 2 | +3 | Screenshots 1-3 now have human-readable prompts ("Select spaces to train in", "Train Choice"). Screenshot 5 is improved but jargony ("Sub Action Spaces"). Screenshot 4 still shows a raw AST path — one catastrophic screen holds back the score. |
| 2 | Option Legibility | 7 | 5 | +2 | "None" suffix eliminated. All zone names clean. Action names ("Place Irregulars", "Place At Base") remain clear. Error text still vague but wording improved slightly. |
| 3 | Breadcrumb Navigability | 4 | 2 | +2 | `$` prefix removed from labels. "..." collapse added for deep trails. But the raw AST path still appears as a breadcrumb entry in screenshots 4-5, and repeated "Train Choice" entries lack forEach iteration context. |
| 4 | Error Communication | 3 | 3 | 0 | "Does not meet current requirements" is marginal improvement over "currently unavailable" — neither explains WHY. Errors still appear under selected options, which is misleading. No progress on the core problem. |
| 5 | Information Density | 5 | 3 | +2 | Breadcrumb collapse ("...") reclaims space. Shorter prompts on most screens. Screenshot 4 is still cluttered by the AST path prompt, but overall density improved. |
| 6 | Visual Hierarchy | 5 | 4 | +1 | Human-readable prompts make the decision clearer on most screens. "Train" badge, "Current" marker, and button styling are consistent. The AST path prompt in screenshot 4 still competes for attention. |
| | **Average** | **4.8** | **3.2** | **+1.6** | |

### Prioritized Recommendations

1. **[CRITICAL] Replace the raw AST path prompt in screenshot 4.** The prompt "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces (up to 3)" is the single worst remaining readability problem. This needs a human-readable override like "Select source spaces for reinforcements (up to 3)" or "Choose where to draw troops from". This is the same CRITICAL #1 from Eval #1, partially fixed — the AST path fallback is still triggered for macro-generated decisions that lack display names.

2. **[CRITICAL] Eliminate the AST path from breadcrumb entries.** In screenshot 5, the breadcrumb contains the full AST path with selected values appended. This entry should be replaced with a summary like "Source Spaces: Quang Tri, Pleiku Darlac, Binh Dinh" — dropping the "Macro Place From Available Or Map..." prefix entirely.

3. **[HIGH] Fix error message placement and specificity.** Errors still appear under SELECTED options in screenshot 2, which is misleading. The player sees a selected (blue, checked) option with a red warning underneath. Either (a) the error should explain the issue ("No US pieces available to place here") or (b) the error placement should be reconsidered — perhaps showing errors only when a player hovers or tries to confirm, with a summary like "3 selected spaces cannot currently support training".

4. **[HIGH] Resolve the range mismatch between prompt and counter.** Screenshot 2 shows "Select spaces to train in (1 to 6)" in the prompt but "Selected: 3 of 1-3" in the counter. The prompt range should update dynamically to match the actual constraint, or the counter should explain the narrowing (e.g., "3 spaces eligible, 3 selected").

5. **[MEDIUM] Add forEach iteration context to breadcrumbs.** The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" entries in screenshots 4-5 don't indicate which forEach iteration the player is in. Something like "Training Binh Dinh (1/3)" would orient the player.

6. **[MEDIUM] Replace "Sub Action Spaces" with a descriptive prompt.** Screenshot 5's prompt is no longer raw (`$` removed) but "Sub Action Spaces" is still internal terminology. A contextual prompt like "Select additional space for action (optional)" would be clearer.

7. **[LOW] Harmonize range format between prompts and counters.** Prompts use "(up to 3)" while counters use "0-3". Pick one format and use it consistently — the "(up to N)" format is more readable.

8. **[LOW] Investigate the dark rectangle overlay.** Same artifact from Eval #1 — a semi-transparent dark rectangle overlaps the map behind the choice panel in screenshots 1-2. Not blocking but adds visual noise.

---

## EVALUATION #3

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Select spaces to train in (1 to 6)" — human-readable, same as Eval #2. Good.
- "Current" breadcrumb badge appears with no prior entries — mildly confusing but harmless.
- "Selected: 0 of 1-6" counter uses the "X-Y" format while the prompt uses "(1 to 6)" — minor format inconsistency.
- The dark semi-transparent rectangle overlay on the map canvas persists from Eval #1 and #2.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue-tinted styling with "x" marks. Unselected options appear lighter.
**Issues observed**:
- Prompt now reads "Select spaces to train in (1 to 3)" — the range dynamically updated to match the actual constraint. This resolves the range mismatch from Eval #2 where the prompt said "(1 to 6)" while the counter said "1-3". Major fix.
- Counter reads "Selected: 3 of 1-3" — consistent with the prompt range.
- The misleading red error messages from Eval #1 and #2 ("This option is currently unavailable" / "Does not meet current requirements") are completely gone. No error text appears under selected options. This resolves the CRITICAL error placement issue.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter — visual distinction is subtle but the misleading error text is no longer competing for attention.
- "Confirm selection" button is active. Clean state.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt now reads "How do you want to train?" — a significant upgrade from Eval #2's "Train Choice". This is natural language that a player can immediately understand.
- Breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" with "Current" badge — clean, no raw variable names.
- Both option buttons are clear and well-labeled.
- Panel is compact and well-organized. This screen is essentially fully resolved.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements.
**Issues observed**:
- Prompt reads "Select source spaces for reinforcements (up to 3)" — the catastrophic raw AST path from Eval #1-2 is COMPLETELY ELIMINATED. This was the #1 CRITICAL issue in both previous evaluations. The prompt is now clear, contextual, and human-readable.
- Breadcrumb shows "..." → "Train Choice: Place Irregulars" → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Current". The "..." collapse works. However, the repeated "Train Choice" entries still lack forEach iteration context — the player can't tell which target space is being processed (e.g., "Training Binh Dinh (1/3)").
- "Selected: 0 of 0-3" counter uses "0-3" while the prompt uses "(up to 3)" — minor format inconsistency persists.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Select additional space for this action (up to 1)" — fully human-readable. The internal "Sub Action Spaces" jargon from Eval #2 is replaced with natural language. Excellent improvement.
- Breadcrumb shows "..." → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri" → "Current". The raw AST path that dominated this breadcrumb in Eval #1-2 is completely replaced with the clean "Source Spaces: ..." label. Major fix.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean — no "None" suffix.
- "Selected: 0 of 0-1" counter — minor format inconsistency with the "(up to 1)" prompt.
- The breadcrumb is now compact enough that the decision area is no longer cramped.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 5 | +3 | All 5 screenshots now have human-readable prompts. The catastrophic AST path (screenshot 4) is replaced with "Select source spaces for reinforcements". Screenshot 3 upgraded from "Train Choice" to "How do you want to train?". Screenshot 5 from "Sub Action Spaces" to "Select additional space for this action". No raw internal names remain in any prompt. |
| 2 | Option Legibility | 8 | 7 | +1 | All zone names clean, no "None" suffix. Action names clear ("Place Irregulars", "Place At Base"). Misleading error text under selected options is gone entirely, removing a major source of confusion. |
| 3 | Breadcrumb Navigability | 6 | 4 | +2 | Raw AST paths eliminated from breadcrumbs — the wall-of-text entry in screenshot 5 is now a clean "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". "..." collapse works well. Remaining issue: repeated "Train Choice" entries lack forEach iteration context (which iteration? which target space?). |
| 4 | Error Communication | 6 | 3 | +3 | The misleading error messages under selected options are gone. The range mismatch between prompt and counter is fixed (prompt now dynamically updates). No error scenarios are triggered in the current screenshots, so we can't fully assess error quality, but removing the misleading errors is a major improvement. |
| 5 | Information Density | 7 | 5 | +2 | AST paths no longer dominate any screen. Breadcrumbs are compact. Prompts are concise. The decision area has breathing room even at the deepest nesting level (screenshot 5). Minor issue: the counter still uses "0-3" format while prompts use "(up to 3)". |
| 6 | Visual Hierarchy | 7 | 5 | +2 | Human-readable prompts are now the clear focal point on every screen. The visual flow — "Train" badge → descriptive prompt → breadcrumb trail → options → action buttons — reads naturally. No raw text competes for attention. The "Current" badge and "..." collapse support orientation. |
| | **Average** | **7.0** | **4.8** | **+2.2** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.** The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" entries in screenshots 4-5 don't indicate which target space is being processed. Something like "Training Binh Dinh (1/3)" or grouping iterations with the target space name would help the player understand where they are in the decision sequence. This was MEDIUM in Eval #2 — upgrading to HIGH since it's now the most prominent remaining readability issue.

2. **[MEDIUM] Harmonize range format between prompts and counters.** Prompts use "(up to 3)" while counters use "0-3" or "1-6". The "(up to N)" format is more readable — consider updating the counter to match (e.g., "Selected: 0, up to 3" or "0 of 3 max"). Carried from Eval #2.

3. **[MEDIUM] Improve visual distinction for unavailable options.** In screenshot 2, unavailable options (Kontum, Quang Tri, Saigon) are only subtly lighter. A stronger visual signal — dimmed text, strikethrough, or an explicit unavailability indicator — would make the distinction clearer at a glance.

4. **[LOW] Investigate the dark rectangle overlay.** The semi-transparent dark rectangle overlapping the map canvas behind the choice panel persists across all three evaluations. Not blocking but adds visual noise. Likely a z-index or background layer issue.

5. **[LOW] Consider removing the lone "Current" badge on the first decision screen.** In screenshot 1, the "Current" badge appears with no prior breadcrumb entries. It's harmless but slightly confusing — the player hasn't navigated anywhere yet, so "Current" lacks context. Consider showing the breadcrumb area only after the first decision is made.

---

## EVALUATION #4

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Select spaces to train in (1 to 6)" — human-readable, unchanged from Eval #3.
- Counter now reads "Selected: 0 of 1 to 6" — the format is harmonized with the prompt. Previously it read "0 of 1-6". This was a MEDIUM recommendation in Eval #3, now fixed.
- The lone "Current" breadcrumb badge that appeared with no prior entries in Eval #1-3 is no longer visible on this screen. This was a LOW recommendation in Eval #3, now fixed.
- The dark semi-transparent rectangle overlay on the map canvas persists behind the panel.
- Zone names are clean and readable.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue-tinted styling with "x" marks and strikethrough text. Unselected options appear lighter.
**Issues observed**:
- Prompt dynamically updated to "Select spaces to train in (1 to 3)" — correct, same as Eval #3.
- Counter reads "Selected: 3 of 1 to 3" — harmonized format using "to" instead of the previous dash notation. Consistent with the prompt.
- No misleading error messages under selected options — clean, same as Eval #3.
- Selected options show clear strikethrough text styling, making the selected/unselected distinction more readable than before.
- Unselected options (Kontum, Quang Tri, Saigon) remain subtly lighter — the visual distinction is still modest but adequate given the clear selected-state styling.
- "Confirm selection" button is active. Clean state.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "How do you want to train?" — natural language, unchanged from Eval #3.
- Breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" with "Current" badge — clean and readable.
- Both option buttons are well-labeled and clear.
- Panel is compact and well-organized. This screen remains fully resolved.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements.
**Issues observed**:
- Prompt reads "Select source spaces for reinforcements (up to 3)" — human-readable, unchanged from Eval #3.
- Counter now reads "Selected: 0 of up to 3" — harmonized with the prompt's "(up to 3)" format. Previously it read "0 of 0-3". This resolves the format inconsistency noted in Eval #3.
- Breadcrumb shows "..." → "Train Choice: Place Irregulars" → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Current". The repeated "Train Choice" entries still lack forEach iteration context — the player cannot tell which target space (Binh Dinh, Da Nang, or Pleiku Darlac) is being processed. This was the #1 HIGH recommendation in Eval #3 and remains unaddressed.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Select additional space for this action (up to 1)" — fully human-readable, unchanged from Eval #3.
- Counter reads "Selected: 0 of up to 1" — harmonized format. Previously read "0 of 0-1".
- Breadcrumb shows "..." → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri" → "Current". Clean, no raw AST paths. The breadcrumb is compact and the decision area has adequate space.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean.
- Same forEach iteration context issue as screenshot 4 — "Train Choice" entries don't indicate iteration progress.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 8 | 0 | All prompts remain human-readable across all 5 screens. No regressions. No further improvements needed — prompts are clear and contextual. |
| 2 | Option Legibility | 8 | 8 | 0 | Zone names clean, action names clear. Selected option styling with strikethrough and "x" marks is effective. No "None" suffixes. No misleading errors. |
| 3 | Breadcrumb Navigability | 7 | 6 | +1 | Lone "Current" badge removed from the first screen (Eval #3 LOW fix). Breadcrumbs remain clean with "..." collapse. Repeated "Train Choice" entries still lack forEach iteration context — the main remaining issue. |
| 4 | Error Communication | 7 | 6 | +1 | Range format harmonization means the counter no longer contradicts the prompt format, removing a subtle source of confusion. No misleading error messages. The range communication is now consistent and clear. |
| 5 | Information Density | 8 | 7 | +1 | Harmonized counter format ("0 of up to 3" instead of "0 of 0-3") improves readability of the selection state. No wasted space. Decision areas have adequate room even at deepest nesting. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | Clean visual flow maintained: "Train" badge → descriptive prompt → breadcrumb → options → buttons. No raw text competes for attention. The "Current" badge removal on the first screen slightly reduces visual noise. |
| | **Average** | **7.5** | **7.0** | **+0.5** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.** The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" entries in screenshots 4-5 don't indicate which target space is being processed or which iteration the player is on. Labels like "Training Binh Dinh (1/3)" or "Iteration 1: Binh Dinh" would orient the player within the forEach loop. This has been the #1 remaining issue since Eval #3 — it is the primary blocker to reaching an 8+ breadcrumb score.

2. **[MEDIUM] Improve visual distinction for unavailable/unselected options.** In screenshot 2, unselected options (Kontum, Quang Tri, Saigon) are only subtly lighter than selected ones. While the selected-state styling (blue tint, strikethrough, "x") is now effective, the unselected options could benefit from stronger dimming or a muted icon to make the distinction immediate at a glance. Carried from Eval #3.

3. **[LOW] Investigate the dark rectangle overlay.** The semi-transparent dark rectangle overlapping the map canvas behind the choice panel persists across all four evaluations. Not blocking functionality but adds visual noise. Likely a z-index or background layer issue in the canvas/panel stacking.

4. **[LOW] Consider adding a brief contextual subtitle on deeper decision screens.** Screenshots 4-5 prompt "Select source spaces for reinforcements" and "Select additional space for this action" — clear prompts, but a one-line subtitle like "Placing Irregular troops in Binh Dinh" would reinforce what the player is doing within the broader Train operation. This would complement the forEach iteration context fix in recommendation #1.

---

## EVALUATION #5

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed in a single row.
**Issues observed**:
- Prompt reads "Select spaces to train in (1 to 6)" — human-readable, unchanged from Eval #4.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent with prompt.
- No lone "Current" badge on the first screen — clean.
- The dark semi-transparent rectangle overlay on the map canvas persists behind the panel — same artifact as Eval #1-4.
- "Confirm selection" is correctly grayed out (nothing selected). "Back" is also grayed out — appropriate since this is the first decision.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue-tinted dashed borders with "x" marks and strikethrough text. Unselected options (Kontum, Quang Tri, Saigon) appear lighter.
**Issues observed**:
- Prompt dynamically updated to "Select spaces to train in (1 to 3)" — correct range constraint reflected.
- Counter reads "Selected: 3 of 1 to 3" — harmonized format, consistent.
- No misleading error messages under selected options — clean, same as Eval #3-4.
- Selected options use strikethrough text with dashed blue borders and "x" marks — effective styling that clearly signals selection.
- Unselected options are subtly lighter but still readable. The visual distinction could be stronger — a player scanning quickly might not immediately distinguish selected from unselected without noticing the "x" marks. The strikethrough text on selected items is counterintuitive: strikethrough typically signals "removed" or "cancelled", not "chosen". This could confuse players who interpret it as "these spaces are excluded".

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "How do you want to train?" — natural, player-friendly language.
- Breadcrumb reads "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" with "Current" badge — clean and informative.
- Both option buttons are well-labeled with clear action descriptions.
- Panel is compact and well-organized. This screen remains fully resolved — the best in the sequence.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements. Three zone options available.
**Issues observed**:
- Prompt reads "Select source spaces for reinforcements (up to 3)" — human-readable, unchanged from Eval #3-4.
- Counter reads "Selected: 0 of up to 3" — harmonized format.
- Breadcrumb shows "..." → "Train Choice: Place Irregulars" → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Current". The repeated "Train Choice" entries STILL lack forEach iteration context — the player cannot tell which target space (Binh Dinh, Da Nang, or Pleiku Darlac) is currently being processed, nor which iteration they're on (1/3, 2/3, 3/3). This has been the #1 remaining issue since Eval #3 — three evaluations and no change.
- "Confirm selection" button is immediately active even with 0 selections, correctly reflecting the optional nature of the "(up to 3)" range.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Select additional space for this action (up to 1)" — fully human-readable, unchanged from Eval #3-4.
- Counter reads "Selected: 0 of up to 1" — harmonized format.
- Breadcrumb shows "..." → "Train Choice: Place At Base" → "Train Choice: Place Irregulars" → "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri" → "Current". Clean, compact, no raw AST paths.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean — no suffixes.
- Same forEach iteration context gap as screenshot 4.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 8 | 0 | All prompts remain human-readable across all 5 screens. No regressions, no changes from Eval #4. Prompts are clear and contextual. |
| 2 | Option Legibility | 7 | 8 | -1 | Zone names and action names remain clean. However, the strikethrough styling on selected options (screenshot 2) is semantically misleading — strikethrough universally signals "removed" or "cancelled", not "selected". A player could interpret selected spaces as excluded. Downgrading by 1 to reflect this usability concern. |
| 3 | Breadcrumb Navigability | 6 | 7 | -1 | The forEach iteration context issue has persisted for three consecutive evaluations (#3, #4, #5) without improvement. The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" entries are the primary source of disorientation at deeper nesting levels. Downgrading by 1 to reflect stagnation on the most prominent remaining issue. The "..." collapse and clean labels remain good. |
| 4 | Error Communication | 7 | 7 | 0 | No misleading errors. Range communication is harmonized and consistent. No change from Eval #4. |
| 5 | Information Density | 8 | 8 | 0 | No wasted space. Decision areas have adequate room. Harmonized counter format is clean. No change from Eval #4. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | Clean visual flow maintained. No raw text competing for attention. The strikethrough styling adds slight visual confusion but doesn't fundamentally break the hierarchy. |
| | **Average** | **7.2** | **7.5** | **-0.3** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.** This has been the #1 remaining issue for three consecutive evaluations (#3, #4, #5). The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" breadcrumb entries in screenshots 4-5 give the player no information about which target space is being processed or which iteration they're on. Concrete fix: replace repeated "Train Choice" entries with labels like "Binh Dinh (1/3): Place Irregulars" or group iterations under a heading "Training 3 spaces — currently: Binh Dinh". Without this, a player deep in the decision tree has no spatial orientation.

2. **[HIGH] Replace strikethrough styling on selected options with a positive selection indicator.** The strikethrough text on selected options in screenshot 2 (Binh Dinh, Da Nang, Pleiku Darlac) is semantically backward — strikethrough universally means "removed" or "cancelled", not "chosen". Replace with a filled checkbox, a checkmark icon, a solid blue background, or bold text. The dashed blue border and "x" mark are fine, but the strikethrough text contradicts the "selected" semantics.

3. **[MEDIUM] Improve visual distinction for unselected/unavailable options.** In screenshot 2, unselected options (Kontum, Quang Tri, Saigon) are only subtly lighter. A stronger dimming, muted color, or small "unavailable" indicator would make the distinction immediate. Carried from Eval #3-4.

4. **[LOW] Investigate the dark rectangle overlay.** The semi-transparent dark rectangle overlapping the map canvas behind the choice panel persists across all five evaluations. Not blocking functionality but adds visual noise. Likely a z-index or background layer issue.

5. **[LOW] Consider a contextual subtitle on deeper decision screens.** A one-line subtitle on screenshots 4-5 like "Placing Irregular troops in Binh Dinh" would reinforce what the player is doing within the broader Train operation. Carried from Eval #4.
