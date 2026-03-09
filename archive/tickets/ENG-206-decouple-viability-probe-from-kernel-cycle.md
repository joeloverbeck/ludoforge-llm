# ENG-206: Decouple Viability Probe from Kernel Import Cycle

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel module boundaries for turn-flow/decision probe
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/move-decision-sequence.ts, packages/engine/src/kernel/legal-choices.ts

## Problem

Current viability probing introduces an import cycle (`turn-flow-eligibility -> move-decision-sequence -> legal-choices -> turn-flow-eligibility`). Cycles in core legality modules reduce maintainability and can become runtime-order hazards.

## Assumption Reassessment (2026-03-08)

1. Confirmed cycle path in current source:
   `turn-flow-eligibility.ts -> move-decision-sequence.ts -> legal-choices.ts -> turn-flow-eligibility.ts`.
2. The direct back-edge is `legal-choices.ts` importing `resolveFreeOperationDiscoveryAnalysis` from `turn-flow-eligibility.ts`.
3. Additional coupling not captured in the original scope:
   `apply-move.ts` and `legal-moves-turn-order.ts` currently import free-operation discovery/grant helpers from `turn-flow-eligibility.ts`.
4. Correction: extract free-operation discovery/grant-match analysis into a dedicated module and rewire importers to that module so turn-flow orchestration no longer owns this shared analysis surface.

## Architecture Check

1. A dedicated probe boundary module is cleaner and easier to evolve than tightly-coupled cyclic modules.
2. Runtime behavior stays game-agnostic; only orchestration boundaries change.
3. No compatibility shims: remove the cycle instead of masking it.

## What to Change

### 1. Extract viability probing orchestration

Create a dedicated module for free-operation discovery/grant-match analysis (including event viability policy checks) that depends on shared primitives without introducing turn-flow/decision/legal-choices cycles.

### 2. Rewire callers to acyclic graph

Update turn-flow eligibility, legal choices, legal move filters, and apply-move preflight to consume the extracted analysis API and keep module graph acyclic.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify if needed)
- `packages/engine/src/kernel/legal-choices.ts` (modify if needed)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (new)
- `packages/engine/test/unit/kernel/` cycle-sensitive tests or module-boundary tests (new/modify)

## Out of Scope

- Changing grant semantics/policies.
- Sequence-context or mandatory-outcome contracts (ENG-202/ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. No import cycle exists across `turn-flow-eligibility`, `move-decision-sequence`, and `legal-choices`.
2. Viability behavior remains unchanged for existing `ENG-201` policy tests.
3. Shared free-operation analysis surface is no longer sourced from `turn-flow-eligibility.ts`.
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Kernel legality/probe module graph is acyclic in this boundary.
2. Probe results remain deterministic and policy-driven from data contracts.
3. Free-operation discovery/grant-match analysis remains game-agnostic and reusable by legality/apply paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<cycle-boundary>.test.ts` — assert/guard acyclic dependency contract and direct import boundary (`legal-choices.ts` must not import `turn-flow-eligibility.ts`).
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — regression parity for viability behavior after refactor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-08
- Outcome amended: 2026-03-08
- Actual changes:
  - Added `packages/engine/src/kernel/free-operation-discovery-analysis.ts` as the canonical home for free-operation discovery/grant-match analysis (`resolveFreeOperationDiscoveryAnalysis`, applicability/granted/monsoon checks, and grant authorization predicate).
  - Rewired imports so `legal-choices.ts`, `apply-move.ts`, and `legal-moves-turn-order.ts` consume this dedicated module.
  - Removed duplicated free-operation discovery/grant-match analysis logic from `turn-flow-eligibility.ts` and retained turn-flow orchestration responsibilities there.
  - Added architecture guard test `packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts` to enforce the new import boundary.
  - Added `packages/engine/src/kernel/turn-flow-action-class.ts` as the canonical home for turn-flow action-class resolution (`resolveTurnFlowActionClass`, `resolveTurnFlowActionClassMismatch`).
  - Rewired consumers (`turn-flow-eligibility.ts`, `free-operation-discovery-analysis.ts`, `apply-move.ts`, `legal-moves.ts`, `legal-moves-turn-order.ts`, `move-identity.ts`, and related tests) to consume the shared turn-flow action-class module.
- Deviations from original plan:
  - `move-decision-sequence.ts` did not require modifications.
  - Scope expanded to include `apply-move.ts` and `legal-moves-turn-order.ts` import rewiring because they consumed the extracted analysis surface.
  - Additional post-completion refinement extracted duplicated turn-flow action-class logic into a dedicated module to remove duplication between turn-flow orchestration and free-operation discovery analysis.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js packages/engine/dist/test/unit/legal-moves.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (445/445).
  - `pnpm -F @ludoforge/engine lint` passed.
