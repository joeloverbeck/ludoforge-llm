---
name: action-tooltip-implement
description: Use when the latest action tooltip plan is ready and improvements need to be implemented. Reads reports/action-tooltip-plan.md and reports/action-tooltip-evaluation.md, then implements the planned changes across the engine tooltip pipeline and runner tooltip UI.
---

# Action Tooltip Readability Implementation

Improve action tooltip readability based on the latest plan's recommendations, implementing changes across both the engine tooltip pipeline and runner tooltip UI.

## Checklist

> **Plan mode note**: If plan mode is active when this skill is invoked, steps 1-4 serve as the exploration phase. During exploration, also identify the specific file paths from the plan's implementation steps and read them via Explore agents to front-load context. Write your execution plan to the plan file, exit plan mode, then continue with steps 5-12.

1. Read `reports/action-tooltip-evaluation.md` — focus on the latest EVALUATION #N for context on what needs improving.
2. Read `reports/action-tooltip-plan.md` — the implementation plan to execute. This is the primary guide for this session.
3. Read `docs/FOUNDATIONS.md` — verify alignment before writing any code. Pay special attention to:
   - **Foundation #1** (Engine Agnosticism): Engine fixes must be game-agnostic
   - **Foundation #3** (Visual Separation): Presentation styling in runner only
   - **Foundation #5** (One Rules Protocol): RuleCard changes affect all consumers
   - **Foundation #10** (Architectural Completeness): Complete solutions, not patches
   - **Foundation #14** (No Backwards Compat): No shims when changing interfaces
4. Collect the unique file paths (source files and test files) from all Implementation Steps in the plan. Read them in parallel (batch) to front-load context before starting edits.
5. Follow the plan's implementation steps **in order**, respecting noted dependencies. Pay attention to the **Layer** annotation on each step — engine steps must not introduce game-specific logic, runner steps must not modify engine code.
6. If a step is ambiguous or you discover the plan's assumptions about the code are wrong, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation) before proceeding — per Foundation #10.
7. **Cross-package interface changes**: If the plan modifies the `RuleCard`, `ContentStep`, or `ContentModifier` interfaces in the engine, verify all runner consumers are updated:
   - `ActionTooltip.tsx` — reads steps, modifiers
   - `ModifiersSection.tsx` — reads modifiers
   - `has-displayable-content.ts` — checks for content presence
   - Any other runner file that imports from `tooltip-rule-card.ts`
8. **Pre-flight test impact analysis**: For each changed function, interface, or constant:
   - Grep engine test files for the function/constant name
   - Grep runner test files for any imports from modified engine modules
   - Classify hits as golden assertions (must update) vs independent fixtures (leave alone)
   - For small changes (1-3 source files), the build-test-fix cycle may be faster than formal grep-based analysis. Use formal analysis when changes affect interfaces, constants shared across many tests, or when the plan notes HIGH test churn risk.
9. Update test assertions based on the impact analysis from Step 8.
10. Run verification:
    - `pnpm turbo typecheck` — must pass (both packages)
    - `pnpm -F @ludoforge/engine test` — must pass
    - `pnpm -F @ludoforge/runner test` — must pass
11. Visual verification: Run `pnpm -F @ludoforge/runner dev` and inspect action tooltips in the browser. Hover over each action button and verify:
    - Text reads more like natural language than technical output
    - Step headers are descriptive (not generic "Select spaces")
    - No raw `$variables`, kebab-case IDs, or filter predicates visible
    - Costs are clearly identifiable
    - Optional steps are distinguishable from mandatory ones
    - Long tooltips are manageable (collapsible or well-structured)
    Report any visual anomalies to the user before concluding.
12. Do NOT update either report file — that happens in the next evaluate invocation.

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

### Engine — Key Test Files

| File | What It Covers |
|------|---------------|
| `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` | Step grouping, header generation |
| `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` | Text generation per message kind |
| `packages/engine/test/unit/kernel/tooltip-humanizer.test.ts` | Identifier humanization |
| `packages/engine/test/unit/kernel/tooltip-modifier-humanizer.test.ts` | Modifier text generation |
| `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` | Value stringification |
| `packages/engine/test/unit/kernel/tooltip-binding-sanitizer.test.ts` | Binding sanitization |
| `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` | End-to-end tooltip pipeline |
| `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` | Cross-game tooltip properties |
| `packages/engine/test/unit/tooltip-humanization.test.ts` | Humanization integration |

### Runner — Tooltip UI

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/ui/ActionTooltip.tsx` | Tooltip rendering — steps, modifiers, availability, companion actions |
| `packages/runner/src/ui/ActionTooltip.module.css` | Tooltip visual styling — typography, spacing, hierarchy |
| `packages/runner/src/ui/useActionTooltip.ts` | Tooltip state management (hover, loading, dismissal) |
| `packages/runner/src/ui/ModifiersSection.tsx` | Modifier display |
| `packages/runner/src/ui/AvailabilitySection.tsx` | Availability status display |
| `packages/runner/src/ui/has-displayable-content.ts` | Content detection logic |
| `packages/runner/src/ui/tooltip-companion-actions.ts` | Companion action resolution |
| `packages/runner/src/ui/action-tooltip-source-key.ts` | Tooltip cache key generation |
| `packages/runner/src/ui/ActionToolbar.tsx` | Action button container (triggers tooltip) |

## Architecture Context

### Engine Tooltip Pipeline Flow

The engine transforms action definitions into human-readable tooltip data through a multi-stage pipeline:

```
Action AST → TooltipMessage[] (IR)
  → tooltip-normalizer.ts (normalize messages)
  → tooltip-normalizer-compound.ts (merge compound messages)
  → tooltip-suppression.ts (suppress redundant messages)
  → tooltip-content-planner.ts (group into ContentPlan: steps, synopsis, modifiers)
  → tooltip-template-realizer.ts (generate English text from plan)
  → RuleCard { synopsis, steps[], modifiers[] }
```

Key transform points:
- **Normalizer**: Deduplicates and orders messages. Compound normalizer merges related select+filter messages.
- **Content Planner**: Groups messages by pipeline stage (select, place, move, pay). Generates step headers from `SUB_STEP_HEADER_BY_KIND` lookup. Extracts synopsis from summary or first select message.
- **Template Realizer**: Has per-kind template functions (`realizeSelect()`, `realizePlace()`, `realizePay()`). Resolves labels via `tooltip-label-resolver.ts`. Shows option hints when options list is small.
- **Humanizer**: Converts camelCase identifiers to Title Case. Called throughout the pipeline.

### Runner Tooltip Rendering

```
bridge.describeAction(actionId) → AnnotatedActionDescription
  → hasDisplayableContent() check
  → ActionTooltip.tsx renders:
      synopsis (from ruleCard.synopsis)
      steps (ordered list from ruleCard.steps)
      modifiers (from ruleCard.modifiers via ModifiersSection)
      availability (from ruleState via AvailabilitySection)
      companion actions (if configured)
  → Floating UI positions tooltip
```

### RuleCard Interface

The `RuleCard` interface in `tooltip-rule-card.ts` is the contract between engine and runner:

```typescript
interface RuleCard {
  readonly synopsis: string;
  readonly steps: readonly ContentStep[];
  readonly modifiers: readonly ContentModifier[];
}

interface ContentStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly lines: readonly RealizedLine[];
  readonly subSteps?: readonly ContentStep[];
}
```

Changes to this interface affect both packages — the engine produces it, the runner consumes it.

## Common Pitfalls

### Engine-Side

- **Game-specific humanization**: Don't add FITL-specific string replacements in the humanizer. Use the `VerbalizationDef` and label resolver for game-specific terms — the humanizer must stay game-agnostic.
- **Filter predicate text**: Token filter stringification happens in `tooltip-value-stringifier.ts` (`stringifyTokenFilter()`), not in the realizer. The realizer consumes pre-stringified filter strings. Fix filter syntax at the source (stringifier), not via regex post-processing in the realizer.
- **Magic number normalization**: "99" and "999" are sentinel values for "unlimited". These are normalized in `realizeSelect()` in the realizer, where bounds formatting logic lives.
- **Step header diversity**: The `SUB_STEP_HEADER_BY_KIND` map in the content planner maps message kinds to headers. Multiple consecutive messages of the same kind produce identical headers. The fix should diversify headers based on context, not just kind.
- **Integration test fragility**: `tooltip-pipeline-integration.test.ts` and `tooltip-cross-game-properties.test.ts` test full pipeline output. Changes to humanization, headers, or text templates will break golden assertions in these tests. Update them to match the new output.
- **No-hardcoded-FITL audit**: The `no-hardcoded-fitl-audit.test.ts` test scans ALL engine source files (including comments) for FITL-specific strings like "ARVN", "NVA", "Saigon", etc. Even code comments must not contain game-specific identifiers. Use generic examples in comments.

### Runner-Side

- **CSS module scoping**: All tooltip styles are in `ActionTooltip.module.css`. New class names must be added to this module and imported in the component.
- **Floating UI positioning**: The tooltip uses `offset`, `flip`, and `shift` middleware. Changes to tooltip size (from collapsible sections or visual hierarchy) may affect positioning. Test at different viewport sizes.
- **Companion actions**: Some tooltips include related action descriptions via `tooltip-companion-actions.ts`. Presentation changes to step rendering affect companion action display too.
- **Performance**: Tooltips render on hover. Adding expensive computations (text processing, DOM manipulation) to the render path affects perceived hover latency.

### Cross-Package

- **TypeScript strict mode**: Both packages use strict TypeScript. Interface changes require all consumers to be updated — incomplete changes will fail typecheck.
- **exactOptionalPropertyTypes**: The project enables this. New optional fields need explicit `| undefined` in their type: `readonly optional?: boolean | undefined`.
- **Build order**: Engine must build before runner (Turborepo handles this). When testing manually, run `pnpm turbo build` if engine interface changes aren't picked up by the runner.

## Scope Constraints

- Engine changes must be **game-agnostic** — no FITL-specific logic (Foundation #1)
- Presentation styling changes in runner only (Foundation #3)
- No GameSpecDoc or visual-config.yaml changes for tooltip content
- Follow the plan's implementation steps — don't scope-creep beyond what was planned
- If you discover the plan is wrong or incomplete, apply the 1-3-1 rule rather than improvising
- Do NOT update report files — that happens in the next evaluate invocation
