---
name: action-tooltip-plan
description: Use when the latest action tooltip evaluation is ready and a plan for improvements is needed. Reads the most recent EVALUATION from reports/action-tooltip-evaluation.md, analyzes root causes across engine and runner layers, brainstorms solutions, and produces a concrete implementation plan in reports/action-tooltip-plan.md.
---

# Action Tooltip Readability Planning

Read the latest evaluation, analyze root causes across the engine tooltip pipeline and runner presentation layer, and produce a concrete implementation plan for the next improvement iteration.

**This skill produces `reports/action-tooltip-plan.md` as its sole artifact.** If invoked within plan mode, the plan mode file is a working scratchpad — the report file is the deliverable. Do not proceed to implementation after writing the report — the `action-tooltip-implement` skill consumes this plan in a separate invocation.

## Checklist

1. Read `reports/action-tooltip-evaluation.md` — focus on the latest EVALUATION #N. Note the scores, CRITICAL/HIGH recommendations, and any recurring or stagnating issues. Determine the iteration number: `max(latest_evaluation_number, latest_plan_iteration_number) + 1`. **Large file handling**: If the file exceeds read limits, use `offset` to read from the end — evaluations are appended chronologically.
2. Read `docs/FOUNDATIONS.md` — **all proposals must align** with these principles. Pay special attention to:
   - **Foundation #1** (Engine Agnosticism): Engine tooltip fixes must be game-agnostic
   - **Foundation #3** (Visual Separation): Presentation styling in runner only
   - **Foundation #5** (One Rules Protocol): RuleCard is the shared tooltip protocol
   - **Foundation #10** (Architectural Completeness): Solutions address root causes
   - **Foundation #14** (No Backwards Compatibility): No shims when changing RuleCard interface
3. Identify the CRITICAL and HIGH recommendations from the evaluation. If none exist, target the top 2-3 MEDIUM recommendations.
4. **Stalled iteration check**: If the previous evaluation shows no progress since the evaluation before it, check whether the previous plan was implemented. If not, decide whether to carry forward, supersede, or incorporate its recommendations. Note the decision in the Context section. Also review the previous plan's Deferred Items section (if present) and carry forward any items that are still relevant.
5. **Layer triage**: For each identified problem, determine which layer owns the fix using the Layer Decision Framework below. This is the critical planning step — misattributing a problem to the wrong layer wastes an iteration.
6. Read the relevant source files for the identified problems (see Key Files). Extract: key type definitions with line numbers, function signatures that will be modified, data flow through the tooltip pipeline. Scope exploration to the specific problems identified in step 3.
7. For the top 1-3 problems, brainstorm **2-3 solution approaches** each, with trade-offs:
   - Feasibility (how much code change, how many files, cross-package impact)
   - Readability impact (how much does it improve the metric)
   - Risk (what could break, what regressions are possible)
   - Foundation alignment (does it respect all relevant principles)
8. Select the recommended approach for each problem, applying the **1-3-1 rule**: 1 clearly defined problem, 3 potential options, 1 recommendation.
9. Write the new plan to `reports/action-tooltip-plan.md` (overwrites any existing file).
10. **Stop.** This skill's sole output is `reports/action-tooltip-plan.md`. Do not proceed to implementation.

## Layer Decision Framework

Each tooltip readability problem has a root cause in either the engine, the runner, or both. Use this framework to assign fixes correctly:

### Engine Layer (packages/engine/src/kernel/tooltip-*.ts)

Fix in the engine when the **data itself is wrong or unintelligible**:

| Problem | Root Cause | Fix Location |
|---------|-----------|--------------|
| Raw `$variable` names in output | Realizer emits unresolved bindings | `tooltip-template-realizer.ts` |
| `99` meaning "unlimited" | Planner passes raw max values | `tooltip-content-planner.ts` |
| Kebab-case capability IDs | Humanizer doesn't process capability references | `tooltip-humanizer.ts` or `tooltip-modifier-humanizer.ts` |
| Filter predicates as text | Realizer serializes filter AST instead of producing natural language | `tooltip-template-realizer.ts` |
| Repetitive "Select spaces" headers | Planner uses generic kind-based headers | `tooltip-content-planner.ts` |
| Raw property access expressions | Value stringifier doesn't humanize property chains | `tooltip-value-stringifier.ts` |
| Missing optionality markers | Planner doesn't propagate optional flags | `tooltip-content-planner.ts`, `tooltip-rule-card.ts` |

### Runner Layer (packages/runner/src/ui/)

Fix in the runner when the **data is correct but poorly presented**:

| Problem | Root Cause | Fix Location |
|---------|-----------|--------------|
| No visual hierarchy | All text rendered same style | `ActionTooltip.module.css` |
| Costs not prominent | Cost lines not visually distinguished | `ActionTooltip.tsx`, CSS |
| No progressive disclosure | Long tooltips not collapsible | `ActionTooltip.tsx` |
| Optional steps not distinguished | No visual marker for optional | `ActionTooltip.tsx`, CSS |
| Poor scannability | Dense text, no visual anchors | `ActionTooltip.module.css` |

### Both Layers

Fix in both when the **engine needs to provide better data AND the runner needs to present it differently**:

| Problem | Engine Fix | Runner Fix |
|---------|-----------|------------|
| Optional/mandatory distinction | Add `optional` flag to `ContentStep` | Style optional steps differently |
| Cost transparency | Group cost steps separately in RuleCard | Render cost section with distinct styling |

## Plan Output Format

Write `reports/action-tooltip-plan.md` with this structure:

```markdown
# Action Tooltip Plan — Iteration N

**Date**: YYYY-MM-DD
**Based on**: EVALUATION #N (average score: X.X)
**Problems targeted**: [list of CRITICAL/HIGH/MEDIUM items addressed]

## Context

[1-3 sentences: why this change is needed, what prompted it, and the intended outcome]

## Deferred Items

Track items explicitly deferred from previous iterations to prevent silent drops.

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| [description] | Eval #N | Iteration M | [N+1 or "no target yet"] |

If no items are deferred, write: "No deferred items."

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Always relevant | [engine fixes are game-agnostic] |
| #3 Visual Separation | Always relevant | [presentation changes in runner only] |
| #5 One Rules Protocol | Relevant if RuleCard changes | [how RuleCard interface changes affect consumers] |
| #10 Architectural Completeness | Always relevant | [root cause vs symptom] |
| #14 No Backwards Compat | Relevant if interfaces change | [migration approach] |

## Layer Triage

For each problem, document the layer assignment decision:

| Problem | Layer | Reasoning |
|---------|-------|-----------|
| [problem description] | Engine / Runner / Both | [why this layer owns the fix] |

## Current Code Architecture (reference for implementer)

Document the exact interfaces, function signatures, and data flow relevant to the
problems targeted. Include:
- Key type/interface definitions with file paths and line numbers
- Function signatures that will be modified
- Data flow through the tooltip pipeline: message IR → planner → realizer → RuleCard → renderer
- Current code snippets showing what will change (before state)

## Problem 1: [Problem title from evaluation]

**Evaluation score**: Metric X = Y/10
**Root cause**: [Why this problem exists]
**Layer**: Engine / Runner / Both

### Approaches Considered

1. **[Approach A]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Readability impact: [LOW/MEDIUM/HIGH]
   - Risk: [description of what could break]
   - Foundation alignment: [any concerns]

2. **[Approach B]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Readability impact: [LOW/MEDIUM/HIGH]
   - Risk: [description]

3. **[Approach C]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Readability impact: [LOW/MEDIUM/HIGH]
   - Risk: [description]

### Recommendation: [Approach X]

**Why**: [reasoning]

[Repeat for Problem 2, 3...]

## Implementation Steps

Ordered steps with dependencies and layer noted.

1. [Step description] — **Layer**: Engine — **File**: `path/to/file.ts` — **Depends on**: none
2. [Step description] — **Layer**: Runner — **File**: `path/to/file.ts` — **Depends on**: Step 1

## Verification

1. `pnpm turbo typecheck` — must pass (both packages)
2. `pnpm -F @ludoforge/engine test` — must pass
3. `pnpm -F @ludoforge/runner test` — must pass
4. Visual check: run `pnpm -F @ludoforge/runner dev`, hover over each action button, verify tooltip readability improvements

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [risk description] | LOW/MEDIUM/HIGH | [what breaks] | [how to prevent or recover] |

## Implementation Verification Checklist

Machine-readable list of specific changes for the evaluator to cross-reference.

- [ ] `<file>`: <what changed>
- [ ] `<file>`: <what changed>

## Test Impact

Note which test files are affected by the planned changes:
- Engine tooltip tests in `packages/engine/test/unit/kernel/tooltip-*.test.ts`
- Integration tests in `packages/engine/test/integration/tooltip-*.test.ts`
- Runner tooltip tests (if any exist)

## Research Sources

- [URL or description of research that informed the plan]
```

## Key Files

### Engine — Tooltip Pipeline

| File | What It Controls |
|------|-----------------|
| `packages/engine/src/kernel/tooltip-content-planner.ts` | Step grouping, header generation, synopsis extraction, sub-step detection |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Text generation per message kind (select, place, pay, move, etc.) |
| `packages/engine/src/kernel/tooltip-humanizer.ts` | camelCase→Title Case, identifier humanization |
| `packages/engine/src/kernel/tooltip-label-resolver.ts` | Game-specific label resolution from VerbalizationDef |
| `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` | Capability modifier conditions → readable text |
| `packages/engine/src/kernel/tooltip-rule-card.ts` | RuleCard/ContentStep/ContentModifier interfaces |
| `packages/engine/src/kernel/tooltip-value-stringifier.ts` | Value expression → string conversion |
| `packages/engine/src/kernel/tooltip-ir.ts` | Tooltip intermediate representation (message types) |
| `packages/engine/src/kernel/tooltip-normalizer.ts` | Message normalization before planning |
| `packages/engine/src/kernel/tooltip-normalizer-compound.ts` | Compound message normalization |
| `packages/engine/src/kernel/tooltip-suppression.ts` | Message suppression rules |
| `packages/engine/src/kernel/tooltip-blocker-extractor.ts` | Blocker/prerequisite extraction |

### Engine — Tests

| File | What It Covers |
|------|---------------|
| `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` | Step grouping, header generation |
| `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` | Text generation per message kind |
| `packages/engine/test/unit/kernel/tooltip-humanizer.test.ts` | Identifier humanization |
| `packages/engine/test/unit/kernel/tooltip-modifier-humanizer.test.ts` | Modifier text generation |
| `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` | Value stringification |
| `packages/engine/test/unit/kernel/tooltip-ir.test.ts` | IR construction |
| `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` | Normalization |
| `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` | Compound normalization |
| `packages/engine/test/unit/kernel/tooltip-suppression.test.ts` | Suppression rules |
| `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` | Blocker extraction |
| `packages/engine/test/unit/kernel/tooltip-binding-sanitizer.test.ts` | Binding sanitization |
| `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` | End-to-end tooltip pipeline |
| `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` | Cross-game tooltip properties |
| `packages/engine/test/unit/tooltip-humanization.test.ts` | Humanization integration |

### Runner — Tooltip UI

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/ui/ActionTooltip.tsx` | Tooltip rendering — steps, modifiers, availability, companion actions |
| `packages/runner/src/ui/ActionTooltip.module.css` | Tooltip visual styling |
| `packages/runner/src/ui/useActionTooltip.ts` | Tooltip state management (hover, loading, dismissal) |
| `packages/runner/src/ui/ModifiersSection.tsx` | Modifier display |
| `packages/runner/src/ui/AvailabilitySection.tsx` | Availability status display |
| `packages/runner/src/ui/has-displayable-content.ts` | Content detection logic |
| `packages/runner/src/ui/tooltip-companion-actions.ts` | Companion action resolution |
| `packages/runner/src/ui/action-tooltip-source-key.ts` | Tooltip cache key generation |

## Scope Constraints

- Engine changes must be **game-agnostic** — no FITL-specific logic (Foundation #1)
- Presentation styling in runner only (Foundation #3)
- If changing the RuleCard interface, all consumers must be updated in the same change (Foundation #14)
- Focus on the evaluation's top 2-3 recommendations — don't scope-creep
- If a proposed change is too large for one iteration, split it and note what's deferred
- The plan skill produces a report file only — it does NOT implement changes
