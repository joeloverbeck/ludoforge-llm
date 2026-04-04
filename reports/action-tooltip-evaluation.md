# Action Tooltip Readability Evaluation

Iterative evaluation of action tooltip readability in the runner app. Tooltips should read like a board game reference card — clear, structured, and free of technical artifacts.

## Screenshot Reference

- **Location**: `screenshots/action-tooltips/`
- **Current screenshots**: fitl-assault.png, fitl-patrol.png, fitl-sweep.png, fitl-train.png (plus numbered variants like fitl-train-2.png)
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
