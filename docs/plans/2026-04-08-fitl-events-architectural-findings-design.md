# Design: FITL Events Architectural Findings — Spec & Ticket Plan

**Date**: 2026-04-08
**Source**: `reports/architectural-abstractions-2026-04-08-fitl-events.md`
**Approach**: Spec-first for validated findings, investigation tickets for single-signal findings

## Findings Summary

| # | Finding | Evidence Signals | Action |
|---|---------|-----------------|--------|
| A | Event Side-Effect Manifest (event→turn-flow handoff re-derivation) | Import analysis + temporal coupling (28 co-changes) | Spec 119 |
| B | Dual Momentum Enforcement Pathway (gvar + actionRestrictions) | Test behavior (single signal) | Investigation ticket |
| C | Decision Resolution Caller Complexity (136-line test helper) | Test helper complexity (single signal) | Investigation ticket |
| D | toPendingFreeOperationGrant triplication (3 sites) | Code duplication (single signal) | Investigation ticket |

## Spec 119 — Event Side-Effect Manifest

**Purpose**: Define a typed `EventSideEffectManifest` value that `event-execution.ts` produces once per event play, containing all side-effects (free operation grants, eligibility overrides, lasting effects, deferred effect payloads). `turn-flow-eligibility.ts` consumes this manifest instead of independently re-resolving the event card.

**Scope**:
- New type: `EventSideEffectManifest` (kernel/types-events.ts)
- Modify: `event-execution.ts` — produce manifest
- Modify: `turn-flow-eligibility.ts` — consume manifest instead of re-deriving
- Modify: `apply-move.ts` — thread manifest instead of manual `deferredEventEffect` plumbing

**FOUNDATIONS alignment**:
- F5 (One Rules Protocol): Single computation point for event side-effects
- F8 (Determinism): Eliminates re-derivation divergence risk
- F11 (Immutability): Manifest is an immutable value type
- F14 (No Backwards Compatibility): Clean refactor, no shims
- F15 (Architectural Completeness): Addresses root protocol gap

**Decomposition**: Spec 119 decomposes into implementation tickets via `/spec-to-tickets`. Expected: 3-5 tickets (type definition, manifest production, manifest consumption, apply-move threading, test updates).

## Investigation Tickets

### INVMOMDUPATH-001 — Investigate Dual Momentum Enforcement Pathway

**Purpose**: Determine whether gvar pipeline legality conditions and `activeLastingEffects.actionRestrictions` overlap for the same momentum card, or handle disjoint concerns.

**Deliverable**: A verdict (confirm/reject) with evidence. If confirmed: write a follow-up spec (Spec 120). If rejected: close with explanation of why the dual path is intentional complementarity.

**Method**: Compile a specific momentum card (e.g., Rolling Thunder card-41). Check whether its compiled lasting effect carries `actionRestrictions` AND its affected pipelines carry `mom_rollingThunder` gvar conditions. If both exist for the same blocking behavior, the fracture is confirmed.

**Effort**: Small
**Dependencies**: None

### INVDECRESCAL-001 — Investigate Decision Resolution Caller Complexity

**Purpose**: Determine whether the 136-line `decision-param-helpers.ts` test helper compensates for a missing kernel-level API, or is test-specific orchestration.

**Deliverable**: A verdict. If non-test consumers (sim/agents) also need compound-SA decomposition and stochastic stripping, write a follow-up spec. If only tests need it, close — the helper is appropriate test infrastructure.

**Method**: Grep for `completeMoveDecisionSequence` and `resolveMoveDecisionSequence` usage in `packages/engine/src/sim/` and `packages/engine/src/agents/`. Check whether those callers implement similar wrapper logic or use a simpler path.

**Effort**: Small
**Dependencies**: None

### INVGRANTSHAPDUP-001 — Investigate toPendingFreeOperationGrant Triplication

**Purpose**: Confirm that the grant contract-to-pending construction is duplicated identically in 3 files, then consolidate into `grant-lifecycle.ts`.

**Deliverable**: If confirmed identical, a single ticket implementing the consolidation (no spec needed — this is a DRY fix). If the three sites intentionally produce different field subsets, close with explanation.

**Method**: Read and diff `toPendingFreeOperationGrant` in `turn-flow-eligibility.ts`, `free-operation-viability.ts`, and the inline construction in `effects-turn-flow.ts`. Compare field sets.

**Effort**: Small
**Dependencies**: None

## Dependency Graph

```
INVMOMDUPATH-001   ──(if confirmed)──▶  Spec 120 (future, not created now)
INVDECRESCAL-001   ──(if confirmed)──▶  follow-up spec/ticket (future)
INVGRANTSHAPDUP-001 ──(if confirmed)──▶  consolidation ticket (future)

Spec 119 (Event Side-Effect Manifest)
  └── no dependencies on investigation tickets
  └── decomposes into implementation tickets via /spec-to-tickets

All three investigation tickets are independent of each other and of Spec 119.
No blocking dependencies exist in this plan.
```

## Implementation Order

1. Investigation tickets (INVMOMDUPATH-001, INVDECRESCAL-001, INVGRANTSHAPDUP-001) — can run in parallel, small effort each
2. Spec 119 authoring — can run in parallel with investigation tickets
3. Spec 119 ticket decomposition via `/spec-to-tickets`
4. Spec 119 implementation tickets — after decomposition
5. Follow-up specs/tickets from investigation verdicts — after investigations complete
