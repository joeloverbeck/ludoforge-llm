# 188FITLFOUFAC-001: Agent-DSL cookbook — document planTemplates / postureEvaluators / relationships authoring

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — docs only
**Deps**: `archive/specs/188-fitl-four-faction-plan-migration-and-sequencing.md`

## Problem

`docs/agent-dsl-cookbook.md` documents `parameters`, `stateFeatures`, `candidateFeatures`, `candidateAggregates`, selectors, `strategyModules`, `considerations`, `tieBreakers`, and `strategicConditions`, but NOT the Spec 186/187 constructs `planTemplates`, `postureEvaluators`, or `relationships`. Spec 188 gives these constructs their first heavy production use (the four FITL faction personalities), so the cookbook should document how to author them. Without this, future agent-library authors must reverse-engineer the YAML shape from `92-agents.md` and the compiled schema.

## Assumption Reassessment (2026-05-21)

1. `docs/agent-dsl-cookbook.md` exists and currently lacks sections for `planTemplates`, `postureEvaluators`, and `relationships` (confirmed during Spec 188 reassessment).
2. The compiled types backing these constructs exist: `CompiledPlanTemplate`, `CompiledPostureEvaluator`, `CompiledPolicyRelationship` (`packages/engine/src/kernel/types-core.ts`); compiler lowering at `compile-agent-plan-templates.ts`, `compile-agent-posture-evaluators.ts`, `compile-agent-relationships.ts`.
3. The `outcomeGrantContinuation` opt-in is already documented in the cookbook (lines ~240-257) and is a *different* construct from `grantFlowContinuation` — do not conflate them while editing.

## Architecture Check

1. Documentation-only change; documents existing generic DSL constructs, introduces no engine behavior.
2. Preserves agnostic boundaries — the cookbook describes the generic authoring surface; faction-specific examples (if used) are illustrative, drawn from `data/games/fire-in-the-lake/`, and clearly marked as game data, not engine contract.
3. No backwards-compatibility concerns — purely additive doc sections.

## What to Change

### 1. Add a `planTemplates` authoring section

Document the plan-template shape: root action tag, optional special tag, timing, role steps (each step binds a role selector), `postureHook` reference, and `fallback`. Use the existing `arvn.trainGovern` template in `data/games/fire-in-the-lake/92-agents.md` (line ~276) as a worked example. Explain how doctrine carriers (strategy modules) *propose* templates.

### 2. Add a `postureEvaluators` authoring section

Document the `must` (demote/veto) and `prefer` (conditional weighted) clause structure, and how a `planTemplate.postureHook` references an evaluator by id. Note Foundation #20: unavailable preview refs in `prefer` terms must declare an explicit fallback.

### 3. Add a `relationships` authoring section

Document the relationship role kinds (`nominalAlly`, `rival`, etc.), seat binding (direct or via `standingRole`), `condition` (for the ally-as-rival flip), `priority`, and `gainValue`. Reference report §5 relationship model conceptually.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify)

## Out of Scope

- No changes to `92-agents.md` or any engine source.
- Do not document the four faction personalities themselves — that is the authoring work of tickets 003–010; this ticket documents the generic construct surface only.
- **Descope path**: this deliverable originated as a Spec 188 reassessment Addition. If during review the team decides the cookbook update is not worth the diff, close with `Declined — <rationale>` in Outcome. No downstream ticket depends on this one.

## Acceptance Criteria

### Tests That Must Pass

1. No automated test — documentation. Manual check: the three new sections exist and each carries a worked YAML example consistent with `92-agents.md` / the compiled schema.
2. Existing suite unaffected: `pnpm turbo test` (no test changes).

### Invariants

1. Cookbook examples must be valid against the current agent compiler schema (no stale field names).
2. No faction-specific behavior is presented as engine contract (Foundation #1).

## Test Plan

### New/Modified Tests

1. None — documentation-only ticket.

### Commands

1. Manual review of `docs/agent-dsl-cookbook.md` diff.
2. `pnpm turbo lint` (markdown/link hygiene if configured).

## Outcome

Completed: 2026-05-21

What changed:
- Added generic cookbook authoring sections for `planTemplates`, `postureEvaluators`, and `relationships` in `docs/agent-dsl-cookbook.md`.
- Used the existing `arvn.trainGovern` plan template as the worked plan-template example and kept the posture/relationship examples on current compiler field names.
- Documented Foundation #20 posture fallback discipline and clarified that `grantFlowContinuation` and `outcomeGrantContinuation` are distinct preview configuration surfaces, not substitutes for `fallback.contribution`.

Deviations from original plan:
- No code, schema, or `data/games/fire-in-the-lake/92-agents.md` edits were needed; the cookbook now documents the generic construct surface only.
- The acceptance section's `pnpm turbo test` existing-suite lane and the command section's `pnpm turbo lint` lane were both run.

Verification:
- Manual diff review of `docs/agent-dsl-cookbook.md`.
- `pnpm turbo lint` — passed, 2 tasks successful from cache.
- `pnpm run check:ticket-deps` — passed for 10 active tickets and 2472 archived tickets.
- `pnpm turbo test` — passed, 5 tasks successful, 2 cached, 5 total.
