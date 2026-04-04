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

## EVALUATION #1

**Date**: 2026-04-04
**Screenshots analyzed**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train-1.png, fitl-train-2.png

### Screenshot Analysis

#### fitl-assault.png — Assault Tooltip
**What's shown**: Assault operation tooltip with synopsis, 1 top-level collapsible "Step 1" containing 7 sub-steps, modifiers section (0 active), availability indicator, and Raw AST toggle. Single screen, no scrolling needed.
**Issues observed**:
- "Select 0 Target Spaces" — confusing; "0" as a count makes the line seem like a no-op
- 6 of 7 sub-steps all labeled **"Select spaces"** — no semantic differentiation
- Filter predicates as text: "number of US Troops pieces > 0 and number of NVA/VC pieces > 0"
- Nonsensical range: "Select 1-0 number of ARVN Troops/Police pieces" — "1-0" is meaningless to a player
- Kebab-case capability IDs exposed: `Cap-assault-cobras-shaded-cost`, `Cap-assault-m48-unshaded-bonus-removal`
- "Roll 1-6" under "Roll dice" is the only descriptive header among the sub-steps
- Cost "Pay 3 ARVN Resources" buried as a bullet inside step 5, indistinguishable from other bullets
- "zone Id in Target Spaces and not Terrain Tags includes Lowland" — raw filter with internal field names

#### fitl-patrol.png — Patrol Tooltip
**What's shown**: Patrol operation tooltip with synopsis, collapsible "Step 1" and 8 sub-steps, modifiers section (expanded, showing 1 modifier), and availability indicator. Requires light scrolling.
**Issues observed**:
- "Select up to 1 Target Lo Cs" — partially humanized but "Lo Cs" is awkward abbreviation
- **Magic number**: "Select 1-99 zone Category is Line of Communication" — 99 meaning unlimited
- Raw filter predicates: "Select 0 Faction eq us and type in troops, police"
- **$variable reference**: "Move Cube from Zone of $cube to Loc" — `$cube` is an internal binding
- Raw property access: "Set Cube.m48patrol Moved to true" — internal property chain
- Complex filter: "Faction eq us and type in troops, police and m48patrol Moved eq true" — reads like SQL
- Kebab-case ID: `Cap-patrol-m48-shaded-moved-cube-penalty`
- **Magic number**: "Select up to 99 Faction eq arvn and type in troops, police"
- 6 of 8 sub-steps labeled "Select spaces"
- Positive: Modifier text is well-written: "M48 Patton is Shaded: Patrol: pay 3 ARVN Resources for each cube that moved"
- Cost "Pay 3 ARVN Resources" at step 6 of 8 — buried deep

#### fitl-sweep.png — Sweep Tooltip
**What's shown**: Sweep operation tooltip with synopsis, collapsible "Step 1" containing 6 bullet items plus 5 sub-steps, modifiers (collapsed), availability, and Raw AST toggle. Single screen.
**Issues observed**:
- Long filter predicate in Step 1: "Select 1 zone Category in Province or City and zone Country is not North Vietnam"
- Raw filter: "Select 0 Faction eq us and type eq troops"
- Two kebab-case capability IDs: `Cap-sweep-cobras-unshaded-removal`, `Cap-sweep-booby-traps-shaded-cost`
- **$variable**: "Move Troop from Zone of $troop to Space"
- **Magic number**: "Select up to 99 spaces"
- Kebab-case internal: `Sweep-loc-hop`
- Sub-steps 1 and 2 both "Select spaces"; steps 3 ("Move forces") and 5 ("Pay resources") are better
- Step 1 mixes 6 unstructured bullet items (selections, filters, caps) before sub-steps begin — hard to parse

#### fitl-train-1.png — Train Tooltip (upper half)
**What's shown**: Train operation tooltip, upper portion. Synopsis, collapsible "Step 1" with ~12 bullet items, then sub-steps starting from 1 (Summary) through 5 (Set values). Requires significant scrolling.
**Issues observed**:
- Multiple filter predicates: "Select 1 zone Category in City or Province and number of US pieces > 0"
- **Magic number**: "Select 1-99 zone Category in City or Province and number of US pieces > 0"
- Filter condition: "number of NVA pieces ≤ number of US/ARVN/VC pieces"
- Kebab-case internal ID: `Place-from-available-or-map` shown under "Summary" header
- **$variable references**: "Set Patronage to $transferAmount * -1", "Set ARVN Resources to $transferAmount"
- Confusing arithmetic: "Set ARVN Resources to 1 * -4 or -3" — raw expression, not meaningful
- Positive: "(optional)" marker on "Choose: Pacify, Replace Cubes With Base (optional)"
- Positive: Sub-step headers are more diverse (Summary, Choose option, Pay resources, Set values)
- Positive: "Gain 5 Aid" is clear and natural

#### fitl-train-2.png — Train Tooltip (lower half)
**What's shown**: Continuation of Train tooltip, sub-steps 1 through 7. Shows Summary, Choose option, Pay resources, Choose option, Set values, Shift markers, Remove pieces. Modifiers (collapsed), availability indicator, Raw AST toggle.
**Issues observed**:
- **$variable**: "Set ARVN Resources to $pacLevels * -4 or -3", "Shift Support/Opposition by $pacLevels"
- "Remove Cube from Sub Space to ARVN Available Forces" — "Sub Space" is unclear jargon
- Raw arithmetic expressions persist throughout
- "Choose:" with empty label (step 4) — doesn't tell the player what they're choosing
- The tooltip requires 2 full screens of scrolling — no progressive disclosure beyond Step 1 collapse
- Positive: Step headers in the lower half are semantically diverse and mostly descriptive

### Resolved Since Previous

No previous evaluation exists — this is the baseline evaluation.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Language Naturalness | 2 | — | — | Pervasive filter predicates ("Faction eq us and type in troops"), $variables ($cube, $troop, $transferAmount), raw property chains ("Cube.m48patrol Moved"), confusing arithmetic ("1 * -4 or -3"). Only synopses and simple lines ("Pay 3 ARVN Resources") read naturally. |
| 2 | Step Semantic Clarity | 3 | — | — | Assault: 6/7 sub-steps "Select spaces". Patrol: 6/8 "Select spaces". Sweep slightly better. Train has the most diverse headers (Summary, Choose option, Pay resources, Shift markers, Remove pieces). Top-level "Step 1" always generic. |
| 3 | Information Hierarchy | 3 | — | — | All text in same monospace weight. No visual distinction between costs, selections, conditions, or choices. Cost lines look identical to selection lines. Only hierarchy: bold step headers vs regular bullets. |
| 4 | Terminology Consistency | 2 | — | — | Severe jargon: kebab-case capability IDs in every tooltip (Cap-assault-cobras-shaded-cost, Cap-sweep-booby-traps-shaded-cost, Sweep-loc-hop, Place-from-available-or-map), raw property names (m48patrol, Moved), $variables throughout. |
| 5 | Progressive Disclosure | 3 | — | — | Train spans 2 full screens with no collapsible sub-sections. Only affordance is the top-level Step 1 disclosure triangle. All sub-steps fully expanded always. |
| 6 | Visual Scannability | 4 | — | — | Synopsis line well-formatted (bold, em-dash). Step headers bold. But dense monospace bullets, uniform styling, no color coding or spacing variations. Modifiers section and green availability dot are good anchors. |
| 7 | Cost Transparency | 4 | — | — | Costs present but buried as regular bullets: "Pay 3 ARVN Resources" at step 5/7 in Assault, step 6/8 in Patrol. No dedicated cost section, no visual prominence. "Gain 5 Aid" in Train is clear but unstyled. |
| 8 | Optional/Mandatory Distinction | 3 | — | — | One "(optional)" text marker in Train ("Choose: Pacify, Replace Cubes With Base (optional)"). No systematic optionality marking across tooltips. All steps look equally mandatory. No visual styling for optional items. |
| | **Average** | **3.0** | **—** | **—** | |

### Prioritized Recommendations

1. **[CRITICAL]** Humanize filter predicates — replace "Faction eq us and type in troops, police" with natural language like "Select US Troops or Police". This is the single largest readability barrier, affecting Language Naturalness (2) and Terminology Consistency (2) simultaneously. Root cause: `tooltip-template-realizer.ts` serializes filter AST nodes as-is.

2. **[CRITICAL]** Remove raw `$variable` references and arithmetic expressions — "$cube", "$troop", "$transferAmount", "$pacLevels", "1 * -4 or -3" are meaningless to players. Replace with resolved descriptions or suppress internal computation details. Root cause: `tooltip-template-realizer.ts` emits unresolved bindings.

3. **[CRITICAL]** Humanize kebab-case capability IDs — "Cap-assault-cobras-shaded-cost", "Cap-sweep-booby-traps-shaded-cost", "Sweep-loc-hop", "Place-from-available-or-map" should be converted to readable descriptions (e.g., "Cobras (unshaded): remove 1 extra piece"). Root cause: `tooltip-humanizer.ts` doesn't process these identifiers.

4. **[HIGH]** Diversify step headers — "Select spaces" repeated 6-7 times per tooltip is useless. Headers should describe the action's purpose (e.g., "Choose target provinces", "Select forces to move", "Pick assault targets"). Root cause: `tooltip-content-planner.ts` uses generic `SUB_STEP_HEADER_BY_KIND` mapping.

5. **[HIGH]** Normalize magic numbers — "99" and "1-99" meaning "unlimited" should display as "any number of" or omit the upper bound. "Select 0" should be suppressed or rewritten. "1-0" range is nonsensical. Root cause: `tooltip-content-planner.ts` passes raw bounds.

6. **[MEDIUM]** Add visual hierarchy — distinguish costs (colored/highlighted), conditions (indented/italicized), and choices (bracketed/styled) through CSS. Currently all text is uniform monospace.

7. **[MEDIUM]** Add progressive disclosure for long tooltips — Train's 2-screen scroll needs collapsible sub-procedures. Key info (synopsis + cost summary) should be visible without scrolling.

8. **[MEDIUM]** Improve cost transparency — add a dedicated "Cost" section or visually highlight cost lines rather than burying them as regular bullets.

9. **[LOW]** Systematic optional/mandatory distinction — extend the "(optional)" text marker that exists in Train to all tooltips, and add visual styling (dimmed, italicized, or marked with an icon).
