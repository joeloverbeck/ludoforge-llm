# Architectural Abstraction Recovery: fitl-events

**Date**: 2026-04-08
**Input**: `packages/engine/test/integration/fitl-events*` (101 test files)
**Engine modules analyzed**: 373 (234 kernel + 89 cnl + 18 contracts + 13 sim + 19 shared)
**Prior reports consulted**:
- `archive/reports/architectural-abstractions-2026-04-08-fitl-policy-agent-canary.md` (REJECTED)
- `archive/reports/missing-abstractions-2026-04-07-fitl-policy-agent-canary.md`
- `archive/reports/missing-abstractions-2026-04-07-fitl-playbook-golden.md`

## Executive Summary

The FITL events test suite exercises the full engine pipeline from spec compilation through event card execution, covering grants, eligibility overrides, momentum markers, decision resolution, and phase lifecycle. Analysis found **two cross-subsystem fractures** with two-signal evidence, **one candidate abstraction** surviving all validation filters, and **one borderline fracture** that needs further investigation. The eligibility override lifecycle, lasting effect lifecycle, grant lifecycle state machine, and full-deck structural validation are all **acceptably architected** — complex but correctly owned.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| Deck structural validation | ~5 (full-deck, capability, momentum, pivotal, text-only-backfill) | Card tags, seatOrder, playCondition, markers, lasting effects | 130-card completeness, marker 1:1 mapping, momentum duration, pivotal conditions |
| Event card effect execution | ~90 (individual card tests) | Token movement, marker shifts, resource deltas, zone targeting | Post-execution zone token counts, marker states, global var values |
| Free operation grant lifecycle | ~10 (ia-drang, lam-son-719, etc.) | freeOperationGrants, sequence batches, viability probing | Grant queueing, sequence-locking, zero-cost follow-ups |
| Eligibility override lifecycle | ~8 (claymores, rolling-thunder, etc.) | pendingEligibilityOverrides, nextTurn duration, card boundaries | Override persistence, consumption at boundary, seat targeting |
| Momentum / lasting effect lifecycle | ~6 (rolling-thunder, da-nang, bombing-pause, etc.) | activeLastingEffects, round duration, coup reset, action blocking | Momentum blocks actions, coup clears momentum, duration counter decrement |
| Decision resolution | ~15 (election, tet-offensive, etc.) | chooseN, chooseOne, DecisionOverrideRule, bind variables | Cardinality scaling, override matching, compound SA resolution |
| Support marker transitions | ~10 (election, annam, burning-bonze, etc.) | supportOpposition lattice, shift direction, adjacency | One-level shifts, clamping at extremes, adjacency-filtered targeting |
| Resource clamping | ~20 (rolling-thunder, annam, election, etc.) | addVar delta, floor 0, ceiling 75, aid/resources | Delta arithmetic, floor/ceiling enforcement |

## Traceability Summary

Grouped by module cluster — individual file listing omitted for 373 files.

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| kernel/event-execution.ts + effects-turn-flow.ts + grant-lifecycle.ts | Grant lifecycle, eligibility overrides, momentum, effect execution | High | Import + temporal (28 co-changes) |
| kernel/legal-moves.ts + legal-moves-turn-order.ts + apply-move.ts | Effect execution, decision resolution, momentum blocking | High | Import + temporal (26 co-changes) |
| kernel/phase-advance.ts + boundary-expiry + turn-flow-lifecycle.ts | Momentum expiry, coup reset, phase transitions | High | Import + temporal |
| kernel/turn-flow-eligibility.ts + types-turn-flow.ts + schemas-extensions.ts | Eligibility overrides, grant creation, turn flow state | High | Import + temporal (23 co-changes) |
| kernel/free-operation-*.ts (22 files) | Free operation grant lifecycle | High | Import |
| kernel/effects-*.ts (20 files) | Effect execution (all card tests) | High | Import |
| kernel/eval-*.ts + resolve-*.ts + query-*.ts | Condition evaluation, selector resolution | High | Import |
| cnl/* (89 files) | Deck structural validation (compilation pipeline) | High | Import via production-spec-helpers.ts |
| kernel/validate-gamedef-*.ts + schemas-*.ts + types-*.ts | Structural validation | Medium | Import (indirect via compilation) |
| test/helpers/decision-param-helpers.ts | Decision resolution (all card execution tests) | High | Import (100% of execution tests) |
| test/helpers/turn-order-helpers.ts | Grant lifecycle, eligibility overrides | High | Import |

## Fracture Summary

| # | Fracture Type | Location | Evidence Sources | Severity |
|---|--------------|----------|-----------------|----------|
| 1 | Split protocol | Momentum enforcement: `legal-moves-turn-order.ts` (pipeline gvar legality + lastingEffect actionRestrictions) | Import analysis + test behavior (momentum-validation + coin-operations tests) | MEDIUM |
| 2 | Split protocol | Event-to-turn-flow handoff: `event-execution.ts` + `turn-flow-eligibility.ts` re-derive grants/overrides independently | Import analysis + temporal coupling (28 co-changes) | MEDIUM |

## Candidate Abstractions

### 1. Event Side-Effect Manifest

**Kind**: Protocol
**Scope**: kernel/event-execution.ts, kernel/turn-flow-eligibility.ts, kernel/apply-move.ts
**Fractures addressed**: #2 (Event-to-turn-flow handoff)

**Owned truth**: The complete set of side-effects an event card produces when played — free operation grants, eligibility overrides, lasting effects, and deferred effect payloads — as a single typed value computed once and threaded through the pipeline.

**Invariants**:
- An event card's side-effects are resolved exactly once per play, not re-derived by downstream consumers
- All side-effect categories (grants, overrides, lasting effects, deferred payloads) are part of the same manifest
- The manifest is the sole input to turn-flow integration — `turn-flow-eligibility.ts` does not independently re-resolve the event card

**Owner boundary**: `kernel/event-execution.ts` — the module that already resolves event context should produce the manifest; `turn-flow-eligibility.ts` consumes it.

**Modules affected**:
- `event-execution.ts`: Already computes grants (`resolveEventFreeOperationGrants`), overrides (`resolveEventEligibilityOverrides`), lasting effects, and deferred payloads — but returns them piecemeal
- `turn-flow-eligibility.ts`: Currently re-derives grants and overrides by calling back into event-execution resolution functions; would instead receive pre-resolved manifest
- `apply-move.ts`: Currently threads `deferredEventEffect` manually between the two modules; would pass the manifest instead

**Tests explained**: All event card execution tests (~90), especially those verifying grant creation (Ia Drang), override creation (Claymores, Rolling Thunder), and deferred effects (cards with afterGrants timing).

**Expected simplification**:
- Eliminates redundant event card resolution (currently resolved independently in event-execution and turn-flow-eligibility)
- Replaces manual data-plumbing of `deferredEventEffect` through apply-move.ts with structured manifest threading
- Reduces the 28-commit temporal coupling between `effects-turn-flow.ts` and `turn-flow-eligibility.ts` by clarifying the interface boundary
- New side-effect categories (future) would be added to the manifest type once, not plumbed through multiple modules

**FOUNDATIONS alignment**:
- F5 (One Rules Protocol): Aligned — manifest consolidates the single source of truth for event side-effects
- F8 (Determinism): Aligned — eliminating re-derivation removes a class of potential divergence (currently safe because resolution is pure, but fragile under future changes)
- F11 (Immutability): Aligned — manifest is a value type, passed immutably
- F14 (No Backwards Compatibility): Aligned — this is a clean refactor, not a shim
- F15 (Architectural Completeness): Aligned — addresses a genuine protocol gap rather than papering over symptoms

**Confidence**: Medium
**Counter-evidence**: If event side-effects are intentionally re-derived because downstream modules need to filter/transform them based on state that changed between event execution and turn-flow integration (e.g., if grant installation can fail and overrides should only apply when grants succeed). If such conditional coupling exists, a single manifest would be premature. Currently, no evidence of such coupling was found — the re-derivation appears to be incidental, not intentional.

## Acceptable Architecture

### Eligibility Override Lifecycle
The override lifecycle has clear single-module authority. `turn-flow-eligibility.ts` owns creation (extraction from event definitions), categorization (immediate vs. deferred by duration), accumulation (`pendingEligibilityOverrides` array), application (to `effectiveEligibility` map), and consumption (reset at card boundary). Only 4 files reference `pendingEligibilityOverrides` — the type, schema, initial state, and logic module. This is the minimum footprint for a typed, validated, lifecycle-managed concept.

### Lasting Effect Lifecycle
`event-execution.ts` owns creation (with duration counter initialization) and expiry logic (`expireLastingEffectsAtBoundaries`). `boundary-expiry.ts` orchestrates when expiry runs. The counter-decrement model (remaining{Turn,Round,Cycle}Boundaries) is mechanical and correct. State lives in `state.activeLastingEffects` with clear immutable update patterns.

### Grant Lifecycle State Machine
`grant-lifecycle.ts` provides a clean, well-typed state machine: `sequenceWaiting → ready → offered → consumed/exhausted/expired/skipped`. All transitions return immutable results with trace entries. Phase assertions prevent invalid transitions. The module is ~384 lines of focused lifecycle logic with no cross-cutting concerns. (Note: the *authority split* over who *calls* these transitions is a known prior finding, but the state machine itself is well-designed.)

### Full Deck Structural Validation
The deck validation tests (`full-deck`, `capability-validation`, `momentum-validation`, `pivotal`) are well-architected golden tests that compile the production spec once and validate structural invariants. They exercise the CNL pipeline cleanly without entangling kernel runtime concerns.

### Effect System Dispatch
The effect system (20+ files) is well-stratified with centralized dispatch in `effect-dispatch.ts`, domain-specific handlers (`effects-token.ts`, `effects-var.ts`, `effects-turn-flow.ts`, etc.), and a consistent `(effect, env, cursor, scope, budget, applyBatch)` handler signature. Despite the file count, each handler is focused and independently testable.

## Needs Investigation

### Dual Momentum Enforcement Pathway (Single-Signal)

**Observation**: Momentum in FITL is enforced through two independent mechanisms:
1. **Global variable guards** in action pipeline legality conditions — `mom_rollingThunder`, `mom_generalLansdale`, etc. are checked as `gvar` boolean references. These are evaluated during move enumeration by pipeline-specific conditions.
2. **Lasting effect `actionRestrictions`** — `isMoveAllowedByLastingEffectRestrictions()` in `legal-moves-turn-order.ts` checks `activeLastingEffects[].actionRestrictions` for `blocked` or `maxParam` constraints.

The free-operation bypass (`move.freeOperation === true`) is implemented independently in both paths — as a code-level check in `isMoveAllowedByLastingEffectRestrictions` (line 252) and as a `__freeOperation == true` condition node baked into pipeline legality ASTs.

**Single signal**: Test behavior — `fitl-coin-operations.test.ts:922` checks `mom_generalLansdale` legality guard on pipeline definitions, while `fitl-events-rolling-thunder.test.ts` checks momentum blocking through the lasting effect / coup-reset path.

**Missing second signal**: Need to verify whether any specific card actually uses BOTH mechanisms for the same logical momentum concept (gvar guard AND actionRestriction). If the two paths handle disjoint concerns (gvar = "is this action family allowed" vs. actionRestriction = "cap the numeric parameter"), the dual path is intentional complementarity, not a split protocol. Temporal coupling data does not show unusual co-change between the relevant files.

**What to look for**: Compile a specific momentum card (e.g., Rolling Thunder, card-41) and check whether its compiled lasting effect carries `actionRestrictions` AND its affected pipelines carry `mom_rollingThunder` gvar conditions. If both exist for the same blocking behavior, the fracture is confirmed.

### Decision Resolution Caller Complexity

**Observation**: The test helper `decision-param-helpers.ts` is 136 lines of orchestration logic wrapping the kernel's `completeMoveDecisionSequence`. It handles compound SA move decomposition, stochastic binding stripping, and consumed-key tracking. Every event card execution test imports it. This suggests the kernel's decision API may lack a higher-level "resolve and apply move with full decision completion" function.

**Single signal**: Test helper complexity as fracture signal. 100% of event execution tests depend on this helper rather than calling kernel APIs directly.

**Missing second signal**: Need to check whether non-test consumers (sim/agents, runner) also need this orchestration. If `sim/simulator.ts` or `agents/*.ts` implement similar wrapper logic, the fracture is cross-subsystem. If they use a simpler path (e.g., agents only produce fully-resolved moves), the complexity may be test-specific.

**What to look for**: Grep for `completeMoveDecisionSequence` or `resolveMoveDecisionSequence` usage in `packages/engine/src/sim/` and `packages/engine/src/agents/` to determine if production callers face the same orchestration burden.

### toPendingFreeOperationGrant Construction Triplication

**Observation**: The function `toPendingFreeOperationGrant` — converting a grant contract to a pending grant object — is duplicated in `turn-flow-eligibility.ts`, `free-operation-viability.ts`, and inline in `effects-turn-flow.ts`. All three produce the same field set.

**Assessment**: This is single-concept scatter (same function duplicated in 3 files within the kernel), not a cross-subsystem fracture. Deferred to `detect-missing-abstractions`. The natural home for consolidation is `grant-lifecycle.ts`, which already provides grant array operations but lacks the contract-to-pending factory.

## Recommendations

- **Spec-worthy**: Event Side-Effect Manifest — the re-derivation pattern between event-execution and turn-flow-eligibility is a genuine protocol gap that will become more fragile as new side-effect categories are added. A spec should define the manifest type and the single-computation-point contract.
- **Acceptable**: Eligibility override lifecycle, lasting effect lifecycle, grant lifecycle state machine, effect system dispatch, deck structural validation.
- **Needs investigation**: Dual momentum enforcement pathway (verify whether gvar guards and actionRestrictions overlap for the same card), decision resolution caller complexity (verify non-test consumer patterns), toPendingFreeOperationGrant triplication (defer to detect-missing-abstractions).
