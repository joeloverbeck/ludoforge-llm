# LEGACTTOO-006: Content Planner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module (`tooltip-content-planner.ts`)
**Deps**: LEGACTTOO-001, LEGACTTOO-004

## Problem

The normalizer produces a flat array of `TooltipMessage[]` per action. The content planner must group these by pipeline stage, identify the synopsis source message, extract modifiers, enforce a rhetorical budget (5-15 messages simple, 20-30 complex), and filter suppressed messages. Without this, there's no structured input for the template realizer (LEGACTTOO-007).

## Assumption Reassessment (2026-03-07)

1. `TooltipMessage` types from LEGACTTOO-001 include a `stage?: string` field for pipeline stage tagging. **Verified**: `MessageBase.stage` exists in `tooltip-ir.ts:13`.
2. `ModifierMessage` has `condition` and `description` fields. **Verified**: `tooltip-ir.ts:149-153`.
3. `SuppressedMessage` must be filtered out entirely. **Verified**: `tooltip-ir.ts:177-180`.
4. ~~`ContentPlan` is defined in `tooltip-rule-card.ts`.~~ **Corrected**: `ContentPlan` does NOT exist yet. `ContentStep` and `ContentModifier` are in `tooltip-rule-card.ts`, but `ContentPlan` must be newly defined in this ticket. See Architecture Check below for why it differs from `RuleCard`.

## Architecture Check

1. The planner is a pure function: `planContent(messages: readonly TooltipMessage[], actionLabel: string): ContentPlan`. No side effects.
2. Engine-agnostic: grouping is by `stage` field (set by normalizer), not by game-specific stage names.
3. The rhetorical budget is a soft constraint — the planner records `collapsedCount` for steps exceeding 3 sub-steps but does not discard messages entirely.
4. **ContentPlan holds message references, not strings.** LEGACTTOO-007 (template realizer) states: "The content planner produces a ContentPlan with structured messages, but those messages still contain programmatic identifiers." The realizer needs `TooltipMessage` objects with their `kind` field to dispatch per-kind template functions. Therefore `ContentPlan` stores `TooltipMessage[]` per step, and the realizer converts those to English `string[]` lines in `RuleCard`.
5. **ContentPlan vs RuleCard**: `ContentPlan` is the intermediate representation between normalizer and realizer. `RuleCard` (already defined in `tooltip-rule-card.ts`) is the final English output. They are structurally different: `ContentPlan` holds message references + `collapsedCount`; `RuleCard` holds string lines.

## What to Change

### 1. Define `ContentPlan` types in `packages/engine/src/kernel/tooltip-content-planner.ts`

```typescript
interface ContentPlanStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly messages: readonly TooltipMessage[];
  readonly collapsedCount: number;
  readonly subSteps?: readonly ContentPlanStep[];
}

interface ContentPlan {
  readonly actionLabel: string;
  readonly synopsisSource?: TooltipMessage;
  readonly steps: readonly ContentPlanStep[];
  readonly modifiers: readonly ModifierMessage[];
}
```

### 2. Implement `planContent` in the same file (~200 lines)

Export `planContent(messages: readonly TooltipMessage[], actionLabel: string): ContentPlan`:

**Step 1: Filter** — Remove all `SuppressedMessage` entries.

**Step 2: Extract modifiers** — Pull all `ModifierMessage` entries into a separate `ModifierMessage[]` array. Remaining messages are step content.

**Step 3: Identify synopsis source** — Find the first `SelectMessage` or `ChooseMessage`. Store as `synopsisSource` (the realizer will verbalize it).

**Step 4: Group by stage** — If messages have `stage` fields, group by stage name (preserving order of first occurrence). If no messages have stages, treat all as a single group. Each group becomes a `ContentPlanStep` with `stepNumber` and `header` (from stage name or auto-generated "Step N").

**Step 5: Build sub-steps** — Within each group, if messages share a common container context, nest them as sub-steps. If a step has >3 sub-steps, keep only the first 3 and set `collapsedCount` to the remainder.

**Step 6: Enforce rhetorical budget** — Count total messages across all steps + sub-steps. If over budget (30 for complex actions with 3+ stages), collapse deepest sub-steps first by increasing their parent's `collapsedCount`.

### 3. Export from `packages/engine/src/kernel/index.ts`

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

1. Suppressed messages are filtered: input with 3 messages (1 suppressed) → plan steps contain only 2 messages total.
2. Modifier extraction: input with 2 modifiers + 3 effects → `plan.modifiers.length === 2`, step messages contain only effect messages.
3. Stage grouping: messages tagged with stages `selectSpaces`, `placeForces` → 2 steps with correct headers.
4. No-stage grouping: messages without stage → single step group.
5. Synopsis source identification: input with a SelectMessage → `plan.synopsisSource?.kind === 'select'`.
6. Synopsis fallback: no select/choose messages → `plan.synopsisSource === undefined`.
7. Sub-step collapse: step with 5 sub-steps → first 3 sub-steps kept + `collapsedCount === 2`.
8. Rhetorical budget: complex action with 35 messages → total messages across steps <= 30, collapsedCount values reflect trimmed messages.
9. Empty input: `[]` → plan with empty steps, empty modifiers, synopsisSource undefined.
10. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `planContent` is pure — no side effects, no mutation of input array.
2. Step numbering is sequential starting at 1.
3. No `SuppressedMessage` ever appears in output steps or modifiers.
4. `plan.actionLabel` is never empty — always equals the input action label.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — tests for filtering, modifier extraction, stage grouping, synopsis source identification, sub-step collapse, rhetorical budget, edge cases, purity.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`

## Outcome

### Changed vs Originally Planned

**Architecture change**: The ticket originally assumed `ContentPlan` would mirror `RuleCard` with string-based `synopsis` and `lines`. After reassessment against LEGACTTOO-007 (template realizer), `ContentPlan` was redesigned to hold `TooltipMessage` references instead of pre-verbalized strings. This cleanly separates structural planning from verbalization — the content planner groups messages, the template realizer converts them to English.

**Key type changes**:
- `ContentPlan.synopsisSource?: TooltipMessage` instead of `synopsis: string`
- `ContentPlanStep.messages: readonly TooltipMessage[]` instead of `lines: readonly string[]`
- `ContentPlanStep.collapsedCount: number` tracks budget-collapsed sub-steps

**Files created**:
- `packages/engine/src/kernel/tooltip-content-planner.ts` (~210 lines) — types + `planContent` function
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — 17 tests covering all acceptance criteria

**Files modified**:
- `packages/engine/src/kernel/index.ts` — barrel export added

**Verification**: 3083 unit tests pass, typecheck clean.
