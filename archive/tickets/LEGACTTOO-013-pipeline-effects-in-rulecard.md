# LEGACTTOO-013: Reflect Pipeline-Selected Effects in RuleCard Normalization

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — modify `condition-annotator.ts`
**Deps**: archive/tickets/LEGACTTOO-008-engine-integration-describe-action-rulecard-caching.md

## Problem

`buildRuleCard` in `condition-annotator.ts` normalizes only `[...action.cost, ...action.effects]` and ignores `actionPipelines`.

This is not just incomplete; it is semantically wrong for pipeline-backed actions. Runtime execution uses the selected pipeline profile's `costEffects` and `stages[*].effects` (not base `action.cost`/`action.effects`) whenever a pipeline profile is configured and matched. So current RuleCards can describe effects that will never execute.

## Assumption Reassessment (2026-03-07)

1. `ActionPipelineDef` has `costEffects: readonly EffectAST[]` and `stages: readonly ActionResolutionStageDef[]` where `stages` is validated as non-empty (`validate-gamedef-extensions.ts`).
2. Pipeline dispatch is runtime-selected via `resolveActionPipelineDispatch`; if pipelines exist but none match applicability, the action is `notApplicable` (`reason: pipelineNotApplicable`).
3. `executeMoveAction` executes `executionProfile.costSpend` and `executionProfile.resolutionStages` when a pipeline profile is selected, and executes base `action.cost`/`action.effects` only when no pipeline profile is selected.
4. `buildRuleCard` currently uses only base action effects (`const allEffects = [...action.cost, ...action.effects]`) and is cached by `action.id`.
5. RuleCard generation is static/cached; it cannot branch on live state at render-time.

## Architecture Check

1. For actions with configured pipelines, RuleCard content should be derived from pipeline profiles, not base action effects, to stay truthful to runtime behavior.
2. To preserve static caching, pipeline applicability must be represented declaratively in the RuleCard (conditional modifiers), not by runtime filtering.
3. A clean approach is to reuse existing `if`-effect normalization by wrapping each profile's effect bundle in a synthetic `if` when `applicability` exists.
4. Engine remains game-agnostic: this change operates only on generic `actionPipelines` semantics.
5. No backward-compatibility aliasing: if behavior changes for previously incorrect tooltips, tests should be updated to enforce the corrected semantics.

## What to Change

### 1. Correct RuleCard normalization input source

In `buildRuleCard`:
1. Gather pipelines for `action.id`.
2. If none exist, keep current normalization path (`action.cost + action.effects`).
3. If pipelines exist, normalize pipeline execution effects instead:
   - `pipeline.costEffects` + flattened `pipeline.stages[*].effects`
   - Wrap as `{ if: { when: pipeline.applicability, then: ... } }` when applicability is present.
4. Do not include base action effects in the pipeline-backed branch.

### 2. Strengthen unit tests for tooltip semantics

Add/modify tests to verify:
1. Pipeline-backed actions include pipeline effects in RuleCard.
2. Applicability becomes RuleCard modifiers when present.
3. Base action effects are not shown for pipeline-backed actions.
4. Non-pipeline actions are unchanged.

## Files to Touch

- `packages/engine/src/kernel/condition-annotator.ts` (modify — correct `buildRuleCard` source effects)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — add/strengthen tooltip pipeline tests)

## Out of Scope

- Runner UI rendering details for modifiers (LEGACTTOO-009)
- Changing DisplayNode pipeline section rendering
- Reworking runtime pipeline dispatch/selection order

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline-backed RuleCard includes pipeline cost/stage effects.
2. Pipeline applicability is represented as conditional modifiers in RuleCard.
3. Pipeline-backed RuleCard does not include base action effects (unless no pipelines are configured).
4. Non-pipeline actions remain unchanged.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. RuleCard remains static and cached by action id.
2. Tooltip semantics reflect runtime execution semantics for pipeline-backed actions.
3. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts`:
   - add test for pipeline effects in RuleCard
   - add test that pipeline applicability yields modifiers
   - add regression test ensuring base action effects are excluded when pipelines exist

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - Updated `buildRuleCard` in `packages/engine/src/kernel/condition-annotator.ts` to use pipeline-derived effects when pipelines are configured for an action.
  - Pipeline applicability is represented via conditional modifiers by wrapping pipeline effect bundles in synthetic `if` effects during normalization.
  - Base `action.cost`/`action.effects` are now excluded from RuleCard content for pipeline-backed actions.
  - Added two unit tests in `packages/engine/test/unit/kernel/condition-annotator.test.ts` to lock in replacement semantics and applicability modifier behavior.
- Deviations from original plan:
  - The original plan was additive (include pipeline effects in addition to base action effects). This was corrected to replacement semantics after validating runtime execution flow (`executionProfile.costSpend` + `resolutionStages` replace base action effects when pipelines are configured).
  - Integration test changes were not required; targeted unit coverage was expanded instead.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed (`421` tests, `0` failures).
  - `pnpm turbo lint` passed (`2/2` packages successful).
