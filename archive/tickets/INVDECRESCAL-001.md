# INVDECRESCAL-001: Investigate decision resolution caller complexity

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

The test helper `decision-param-helpers.ts` (136 lines) wraps the kernel's `completeMoveDecisionSequence` with substantial logic: compound SA move decomposition, stochastic binding stripping, consumed-key tracking. Every FITL event card test imports it. This suggests the kernel's decision API may lack a higher-level "resolve and apply move with full decision completion" function.

Currently supported by a single evidence signal (test helper complexity). Need to check whether non-test consumers face the same orchestration burden.

## Assumption Reassessment (2026-04-08)

1. The helper path in the ticket was stale. The live helper is `packages/engine/test/helpers/decision-param-helpers.ts`, and it is now 258 lines — confirmed path/size drift.
2. FITL integration/e2e helper surfaces still rely heavily on `applyMoveWithResolvedDecisionIds` from that helper — confirmed widespread test-only usage.
3. Simulator, agents, and runner do not duplicate that exact orchestration in caller code. They route through shared kernel completion helpers (`completeTemplateMove`, `evaluatePlayableMoveCandidate`) or interactive choose-N APIs — confirmed.

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If non-test consumers need similar orchestration, a follow-up spec for a kernel-level API is warranted
3. If only tests need it, the helper is appropriate test infrastructure — no action needed

## What to Change

### 1. Check simulator usage

Grep for `completeMoveDecisionSequence`, `resolveMoveDecisionSequence`, and `applyMove` usage in `packages/engine/src/sim/`. Does the simulator implement compound-SA decomposition or stochastic stripping?

### 2. Check agent usage

Grep the same symbols in `packages/engine/src/agents/`. Do agents need to handle compound moves or do they produce fully-resolved moves?

### 3. Check runner usage

Grep in `packages/runner/src/`. Does the web runner face similar orchestration needs?

### 4. Write verdict

- **Confirmed**: Non-test consumers implement similar wrapper logic → write follow-up spec
- **Rejected**: Only tests need compound-SA decomposition → close, helper is appropriate test infrastructure

## Files to Touch

- No source files modified
- Read: `packages/engine/src/sim/simulator.ts`
- Read: `packages/engine/src/agents/policy-agent.ts`
- Read: `packages/runner/src/worker/` (if relevant)

## Out of Scope

- Any code changes
- Writing a follow-up spec (that's a follow-up if confirmed)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict is one of: confirmed (with evidence) or rejected (with explanation)

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only

## Outcome

- Completion date: 2026-04-08
- Verdict: **Rejected**
- Evidence:
  - `packages/engine/src/sim/simulator.ts` does not orchestrate decision completion itself. The simulator consumes agent-selected trusted moves and applies them with `applyTrustedMove(...)`.
  - `packages/engine/src/agents/policy-agent.ts` and `packages/engine/src/agents/prepare-playable-moves.ts` do perform non-test move completion, but they delegate to shared engine APIs: `evaluatePlayableMoveCandidate(...)` and `completeTemplateMove(...)`.
  - `packages/engine/src/kernel/move-completion.ts` already provides a higher-level shared template-completion surface on top of `completeMoveDecisionSequence(...)`, including stochastic selection handling.
  - `packages/runner/src/worker/game-worker-api.ts` exposes `legalChoices(...)`, `advanceChooseN(...)`, and `applyTemplateMove(...)`; its template application path delegates to `completeTemplateMove(...)` rather than reimplementing the FITL test helper logic.
  - Only the FITL test helper adds the extra deterministic override behavior and compound special-activity normalization needed by those tests before calling `applyMove(...)`.
- Explanation:
  - Non-test consumers do need move-completion support, but the live architecture already centralizes that work in shared kernel helpers. The remaining complexity in `decision-param-helpers.ts` is test-specific infrastructure for deterministic assertions and FITL compound special-activity normalization, not evidence that production callers are carrying the same orchestration burden.
- Verification results:
  - Static analysis only, per ticket. No source/runtime behavior changed and no tests were required.
