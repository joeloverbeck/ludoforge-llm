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

---

## EVALUATION #6

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Target Spaces: Select spaces to train in (1 to 6)" — human-readable, with a clean "Target Spaces:" label prefix followed by a natural language description. Good.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent with prompt.
- No lone "Current" badge on the first screen — clean.
- The dark semi-transparent rectangle overlay on the map canvas persists behind the panel — same artifact as Eval #1-5.
- "Confirm selection" correctly grayed out, "Back" grayed out, "Cancel" active.
- Zone names are clean and readable.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue checkmarks with solid blue borders. Unselected options appear lighter.
**Issues observed**:
- Prompt dynamically updated to "Target Spaces: Select spaces to train in (1 to 3)" — correct range constraint.
- Counter reads "Selected: 3 of 1 to 3" — harmonized and consistent.
- No misleading error messages under selected options — clean.
- **Strikethrough styling is GONE.** Selected options now display with blue checkmarks and solid blue-tinted borders — a proper "selected" visual signal. This directly fixes Eval #5's HIGH #2 recommendation. The semantic confusion of strikethrough-as-selection is eliminated.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/dimmed. The distinction is clearer now that selected options use positive visual indicators (checkmarks, blue borders) rather than the contradictory strikethrough.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train?" — natural language with a readable label prefix.
- Breadcrumb now shows a group header "Target Spaces (1x)" above the "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" pill, with a "Current" badge. The "(1x)" multiplicity indicator is new — it tells the player this was a single-step selection.
- Both option buttons are well-labeled and clear.
- Panel is compact and well-organized. This screen remains the best in the sequence.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements.
**Issues observed**:
- The prompt shows the raw AST path prefix followed by the human-readable description: "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Select source spaces for reinforcements (up to 3)". The human-readable part IS present after the colon, but the catastrophic AST prefix has resurfaced. This is a regression from Eval #3-5 which reported this as eliminated.
- Breadcrumb now shows grouped headers: "Target Spaces (1x)" and "Train Choice (3x)" with their respective pills. The "(3x)" multiplicity indicator provides some forEach iteration context — the player can see that "Train Choice" had 3 iterations. However, individual entries still read "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars" without identifying which target space each iteration corresponds to.
- Counter reads "Selected: 0 of up to 3" — harmonized format.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Sub Action Spaces: Select additional space for this action (up to 1)" — the human description is good but the "Sub Action Spaces:" prefix is internal jargon. Not catastrophic like the AST path but not player-friendly either.
- Breadcrumb shows grouped headers: "Target Spaces (1x)" → pill, "Train Choice (3x)" → 3 pills, "Source Spaces (1x)" → pill containing the full AST path with values: "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". This AST path in the breadcrumb pill is a regression — Eval #3 reported it replaced with a clean "Source Spaces: ..." label.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean.
- Counter reads "Selected: 0 of up to 1" — harmonized.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 6 | 8 | -2 | Screenshots 1-3 remain human-readable with clean label prefixes. However, screenshot 4 shows the raw AST path prefix has resurfaced: "Macro Place From Available Or Map...Source Spaces: Select source spaces for reinforcements (up to 3)". The human description is present after the colon, but the AST prefix is catastrophically long. Screenshot 5 uses internal jargon "Sub Action Spaces:" — not ideal but tolerable. The AST path regression is significant. |
| 2 | Option Legibility | 8 | 7 | +1 | Strikethrough styling on selected options is eliminated — replaced with blue checkmarks and solid borders, a proper positive selection indicator. This directly fixes Eval #5's HIGH #2. Zone names clean, no "None" suffix, action names clear. |
| 3 | Breadcrumb Navigability | 5 | 6 | -1 | New group multiplicity indicators "(1x)", "(3x)" provide partial forEach context — a step forward. However, the raw AST path has reappeared inside the Source Spaces breadcrumb pill in screenshot 5: "Macro Place From Available...Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". Individual Train Choice entries still lack target-space identification (which iteration = which space?). Net regression due to AST path resurfacing. |
| 4 | Error Communication | 7 | 7 | 0 | No misleading errors. Range format harmonized and consistent. Unchanged from Eval #4-5. |
| 5 | Information Density | 7 | 8 | -1 | Screenshot 4's prompt is dominated by the long AST path prefix, consuming significant horizontal space. The AST path in the breadcrumb pill (screenshot 5) also wastes space. Other screens remain clean and well-spaced. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | Selected option styling is improved with proper checkmarks — the visual flow for screenshots 1-3 is strong. The AST path text in screenshot 4 competes for attention, but the "Train" badge and human-readable suffix still provide some orientation. Net neutral — selection styling improvement offsets AST path regression. |
| | **Average** | **6.7** | **7.2** | **-0.5** | |

### Prioritized Recommendations

1. **[CRITICAL] Strip the raw AST path prefix from the screenshot 4 prompt.** The prompt "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Select source spaces for reinforcements (up to 3)" has the human description appended after the colon — the fix is partially applied. The remaining task is to suppress the AST prefix entirely, showing only "Source Spaces: Select source spaces for reinforcements (up to 3)" or just "Select source spaces for reinforcements (up to 3)". This was reported fixed in Eval #3 but has regressed. The prompt label resolution logic needs to handle macro-generated decision nodes that lack explicit `displayName` overrides.

2. **[CRITICAL] Strip the raw AST path from the Source Spaces breadcrumb pill.** In screenshot 5, the breadcrumb pill reads "Macro Place From Available Or Map...Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". This should display only "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". The same label resolution fix needed for recommendation #1 should also clean up breadcrumb entries.

3. **[HIGH] Add forEach iteration context to breadcrumbs.** The "(3x)" group multiplicity indicator is a welcome addition but doesn't tell the player WHICH iteration they're on or WHICH target space is being processed. Individual entries still read "Train Choice: Place Irregulars" without context like "Binh Dinh (1/3): Place Irregulars". This has been the top remaining issue since Eval #3 — five evaluations running.

4. **[MEDIUM] Replace "Sub Action Spaces:" prompt prefix with a player-friendly label.** Screenshot 5's prompt "Sub Action Spaces: Select additional space for this action (up to 1)" uses internal terminology in the label prefix. Consider "Additional Space:" or simply dropping the label and showing only the description.

5. **[LOW] Investigate the dark rectangle overlay.** The semi-transparent dark rectangle overlapping the map canvas behind the choice panel persists across all six evaluations. Not blocking functionality but adds visual noise.

6. **[LOW] Strengthen visual distinction for unavailable options.** In screenshot 2, unselected options are subtly lighter. The improved selected-state styling (blue checkmarks) makes the distinction clearer than before, but stronger dimming or a muted unavailability indicator would help at-a-glance scanning.

---

## EVALUATION #7

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Target Spaces: Target Spaces: Select spaces to train in (1 to 6)" — the label prefix "Target Spaces:" is **duplicated**. This is a new regression not present in any previous evaluation. The human-readable description is intact after the second colon, but the doubled label is visually noisy and looks like a bug.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent.
- No lone "Current" badge — clean.
- The dark semi-transparent rectangle overlay on the map canvas persists behind the panel.
- "Confirm selection" correctly grayed out, "Back" grayed out, "Cancel" active.
- Zone names clean and readable.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue checkmarks with solid blue borders. Unselected options appear lighter.
**Issues observed**:
- Prompt reads "Target Spaces: Target Spaces: Select spaces to train in (1 to 3)" — same duplicated label prefix as screenshot 1.
- Counter reads "Selected: 3 of 1 to 3" — harmonized and consistent.
- No misleading error messages under selected options — clean.
- Selected option styling with blue checkmarks and solid borders is maintained from Eval #6 — proper positive selection indicators.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/dimmed. The distinction is adequate given the strong selected-state styling.
- "Confirm selection" button is active.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "Train Choice: Train Choice: How do you want to train?" — **duplicated** "Train Choice:" label prefix. Same pattern as screenshots 1-2.
- Breadcrumb shows "Target Spaces (1x)" group header with "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" pill and "Current" badge — clean and informative.
- Both option buttons well-labeled and clear.
- Panel is compact and organized. This screen would be fully resolved if not for the duplicated prompt prefix.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements.
**Issues observed**:
- Prompt reads "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Source Spaces: Select source spaces for reinforcements (up to 3)". Two problems compound: (1) the raw AST path prefix persists from Eval #6, and (2) "Source Spaces:" is duplicated after the AST path, producing "...Source Spaces: Source Spaces: Select...".
- Breadcrumb shows "Target Spaces (1x)" and "Train Choice (3x)" group headers with pills: "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars", and "Current" badge. The "(3x)" multiplicity indicator provides partial forEach context but individual entries still don't identify which target space each iteration corresponds to.
- Counter reads "Selected: 0 of up to 3" — harmonized.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Sub Action Spaces: Sub Action Spaces: Select additional space for this action (up to 1)" — duplicated label prefix, same pattern as all other screens.
- Breadcrumb shows "Target Spaces (1x)" pill, "Train Choice (3x)" pills, "Source Spaces (1x)" with a pill still containing the full AST path: "Macro Place From Available Or Map Action Pipelines 0 Stages 1 Effects 0 For Each Effects 1 If Then 0 Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". This AST path in the breadcrumb is unchanged from Eval #6.
- Counter reads "Selected: 0 of up to 1" — harmonized.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean.
- The overall panel is cramped at this deepest level — breadcrumb pills span most of the width.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 5 | 6 | -1 | All 5 screens now show duplicated label prefixes ("Target Spaces: Target Spaces:", "Train Choice: Train Choice:", "Sub Action Spaces: Sub Action Spaces:") — a new regression. The human-readable descriptions after the duplication remain good, but the doubled labels look buggy and reduce clarity. Screenshot 4 still has the raw AST path prefix compounding the issue. |
| 2 | Option Legibility | 8 | 8 | 0 | Blue checkmark selection styling maintained. Zone names clean, action names clear. No "None" suffixes. No misleading errors. Unchanged from Eval #6. |
| 3 | Breadcrumb Navigability | 5 | 5 | 0 | Group multiplicity indicators "(1x)", "(3x)" still present. Raw AST path still appears in the Source Spaces breadcrumb pill (screenshot 5). forEach iteration context still absent — individual "Train Choice" entries don't identify target spaces. No change from Eval #6. |
| 4 | Error Communication | 7 | 7 | 0 | No misleading errors. Range format harmonized. Unchanged. |
| 5 | Information Density | 6 | 7 | -1 | The duplicated label prefixes waste horizontal space on every screen. Screenshot 4 is particularly dense with AST path + duplicated "Source Spaces:" + description all on one line. The breadcrumb AST path pill in screenshot 5 continues to consume space. |
| 6 | Visual Hierarchy | 6 | 7 | -1 | The duplicated prefixes introduce visual stuttering — the eye reads "Target Spaces: Target Spaces:" and has to re-parse to find the actual description. This disrupts the clean prompt → options → buttons flow that was established in Eval #3-5. Selection styling remains good. |
| | **Average** | **6.2** | **6.7** | **-0.5** | |

### Prioritized Recommendations

1. **[CRITICAL] Fix the duplicated label prefix in all prompts.** Every screen now shows "Label: Label: description" (e.g., "Target Spaces: Target Spaces: Select spaces to train in"). This is a new regression — likely the label is being prepended both by the render model's prompt formatting AND by the ChoicePanel display logic. The fix should ensure the label prefix appears exactly once. Check `project-render-model.ts` and `ChoicePanel.tsx` for where the prompt string is assembled — the label is probably concatenated in two places.

2. **[CRITICAL] Strip the raw AST path prefix from the screenshot 4 prompt and screenshot 5 breadcrumb.** This has been reported as CRITICAL since Eval #1. Screenshot 4 shows "Macro Place From Available Or Map...Source Spaces: Source Spaces: Select source spaces for reinforcements (up to 3)" — both the AST path and the duplication are present. Screenshot 5's breadcrumb pill contains the same AST path. The label resolution logic for macro-generated decision nodes still falls through to the raw path.

3. **[HIGH] Add forEach iteration context to breadcrumbs.** This has been the top remaining structural issue since Eval #3 — five consecutive evaluations. The "(3x)" multiplicity indicator helps but individual "Train Choice" entries need to show which target space they correspond to (e.g., "Binh Dinh: Place Irregulars (1/3)").

4. **[MEDIUM] Replace "Sub Action Spaces:" prompt prefix with player-friendly language.** Screenshot 5 shows "Sub Action Spaces: Sub Action Spaces: ..." — even once the duplication is fixed, "Sub Action Spaces" is internal jargon. A contextual label like "Additional Space:" would be clearer.

5. **[LOW] Investigate the dark rectangle overlay.** Persists across all seven evaluations. Not blocking but adds visual noise.

6. **[LOW] Strengthen visual distinction for unavailable options.** Unselected options in screenshot 2 are subtly lighter. The strong selected-state styling makes this less urgent, but stronger dimming would help at-a-glance scanning.

---

## EVALUATION #8

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-5.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces for training. No spaces selected. Six zone checkbox buttons displayed in a single row.
**Issues observed**:
- Prompt reads "Target Spaces: Select spaces to train in (1 to 6) — Target Spaces". The duplicated label prefix from Eval #7 ("Target Spaces: Target Spaces:") is **fixed** — the label now appears only once at the start. However, a **new trailing suffix** "— Target Spaces" is appended after the description. This is redundant with the prefix and adds visual noise, though it's far less jarring than the previous duplication.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent.
- No lone "Current" badge — clean.
- "Confirm selection" correctly grayed out, "Back" grayed out, "Cancel" active.
- Zone names clean and readable.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue checkmarks with solid blue borders. Unselected options appear lighter.
**Issues observed**:
- Prompt dynamically updated to "Target Spaces: Select spaces to train in (1 to 3) — Target Spaces" — correct range constraint reflected. Same trailing suffix pattern.
- Counter reads "Selected: 3 of 1 to 3" — harmonized and consistent.
- No misleading error messages under selected options — clean.
- Blue checkmark selection styling maintained from Eval #6 — proper positive selection indicators. No strikethrough.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/dimmed. The distinction is adequate with the strong selected-state styling.
- "Confirm selection" button is active.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base)
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train? — Train Choice" — natural language with the same trailing suffix pattern. The duplicated prefix from Eval #7 ("Train Choice: Train Choice:") is fixed.
- Breadcrumb shows "Target Spaces (1x)" group header with "Target Spaces: Binh Dinh, Da Nang, Pleiku Darlac" pill and "Current" badge — clean and informative.
- Both option buttons are well-labeled and clear.
- Panel is compact and well-organized.

#### fitl-train-4.png — Deep Nested Choice (Source Spaces in forEach)
**What's shown**: Inside a forEach loop, player selects source spaces (up to 3) for reinforcements.
**Issues observed**:
- Prompt reads "Source Spaces: Select source spaces for reinforcements (up to 3) — Source Spaces". The **raw AST path prefix is ELIMINATED** — this was the #1 CRITICAL issue in Eval #6-7 and was reported as regressed. It is now fixed again. The prompt is fully human-readable apart from the trailing suffix.
- Breadcrumb shows "Target Spaces (1x)" and "Train Choice (3x)" group headers with pills: "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars", and "Current" badge. The "(3x)" multiplicity indicator provides partial forEach context but individual entries still don't identify which target space each iteration corresponds to. This has been the top structural issue since Eval #3 — **six consecutive evaluations** without resolution.
- Counter reads "Selected: 0 of up to 3" — harmonized.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) are clean.

#### fitl-train-5.png — Deepest Nested Choice (Sub-Action Spaces)
**What's shown**: Deepest nesting level. Player selects additional space for the current action (up to 1).
**Issues observed**:
- Prompt reads "Sub Action Spaces: Select additional space for this action (up to 1) — Sub Action Spaces". The duplicated prefix from Eval #7 is fixed, but "Sub Action Spaces" remains internal jargon in both the prefix and the trailing suffix. The human description between them is clear.
- Breadcrumb shows "Target Spaces (1x)" pill, "Train Choice (3x)" pills, "Source Spaces (1x)" with pill reading "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri". The **raw AST path in the breadcrumb pill is ELIMINATED** — this was CRITICAL in Eval #6-7. The pill now shows a clean "Source Spaces: ..." label. Major fix.
- Counter reads "Selected: 0 of up to 1" — harmonized.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) are clean.
- The panel is more compact now that the breadcrumb pill no longer contains the AST path.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 7 | 5 | +2 | The duplicated label prefixes from Eval #7 are fixed — major improvement. The raw AST path prefix in screenshot 4 is eliminated — the other major regression from Eval #6-7 is resolved. All 5 screens now have human-readable descriptions. New issue: a trailing "— Label" suffix on every prompt is redundant with the prefix. Screenshot 5 still uses "Sub Action Spaces" jargon. The suffix prevents reaching 8. |
| 2 | Option Legibility | 8 | 8 | 0 | Blue checkmark selection styling maintained. Zone names clean, action names clear. No "None" suffixes. No misleading errors. Unchanged from Eval #6-7. |
| 3 | Breadcrumb Navigability | 6 | 5 | +1 | The raw AST path in the Source Spaces breadcrumb pill (screenshot 5) is eliminated — was CRITICAL in Eval #6-7. Group multiplicity indicators "(1x)", "(3x)" still present. However, forEach iteration context is still absent — individual "Train Choice" entries don't identify target spaces. This has persisted for six consecutive evaluations (#3-#8). |
| 4 | Error Communication | 7 | 7 | 0 | No misleading errors. Range format harmonized and consistent. Unchanged. |
| 5 | Information Density | 7 | 6 | +1 | The AST path is gone from both the screenshot 4 prompt and the screenshot 5 breadcrumb pill, reclaiming significant space. The trailing suffix adds minor overhead but far less than the previous duplicated prefixes or AST paths. Decision areas have adequate room. |
| 6 | Visual Hierarchy | 7 | 6 | +1 | No more duplicated prefixes creating visual stuttering. No AST paths competing for attention. The prompt flow is clean: "Train" badge → "Label: description — Label" → options → buttons. The trailing suffix is mildly distracting but doesn't break the hierarchy. Selection styling remains strong. |
| | **Average** | **7.0** | **6.2** | **+0.8** | |

### Prioritized Recommendations

1. **[HIGH] Add forEach iteration context to breadcrumbs.** The repeated "Train Choice: Place Irregulars" / "Train Choice: Place At Base" entries in screenshots 4-5 give the player no information about which target space is being processed or which iteration they're on. Concrete fix: replace with labels like "Binh Dinh (1/3): Place Irregulars" or add a sub-header per iteration. This has been the top remaining structural issue for **six consecutive evaluations** (#3-#8) — escalating from HIGH toward CRITICAL if it persists. *(Recurring: 6 consecutive evaluations)*

2. **[HIGH] Remove the redundant trailing "— Label" suffix from all prompts.** Every screen now shows "Label: description — Label" (e.g., "Target Spaces: Select spaces to train in (1 to 6) — Target Spaces"). The trailing "— Target Spaces" after the description is redundant with the "Target Spaces:" prefix. Removing it would make prompts cleaner and more concise. This is likely being appended by a secondary formatting step — check where the em-dash suffix is concatenated. *(New issue — regression from Eval #7's duplication fix)*

3. **[MEDIUM] Replace "Sub Action Spaces" with player-friendly language.** Screenshot 5's prompt prefix and suffix both show "Sub Action Spaces" — internal terminology. Even once the trailing suffix is removed, the prefix "Sub Action Spaces:" should be replaced with something like "Additional Space:" or "Bonus Placement:". *(Recurring: 3 consecutive evaluations — #6, #7, #8)*

4. **[LOW] Strengthen visual distinction for unavailable options.** In screenshot 2, unselected options (Kontum, Quang Tri, Saigon) are subtly lighter. The strong selected-state styling (blue checkmarks) makes this less urgent, but stronger dimming would help at-a-glance scanning. *(Recurring: 4 consecutive evaluations — #5, #6, #7, #8)*

5. **[LOW] Investigate the dark rectangle overlay.** The semi-transparent dark rectangle overlapping the map canvas behind the choice panel may persist — hard to distinguish from the normal panel background in these screenshots. If still present, it has persisted across all eight evaluations. *(Recurring: potentially 8 consecutive evaluations)*

---

## EVALUATION #9

**Date**: 2026-03-29
**Screenshots analyzed**: fitl-train-1.png through fitl-train-11.png
**Note**: Screenshot set expanded from 5 to 11, revealing deeper decision states (source space confirmation, sub-action choice, pacification levels, final confirmation) not captured in previous evaluations.

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Target Spaces: Select spaces to train in (1 to 6)" — clean, human-readable. The trailing "— Target Spaces" suffix from Eval #8 is **gone**. This is a fix.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent.
- No lone "Current" badge — clean.
- Zone names clean and readable.
- "Confirm selection" correctly grayed out, "Back" grayed out, "Cancel" active.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue checkmarks with solid blue borders. Unselected options dimmed.
**Issues observed**:
- Prompt dynamically updated to "Target Spaces: Select spaces to train in (1 to 3)" — correct range constraint. No trailing suffix.
- Counter reads "Selected: 3 of 1 to 3" — harmonized and consistent.
- No misleading error messages under selected options — clean.
- Blue checkmark selection styling maintained from Eval #6 — proper positive indicators, no strikethrough.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/dimmed. Distinction is adequate.

#### fitl-train-3.png — Train Sub-Choice (Place Irregulars vs Place At Base), 1st iteration
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" after selecting target spaces.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train?" — natural language, no trailing suffix. Clean.
- Breadcrumb shows "Target Spaces (1x)" group header with pill and "Current" badge.
- Both option buttons well-labeled and clear.
- Panel compact and well-organized. This screen is essentially fully resolved.

#### fitl-train-4.png — Train Sub-Choice, later iteration (forEach context visible)
**What's shown**: The same binary choice appears again — the player is in a later forEach iteration. Breadcrumb now shows completed iterations.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train?" — identical to screenshot 3. Clean.
- Breadcrumb shows "Target Spaces (1x)" pill and "Train Choice (2x)" group header with two completed pills: "Train Choice: Place Irregulars" and "Train Choice: Place At Base", plus "Current". The "(2x)" multiplicity indicator tells the player 2 iterations have been completed.
- However, the player still **cannot tell which target space** each iteration corresponds to. "Train Choice: Place Irregulars" and "Train Choice: Place At Base" — for which spaces? This is the forEach iteration context gap persisting since Eval #3 — **7th consecutive evaluation**.

#### fitl-train-5.png — Source Spaces Selection (Empty)
**What's shown**: Inside the forEach loop, player selects source spaces (up to 3) for reinforcements. No selections yet.
**Issues observed**:
- Prompt reads "Source Spaces: Select source spaces for reinforcements (up to 3)" — clean, human-readable. **No AST path, no trailing suffix.** The AST path regression from Eval #6-7 remains fixed.
- Breadcrumb: "Target Spaces (1x)" pill, "Train Choice (3x)" with 3 pills: "Train Choice: Place Irregulars", "Train Choice: Place At Base", "Train Choice: Place Irregulars", then "Current".
- Counter: "Selected: 0 of up to 3" — harmonized.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) clean.

#### fitl-train-6.png — Source Spaces Selection (3 Selected)
**What's shown**: Player has selected all 3 source spaces (Binh Dinh, Pleiku Darlac, Quang Tri). Blue checkmarks on all options.
**Issues observed**:
- Prompt reads "Source Spaces: Select source spaces for reinforcements" — the "(up to 3)" range indicator has **disappeared** now that selections are made. Minor loss of context.
- **Counter reads "Selected: 3 of 0"** — this is **broken**. "3 of 0" is nonsensical. The counter should read "3 of up to 3" or "3 of 3". This is a **new regression** not present in any previous evaluation.
- Blue checkmark styling is correct — all 3 options selected with proper visual indicators.
- Breadcrumb same as screenshot 5 — clean.

#### fitl-train-7.png — Additional Space Selection (Empty), deepest nesting
**What's shown**: Deepest nesting level from previous evaluations. Player selects an additional space (up to 1).
**Issues observed**:
- Prompt reads "Additional Space: Select additional space for this action (up to 1) — Sub Action Spaces". The prefix is now **"Additional Space:"** instead of the previous "Sub Action Spaces:" — this is a partial fix of Eval #8's MEDIUM #3 (replace "Sub Action Spaces" jargon). However, the **trailing suffix "— Sub Action Spaces"** persists, showing the internal name. The suffix was flagged in Eval #8 as HIGH #2.
- Breadcrumb: "Target Spaces (1x)" → pill, "Train Choice (3x)" → 3 pills, "Source Spaces (1x)" → pill "Source Spaces: Binh Dinh, Pleiku Darlac, Quang Tri", "Current". Clean — no AST paths.
- Counter: "Selected: 0 of up to 1" — harmonized.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) clean.
- Panel is compact but readable at this depth.

#### fitl-train-8.png — Additional Space Selection (1 Selected, with errors)
**What's shown**: Player selected Da Nang. Binh Dinh and Pleiku Darlac show red error indicators.
**Issues observed**:
- Prompt reads "Additional Space: Select additional space for this action — Sub Action Spaces". Same trailing suffix issue.
- **Counter reads "Selected: 1 of 0"** — same broken counter as screenshot 6. "1 of 0" is nonsensical.
- Error text "! Does not meet current requirements" appears under **unavailable** options (Binh Dinh, Pleiku Darlac), NOT under the selected option (Da Nang). This is **correct error placement** — a fix from the original Eval #1-2 issue where errors appeared under selected options. Positive progress.
- However, the error text itself remains vague — no explanation of WHY these spaces don't meet requirements.

#### fitl-train-9.png — Sub-Action Choice (Pacify / Saigon Transfer / None)
**What's shown**: A new decision depth not seen in previous evaluations. Player chooses a sub-action type.
**Issues observed**:
- Prompt reads just **"Sub Action"** — bare internal label with no description. Unlike the well-crafted prompts on earlier screens ("How do you want to train?", "Select source spaces for reinforcements"), this shows only the raw decision name with zero contextual guidance.
- Options: "Pacify", "Saigon Transfer", "None" — the action names are readable, but **"None"** is ambiguous. Does it mean "skip this step" or "no sub-action"? A label like "Skip" or "No additional action" would be clearer.
- Breadcrumb: "..." → "Train Choice (3x)" pills, "Source Spaces (1x)" pill, "Sub Action Spaces (1x)" pill "Sub Action Spaces: Da Nang", then "Current". The "Sub Action Spaces" label in the breadcrumb pill is internal jargon.
- This screen would benefit from a descriptive prompt like "Choose a sub-action for Da Nang" or "What would you like to do in Da Nang?".

#### fitl-train-10.png — Pac Levels Choice (1 or 2)
**What's shown**: A numeric choice for pacification levels. Two options: "1" and "2".
**Issues observed**:
- Prompt reads just **"Pac Levels"** — bare internal jargon. A player has no idea what "Pac Levels" means or what choosing "1" vs "2" implies. This should read something like "Choose pacification level" or "How many levels of pacification?".
- **Options "1" and "2" are bare numbers with zero context.** The player doesn't know what these numbers represent — cost? intensity? effect magnitude? This is the most opaque decision in the entire sequence.
- Breadcrumb: "..." → "Source Spaces (1x)" pill, "Sub Action Spaces (1x)" pill, "Sub Action (1x)" pill "Sub Action: Pacify", "Current". The trail is clean and shows the path.

#### fitl-train-11.png — Final Confirmation
**What's shown**: A confirmation screen at the end of the decision sequence. No prompt text visible — the panel shows the completed breadcrumb trail and "Back", "Cancel", "Confirm" buttons.
**Issues observed**:
- Breadcrumb: "..." → "Sub Action Spaces (1x)" pill "Sub Action Spaces: Da Nang", "Sub Action (1x)" pill "Sub Action: Pacify", "Pac Levels (1x)" pill "Pac Levels: 2".
- The "Confirm" button is present and active — good.
- No visible prompt or summary of what's being confirmed. A brief summary like "Confirm your Train operation choices" would help the player understand this is the final step.
- The breadcrumb labels use internal jargon ("Sub Action Spaces", "Pac Levels") — the player sees these as the summary of their decisions.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 6 | 7 | -1 | Screenshots 1-6 are excellent — clean prompts, no AST paths, no trailing suffixes, dynamic ranges. The trailing suffix from Eval #8 is mostly eliminated. However, the expanded screenshot set reveals deeper decisions with bare jargon prompts: "Sub Action" (screenshot 9) and "Pac Levels" (screenshot 10) have no descriptions at all. Screenshot 7 retains the trailing "— Sub Action Spaces" suffix. |
| 2 | Option Legibility | 7 | 8 | -1 | Blue checkmark selection styling is strong. Zone and action names clean. Error placement improved (under unavailable options, not selected ones). However, screenshot 10 shows bare numeric options "1" and "2" with no context — completely opaque. Screenshot 9's "None" option is ambiguous. |
| 3 | Breadcrumb Navigability | 6 | 6 | 0 | No AST paths in any breadcrumb — sustained fix. Group headers with multiplicity indicators work well. "..." collapse effective. forEach iteration context **still absent** — "Train Choice" entries don't identify target spaces. Some breadcrumb labels use jargon ("Sub Action Spaces", "Pac Levels"). *(forEach context gap: 7th consecutive evaluation)* |
| 4 | Error Communication | 5 | 7 | -2 | **New regression**: Counter displays "Selected: 3 of 0" (screenshot 6) and "Selected: 1 of 0" (screenshot 8) — nonsensical values. The counter worked correctly in Eval #8 ("0 of up to 3"). Error placement is now correct (under unavailable options, not selected ones — positive progress from Eval #1-2). Error text remains vague ("Does not meet current requirements"). |
| 5 | Information Density | 7 | 7 | 0 | No AST paths wasting space. Breadcrumbs compact. Adequate space for decisions even at deepest nesting (screenshots 9-11). The expanded 11-screenshot set shows the panel remains well-proportioned throughout the full decision tree. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | "Train" badge prominent. Blue checkmark styling provides clear selection feedback. Visual flow (badge → prompt → breadcrumb → options → buttons) reads naturally on most screens. Bare prompts on screenshots 9-10 weaken guidance at deeper levels but don't break the structural hierarchy. |
| | **Average** | **6.3** | **7.0** | **-0.7** | |

### Prioritized Recommendations

1. **[CRITICAL] Fix the broken selection counter.** Screenshots 6 and 8 show "Selected: 3 of 0" and "Selected: 1 of 0" — the counter displays nonsensical values when options are selected. This is a **new regression** — previous evaluations showed correct values like "0 of up to 3". The counter logic likely breaks when the maximum is dynamically constrained or when all valid options are selected. *(New regression)*

2. **[HIGH] Add descriptive prompts for deeper decisions.** Screenshot 9 shows bare "Sub Action" and screenshot 10 shows bare "Pac Levels" — internal labels with no player-facing descriptions. These need the same treatment that transformed "$target Spaces" into "Select spaces to train in" back in Eval #2. Suggested prompts: "Sub Action" → "Choose a sub-action for this space", "Pac Levels" → "Choose pacification level". *(New — first time these screens are captured)*

3. **[HIGH] Add forEach iteration context to breadcrumbs.** The repeated "Train Choice" entries still don't identify which target space each iteration processes. Labels like "Binh Dinh: Place Irregulars (1/3)" would orient the player. This has been the top structural issue for **seven consecutive evaluations** (#3-#9). While impact is moderate (it causes disorientation, not unusability), persistence warrants escalation consideration. *(Recurring: 7 consecutive evaluations)*

4. **[HIGH] Remove the trailing "— Sub Action Spaces" suffix from screenshot 7's prompt.** The prefix was improved to "Additional Space:" (fixing Eval #8 MEDIUM #3) but the trailing suffix still exposes the internal decision name. The suffix was eliminated from other screens (screenshots 1-6 are clean) — this screen's suffix is likely a separate code path that wasn't updated. *(Recurring: 2 consecutive evaluations — #8, #9)*

5. **[MEDIUM] Add context to bare numeric options.** Screenshot 10 shows "1" and "2" as options for "Pac Levels" — a player has no idea what these numbers represent. Either the prompt should explain ("Choose 1 or 2 levels of pacification — higher costs more resources") or the option labels should be enriched ("1 level", "2 levels"). *(New)*

6. **[MEDIUM] Replace "None" option label with "Skip" or "No additional action".** Screenshot 9's "None" option is ambiguous — it could mean "skip this step" or "nothing selected". A clearer label would reduce confusion. *(New)*

7. **[MEDIUM] Clean up jargon in breadcrumb labels.** Breadcrumb pills show "Sub Action Spaces: Da Nang", "Sub Action: Pacify", "Pac Levels: 2" — these use internal decision names as labels. Player-friendly labels like "Additional Space: Da Nang", "Action: Pacify", "Pacification: 2" would improve readability of the decision trail. *(New)*

8. **[LOW] Strengthen visual distinction for unavailable options.** Unselected/unavailable options remain only subtly lighter. The strong selected-state styling (blue checkmarks) makes this less urgent. *(Recurring: 5 consecutive evaluations — #5 through #9)*

---

## EVALUATION #10

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-train-1.png through fitl-train-11.png

### Screenshot Analysis

#### fitl-train-1.png — Initial Target Space Selection (Empty)
**What's shown**: The Train choice panel at the start. Player must select target spaces. No spaces selected. Six zone checkbox buttons displayed.
**Issues observed**:
- Prompt reads "Target Spaces: Select spaces to train in (1 to 6)" — clean, human-readable. No trailing suffix.
- Counter reads "Selected: 0 of 1 to 6" — harmonized format, consistent.
- No lone "Current" badge — clean.
- Zone names clean and readable.
- "Confirm selection" correctly grayed out, "Back" grayed out, "Cancel" active.
- No issues on this screen.

#### fitl-train-2.png — Target Space Selection (3 Selected)
**What's shown**: Player has selected 3 spaces (Binh Dinh, Da Nang, Pleiku Darlac). Selected options show blue checkmarks with solid blue borders. Unselected options dimmed.
**Issues observed**:
- Prompt reads "Target Spaces: Select spaces to train in (1 to 6)" — static range, does not dynamically reflect that only 3 more can be selected. Minor — the counter handles this adequately.
- Counter reads "Selected: 3 of 1 to 6" — harmonized and consistent.
- Blue checkmark selection styling strong — proper positive indicators.
- Unselected options (Kontum, Quang Tri, Saigon) appear lighter/dimmed. Distinction is adequate.
- "Confirm selection" active.

#### fitl-train-3.png — Train Sub-Choice, 1st Iteration
**What's shown**: Binary choice between "Place Irregulars" and "Place At Base" for the first target space.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train?" — natural language, clean.
- Breadcrumb shows "Target Spaces (1x)" group header with pill "Binh Dinh, Da Nang, Pleiku Darlac" and "Current" badge — clean and informative.
- Both option buttons well-labeled and clear.
- Panel compact and well-organized. No issues.

#### fitl-train-4.png — Train Sub-Choice, Later Iteration (forEach Context Visible)
**What's shown**: The same binary choice in a later forEach iteration. Breadcrumb shows completed iterations.
**Issues observed**:
- Prompt reads "Train Choice: How do you want to train?" — clean.
- Breadcrumb shows "Target Spaces (1x)" pill and "Train Choice (2x)" group header with two completed pills: **"Binh Dinh: Place Irregulars"** and **"Da Nang: Place At Base"**, plus "Current". The forEach iteration context — which target space each choice corresponds to — is now **included**. This was the #1 structural issue for 7 consecutive evaluations (#3-#9). **Resolved.**
- The player can now see that the first iteration chose "Place Irregulars" for Binh Dinh and "Place At Base" for Da Nang, and they're currently deciding for the third space (Pleiku Darlac). Major improvement in orientation.

#### fitl-train-5.png — Source Spaces Selection (Empty)
**What's shown**: Inside the forEach loop, player selects source spaces (up to 3) for reinforcements. No selections yet.
**Issues observed**:
- Prompt reads "Source Spaces: Select source spaces for reinforcements (up to 3)" — clean, human-readable.
- Breadcrumb: "Target Spaces (1x)" pill, "Train Choice (3x)" with 3 pills: "Binh Dinh: Place Irregulars", "Da Nang: Place At Base", "Pleiku Darlac: Place Irregulars" — all with forEach iteration context. Excellent.
- Counter: "Selected: 0 of up to 3" — correct.
- Zone options (Binh Dinh, Pleiku Darlac, Quang Tri) clean.

#### fitl-train-6.png — Source Spaces Selection (2 Selected)
**What's shown**: Player has selected 2 source spaces (Binh Dinh, Quang Tri). Blue checkmarks on selected options. Pleiku Darlac unselected/dimmed.
**Issues observed**:
- Prompt reads "Source Spaces: Select source spaces for reinforcements (up to 3)" — the "(up to 3)" range indicator **persists** even with selections. This is improved from Eval #9 where the range disappeared.
- Counter reads **"Selected: 2 of up to 3"** — **FIXED**. In Eval #9 this showed "Selected: 3 of 0" (broken). Now correctly shows the actual count and maximum. The CRITICAL counter bug from Eval #9 is resolved.
- Blue checkmark styling correct.
- Breadcrumb same as screenshot 5 — clean with forEach context.

#### fitl-train-7.png — Additional Space Selection (Empty)
**What's shown**: Deepest nesting level. Player selects an additional space (up to 1).
**Issues observed**:
- Prompt reads "Additional Space: Select additional space for this action (up to 1)" — clean! The trailing **"— Sub Action Spaces"** suffix from Eval #9 is **eliminated**. This was HIGH #4 in Eval #9. Fully resolved.
- Breadcrumb: "Target Spaces (1x)" → pill, "Train Choice (3x)" → 3 pills with forEach context, "Source Spaces (1x)" → pill "Binh Dinh: Binh Dinh, Quang Tri", "Current". The Source Spaces pill shows "Binh Dinh: Binh Dinh, Quang Tri" — the prefix "Binh Dinh:" is the iteration context (which target space), but "Binh Dinh" also appears as a selected source, creating a mildly confusing double appearance.
- Counter: "Selected: 0 of up to 1" — correct.
- Zone options (Binh Dinh, Da Nang, Pleiku Darlac) clean.

#### fitl-train-8.png — Additional Space Selection (1 Selected, with Errors)
**What's shown**: Player selected Pleiku Darlac. Binh Dinh and Da Nang show red error indicators.
**Issues observed**:
- Prompt reads "Additional Space: Select additional space for this action (up to 1)" — clean, no trailing suffix.
- Counter reads **"Selected: 1 of up to 1"** — **FIXED**. In Eval #9 this showed "Selected: 1 of 0" (broken). Now correct.
- Error text "! Does not meet current requirements" appears under unavailable options (Binh Dinh, Da Nang) — correct placement (not under the selected option). Positive.
- Error text remains vague — no explanation of WHY these spaces don't meet requirements.

#### fitl-train-9.png — Sub-Action Choice (Pacify / Saigon Transfer / Skip)
**What's shown**: Player chooses a sub-action type for the current space.
**Issues observed**:
- Prompt reads **"Sub Action: Choose a sub-action for this space"** — **IMPROVED**. In Eval #9 this was bare "Sub Action" with no description. Now has a descriptive prompt. This addresses HIGH #2 from Eval #9.
- Options: "Pacify", "Saigon Transfer", **"Skip"** — the "None" option from Eval #9 is renamed to **"Skip"**. This addresses MEDIUM #6 from Eval #9. Much clearer.
- Breadcrumb: "..." → "Train Choice (3x)" pills with forEach context, "Source Spaces (1x)" pill, "Sub Action Spaces (1x)" pill "Binh Dinh: Pleiku Darlac", "Current". The "Sub Action Spaces" breadcrumb group header is still internal jargon.
- The prompt prefix "Sub Action:" is still somewhat technical — "Action:" or "Bonus Action:" would be more player-friendly. Minor.

#### fitl-train-10.png — Pacification Level Choice
**What's shown**: Numeric choice for pacification level. Two options: "1" and "2".
**Issues observed**:
- Prompt reads **"Pacification Level: Choose pacification level"** — **IMPROVED**. In Eval #9 this was bare "Pac Levels". Now fully spelled out with a descriptive prompt. This addresses HIGH #2 from Eval #9.
- Options **"1" and "2" remain bare numbers** without context. The player still doesn't know what choosing 1 vs 2 implies (cost? intensity? effect?). The prompt could explain ("Choose 1 or 2 levels — higher costs more resources") or labels could be enriched ("1 level", "2 levels"). This was MEDIUM #5 in Eval #9 — not addressed.
- Breadcrumb: "..." → "Source Spaces (1x)" pill, "Sub Action Spaces (1x)" pill "Binh Dinh: Pleiku Darlac", "Sub Action (1x)" pill "Pleiku Darlac: Pacify", "Current". The Sub Action pill now shows forEach context. Clean.

#### fitl-train-11.png — Final Confirmation
**What's shown**: Confirmation screen at the end of the decision sequence. No prompt text — just the breadcrumb trail and buttons.
**Issues observed**:
- Breadcrumb: "..." → "Sub Action Spaces (1x)" pill "Binh Dinh: Pleiku Darlac", "Sub Action (1x)" pill "Pleiku Darlac: Pacify", "Pac Levels (1x)" pill "Pleiku Darlac: 1".
- "Back", "Cancel", "Confirm" buttons present and active.
- No visible prompt or summary of what's being confirmed. A brief "Confirm your Train operation" prompt would help orient the player at this final step.
- Breadcrumb group headers still use internal jargon ("Sub Action Spaces", "Pac Levels").

### Resolved Since Previous

- **CRITICAL: Broken selection counter** — was CRITICAL in Eval #9 ("3 of 0", "1 of 0"). Now correctly shows "2 of up to 3" and "1 of up to 1". Counter logic fixed.
- **HIGH: Bare prompts for deeper decisions** — was HIGH in Eval #9 (screenshots 9-10 showed raw "Sub Action" and "Pac Levels"). Now both have descriptive prompts: "Choose a sub-action for this space" and "Choose pacification level".
- **HIGH: forEach iteration context in breadcrumbs** — was HIGH/recurring for 7 consecutive evaluations (#3-#9). Breadcrumb pills now show target space names (e.g., "Binh Dinh: Place Irregulars" instead of "Train Choice: Place Irregulars"). Long-standing structural issue finally resolved.
- **HIGH: Trailing "— Sub Action Spaces" suffix** — was HIGH in Eval #9 (screenshot 7). Suffix is now eliminated. Prompt is clean.
- **MEDIUM: "None" option label** — was MEDIUM in Eval #9 (screenshot 9). Renamed to "Skip". Clearer.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Decision Prompt Clarity | 8 | 6 | +2 | All 11 screens now have human-readable prompts. Screenshots 9-10 gained descriptive prompts (was bare jargon in Eval #9). Trailing suffix eliminated from screenshot 7. Screenshot 11 still lacks a confirmation prompt, and screenshot 10's prompt is slightly circular ("Pacification Level: Choose pacification level"). These minor issues prevent reaching 9. |
| 2 | Option Legibility | 8 | 7 | +1 | "None" → "Skip" improves clarity. Blue checkmark selection styling maintained. Zone and action names clean. Error placement correct. Screenshot 10's bare "1" and "2" options remain the weakest point — no context for what the numbers mean. |
| 3 | Breadcrumb Navigability | 8 | 6 | +2 | forEach iteration context is ADDED — the #1 structural issue for 7 evaluations is resolved. Pills now show "Binh Dinh: Place Irregulars" instead of "Train Choice: Place Irregulars". "..." collapse effective. Group headers still use some jargon ("Sub Action Spaces", "Pac Levels") but individual pills are informative. |
| 4 | Error Communication | 7 | 5 | +2 | Counter FIXED — "2 of up to 3" and "1 of up to 1" instead of the broken "3 of 0" / "1 of 0" from Eval #9. Error placement correct (under unavailable options). Error text still vague ("Does not meet current requirements" — no explanation of why). |
| 5 | Information Density | 7 | 7 | 0 | Panel remains well-proportioned across all 11 screens. ForEach context in breadcrumb pills adds useful information without wasting space. No AST paths or redundant suffixes consuming room. Unchanged. |
| 6 | Visual Hierarchy | 7 | 7 | 0 | Clean flow: Train badge → prompt → breadcrumb → options → buttons. Selection styling strong. No competing noise. The added forEach context in breadcrumbs doesn't clutter the visual flow. Unchanged. |
| | **Average** | **7.5** | **6.3** | **+1.2** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #6 | 6.7 | -0.5 |
| #7 | 6.2 | -0.5 |
| #8 | 7.0 | +0.8 |
| #9 | 6.3 | -0.7 |
| #10 | 7.5 | +1.2 |

The trend shows oscillation across evaluations #6-#9 (alternating negative and positive deltas for 4 evaluations). Eval #10 breaks upward with the largest positive delta in the series (+1.2), driven by resolving multiple long-standing structural issues. The oscillation pattern appears to be ending — the fixes in this round address root causes (forEach context, counter logic, descriptive prompts) rather than surface formatting that could easily regress.

### Prioritized Recommendations

1. **[MEDIUM] Add context to bare numeric options.** Screenshot 10 shows "1" and "2" as options for "Pacification Level" — a player has no idea what these numbers represent (cost? effect magnitude? levels of support shift?). Either the prompt should explain ("Choose 1 or 2 levels — higher costs more resources") or the option labels should be enriched ("1 level", "2 levels"). *(Recurring: 2 consecutive evaluations — #9, #10)*

2. **[MEDIUM] Clean up jargon in breadcrumb group headers.** Group headers still show "Sub Action Spaces (1x)", "Sub Action (1x)", "Pac Levels (1x)" — internal decision names. Player-friendly labels like "Additional Space", "Action", "Pacification" would improve readability. Note: the individual pills within these groups now have good forEach context labels — this is a header-level issue only. *(Recurring: 2 consecutive evaluations — #9, #10)*

3. **[MEDIUM] Add a confirmation prompt to the final screen.** Screenshot 11 shows only breadcrumb trail and buttons with no prompt text. A brief "Confirm your Train operation" prompt would help orient the player and signal that this is the final step. *(Recurring: 2 consecutive evaluations — #9, #10)*

4. **[LOW] Improve error specificity.** Screenshot 8 shows "! Does not meet current requirements" under unavailable options — correct placement but vague text. Explaining WHY a space doesn't qualify (e.g., "No eligible pieces" or "Already at capacity") would help the player understand constraints. *(Recurring: multiple evaluations)*

5. **[LOW] Resolve double zone name in Source Spaces pill.** Screenshot 7's breadcrumb shows "Binh Dinh: Binh Dinh, Quang Tri" — the iteration context prefix "Binh Dinh:" repeats when Binh Dinh is also a selected source. This is a minor cosmetic issue but may confuse players. *(New)*

6. **[LOW] Strengthen visual distinction for unavailable options.** Unselected/unavailable options remain only subtly lighter. The strong selected-state styling (blue checkmarks) makes this less urgent. *(Recurring: 6 consecutive evaluations — #5 through #10)*
