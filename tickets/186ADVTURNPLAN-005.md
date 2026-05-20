# 186ADVTURNPLAN-005: Bounded plan proposer/evaluator + plan trace contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents` runtime (new `plan-proposal.ts`, new `plan-trace.ts`, `policy-eval.ts`/`policy-evaluation-core.ts`)
**Deps**: `tickets/186ADVTURNPLAN-001.md`, `tickets/186ADVTURNPLAN-004.md`

## Problem

Spec 186 §4.4 / §4.8: at a player's `actionSelection` frame the agent must enumerate candidate plans from active doctrine carriers, bind role selectors with bounded top-K expansion, score each plan via leaf scorers (selector quality, demoted considerations) plus the posture hook, select by priority tier / guardrails / posture / stable key, and record the choice in `PlanExecutionState` — all under named cap classes. The deterministic plan trace (§4.8) records the proposal-side decision (doctrines selected/active/rejected, template, bindings, alternatives, posture status).

## Assumption Reassessment (2026-05-20)

1. Spec 164's `CAP_CLASS_BUDGETS` named-registry pattern (`archive/specs/164-...`) is the model for the plan cap classes (`maxActiveDoctrines`, `maxTemplatesPerDoctrine`, `maxRootCandidates`, `maxBindingsPerRole`, `maxPlanInstances`, `maxPlanSteps`).
2. Leaf scorers reuse existing machinery: selector quality (`policy-selector-eval.ts`) and the consideration-evaluation primitives (`policy-eval.ts` / `policy-evaluation-core.ts`) — re-homed, not rewritten.
3. `PlanExecutionState` (`186ADVTURNPLAN-004`) is the sink for the selected plan.
4. The posture hook in this ticket consumes only current-state and `ready`/non-`ready` preview status; deep posture-over-preview is Spec 187 (verified Non-Goal).

## Architecture Check

1. Enumeration is finite and statically capped by named cap classes recorded in reproducibility metadata (Foundation #10) — no MCTS/HTN search (§Non-Goals).
2. Proposal order, selector rankings, and role bindings are sorted/stable → byte-identical plan trace on replay (Foundations #8, #16).
3. Leaf scorers are reused as a subordinate layer; the proposer is generic over compiled plan IR (Foundation #1).

## What to Change

### 1. `plan-proposal.ts` (new)

Implement the §4.4 pipeline: evaluate active doctrine carriers (re-homed Spec 182 modules) → match each template `root` against published legal root actions → bind role selectors with bounded top-K → score plans via leaf scorers + posture hook → select by priority tier / guardrail / posture / stable tie-break → write `PlanExecutionState`. Enforce the named cap classes.

### 2. Named cap-class registry

Add the plan cap classes following the Spec 164 `CAP_CLASS_BUDGETS` pattern; statically named, validated (by `186ADVTURNPLAN-002`), recorded in reproducibility metadata.

### 3. `plan-trace.ts` (new)

Define the §4.8 trace contract and record the proposal-side section: selected/active/rejected doctrines (with reasons), selected template + intent, role bindings, alternatives, posture status. (Per-microturn execution entries are added in `186ADVTURNPLAN-006`.)

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (new)
- `packages/engine/src/agents/plan-trace.ts` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify — expose consideration/selector primitives as leaf scorers)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — reuse scoring core)

## Out of Scope

- Wiring the proposer into the per-microturn entry + retiring the v2 primary path (`186ADVTURNPLAN-006`).
- Deep posture-over-preview and ally-rival metadata (Spec 187).

## Acceptance Criteria

### Tests That Must Pass

1. Given a compiled profile with one doctrine carrier and one plan template, the proposer enumerates candidate plans, binds roles, and writes a selected plan to `PlanExecutionState`.
2. Enumeration respects each named cap class (e.g. `maxPlanInstances` truncates deterministically).
3. The proposal-side plan trace is deterministic and replay-identical across two runs with the same GameDef + state + seed + policy fingerprint.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Plan enumeration is bounded by named, statically-declared cap classes (Foundation #10).
2. Proposal order, selector rankings, and role bindings are deterministic (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-proposal.test.ts` (new) — `architectural-invariant`: bounded enumeration + cap-class truncation + selection ordering.
2. `packages/engine/test/determinism/plan-trace-replay.test.ts` (new) — `architectural-invariant`: proposal-side plan trace replay identity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-proposal.test.js dist/test/determinism/plan-trace-replay.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
