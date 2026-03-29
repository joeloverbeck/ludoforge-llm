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
