# Action Tooltip Readability Pipeline — Design

**Date**: 2026-04-04

## Problem

The runner's action tooltips display near-raw engine output. Filter predicates appear as text ("Faction eq us and type in troops, police"), internal identifiers leak through ("Cap-sweep-cobras-unshaded-removal", "$cube", "m48patrol"), magic numbers show ("Select up to 99"), step headers repeat generically ("Select spaces" x7), and there is no visual hierarchy distinguishing costs, conditions, or optional steps. The result is tooltips that read like database queries rather than board game manual entries.

## Goal

Create an iterative improvement pipeline (evaluate → plan → implement) — mirroring the existing map-representation and train-operation-ui pipelines — that systematically improves action tooltip readability until they read like professionally written game reference cards. The pipeline must be game-agnostic per Foundation #1.

## Architecture Decision: Two-Layer Fix

Fixes span both packages collaboratively:

- **Engine** (`packages/engine/src/kernel/tooltip-*.ts`): Fix data quality — sanitize raw identifiers, humanize filter predicates, normalize magic numbers, improve step grouping and headers. The engine produces clean structured `RuleCard` data.
- **Runner** (`packages/runner/src/ui/ActionTooltip.*`): Fix presentation — typography, spacing, visual hierarchy, progressive disclosure, cost prominence, optional/mandatory styling. The runner formats clean data into polished tooltips.

This aligns with Foundations #1 (engine stays game-agnostic), #3 (presentation in runner), and #5 (RuleCard is the shared protocol).

## Pipeline Structure

Three skills in `.claude/skills/`:

| Skill | Input | Output |
|-------|-------|--------|
| `action-tooltip-evaluate` | `screenshots/action-tooltips/*.png` | Appends to `reports/action-tooltip-evaluation.md` |
| `action-tooltip-plan` | Latest evaluation | Overwrites `reports/action-tooltip-plan.md` |
| `action-tooltip-implement` | Plan + evaluation | Code changes in engine + runner |

**Workflow**: User captures screenshots → invoke evaluate → invoke plan → invoke implement → user captures new screenshots → repeat.

## 8 Evaluation Metrics (1-10 scale)

| # | Metric | What It Measures |
|---|--------|-----------------|
| 1 | Language Naturalness | Does text read like a game manual, not a database query? |
| 2 | Step Semantic Clarity | Do step headers describe actions, not repeat generic labels? |
| 3 | Information Hierarchy | Are costs, conditions, choices visually distinct from actions? |
| 4 | Terminology Consistency | Game terms used correctly, no internal jargon leaking? |
| 5 | Progressive Disclosure | Key info first, long tooltips use collapsible sections? |
| 6 | Visual Scannability | Can you understand the action in 5 seconds of scanning? |
| 7 | Cost Transparency | Resource costs, limits, prerequisites clearly called out? |
| 8 | Optional/Mandatory Distinction | Required vs "if desired" steps clearly differentiated? |

**Scoring guide**:
- 1-3: Unusable — raw engine output, filter predicates, internal IDs
- 4-5: Poor — some humanization but still reads like technical output
- 6-7: Adequate — mostly readable, occasional jargon, structure could improve
- 8-9: Good — reads like a board game reference card
- 10: Excellent — indistinguishable from a professional game manual tooltip

**Graduation**: Average 8.0+ with no CRITICAL/HIGH recommendations.

## Layer Decision Framework

The plan skill uses this to assign each fix to the correct layer:

| Problem Type | Fix Layer | Rationale |
|-------------|-----------|-----------|
| Raw `$variable` names | Engine (realizer) | Should never emit unresolved bindings |
| `99` = "unlimited" | Engine (planner) | Semantic data, not magic numbers |
| Kebab-case capability IDs | Engine (humanizer) | Humanize before leaving engine |
| Filter predicates as text | Engine (realizer) | Produce natural language |
| Repetitive generic headers | Engine (planner) | Step grouping is planner's job |
| Visual hierarchy / typography | Runner (CSS) | Foundation #3 |
| Progressive disclosure | Runner (component) | UI behavior |
| Cost prominence | Runner (CSS + component) | Presentation styling |
| Optional/mandatory styling | Both | Engine marks optionality, runner styles it |

## Key Files

### Engine (tooltip pipeline)

| File | Role |
|------|------|
| `packages/engine/src/kernel/tooltip-content-planner.ts` | Step grouping, headers, synopsis |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Text generation per message kind |
| `packages/engine/src/kernel/tooltip-humanizer.ts` | Identifier humanization |
| `packages/engine/src/kernel/tooltip-label-resolver.ts` | Game-specific labels from VerbalizationDef |
| `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` | Capability conditions → text |
| `packages/engine/src/kernel/tooltip-rule-card.ts` | RuleCard interfaces |

### Runner (tooltip rendering)

| File | Role |
|------|------|
| `packages/runner/src/ui/ActionTooltip.tsx` | Tooltip component |
| `packages/runner/src/ui/ActionTooltip.module.css` | Tooltip styles |
| `packages/runner/src/ui/ModifiersSection.tsx` | Modifier display |
| `packages/runner/src/ui/AvailabilitySection.tsx` | Availability status |

## Screenshot Conventions

- Location: `screenshots/action-tooltips/`
- Naming: `fitl-assault.png`, `fitl-patrol.png`, `fitl-sweep.png`, `fitl-train.png` (plus numbered variants)
- User places screenshots manually after each implementation cycle
- Evaluate skill reads whatever is in the directory

## Report Lifecycle

- Evaluations appended chronologically to `reports/action-tooltip-evaluation.md`
- Plans overwritten per iteration in `reports/action-tooltip-plan.md`
- Archival at ~500 lines / ~10 evaluations
- Stagnation detection: same top recommendation for 3+ evaluations without 0.5+ improvement
- Graduation: average 8.0+ with no CRITICAL/HIGH remaining

## Foundations Alignment

| Foundation | Relevance |
|-----------|-----------|
| #1 Engine Agnosticism | Engine tooltip fixes must be game-agnostic |
| #3 Visual Separation | Presentation styling in runner only |
| #5 One Rules Protocol | RuleCard is the shared tooltip protocol |
| #10 Architectural Completeness | Fix root causes, not symptoms |
| #14 No Backwards Compat | No shims when changing RuleCard interface |

## Verification

1. `pnpm turbo typecheck` — both packages
2. `pnpm turbo test` — both packages
3. Visual check: `pnpm -F @ludoforge/runner dev`, hover over each action, verify tooltip readability
