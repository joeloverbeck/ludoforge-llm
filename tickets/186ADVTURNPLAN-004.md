# 186ADVTURNPLAN-004: PlanExecutionState cross-microturn lifecycle

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents` runtime (new `plan-execution.ts`, `policy-agent.ts`)
**Deps**: `tickets/186ADVTURNPLAN-001.md`

## Problem

Spec 186 §3.2 verified the core runtime gap: `PolicyAgent.chooseDecision` is invoked once per microturn, and the only state surviving across microturns is `previewWideningState` (`policy-agent.ts:578`) — there is no persistent plan, role binding, or committed intent. This ticket adds `PlanExecutionState` (§4.3): a serializable, deterministic object that persists the selected plan across the microturns of one `turnId` and is cleared at the turn boundary. It is the substrate the proposer (`005`) writes and the controller (`006`) reads.

## Assumption Reassessment (2026-05-20)

1. `previewWideningState: PreviewWideningState` is held on `PolicyAgent` (`policy-agent.ts:578`); `PreviewWideningState` is defined at `preview-budget-allocator.ts:13` and keyed by `turnId`+`seatId` — the same keying `PlanExecutionState` uses (verified).
2. `chooseDecision` (`policy-agent.ts:587`) is the per-microturn entry; `actionSelection` / `turnRetirement` frames are observable there.
3. Compiled plan types (`CompiledPlanTemplate`, role bindings) exist after `186ADVTURNPLAN-001`; `PlanExecutionState` references them as runtime instances.

## Architecture Check

1. `PlanExecutionState` is held on the agent instance (like `previewWideningState`), not in kernel `GameState` — it is advisory policy memory, not authoritative state (Foundations #4, #19).
2. Canonical serialization makes plan state reconstructable on replay (Foundation #8).
3. No shim — net-new runtime object alongside the existing widening-state map.

## What to Change

### 1. `plan-execution.ts` (new)

Define `PlanExecutionState`: `{ selectedTemplate, intent, roleBindings, nextStepIndex, fallbackHistory, deviations }`. Provide create / advance / clear helpers and canonical (de)serialization.

### 2. `policy-agent.ts` (modify)

Hold a `planExecutionState` map keyed by `turnId`+`seatId` (alongside `previewWideningState`). Create at the turn's `actionSelection` frame; clear on `turnRetirement` or `turnId` change. Do not yet wire the proposer or controller — those are `005`/`006`; this ticket establishes the lifecycle hooks and an empty/placeholder state.

## Files to Touch

- `packages/engine/src/agents/plan-execution.ts` (new)
- `packages/engine/src/agents/policy-agent.ts` (modify)

## Out of Scope

- Plan proposal/scoring (`186ADVTURNPLAN-005`).
- Execution controller, fallback ladder, consideration demotion (`186ADVTURNPLAN-006`).
- Trace emission (`005`/`006`).

## Acceptance Criteria

### Tests That Must Pass

1. `PlanExecutionState` created at `actionSelection` persists across consecutive microturns within the same `turnId`+`seatId`.
2. The state clears at `turnRetirement` and on `turnId` change.
3. Serialization round-trips canonically (serialize → deserialize → byte-identical).
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `PlanExecutionState` lives on the agent, never in kernel `GameState` (Foundation #4).
2. State serialization is canonical and replay-stable (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-execution-lifecycle.test.ts` (new) — `architectural-invariant`: persistence-across-microturns, boundary-clear, serialization round-trip.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-execution-lifecycle.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
