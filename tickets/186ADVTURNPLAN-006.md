# 186ADVTURNPLAN-006: Microturn execution controller + fallback ladder + consideration demotion (v2 retirement)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents` runtime (`policy-agent.ts`, `policy-eval.ts`, `policy-evaluation-core.ts`, `plan-trace.ts`)
**Deps**: `archive/tickets/186ADVTURNPLAN-004.md`, `tickets/186ADVTURNPLAN-005.md`

## Problem

This ticket completes the paradigm switch (Spec 186 §4.5–§4.6). It wires the execution controller into the per-microturn entry point: at `actionSelection` it commits a plan (via the proposer, `005`); at each subsequent microturn it matches the live `legalActions` frontier to the next plan role/step, re-selecting via the role selector and descending a bounded fallback ladder. It retires the v2 top-level consideration-scoring pass as the *primary* selector, demoting it to the **primitive consideration policy** at the bottom of the fallback ladder. The migration is **behavior-preserving**: a profile with no `planTemplates` matches no template and falls through to the primitive policy, which scores the published frontier exactly as v2 did.

## Assumption Reassessment (2026-05-20)

1. `PolicyAgent.chooseDecision` (`policy-agent.ts:587`) → `chooseActionSelectionDecision` → `evaluatePolicyMove` (`policy-eval.ts:1121`) is the **single** action-selection scoring entry; `evaluatePolicyMove` wraps `evaluatePolicyMoveCore` (`policy-eval.ts:606`). chooseOne/chooseNStep route through the same `chooseDecision` (verified — no second scoring path).
2. The top-level consideration-scoring driver is the reduce-loop over `moveConsiderationIds` at `policy-eval.ts:848–857` (single source-code site). This becomes the primitive fallback policy, not the entry.
3. `legalActions` matching for chooseOne/chooseNStep already returns `null` on no-match (`policy-agent.ts` ~836–895) — the controller preserves this; it selects *which* published option satisfies the role, never constructs one (§3.3).
4. Blast radius (verified): 1 source-code consumer (`policy-agent.ts:616`); ~20 test files reference `considerations`/`strategyModules`/`selectors` but require **no migration** because the primitive fallback preserves v2 behavior.

## Architecture Check

1. The plan is advisory: the controller never constructs a move outside `legalActions` and never asserts legality; every microturn re-validates against the live frontier (Foundations #5, #18, #19).
2. **Foundation #14 — no shim**: the primitive consideration policy is a *designed leaf layer* (the DPSA demotion), not a deprecated alias path. The v2 *primary* entry is deleted in the same change; the v2 *scoring behavior* survives intentionally as the fallback bottom. The diff is mechanically focused on the single entry point + the single consideration loop, keeping it reviewable despite the architectural significance.
3. The fallback ladder bottoms at deterministic stable tie-break, then the authored `tags:[pass]` action — never a client-visible `noLegalMoves` when a pass exists (Foundation #18).

## What to Change

### 1. Execution controller (`policy-agent.ts`)

In `chooseActionSelectionDecision`: run the proposer (`005`) and commit `PlanExecutionState`. In `chooseDecision` for subsequent microturns: identify the next expected step/open role from `PlanExecutionState`; match published `legalActions` to the role's `match` pattern (exact → re-run role selector → fallback ladder). The fallback ladder (bounded by a max-attempts cap): rebind uncommitted role → next-best selector candidate → skip optional step → alternate template (same doctrine) → fallback doctrine → **primitive consideration policy** → stable tie-break → authored `pass`.

### 2. Demote the v2 primary path (`policy-eval.ts`, `policy-evaluation-core.ts`)

Re-home the `moveConsiderationIds` reduce-loop (`policy-eval.ts:848–857`) as the primitive consideration policy invoked by the fallback ladder; delete its role as the primary action-selection entry. No compatibility shim.

### 3. Per-microturn trace (`plan-trace.ts`)

Emit per-microturn entries `{ expectedStep, matchedRole, selectedLegalOption, match: exact|reselected|fallback, deviation }` into the trace structure established in `005`.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/plan-trace.ts` (modify)

## Out of Scope

- FITL ARVN authoring + profile-quality witnesses (`186ADVTURNPLAN-007`).
- Deep posture-over-preview and ally-rival metadata (Spec 187).
- `routePairs`/`subset` (`186ADVTURNPLAN-003`).

## Acceptance Criteria

### Tests That Must Pass

1. Every selected microturn decision is a member of the published `input.microturn.legalActions` (architectural invariant), across a plan-driven profile and a considerations-only profile.
2. The fallback ladder terminates within its max-attempts cap and bottoms out at stable tie-break / authored `pass` — never `noLegalMoves` when a pass exists.
3. **v2-equivalence**: a profile with only `considerations` (no `planTemplates`) produces byte-identical decisions to current v2 behavior (Foundations #14, #16).
4. Per-microturn plan trace is emitted and replay-identical.
5. Existing suite: `pnpm -F @ludoforge/engine test` (the ~20 consideration-referencing test files pass unchanged via the primitive fallback).

### Invariants

1. Selected decision ∈ published `legalActions` always (Foundations #5, #18).
2. No plan/timing/sequencing is ever published as a kernel `Decision` variant or legal action (Foundation #19).
3. The fallback ladder cannot loop indefinitely (bounded max-attempts, Foundation #10).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/plan-controller-legality-frontier.test.ts` (new) — `architectural-invariant`: selected ∈ legalActions; fallback termination.
2. `packages/engine/test/determinism/plan-v2-equivalence.test.ts` (new) — `architectural-invariant`: considerations-only profile is byte-identical to current v2 decisions.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/plan-controller-legality-frontier.test.js dist/test/determinism/plan-v2-equivalence.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
