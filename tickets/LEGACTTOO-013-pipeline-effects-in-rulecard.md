# LEGACTTOO-013: Include Pipeline Effects in RuleCard Normalization

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — modify `condition-annotator.ts`
**Deps**: archive/tickets/LEGACTTOO-008-engine-integration-describe-action-rulecard-caching.md

## Problem

`buildRuleCard` in `condition-annotator.ts` normalizes only `[...action.cost, ...action.effects]` but does not include effects from `actionPipelines` associated with the action. For pipeline-backed actions, the RuleCard synopsis and steps are incomplete — they show only the base action's effects, not the pipeline's cost effects or stage effects.

The DisplayNode path already handles pipelines separately via `buildAnnotatedPipelineSection`, but the tooltip normalization pipeline has no equivalent. This means for games using `actionPipelines`, the English tooltip will show a partial picture of what the action does.

## Assumption Reassessment (2026-03-07)

1. `ActionPipelineDef` has `costEffects: readonly EffectAST[]` and `stages: readonly { effects: readonly EffectAST[] }[]` — confirmed at `types-operations.ts`.
2. `buildRuleCard` at `condition-annotator.ts:296` only normalizes `action.cost` and `action.effects`.
3. Pipelines are filtered by `actionId` at line 405: `(context.def.actionPipelines ?? []).filter((p) => p.actionId === action.id)`.
4. Pipeline applicability is checked at runtime via `pipelineApplicabilityPasses` — some pipelines may be conditionally applicable. RuleCard is static (cached), so it cannot know which pipelines apply at runtime.

## Architecture Check

1. Since RuleCard is static and cached, pipeline effects that depend on runtime applicability cannot be included in the base RuleCard. Two approaches:
   - **Option A**: Include all pipeline effects as modifiers (with the applicability condition as the modifier condition). This preserves static caching.
   - **Option B**: Generate separate RuleCards per applicable pipeline combination. This increases cache complexity.
   - **Recommendation**: Option A — normalize pipeline effects as conditional modifier blocks within the RuleCard, matching how `normalizeIf` already works.
2. Game-agnostic: `actionPipelines` is a generic engine concept, not game-specific.
3. No backwards-compatibility concerns — RuleCard content is additive.

## What to Change

### 1. Extend `buildRuleCard` to include pipeline effects

After normalizing `action.cost` and `action.effects`, also normalize effects from each associated pipeline. Wrap each pipeline's effects as a modifier block with the pipeline's applicability condition (if present).

### 2. Add integration test

Verify that a pipeline-backed action produces a RuleCard with pipeline effects visible.

## Files to Touch

- `packages/engine/src/kernel/condition-annotator.ts` (modify — extend `buildRuleCard`)
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify — add pipeline effect test)

## Out of Scope

- Runner UI rendering of pipeline modifiers (LEGACTTOO-009)
- Pipeline applicability runtime evaluation (already handled by `buildRuleState` for base preconditions)
- Changing the DisplayNode pipeline section rendering

## Acceptance Criteria

### Tests That Must Pass

1. RuleCard for a pipeline-backed action includes pipeline cost/stage effects in steps or modifiers.
2. Pipeline applicability conditions appear as modifier conditions when present.
3. Non-pipeline actions are unaffected — no regression.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. RuleCard remains static and cached — no runtime-dependent content.
2. Pipeline effects do not duplicate base action effects.
3. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — add test compiling a game with actionPipelines, verify RuleCard includes pipeline effects.
2. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — add unit test with synthetic pipeline def, verify normalized output.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
