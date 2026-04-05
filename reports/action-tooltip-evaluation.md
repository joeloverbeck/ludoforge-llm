# Action Tooltip Readability Evaluation

Iterative evaluation of action tooltip readability in the runner app. Tooltips should read like a board game reference card — clear, structured, and free of technical artifacts.

## Screenshot Reference

- **Location**: `screenshots/action-tooltips/`
- **Current screenshots**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png
- **Capture method**: Manual — user places new screenshots after each implementation cycle

## Evaluation Rubric

### Metrics (1-10 scale)

| # | Metric | Description |
|---|--------|-------------|
| 1 | Language Naturalness | Does the text read like a game manual, not a database query? No filter predicates, `$variables`, or raw boolean operators. |
| 2 | Step Semantic Clarity | Do step headers describe what happens (e.g., "Place forces", "Pay resources"), not repeat generic labels (e.g., "Select spaces" x7)? |
| 3 | Information Hierarchy | Are costs, conditions, and choices visually distinct from action steps? Is there a clear reading order? |
| 4 | Terminology Consistency | Are game terms used correctly? No internal jargon leaking (kebab-case IDs, property names, capability references). |
| 5 | Progressive Disclosure | For long tooltips, is key info shown first with details collapsible? Is the tooltip manageable without excessive scrolling? |
| 6 | Visual Scannability | Can you understand the action in 5 seconds of scanning? Are there visual anchors (bold headers, spacing, icons)? |
| 7 | Cost Transparency | Are resource costs, limits, and prerequisites clearly called out and prominently displayed? |
| 8 | Optional/Mandatory Distinction | Can you tell which steps are required vs. "if desired"? Is optionality visually or textually marked? |

### Scoring Guide

- **1-3**: Unusable — raw engine output, filter predicates as text, `$variable` names, kebab-case capability IDs, magic numbers
- **4-5**: Poor — some humanization but still reads like technical output, generic headers, internal jargon mixed in
- **6-7**: Adequate — mostly readable, occasional jargon leaks, step grouping could be clearer, costs not prominent
- **8-9**: Good — reads like a board game reference card, clear step headers, prominent costs, optional steps marked
- **10**: Excellent — indistinguishable from a professionally written game manual tooltip

### Graduation Condition

Average score reaches **8.0+** with no CRITICAL or HIGH recommendations remaining.

---

## EVALUATION #4

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation tooltip with synopsis, collapsible "Step 1" containing 7 sub-steps — all sub-steps now have disclosure triangles (▼), confirming collapsibility. All appear expanded in this screenshot. No cost steps visible (Assault has no "Pay resources" sub-step within this view).
**Issues observed**:
- **Improved**: All sub-steps now collapsible (▼ disclosure markers visible on steps 1-7)
- Steps 1, 2, 4, 6, 7 still all "Select spaces" — repetitive headers persist
- Condition expressions still technical: "number of US Troops pieces > 0 and number of NVA/VC pieces > 0"
- "Cap Assault Cobras Shaded Cost", "Cap Assault M48-Unshaded Bonus Removal" — semantically meaningless humanized capability IDs
- "zone Id in Target Spaces and not Terrain Tags includes Lowland" — raw field names
- No cost highlighting visible in Assault (cost line "Pay 3 ARVN Resources" is inside step 5 "Select items" — not a dedicated cost sub-step)

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol operation with synopsis, collapsible "Step 1" and 8 sub-steps, all with disclosure triangles. Step 6 "Pay resources" shows amber/gold left border and colored header — cost highlighting working.
**Issues observed**:
- **Improved**: Step 6 "Pay resources" has visible amber left border and gold-colored header text — cost step clearly distinguished from surrounding steps
- **Improved**: All sub-steps collapsible with ▼ markers
- Steps 1, 2 "Select spaces"; steps 3, 5, 7, 8 "Select zones" — still repetitive
- "Faction is us and type in troops, police" — filter expression still reads as a technical predicate
- "Cube.m48patrol Moved to true" — raw property chain
- "Cap Patrol M48-Shaded Moved Cube Penalty" — meaningless humanized capability ID

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep operation with synopsis, collapsible "Step 1" with 4 bullet items plus 5 sub-steps (all with ▼ markers). Step 5 "Pay resources" shows amber cost highlighting. Modifiers section expanded showing 3 modifier entries with descriptive text.
**Issues observed**:
- **Improved**: Step 5 "Pay resources" has amber left border and gold header — visually distinct
- **Improved**: All sub-steps collapsible
- **Improved**: Modifiers section now shows descriptive text: "CAPS is Shaded: Train/Sweep: limited to spaces without NVA control", "Cobras is Unshaded: Sweep: remove 1 active enemy in up to 2 spaces", "Booby Traps is Shaded: No additional effect"
- Condition expressions still technical in Step 1 bullets
- "Sweep Loc Hop" — meaningless humanized identifier
- Step 4 "Select spaces" with child "Select spaces" — redundant

#### fitl-train-1.png + fitl-train-2.png — Train Tooltip
**What's shown**: Train operation spanning 2 screenshots. Synopsis, collapsible "Step 1" with ~10 bullet items, sub-steps 1-7 (all with ▼ markers). Step 3 "Pay resources" shows amber cost highlighting in both screenshots.
**Issues observed**:
- **Improved**: Step 3 "Pay resources" has amber left border and gold header — cost clearly visible and findable even in a long tooltip
- **Improved**: All 7 sub-steps now collapsible — when collapsed, Train would fit in a single screen showing just step headers
- **Persists**: Screenshots show all sub-steps expanded (user expanded for screenshot), but collapsibility is confirmed by ▼ markers
- **Persists**: Arithmetic expressions "Transfer Amount * -1", "1 * -4 or -3", "Pac Levels * -4 or -3"
- **Persists**: Condition filters in Step 1 bullets still technical
- **Persists**: "Sub Space" jargon, "Place From Available Or Map" meaningless
- Positive: Sub-step headers diverse and meaningful (Summary, Choose option, Pay resources, Set values, Shift markers, Remove pieces)

### Cross-Tooltip Consistency

- **Cost highlighting is consistent**: All tooltips with "Pay resources" sub-steps show amber left border and gold header (Patrol step 6, Sweep step 5, Train step 3). Assault has no dedicated cost sub-step — its cost line is inside "Select items" so it doesn't get highlighted.
- **Collapsible sub-steps consistent**: All tooltips show ▼ disclosure markers on all sub-steps
- **Step header inconsistency persists**: "Select spaces" vs "Select zones" vs "Select items" across tooltips
- **Modifier display improved**: Sweep's modifiers now show descriptive text with condition + effect format

### Resolved Since Previous

- **No visual hierarchy for costs** — was [MEDIUM #4] in Eval #3 (per-metric stagnation at 3 for 3 evals), now partially resolved. Cost sub-steps ("Pay resources") have amber left border and gold-colored header, making them visually distinct from other steps. Information Hierarchy stagnation broken.
- **No progressive disclosure** — was [MEDIUM #5] in Eval #3 (per-metric stagnation at 3 for 3 evals), now resolved. All sub-steps are collapsible via `<details>` elements with disclosure triangles. Long tooltips can be collapsed to show only step headers.
- **Costs buried at inconsistent positions** — was [MEDIUM #7] in Eval #3 (per-metric stagnation at 4 for 3 evals), partially resolved. Cost steps are now visually highlighted regardless of position — amber border makes them findable via scanning.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 4 | 4 | 0 | No engine-layer text changes this iteration. Filter predicates, arithmetic, and property chains persist. |
| 2 | Step Semantic Clarity | 4 | 4 | 0 | No step header changes. Same repetitive "Select spaces" / "Select zones" pattern. |
| 3 | Information Hierarchy | 5 | 3 | +2 | Cost sub-steps now visually distinguished with amber left border and colored header. Clear visual separation between cost steps and other steps. First visual hierarchy improvement. Still room to grow — conditions and choices not yet differentiated. |
| 4 | Terminology Consistency | 4 | 4 | 0 | No terminology changes. Same humanized-but-meaningless capability IDs. |
| 5 | Progressive Disclosure | 5 | 3 | +2 | All sub-steps now collapsible with disclosure triangles. Long tooltips can be collapsed to show only headers. First 3 sub-steps default-open, rest collapsed. Train tooltip manageable in one screen when collapsed. |
| 6 | Visual Scannability | 5 | 4 | +1 | Cost highlighting provides a visual anchor — eye is drawn to amber border when scanning. Collapsible sub-steps reduce visual clutter. Synopsis + highlighted costs + collapsible headers create a scannable structure. |
| 7 | Cost Transparency | 6 | 4 | +2 | "Pay resources" steps now instantly findable via amber border regardless of position in the step list. Patrol's cost at step 6/8 is as visible as Sweep's at step 5/5. Only exception: Assault's cost is inside "Select items" step (not a dedicated cost sub-step). |
| 8 | Optional/Mandatory Distinction | 3 | 3 | 0 | No changes. One "(optional)" text marker in Train persists. |
| | **Average** | **4.5** | **3.6** | **+0.9** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #1   | 3.0 | — |
| #2   | 3.4 | +0.4 |
| #3   | 3.6 | +0.2 |
| #4   | 4.5 | +0.9 |

The runner-layer shift produced the largest single-iteration improvement (+0.9 vs previous best of +0.4). Three previously-stagnating metrics broke through: Information Hierarchy (+2), Progressive Disclosure (+2), Cost Transparency (+2). This validates the layer-shift recommendation from Eval #3.

### Prioritized Recommendations

1. **[HIGH]** Condition expressions still read as technical predicates — "Faction is us and type in troops, police", "number of US Troops pieces > 0 and number of NVA/VC pieces > 0". The operators are humanized ("is" vs "eq") but the overall sentence structure is still a filter expression. *(Recurring: 4 consecutive evaluations, metric: Language Naturalness unchanged at 4 for 2 evaluations)*

2. **[HIGH]** Humanized capability IDs still semantically meaningless — "Cap Assault Cobras Shaded Cost", "Sweep Loc Hop", "Place From Available Or Map". Players cannot understand what these refer to. *(Recurring: 3 consecutive evaluations)*

3. **[HIGH]** Step headers repetitive within the same target type — 4x "Select spaces" in Assault, 4x "Select zones" in Patrol. *(Recurring: 4 consecutive evaluations, metric: Step Semantic Clarity unchanged at 4 for 3 evaluations — per-metric stagnation)*

4. **[MEDIUM]** Assault's cost line ("Pay 3 ARVN Resources") is inside a "Select items" step and doesn't receive cost highlighting — it's the only tooltip where costs aren't visually distinguished. *(New)*

5. **[MEDIUM]** Arithmetic expressions visible — "Transfer Amount * -1", "Pac Levels * -4 or -3", "1 * -4 or -3". Variable names are readable but the math is meaningless to players. *(Recurring: 4 consecutive evaluations)*

6. **[LOW]** Raw property chains — "Set Cube.m48patrol Moved to true", "Sub Space" jargon. *(Recurring: 4 consecutive evaluations)*

7. **[LOW]** Optional/mandatory distinction limited to one "(optional)" text marker. *(Recurring: 4 consecutive evaluations, metric unchanged at 3 for 4 evaluations — per-metric stagnation)*

**Per-metric stagnation notes**: Step Semantic Clarity (4) has been unchanged for 3 evaluations. Optional/Mandatory Distinction (3) has been unchanged for 4 evaluations. Language Naturalness (4) has been unchanged for 2 evaluations (approaching stagnation).

---

## EVALUATION #5

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation with synopsis, collapsible "Step 1" with 7 sub-steps. Sub-step headers now include filter context in parentheses. Step 5 now shows "Target spaces" (from choiceBranchLabel).
**Issues observed**:
- **Improved**: Step headers now diversified with filter context: "Select spaces (number of us troops pieces > 0)" (steps 1, 2), "Select spaces (zone id in target spaces)" (step 4), "Select spaces (number of arvn troops/police pieces > 0)" (steps 6, 7)
- **Improved**: Step 5 header is "Target spaces" — derived from choiceBranchLabel, more meaningful
- **Persists**: "Cap Assault Cobras Shaded Cost" still appears as a bullet under "Roll dice" (step 3) — this is NOT a modifier message, so the modifier suppression doesn't affect it
- **Persists**: "Cap Assault M48-Unshaded Bonus Removal" still appears under step 4
- **Persists**: Filter context in headers is still technical: "(number of us troops pieces > 0)" — lowercase, reads like a query
- **Persists**: Condition text in step lines still reads as filter predicates

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol operation with 8 sub-steps. Headers now include filter context. Cost step 6 has amber highlighting.
**Issues observed**:
- **Improved**: Steps 1, 2 now "Select spaces (zone category is line of communication)" — contextual, distinct from steps 3, 5 "Select zones (faction is us)" and steps 7, 8 "Select zones (faction is arvn)"
- **Improved**: Headers differentiate US vs ARVN selection steps — player can see the pattern
- **Persists**: "Cap Patrol M48-Shaded Moved Cube Penalty" still appears under step 5 — inline capability text not suppressed
- **Persists**: "Cube.m48patrol Moved to true" — raw property chain
- **Persists**: Filter context in parentheses still reads as technical text

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep operation with 5 sub-steps. Headers include filter context. Cost step 5 has amber highlighting. Modifiers section expanded with 3 descriptive entries.
**Issues observed**:
- **Improved**: Steps 1, 2 now "Select spaces (zone category in province or city)" — contextual
- **Persists**: "Cap Sweep Cobras Unshaded Removal" and "Cap Sweep Booby Traps Shaded Cost" in Step 1 bullets — inline capability text not suppressed
- **Persists**: "Sweep Loc Hop" still appears — humanized but meaningless

#### fitl-train-1.png + fitl-train-2.png — Train Tooltip
**What's shown**: Train operation spanning 2 screenshots. Sub-steps 1-7 all collapsible. Cost step 3 amber-highlighted. Modifiers section at bottom shows 3 descriptive entries with effect text.
**Issues observed**:
- **Improved**: Modifiers section now shows descriptive text: "CAPS is Unshaded: Train: place free Police in training spaces with US base", "CORDS is Unshaded: Train: pacify in up to 2 selected spaces instead of 1"
- **Persists**: Arithmetic expressions "Transfer Amount * -1", "1 * -4 or -3", "Pac Levels * -4 or -3"
- **Persists**: "Place From Available Or Map" under Summary — meaningless
- **Persists**: Tooltip still spans 2 screens when all sub-steps expanded (but collapsible)

### Cross-Tooltip Consistency

- **Step header filter context consistent**: All tooltips now append filter context in parentheses for select sub-steps
- **Cost highlighting consistent**: Amber left border on all "Pay resources" steps across all tooltips
- **Collapsibility consistent**: All sub-steps collapsible
- **Inline capability IDs inconsistent with Modifiers section**: Capability references appear as raw text in step bullets ("Cap Assault Cobras Shaded Cost") but as descriptive text in the Modifiers section ("Cobras is Unshaded: Sweep: remove 1 active enemy in up to 2 spaces"). These serve different purposes but the inline references are still meaningless noise.
- **choiceBranchLabel usage inconsistent**: Only Assault step 5 ("Target spaces") appears to use choiceBranchLabel — other tooltips' select steps don't have branch labels

### Resolved Since Previous

- **Step headers repetitive within same target type** — was [HIGH #3] in Eval #4 (per-metric stagnation at 4 for 3 evals), now partially resolved. Filter context in parentheses differentiates consecutive same-target sub-steps: "Select spaces (number of us troops pieces > 0)" vs "Select spaces (zone id in target spaces)". Headers are no longer identical, though the filter context itself is still technical.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 4 | 4 | 0 | No text quality changes for step line content. Filter predicates persist. Arithmetic persists. Filter context added to headers is informative but still reads as technical text. |
| 2 | Step Semantic Clarity | 5 | 4 | +1 | Step headers now differentiated via filter context: "Select spaces (number of us troops pieces > 0)" vs "Select spaces (zone id in target spaces)". No more 4x identical "Select spaces". choiceBranchLabel produces good headers like "Target spaces". Per-metric stagnation broken. |
| 3 | Information Hierarchy | 5 | 5 | 0 | No new visual hierarchy changes. Cost highlighting and collapsibility from iteration 4 maintained. |
| 4 | Terminology Consistency | 4 | 4 | 0 | Inline capability IDs still present ("Cap Assault Cobras Shaded Cost") — these were NOT suppressed because they come through a non-modifier rendering path. The modifier suppression only affects dedicated modifier-kind messages, not inline references in step content. |
| 5 | Progressive Disclosure | 5 | 5 | 0 | No changes. Collapsibility maintained. |
| 6 | Visual Scannability | 6 | 5 | +1 | Filter context in step headers makes scanning more efficient — player can identify which step selects US forces vs ARVN forces without expanding the step. Combined with cost highlighting and collapsibility, the tooltip structure is increasingly scannable. |
| 7 | Cost Transparency | 6 | 6 | 0 | No changes. Cost highlighting maintained. |
| 8 | Optional/Mandatory Distinction | 3 | 3 | 0 | No changes. One "(optional)" marker in Train. |
| | **Average** | **4.8** | **4.5** | **+0.3** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #1   | 3.0 | — |
| #2   | 3.4 | +0.4 |
| #3   | 3.6 | +0.2 |
| #4   | 4.5 | +0.9 |
| #5   | 4.8 | +0.3 |

Consistent positive trend. Runner-layer shift (Eval #4) produced the largest jump. Engine-layer refinements continue to deliver incremental gains.

### Prioritized Recommendations

1. **[HIGH]** Inline capability references still appear as meaningless text in step content — "Cap Assault Cobras Shaded Cost", "Cap Sweep Cobras Unshaded Removal", "Sweep Loc Hop", "Place From Available Or Map". These are not modifier-kind messages so the modifier suppression doesn't reach them. They are noise that clutters the step content. *(Recurring: 4 consecutive evaluations, metric: Terminology Consistency unchanged at 4 for 3 evaluations — per-metric stagnation)*

2. **[HIGH]** Condition expressions in step lines still read as technical predicates — "number of US Troops pieces > 0 and number of NVA/VC pieces > 0", "Faction is us and type in troops, police and m48patrol moved is true". *(Recurring: 5 consecutive evaluations, metric: Language Naturalness unchanged at 4 for 3 evaluations — per-metric stagnation)*

3. **[MEDIUM]** Filter context in step headers is informative but still technical — "(number of us troops pieces > 0)" is better than no context but reads as a query rather than natural language. *(New)*

4. **[MEDIUM]** Arithmetic expressions visible to players — "Transfer Amount * -1", "1 * -4 or -3". *(Recurring: 5 consecutive evaluations)*

5. **[MEDIUM]** Raw property chains — "Set Cube.m48patrol Moved to true", "Sub Space" jargon. *(Recurring: 5 consecutive evaluations)*

6. **[LOW]** Optional/mandatory distinction limited to one "(optional)" text marker. *(Recurring: 5 consecutive evaluations, metric unchanged at 3 for 5 evaluations — per-metric stagnation)*

**Per-metric stagnation notes**: Terminology Consistency (4) has been unchanged for 3 evaluations — inline capability references are the blocker. Language Naturalness (4) has been unchanged for 3 evaluations — condition expressions are the blocker. Optional/Mandatory Distinction (3) has been unchanged for 5 evaluations — never changed from baseline.

---

## EVALUATION #6

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation with synopsis, collapsible "Step 1" with 7 sub-steps. All sub-steps collapsible. Step headers include concise filter context.
**Issues observed**:
- **Improved**: "Cap Assault Cobras Shaded Cost" and "Cap Assault M48-Unshaded Bonus Removal" gone — step 3 "Roll dice" now only shows "Roll 1-6"
- **Improved**: Headers concise: "(us troops)" instead of "(number of us troops pieces > 0)", "(zone id in target spaces)" (step 4), "(arvn troops/police)" (steps 6, 7)
- **Improved**: Step 5 still "Target spaces" (from choiceBranchLabel) — clean and readable
- Steps 1, 2 both "(us troops)" — still identical headers for consecutive steps
- Condition text in lines still reads as filter predicates: "number of US Troops pieces > 0 and number of NVA/VC pieces > 0"

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol operation with 8 sub-steps. Headers concise with faction context. Cost step 6 amber-highlighted.
**Issues observed**:
- **Improved**: Headers now "(line of communication)" (steps 1, 2), "(us)" (steps 3, 5), "(arvn)" (steps 7, 8) — concise and descriptive
- **Improved**: No "Cap Patrol M48-Shaded Moved Cube Penalty" line — capability noise suppressed
- "Cube.m48patrol Moved to true" — raw property chain persists
- "Faction is us and type in troops, police and m48patrol moved is true" — condition still technical but operators humanized

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep operation with 5 sub-steps. Headers "(province or city)". Cost step 5 amber-highlighted. Modifiers section with 3 descriptive entries.
**Issues observed**:
- **Improved**: "Cap Sweep Cobras Unshaded Removal" and "Cap Sweep Booby Traps Shaded Cost" gone from Step 1 bullets — only 2 bullets remain in Step 1 (down from 4)
- **Improved**: Headers "(province or city)" — concise
- **Persists**: "Sweep Loc Hop" in step 4 — not a "Cap " prefix, so not suppressed
- Step 1 only has 2 relevant bullets now — cleaner and more scannable

#### fitl-train-1.png + fitl-train-2.png — Train Tooltip
**What's shown**: Train operation spanning 2 screenshots. Sub-steps 1-7 collapsible. Cost step 3 amber-highlighted. Modifiers at bottom with descriptive text.
**Issues observed**:
- **Persists**: "Place From Available Or Map" under Summary — still meaningless
- **Persists**: Arithmetic "Transfer Amount * -1", "1 * -4 or -3", "Pac Levels * -4 or -3"
- **Persists**: "Sub Space" jargon
- Tooltip still spans 2 screens when expanded (but collapsible)
- Positive: Modifiers section shows rich descriptive text: "CAPS is Unshaded: Train: place free Police in training spaces with US base"

### Cross-Tooltip Consistency

- **"Cap " line suppression consistent**: All "Cap ..." lines removed across all tooltips
- **Filter context format consistent**: All tooltips show concise noun context in parentheses
- **Cost highlighting consistent**: Amber left border on all "Pay resources" steps
- **Collapsibility consistent**: All sub-steps have ▼ disclosure markers
- **Minor inconsistency**: "Sweep Loc Hop" and "Place From Available Or Map" survive because they don't start with "Cap " — these non-capability noise lines are inconsistently handled compared to the now-suppressed "Cap ..." lines

### Resolved Since Previous

- **Inline "Cap ..." capability references as meaningless noise** — was [HIGH #1] in Eval #5 (per-metric stagnation), now resolved. All "Cap Assault Cobras Shaded Cost", "Cap Sweep Cobras Unshaded Removal", "Cap Patrol M48-Shaded Moved Cube Penalty" etc. suppressed from step content. Capability effects still shown in Modifiers section.
- **Filter context in headers too technical** — was [MEDIUM #3] in Eval #5, now resolved. Headers show concise nouns: "(us troops)", "(line of communication)", "(province or city)", "(arvn)" instead of full filter predicates.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 5 | 4 | +1 | Step headers now read more naturally: "Select spaces (us troops)" instead of "(number of us troops pieces > 0)". "Cap ..." noise removed. But condition text in step lines still reads as filter predicates. Breaking 3-eval stagnation at 4. |
| 2 | Step Semantic Clarity | 6 | 5 | +1 | Headers now both unique AND concise: "(us troops)" vs "(arvn troops/police)" vs "(zone id in target spaces)". Combined with collapsibility, the step structure is clear and navigable. |
| 3 | Information Hierarchy | 5 | 5 | 0 | No new visual changes. Cost highlighting and collapsibility maintained. |
| 4 | Terminology Consistency | 5 | 4 | +1 | "Cap ..." capability ID noise removed. "Sweep Loc Hop" and "Place From Available Or Map" persist but are fewer and less prominent. Breaking 3-eval stagnation at 4. |
| 5 | Progressive Disclosure | 5 | 5 | 0 | No changes. Collapsibility maintained. Sweep's Step 1 bullets reduced from 4 to 2 (cap lines removed). |
| 6 | Visual Scannability | 6 | 6 | 0 | Removal of noise lines improves scannability indirectly — fewer items to scan through. But no new visual formatting changes. |
| 7 | Cost Transparency | 6 | 6 | 0 | No changes. Cost highlighting maintained. |
| 8 | Optional/Mandatory Distinction | 3 | 3 | 0 | No changes. One "(optional)" marker in Train. |
| | **Average** | **5.1** | **4.8** | **+0.3** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #2   | 3.4 | +0.4 |
| #3   | 3.6 | +0.2 |
| #4   | 4.5 | +0.9 |
| #5   | 4.8 | +0.3 |
| #6   | 5.1 | +0.3 |

Crossed the 5.0 threshold — transitioning from "poor" (4-5) into "adequate" (6-7) range. Consistent positive trend continues. No oscillation detected.

### Prioritized Recommendations

1. **[HIGH]** Condition expressions in step lines still read as technical predicates — "number of US Troops pieces > 0 and number of NVA/VC pieces > 0", "Faction is us and type in troops, police and m48patrol moved is true". Players see structured filter syntax, not natural game instructions. *(Recurring: 6 consecutive evaluations, metric: Language Naturalness improved to 5 but condition text is the remaining blocker)*

2. **[MEDIUM]** Non-"Cap" humanized identifiers still appear as noise — "Sweep Loc Hop" (step 4 in Sweep), "Place From Available Or Map" (Summary in Train). These are not capability IDs and escaped the "Cap " prefix suppression. *(Recurring: 5+ consecutive evaluations)*

3. **[MEDIUM]** Arithmetic expressions visible — "Transfer Amount * -1", "Pac Levels * -4 or -3", "1 * -4 or -3". Players see internal computation. *(Recurring: 6 consecutive evaluations)*

4. **[MEDIUM]** Raw property chains — "Set Cube.m48patrol Moved to true", "Sub Space". *(Recurring: 6 consecutive evaluations)*

5. **[LOW]** Optional/mandatory distinction limited to one "(optional)" text marker. *(Recurring: 6 consecutive evaluations, metric unchanged at 3 for 6 evaluations — per-metric stagnation)*

**Per-metric stagnation notes**: Optional/Mandatory Distinction (3) has been unchanged for 6 consecutive evaluations — never changed from baseline. This is the longest-running stagnation in the pipeline.

---

## EVALUATION #7

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation with synopsis, 7 collapsible sub-steps. Step headers with concise context. Modifiers section expanded showing descriptive capability effects.
**Issues observed**:
- **Dramatically improved**: "Select 1 with US Troops and with NVA/VC" — was "Select 1 number of US Troops pieces > 0 and number of NVA/VC pieces > 0". Reads much more naturally.
- **Improved**: "Select up to 2 in selected spaces without Lowland terrain" — was "zone Id in Target Spaces and not Terrain Tags includes Lowland"
- **Improved**: "Select 1 with ARVN Troops/Police and with NVA/VC" — concise
- **Improved**: Modifiers now show rich descriptive text: "Abrams is Shaded: Assault spaces must have US base or 3+ US Troops"
- Steps 1, 2 still "(us troops)" — identical consecutive headers persist
- Steps 6, 7 "(arvn troops/police)" — also identical

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol with 8 collapsible sub-steps. Cost step 6 amber-highlighted. Concise filter context headers.
**Issues observed**:
- **Improved**: "Select up to 2 us troops, police" — was "Faction is us and type in troops, police and m48patrol moved is true". m48patrol tracking suppressed, faction/type simplified.
- **Improved**: "Set Cube m48patrol" — dot chain humanized (was "Set Cube.m48patrol Moved to true", "Moved to true" suppressed)
- **Improved**: "Select arvn troops, police" — concise
- "Set Cube m48patrol" — still somewhat cryptic, but much better than the property chain
- Steps 1, 2 still both "(line of communication)" — identical

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep with 5 sub-steps. Very clean — only 2 Step 1 bullets, 5 concise sub-steps, modifiers, availability. Fits comfortably in one screen.
**Issues observed**:
- **Improved**: "Select 1 in Province or City and not in North Vietnam" — natural language
- **Improved**: "Sweep Loc Hop" GONE from step 4 — noise suppressed
- **Improved**: Step 1 down to 2 bullets — very clean
- Step 4 "Select spaces" with child "Select spaces" — redundant but minimal

#### fitl-train-1.png + fitl-train-2.png — Train Tooltip
**What's shown**: Train spanning 2 screenshots. Sub-steps 1-7 collapsible. Cost step 3 amber-highlighted.
**Issues observed**:
- **Improved**: "Select 1 in City or Province and with US" — simplified from zone category + piece count filter
- **Persists**: "Place From Available Or Map" under Summary — not caught by noise suppression (contains lowercase "From", "Or")
- **Persists**: Arithmetic "Transfer Amount * -1", "1 * -4 or -3", "Pac Levels * -4 or -3"
- **Persists**: "Sub Space" jargon in "Remove Cube from Sub Space to ARVN Available Forces"
- Positive: Modifiers show rich descriptive effects

### Cross-Tooltip Consistency

- **Condition simplification consistent**: All tooltips show simplified conditions ("with X" instead of "number of X pieces > 0")
- **Noise suppression consistent**: "Sweep Loc Hop" gone; "Cap ..." lines remain suppressed
- **Cost highlighting consistent**: Amber borders on all "Pay resources" steps
- **One remaining noise line inconsistency**: "Place From Available Or Map" in Train survived because it contains lowercase words — inconsistent with the suppression of "Sweep Loc Hop" (which was caught by the 3+ Title Case pattern)

### Resolved Since Previous

- **Condition expressions as technical predicates** — was [HIGH #1] in Eval #6 (recurring 6 evals), now substantially resolved. "number of X pieces > 0" → "with X", "Faction is X and type in Y" → "X Y", "zone Category in X" → "in X", "zone Country is not X" → "not in X". The longest-deferred issue in the pipeline is now largely fixed.
- **Non-Cap noise identifiers** — was [MEDIUM #2] in Eval #6, partially resolved. "Sweep Loc Hop" suppressed. "Place From Available Or Map" persists (mixed case breaks the identifier pattern).
- **Raw property chains** — was [MEDIUM #4] in Eval #6, resolved. "Cube.m48patrol" → "Cube m48patrol" (dot humanized), "Moved to true" suppressed.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 7 | 5 | +2 | Major leap — "with US Troops and with NVA/VC" reads naturally. "in Province or City and not in North Vietnam" is close to game manual language. Faction/type filters simplified to noun phrases. "Moved to true" suppressed. Approaching "adequate to good" threshold. |
| 2 | Step Semantic Clarity | 6 | 6 | 0 | No header changes. Concise context from iteration 6 maintained. |
| 3 | Information Hierarchy | 5 | 5 | 0 | No visual changes. Cost highlighting and collapsibility maintained. |
| 4 | Terminology Consistency | 6 | 5 | +1 | "Sweep Loc Hop" gone. Property chains humanized. "m48patrol" still appears but no longer in dot-chain format. "Place From Available Or Map" persists but is the only remaining identifier noise. |
| 5 | Progressive Disclosure | 6 | 5 | +1 | Sweep tooltip now fits comfortably in one screen (was tight before — fewer Step 1 bullets, noise lines removed). Train still spans 2 screens but less densely. |
| 6 | Visual Scannability | 7 | 6 | +1 | Condition simplification dramatically reduces text density. "with US Troops" is scannable in 1 second vs "number of US Troops pieces > 0" which required parsing. Combined with cost highlighting and collapsibility, tooltips are now genuinely scannable. |
| 7 | Cost Transparency | 6 | 6 | 0 | No changes. Cost highlighting maintained. |
| 8 | Optional/Mandatory Distinction | 3 | 3 | 0 | No changes. One "(optional)" marker in Train. |
| | **Average** | **5.8** | **5.1** | **+0.7** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #3   | 3.6 | +0.2 |
| #4   | 4.5 | +0.9 |
| #5   | 4.8 | +0.3 |
| #6   | 5.1 | +0.3 |
| #7   | 5.8 | +0.7 |

Second-largest single-iteration improvement (+0.7, after Eval #4's +0.9 runner-layer shift). The condition simplification was the highest-impact engine-layer change in the pipeline — addressing the longest-deferred issue (6 evals) produced the largest engine-layer score jump.

### Prioritized Recommendations

1. **[MEDIUM]** "Place From Available Or Map" still appears as noise in Train's Summary sub-step — the only remaining humanized identifier noise line. It escaped the noise detection pattern because it contains lowercase words ("From", "Or"). *(Recurring: 7+ consecutive evaluations but reduced in scope — only 1 remaining instance)*

2. **[MEDIUM]** Arithmetic expressions still visible — "Transfer Amount * -1", "Pac Levels * -4 or -3", "1 * -4 or -3". Players see internal computation. *(Recurring: 7 consecutive evaluations)*

3. **[MEDIUM]** "Sub Space" jargon in Train's "Remove pieces" step. *(Recurring: 7 consecutive evaluations)*

4. **[MEDIUM]** Consecutive identical step headers persist — steps 1+2 "(us troops)" in Assault, steps 1+2 "(line of communication)" in Patrol, steps 6+7 "(arvn troops/police)" in Assault. *(Recurring: reduced severity since headers are now contextual, but identical consecutive pairs remain)*

5. **[LOW]** Optional/mandatory distinction limited to one "(optional)" text marker. *(Recurring: 7 consecutive evaluations, metric unchanged at 3 for 7 evaluations — per-metric stagnation. This is the longest-running stagnation in the pipeline.)*

**Notable**: No HIGH or CRITICAL recommendations remain. All remaining issues are MEDIUM or LOW. The pipeline has transitioned from fixing fundamental readability blockers to polishing edge cases.

---

## EVALUATION #8

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation with 7 collapsible sub-steps. Clean, concise text. Modifiers section expanded showing 2 descriptive capability effects.
**Issues observed**:
- Assault tooltip is now very readable — "Select 1 with US Troops and with NVA/VC", "Select up to 2 in selected spaces without Lowland terrain", "Select 1 with ARVN Troops/Police and with NVA/VC"
- Steps 1+2 still both "(us troops)" and steps 6+7 both "(arvn troops/police)" — identical consecutive headers
- Step 3 "Roll dice" with only "Roll 1-6" — clean
- Positive: No arithmetic, no noise identifiers, no jargon

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol with 8 collapsible sub-steps. Cost step 6 amber-highlighted. Clean text.
**Issues observed**:
- "Set Cube m48patrol" — still somewhat cryptic but much better than original "Set Cube.m48patrol Moved to true"
- Steps 1+2 "(line of communication)" — identical consecutive headers
- "Select up to 2 us troops, police" and "Select arvn troops, police" — readable faction/type selections
- Positive: No arithmetic, no noise, costs highlighted

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep with 5 sub-steps. Entire tooltip fits in one screen. Very clean — 2 Step 1 bullets, 5 concise sub-steps, modifiers with descriptive text. This is the best-looking tooltip.
**Issues observed**:
- Step 4 "Select spaces" with child "Select spaces" — redundant (header = content)
- Otherwise exemplary: clean, scannable, one-screen, cost-highlighted

#### fitl-train-1.png + fitl-train-2.png — Train Tooltip
**What's shown**: Train spanning 2 screenshots. Sub-steps 1-7 collapsible. Cost step 3 amber-highlighted. Modifiers with 3 descriptive entries.
**Issues observed**:
- **Improved**: "Set Patronage to Transfer Amount" (was "Transfer Amount * -1") — arithmetic stripped
- **Improved**: "Set ARVN Resources to 1" (was "1 * -4 or -3") — arithmetic stripped
- **Improved**: "Set ARVN Resources to Pac Levels" (was "Pac Levels * -4 or -3") — arithmetic stripped
- **Improved**: "Remove Cube from this space to ARVN Available Forces" (was "Sub Space") — natural
- **Improved**: "Place From Available Or Map" line GONE — Summary sub-step now empty (just header "Summary")
- Summary sub-step 1 has collapsed header "Summary" but no visible content — the noise line was the only content. Consider whether an empty sub-step should be suppressed entirely.
- Tooltip still spans 2 screens when fully expanded

### Cross-Tooltip Consistency

- **Arithmetic stripping consistent**: All tooltips free of " * -N" arithmetic
- **"this space" consistent**: Train's Remove step uses natural phrasing
- **Cost highlighting consistent**: Amber borders on all "Pay resources" steps
- **Collapsibility consistent**: All sub-steps have ▼ markers
- **Empty sub-step inconsistency**: Train's Summary sub-step has a header but no content lines after noise suppression — other tooltips don't have empty sub-steps

### Resolved Since Previous

- **Arithmetic expressions visible to players** — was [MEDIUM #2] in Eval #7 (recurring 7 evals), now resolved. "Transfer Amount * -1" → "Transfer Amount", "1 * -4 or -3" → "1", "Pac Levels * -4 or -3" → "Pac Levels". Trailing arithmetic operators and constants stripped.
- **"Place From Available Or Map" noise** — was [MEDIUM #1] in Eval #7, now resolved. Summary-kind noise line suppressed.
- **"Sub Space" jargon** — was [MEDIUM #3] in Eval #7 (recurring 7 evals), now resolved. Replaced with "this space" — natural language.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 7 | 7 | 0 | Arithmetic stripped improves edge cases but the overall language quality was already at 7 from iteration 7's condition simplification. "this space" is a minor improvement. No new text quality breakthrough. |
| 2 | Step Semantic Clarity | 6 | 6 | 0 | No step header changes. Identical consecutive headers persist ("(us troops)" x2, "(line of communication)" x2). |
| 3 | Information Hierarchy | 5 | 5 | 0 | No visual changes. Cost highlighting and collapsibility maintained. |
| 4 | Terminology Consistency | 7 | 6 | +1 | All remaining noise identifiers gone ("Place From Available Or Map" suppressed). "Sub Space" replaced with natural "this space". Only "m48patrol" and "Cube" remain as slightly technical terms — but these are game-specific token/property names that may be intentional. |
| 5 | Progressive Disclosure | 6 | 6 | 0 | No changes. Collapsibility maintained. Sweep fits in one screen. |
| 6 | Visual Scannability | 7 | 7 | 0 | No visual changes. Fewer noise lines marginally improves density but not enough to change score. |
| 7 | Cost Transparency | 6 | 6 | 0 | No changes. Cost highlighting maintained. |
| 8 | Optional/Mandatory Distinction | 3 | 3 | 0 | No changes. One "(optional)" marker in Train. |
| | **Average** | **5.9** | **5.8** | **+0.1** | |

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #4   | 4.5 | +0.9 |
| #5   | 4.8 | +0.3 |
| #6   | 5.1 | +0.3 |
| #7   | 5.8 | +0.7 |
| #8   | 5.9 | +0.1 |

Diminishing returns — the +0.1 delta is the smallest improvement yet. The pipeline is reaching the practical limit of engine-layer post-realization cleanup. Future improvements require either runner-layer visual changes or deeper architectural work (RuleCard interface changes for optional/mandatory, AST-level condition rewriting).

### Prioritized Recommendations

1. **[MEDIUM]** Consecutive identical step headers — steps 1+2 "(us troops)" in Assault, steps 1+2 "(line of communication)" in Patrol, steps 6+7 "(arvn troops/police)" in Assault. Players see duplicate header text for adjacent steps. *(Recurring: reduced in severity but present for 5+ evals)*

2. **[MEDIUM]** Empty Summary sub-step in Train — the noise suppression removed the only content line, leaving a collapsible header "Summary" with nothing inside. An empty sub-step is confusing. *(New)*

3. **[LOW]** "Set Cube m48patrol" in Patrol — cryptic but may be an intentional game-specific token/property reference. *(Recurring: 8 consecutive evaluations but severity reduced — only 1 instance remaining)*

4. **[LOW]** Optional/mandatory distinction limited to one "(optional)" text marker. *(Recurring: 8 consecutive evaluations, metric unchanged at 3 for 8 evaluations — per-metric stagnation. Longest-running stagnation in the pipeline.)*

5. **[LOW]** Train tooltip still spans 2 screens when fully expanded, though collapsible. *(Recurring: reduced severity since collapsibility was added in Eval #4)*

**Diminishing returns note**: The average improved by only +0.1 this iteration. The remaining issues are either low-severity edge cases or require architectural changes (RuleCard interface for optional/mandatory). The pipeline may be approaching its practical ceiling without deeper structural work. Consider pausing the pipeline and evaluating cost-benefit of further iterations.
