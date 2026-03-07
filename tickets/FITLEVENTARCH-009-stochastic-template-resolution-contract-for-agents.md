# FITLEVENTARCH-009: Canonical Stochastic Template Resolution Contract for Agents

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — template completion and agent behavior under stochastic unresolved decisions
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md

## Problem

After introducing stochastic pending decisions, `completeTemplateMove` returns `null` for `pendingStochastic`. If all legal moves are templates in that state, current agents can throw `no playable moves after template completion`.

This creates brittle simulator behavior around stochastic-yet-legal decision frontiers.

## Assumption Reassessment (2026-03-07)

1. `completeTemplateMove` now returns `null` when `legalChoicesEvaluate` yields `pendingStochastic`.
2. `RandomAgent` and `GreedyAgent` currently throw when no completed moves remain after template completion attempts.
3. There is no explicit canonical agent/runtime contract yet for unresolved stochastic alternatives.

## Architecture Check

1. Agent/runtime flow should treat unresolved stochastic alternatives as a first-class state, not an exceptional crash path.
2. A canonical unresolved-template contract keeps engine behavior robust and extensible without game-specific exceptions.
3. No backward-compatibility aliases: define one explicit behavior for stochastic unresolved templates.

## What to Change

### 1. Define canonical unresolved-template handling for agents

Adopt a deterministic fallback contract when template completion yields unresolved stochastic alternatives, for example:
- retain base legal move as selectable when completion is blocked by stochastic uncertainty, or
- return a structured agent-level error/result that caller handles deterministically.

Choose one canonical approach and apply it consistently to all built-in agents.

### 2. Align move-completion API with chosen contract

Adjust `move-completion.ts` API/result shape if needed so callers can distinguish:
- unsatisfiable template,
- stochastic unresolved template,
- successfully completed template.

### 3. Add robust regressions for agent behavior

Add tests proving agents do not throw solely due to stochastic unresolved template fronts when legal moves exist.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/test/unit/agents/random-agent.test.ts` (modify)
- `packages/engine/test/unit/agents/greedy-agent-core.test.ts` (modify)
- `packages/engine/test/unit/decision-sequence.test.ts` (modify if shared helper contracts are affected)

## Out of Scope

- Legal move enumeration policy harmonization
- UI decision prompting flow
- Event-card content changes

## Acceptance Criteria

### Tests That Must Pass

1. Built-in agents do not crash when legal moves are present but template completion encounters stochastic unresolved choices.
2. Agent behavior remains deterministic for identical seeds/inputs.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Agent fallback behavior is game-agnostic and independent of game-specific card logic.
2. Stochastic unresolved templates are represented explicitly, not conflated with unsatisfiable templates.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/random-agent.test.ts` — stochastic unresolved template front does not cause terminal throw when legal move exists.
2. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — same invariant for greedy expansion path.
3. `packages/engine/test/unit/decision-sequence.test.ts` or equivalent helper suite — contract-level assertions for new move-completion outcome shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/random-agent.test.js`
3. `node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
