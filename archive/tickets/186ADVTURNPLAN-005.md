# 186ADVTURNPLAN-005: Bounded plan proposer/evaluator + plan trace contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents` runtime (new `plan-proposal.ts`, new `plan-trace.ts`, `policy-eval.ts`/`policy-evaluation-core.ts`)
**Deps**: `archive/tickets/186ADVTURNPLAN-001.md`, `archive/tickets/186ADVTURNPLAN-002A.md`, `archive/tickets/186ADVTURNPLAN-004.md`

## Problem

Spec 186 §4.4 / §4.8: at a player's `actionSelection` frame the agent must enumerate candidate plans from active doctrine carriers, bind role selectors with bounded top-K expansion, score each plan via leaf scorers (selector quality, demoted considerations) plus the posture hook, select by priority tier / guardrails / posture / stable key, and record the choice in `PlanExecutionState` — all under named cap classes. The deterministic plan trace (§4.8) records the proposal-side decision (doctrines selected/active/rejected, template, bindings, alternatives, posture status).

## Assumption Reassessment (2026-05-20)

1. Spec 164's `CAP_CLASS_BUDGETS` named-registry pattern (`archive/specs/164-...`) is the model for the plan cap classes (`maxActiveDoctrines`, `maxTemplatesPerDoctrine`, `maxRootCandidates`, `maxBindingsPerRole`, `maxPlanInstances`, `maxPlanSteps`).
2. Leaf scorers reuse existing machinery: selector quality (`policy-selector-eval.ts`) and the consideration-evaluation primitives (`policy-eval.ts` / `policy-evaluation-core.ts`) — re-homed, not rewritten.
3. `PlanExecutionState` (`186ADVTURNPLAN-004`) is the sink for the selected plan.
4. The posture hook in this ticket consumes only current-state and `ready`/non-`ready` preview status; deep posture-over-preview is Spec 187 (verified Non-Goal).
5. Plan cap/max-step IR is owned by `186ADVTURNPLAN-002A`; this ticket consumes that generic metadata when enforcing proposer/evaluator caps.

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

## Outcome (2026-05-20)

Implemented the proposal-side Phase 2 slice for advisory turn plans:

- Added `packages/engine/src/agents/plan-proposal.ts` and `packages/engine/src/agents/plan-trace.ts`.
- Added `PLAN_CAP_CLASS_BUDGETS` for `standard256` and `deep1024`, with deterministic proposal truncation.
- Wired action-selection `PolicyAgent` decisions to build an advisory plan proposal, commit the selected template/roles/root into `PlanExecutionState`, and emit the proposal-side `agentDecision.plan` trace when policy tracing is enabled.
- Added `PolicyPlanTrace` types in `packages/engine/src/kernel/types-plan-trace.ts` and exported the plan trace through the existing kernel/agent type surfaces.
- Added unit and determinism coverage for proposal enumeration, role binding, cap truncation, `PolicyAgent` state commit/trace emission, and byte-identical plan trace replay.

Scope boundary: this ticket lands the advisory proposal and trace/state write. It does not retire the existing v2 move-selection path or execute per-microturn plan steps; that remains `186ADVTURNPLAN-006`. Deep posture-over-preview and ally/rival posture metadata remain Spec 187. The landed leaf scoring uses the existing selector evaluator for selector quality and bounded current-state/candidate-intrinsic consideration terms for proposal-side scoring; deeper preview/posture leaf scoring remains outside this slice.

Acceptance-to-command map:

- AC1, proposer enumerates a matching template, binds roles, and writes selected plan state: `node --test dist/test/unit/agents/plan-proposal.test.js dist/test/determinism/plan-trace-replay.test.js` from `packages/engine` and `pnpm -F @ludoforge/engine test`.
- AC2, named cap class truncates deterministically: `packages/engine/test/unit/agents/plan-proposal.test.ts` via the focused command and package/root suites.
- AC3, proposal-side plan trace replay identity: `packages/engine/test/determinism/plan-trace-replay.test.ts` via the focused command and package/root suites.
- AC4, existing engine suite: `pnpm -F @ludoforge/engine test`.
- Invariants, bounded caps and deterministic ordering: focused plan proposal/replay tests plus `pnpm turbo test`.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- From `packages/engine`: `node --test dist/test/unit/agents/plan-proposal.test.js dist/test/determinism/plan-trace-replay.test.js` — passed, 4 tests / 2 suites.
- `pnpm -F @ludoforge/engine test` — passed, `164/164 files passed`.
- `pnpm turbo build` — passed, 3 successful tasks.
- `pnpm turbo test` — passed, 5 successful tasks; engine `164/164 files passed`, runner `205` files / `2019` tests passed.
- `pnpm turbo lint` — passed, 2 successful tasks.
- `pnpm turbo typecheck` — passed, 3 successful tasks.
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2464 archived tickets.
- `git diff --check` — passed.
- Trailing-whitespace scan over new untracked source/test files — passed.

Source-size ledger:

- `packages/engine/src/agents/policy-agent.ts`: `942` lines before and after, no net growth.
- `packages/engine/src/agents/policy-eval.ts`: `1730` lines before and after, no net growth.
- `packages/engine/src/kernel/types-core.ts`: `2850` lines before and after, no net growth.
- New source files are under the file-size guidance: `plan-proposal.ts` `532` lines, `plan-trace.ts` `40` lines, `types-plan-trace.ts` `32` lines.

Generated artifacts: no generated artifacts were checked in; schema artifact verification ran through `pnpm -F @ludoforge/engine test` and `pnpm turbo test`.
