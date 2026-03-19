# 15GAMAGEPOLIR-008: Integrate `PolicyAgent` with Traces and Diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent integration, trace payloads, diagnostics formatter
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-005-add-agentpolicycatalog-runtime-ir-schema-and-fingerprints.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md, tickets/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md

## Problem

Even with a working evaluator, the simulator still needs a generic `PolicyAgent`, policy-aware traces, and inspectable diagnostics. Without that integration, authored policies cannot participate in normal simulation flows or be debugged sanely.

## Assumption Reassessment (2026-03-19)

1. The engine currently exposes random/greedy agents and trace payloads still encode narrow AI seat types.
2. Spec 15 requires policy traces to capture seat id, profile id, fingerprint, pruning counts, tie-break chain, preview usage, and emergency fallback.
3. Corrected scope: this ticket should integrate the engine-side agent and trace path, but it should not yet migrate CLI/runner configuration surfaces.

## Architecture Check

1. Integrating `PolicyAgent` behind the existing simulator contract is cleaner than adding a parallel simulation path.
2. Structured policy-aware trace payloads are cleaner than stretching the existing `ai-random`/`ai-greedy` enum past its intended boundary.
3. No game-specific trace branches or profile-specific runtime code should be introduced.

## What to Change

### 1. Add the generic `PolicyAgent`

Implement the simulator-facing agent that:

- resolves acting seat
- resolves the authored/default profile
- delegates move choice to the policy evaluator
- always returns a legal move

### 2. Redesign policy trace payloads

Replace narrow seat-type trace framing with structured policy-aware events and verbose/summary trace levels.

### 3. Add policy diagnostics formatting

Add formatter support for:

- resolved profile plan
- parameter values
- cost tiers
- visibility/preview usage
- fingerprints

## File List

- `packages/engine/src/agents/policy-agent.ts` (new)
- `packages/engine/src/agents/policy-diagnostics.ts` (new)
- `packages/engine/src/agents/factory.ts` (modify)
- `packages/engine/src/trace/trace-events.ts` (modify)
- `packages/engine/src/sim/enriched-trace-types.ts` (modify if needed)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (new)

## Out of Scope

- CLI shorthand parsing
- runner session/store/UI migration
- authored FITL/Texas policy content
- performance benchmark gating

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-agent.test.ts` proves `PolicyAgent` always returns a legal move, resolves the correct seat/profile, and emits emergency fallback when required.
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` proves summary and verbose trace payloads contain the Spec 15 required policy fields and no longer depend on a two-value AI seat enum.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `PolicyAgent` never inspects undeclared game-specific runtime paths.
2. Policy traces identify structured agent/profile/seat data instead of stringly AI seat labels.
3. Emergency fallback remains visible and traceable whenever it fires.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — engine integration and fallback semantics.
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — trace payload contract coverage.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
