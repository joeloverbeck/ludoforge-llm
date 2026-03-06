# LEGACTTOO-006: Content Planner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module (`tooltip-content-planner.ts`)
**Deps**: LEGACTTOO-001, LEGACTTOO-004

## Problem

The normalizer produces a flat array of `TooltipMessage[]` per action. The content planner must group these by pipeline stage, generate a synopsis, extract modifiers, enforce a rhetorical budget (5-15 lines simple, 20-30 complex), and filter suppressed messages. Without this, there's no structured input for the template realizer.

## Assumption Reassessment (2026-03-06)

1. `TooltipMessage` types from LEGACTTOO-001 include a `stage?: string` field for pipeline stage tagging.
2. `ModifierMessage` has `condition` and `description` fields that need extraction into a separate section.
3. `SuppressedMessage` must be filtered out entirely.
4. `ContentPlan`, `ContentStep`, `ContentModifier` types are defined in LEGACTTOO-001's `tooltip-rule-card.ts`.

## Architecture Check

1. The planner is a pure function: `planContent(messages: TooltipMessage[], actionLabel: string) → ContentPlan`. No side effects.
2. Engine-agnostic: grouping is by `stage` field (set by normalizer), not by game-specific stage names.
3. The rhetorical budget is a soft constraint — the planner collapses sub-steps beyond 3 but does not truncate content.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-content-planner.ts` (~250 lines)

Export `planContent(messages: readonly TooltipMessage[], actionLabel: string): ContentPlan`:

**Step 1: Filter**
- Remove all `SuppressedMessage` entries.

**Step 2: Extract modifiers**
- Pull all `ModifierMessage` entries into a separate `ContentModifier[]` array.
- Remaining messages are step content.

**Step 3: Group by stage**
- If messages have `stage` fields, group by stage name (preserving order of first occurrence).
- If no messages have stages, treat all as a single group.
- Each group becomes a `ContentStep` with `stepNumber` and `header` (from stage name or auto-generated).

**Step 4: Build sub-steps**
- Within each group, forEach-container children become sub-steps under their parent step.
- If a step has >3 sub-steps, collapse extras into "and N more..." summary line.

**Step 5: Generate synopsis**
- Format: `"{actionLabel} -- {firstSelectOrChooseMessage}"`.
- If no select/choose message exists, use just the action label.

**Step 6: Enforce rhetorical budget**
- Count total lines (steps + sub-steps). If over budget (30 for complex), collapse deepest sub-steps first.

### 2. Export from `packages/engine/src/kernel/index.ts`

Add barrel export for `tooltip-content-planner.js`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-content-planner.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` (new)

## Out of Scope

- Template realization (converting ContentPlan to English strings) — LEGACTTOO-007
- Blocker extraction — LEGACTTOO-007
- Normalizer logic — LEGACTTOO-004, LEGACTTOO-005
- Runner UI rendering of the plan — LEGACTTOO-009

## Acceptance Criteria

### Tests That Must Pass

1. Suppressed messages are filtered: input with 3 messages (1 suppressed) → plan has 2 content messages.
2. Modifier extraction: input with 2 modifiers + 3 effects → `plan.modifiers.length === 2`, steps contain only effects.
3. Stage grouping: messages tagged with stages `selectSpaces`, `placeForces` → 2 steps with correct headers.
4. No-stage grouping: messages without stage → single step group.
5. Synopsis generation: action label "Train" + first SelectMessage → `"Train -- Select 1-6 target spaces"`.
6. Synopsis fallback: action label "Pass" + no select/choose → `"Pass"`.
7. Sub-step collapse: step with 5 sub-steps → first 3 shown + "and 2 more..." line.
8. Rhetorical budget: complex action with 35 raw lines → collapsed to <=30.
9. Empty input: `[]` → plan with empty steps, empty modifiers, synopsis = action label only.
10. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `planContent` is pure — no side effects, no mutation of input array.
2. Step numbering is sequential starting at 1.
3. No `SuppressedMessage` ever appears in output steps or modifiers.
4. Synopsis is never empty — at minimum it contains the action label.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — tests for filtering, modifier extraction, stage grouping, synopsis generation, sub-step collapse, rhetorical budget, edge cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
