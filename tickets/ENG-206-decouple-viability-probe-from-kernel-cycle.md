# ENG-206: Decouple Viability Probe from Kernel Import Cycle

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel module boundaries for turn-flow/decision probe
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/move-decision-sequence.ts, packages/engine/src/kernel/legal-choices.ts

## Problem

Current viability probing introduces an import cycle (`turn-flow-eligibility -> move-decision-sequence -> legal-choices -> turn-flow-eligibility`). Cycles in core legality modules reduce maintainability and can become runtime-order hazards.

## Assumption Reassessment (2026-03-08)

1. `turn-flow-eligibility.ts` now imports decision-sequence probing directly.
2. `move-decision-sequence.ts` depends on `legal-choices.ts`, which depends on `turn-flow-eligibility.ts`.
3. Mismatch: current structure violates clean dependency layering. Correction: move probe orchestration into a cycle-safe module boundary.

## Architecture Check

1. A dedicated probe boundary module is cleaner and easier to evolve than tightly-coupled cyclic modules.
2. Runtime behavior stays game-agnostic; only orchestration boundaries change.
3. No compatibility shims: remove the cycle instead of masking it.

## What to Change

### 1. Extract viability probing orchestration

Create a dedicated module for free-operation viability probing that depends on shared primitives without introducing turn-flow/decision/legal-choices cycles.

### 2. Rewire callers to acyclic graph

Update turn-flow eligibility and legal move filters to consume the extracted probe API and keep module graph acyclic.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify if needed)
- `packages/engine/src/kernel/legal-choices.ts` (modify if needed)
- `packages/engine/src/kernel/free-operation-viability-probe.ts` (new)
- `packages/engine/test/unit/kernel/` cycle-sensitive tests or module-boundary tests (new/modify)

## Out of Scope

- Changing grant semantics/policies.
- Sequence-context or mandatory-outcome contracts (ENG-202/ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. No import cycle exists across `turn-flow-eligibility`, `move-decision-sequence`, and `legal-choices`.
2. Viability behavior remains unchanged for existing `ENG-201` policy tests.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Kernel legality/probe module graph is acyclic in this boundary.
2. Probe results remain deterministic and policy-driven from data contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<cycle-boundary>.test.ts` — assert/guard acyclic dependency contract for viability probe boundary.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — regression parity for viability behavior after refactor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
