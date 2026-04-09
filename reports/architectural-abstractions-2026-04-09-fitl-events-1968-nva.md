# Architectural Abstraction Recovery: fitl-events-1968-nva

**Date**: 2026-04-09
**Input**: packages/engine/test/integration/fitl-events-1968-nva.test.ts
**Engine modules analyzed**: ~225 (198 kernel, 27 CNL)
**Prior reports consulted**: none

## Executive Summary

Cross-subsystem fractures were found at moderate severity. The 846-line test suite exercises event card compilation (CNL to GameDef), runtime execution (legalMoves, applyMove), decision resolution, global marker state machines, and eligibility overrides. Three fractures passed the two-signal minimum: a HIGH-severity hidden seam in the `apply-move.ts` orchestration triangle, and two MEDIUM-severity fractures (eligibility override split protocol and overloaded `effects-choice.ts`). Two candidate abstractions survived validation. Three areas were confirmed as acceptable complexity.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|-----------------|----------------|
| Card Metadata Compilation | 1 | eventDecks, card metadata (title, order, sideMode, period, seatOrder, flavorText, text) | All 15 cards compile with correct metadata; card-41 is single-side, others dual |
| Capability Marker Toggle Effects | 2 | setGlobalMarker, capability tags, unshaded/shaded states | Capability cards encode correct marker toggle effects for both sides |
| Conditional Global Marker State Machines | 3, 5 | if/then/else effects, marker state guards (topGun/migs interaction) | MiGs shaded conditional on topGun: unshaded->inactive vs shaded; runtime blocks correctly |
| Arithmetic & Binding-Chained Resource Effects | 4, 7 | let-bindings, arithmetic (multiply), rollRandom, nested lets, chooseN | Trail-scaled resource gains; die-roll troop removal with guarded chooseN |
| Targeted Token Movement & Placement | 6, 12-15 | removeByPriority, chooseN, targets with selectors, faction filtering, zone routing | Bombing Pause space targeting; War Photographer piece movement and troop placement |
| Momentum & Round-Duration Effects | 6 | lastingEffects, duration:'round', setupEffects, teardownEffects | Bombing Pause momentum toggle with round-scoped lifecycle |
| Global Marker Query & Decision Resolution | 8-11 | chooseOne, globalMarkers query, state filtering, flipGlobalMarker, legalMoves pruning | RAND offers only markers in required state; flip transitions; illegal when no match |
| Executor-Conditional Eligibility Overrides | 16 | eligibilityOverrides, activeSeat condition, cardDriven turnOrderState, pendingEligibilityOverrides | NVA executor gets remain-eligible override; ARVN executor does not; effects execute for both |

## Traceability Summary

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|-------------------|------------|----------|
| kernel/types-core.ts + types-ast.ts + types-turn-flow.ts + types-events.ts (type system) | All | High | Import |
| kernel/initial-state.ts + prng.ts + state-draft.ts (initialization) | All runtime tests (5, 9-16) | High | Import |
| kernel/legal-moves.ts + legal-choices.ts + legal-moves-turn-order.ts (move enumeration) | 7, 8 | High | Import + temporal (20-26 co-changes) |
| kernel/apply-move.ts + apply-move-pipeline.ts (move application) | 3, 5, 8 | High | Import + temporal (22 co-changes) |
| kernel/effects.ts + effects-choice.ts + effect-context.ts (effect execution) | 2, 3, 4, 5, 6, 7 | High | Import + assertion patterns |
| kernel/event-execution.ts (event orchestration) | 5, 8 | High | Import |
| kernel/turn-flow-eligibility.ts + effects-turn-flow.ts (turn flow) | 8 | High | Import + temporal (29 co-changes) |
| kernel/eval-condition.ts + eval-query.ts + eval-value.ts (evaluation) | 3, 7 | High | Import |
| kernel/move-decision-sequence.ts + choice subsystem (decisions) | 4, 7 | High | Import |
| kernel/tag-effect-asts.ts (utility) | 1, 2, 3, 4, 5, 6 | High | Import (direct test import) |
| cnl/staged-pipeline.ts + compiler.ts + compile-effects.ts + macro expansion (compilation) | 1, 2, 3, 4, 6, 7 | High | Import (via getFitlProductionFixture) |
| kernel/spatial.ts + zone-address.ts (spatial model) | 5 | Medium | Naming (zone IDs in assertions) |

## Fracture Summary

| # | Fracture Type | Location | Evidence Sources | Severity |
|---|---------------|----------|------------------|----------|
| 1 | Split protocol | event-execution.ts / turn-flow-eligibility.ts / apply-move.ts | Import chain + temporal coupling (29 co-changes) | MEDIUM |
| 2 | Overloaded abstraction | effects-choice.ts (1542 lines) | Naming analysis + assertion patterns across 3 scenario families | MEDIUM |
| 3 | Hidden seam | apply-move.ts (1943 lines) coupling event-execution.ts and turn-flow-eligibility.ts | Temporal coupling (22-29 co-changes) + import analysis (sideEffectManifest handoff) | HIGH |

## Candidate Abstractions

### Event Side-Effect Protocol

**Kind**: Protocol
**Scope**: event-execution.ts -> apply-move.ts -> turn-flow-eligibility.ts
**Fractures addressed**: #1 (split protocol), #3 (hidden seam)

**Owned truth**: The complete set of post-event state consequences — eligibility overrides, momentum lasting effects, deferred grants, and any future side-effect categories that event cards may produce.

**Invariants**:
- Every event execution produces exactly one `EventSideEffectManifest` (even if empty)
- The manifest is consumed exactly once by the turn-flow layer during `applyTurnFlowEligibilityAfterMove`
- Condition evaluation (`when` clauses) happens in the event-execution context where move bindings are available
- Duration/seat resolution happens in the turn-flow context where window definitions are available
- No side-effect is silently dropped between creation and consumption

**Owner boundary**: `event-execution.ts` owns creation; `turn-flow-eligibility.ts` owns consumption. `apply-move.ts` passes the manifest without inspecting it.

**Modules affected**: `event-execution.ts` (already creates manifest), `apply-move.ts` (pass-through simplification), `turn-flow-eligibility.ts` (already consumes manifest), `types-events.ts` (manifest type definition)

**Tests explained**: Executor-Conditional Eligibility Overrides (family 8), Momentum & Round-Duration Effects (family 6)

**Expected simplification**: Formalizing the manifest as a first-class protocol contract means new side-effect categories (e.g., deferred resource adjustments, conditional phase skips) can be added by extending the manifest type without modifying the orchestration flow in `apply-move.ts`. Currently, adding a new side-effect category requires coordinated changes in 3-4 files.

**FOUNDATIONS alignment**:
- F5 (One Rules Protocol): Aligned — the manifest ensures event side-effects flow through the same pipeline for all clients
- F11 (Immutability): Aligned — manifest is created and passed, never mutated
- F15 (Architectural Completeness): Slightly strained — the current 3-module chain works but adding new side-effect kinds requires coordinated multi-file changes

**Confidence**: Medium
**Counter-evidence**: `EventSideEffectManifest` already names this protocol explicitly. The candidate may be formalizing what already exists rather than discovering something new. If the manifest type has remained stable across multiple event card implementations without requiring structural changes, the current architecture may be sufficient. Check: how many times has the manifest type been modified in the last 6 months? If fewer than 3, the split is stable.

### Marker Effect Domain Separation

**Kind**: Authority boundary
**Scope**: effects-choice.ts -> split into decision-effect and marker-effect modules
**Fractures addressed**: #2 (overloaded abstraction)

**Owned truth**: The marker state mutation lifecycle — set, shift, and flip operations with lattice validation, default state resolution, and state transition legality.

**Invariants**:
- Every marker mutation validates against the marker's lattice definition before applying
- `flipGlobalMarker` is only valid for global markers (not space markers)
- Lattice default state is resolved consistently whether reading or writing
- Marker mutations are atomic (no partial state between set and validation)

**Owner boundary**: A new `effects-markers.ts` module would own all marker mutation effects (setMarker, shiftMarker, setGlobalMarker, shiftGlobalMarker, flipGlobalMarker) and the shared lattice resolution helpers. `effects-choice.ts` would retain decision effects (chooseOne, chooseN, rollRandom).

**Modules affected**: `effects-choice.ts` (split), `effect-registry.ts` (updated kind-to-module mapping)

**Tests explained**: Capability Marker Toggle Effects (family 2), Conditional Global Marker State Machines (family 3), Global Marker Query & Decision Resolution (family 7)

**Expected simplification**: Clearer single-responsibility modules. Decision effects interact with the decision pipeline; marker effects interact with state draft. Currently both change vectors converge on one 1542-line file. After splitting, a change to marker lattice semantics would not require reviewing decision resolution code, and vice versa.

**FOUNDATIONS alignment**:
- F1 (Engine Agnosticism): Aligned — marker operations remain generic
- F14 (No Backwards Compatibility): Aligned — clean split with no compatibility shims needed
- F15 (Architectural Completeness): Aligned — addresses the overloaded abstraction directly

**Confidence**: Medium
**Counter-evidence**: The shared `resolveGlobalMarkerLattice` and `resolveMarkerLattice` helpers create genuine cohesion between the two domains. If marker lattice resolution logic is tightly coupled with choice scope management (`updateChoiceScope`), the split may introduce duplication or awkward cross-module imports. Check: does `updateChoiceScope` reference marker-specific state, or is it purely choice-scoped? If purely choice-scoped, the split is clean.

## Acceptable Architecture

**Event Card Execution Pipeline**: The pipeline from CNL compilation through event-execution orchestration to effect dispatch and eligibility update is correctly layered. Each module has a clear single responsibility: the compiler produces declarative `EventCardDef` with typed ASTs, `event-execution.ts` owns target synthesis and effect sequencing, the generic effect system dispatches individual effects, and `turn-flow-eligibility.ts` handles post-execution eligibility. The complexity is inherent in the FITL domain (event cards genuinely combine targeting, effects, and eligibility consequences) and is not an architectural deficiency.

**Decision Resolution System**: `move-decision-sequence.ts` is a thin coordinator that delegates to `decision-sequence-satisfiability.ts`, `move-decision-discoverer.ts`, and `choice-option-policy.ts`. The test helpers (`decision-param-helpers.ts`, `decision-key-matchers.ts`) provide test ergonomics without duplicating kernel logic — they call the kernel's `completeMoveDecisionSequence` and `resolveMoveDecisionSequence` directly. This is well-factored.

**Global Marker State Machine**: Authority is cleanly partitioned. `effects-choice.ts` writes marker state. `eval-query.ts` reads and enumerates markers for decision option generation. `legal-moves.ts` uses the evaluation subsystem to determine if events have legal options. The `state.globalMarkers` field on `GameState` is the single source of truth, and all modules read/write through it. The lattice definition on `GameDef` is the single source of valid states.

## Needs Investigation

**A. Projection Drift — globalMarker defaultState resolution**
- Resolution (2026-04-09): closed as acceptable duplication via `ARCHINVEST-001`.
- Evidence: both live paths still resolve the lattice by `id` and use the same `state.globalMarkers?.[markerId] ?? lattice.defaultState` fallback semantics. The read path filters unknown markers while the write path throws, which matches their API responsibilities rather than indicating drift.
- History check: six-month `git log` plus line history showed no semantic divergence in the fallback logic. `eval-query.ts` introduced the read path once in `3e0da724`; later `effects-choice.ts` edits changed typing/signatures and mutable cursor plumbing, not marker fallback semantics.

**B. Decision Resolution Split Protocol**
- Signal found: The test helper `decision-param-helpers.ts` reimplements a decision resolution loop using `completeMoveDecisionSequence`. This could indicate the kernel's public API is insufficient for common test patterns.
- Second signal needed: Check if other test files use the same helper pattern, or if the helper has diverged from the kernel's resolution logic. If the helper is a thin wrapper with no behavioral drift, it's acceptable test ergonomics.

**C. CNL Compile-Effects to Kernel AST Bridge**
- Signal found: 25 git co-changes between `compile-effects.ts` and `schemas-ast.ts`. The compiler imports `chooseOneBuilder` and `chooseNBuilder` from `kernel/ast-builders.ts`.
- Second signal needed: Determine if AST schema changes routinely break the compiler in ways that require non-trivial fixes. If changes are always mechanical (add field to schema, add field to compiler), this is expected coupling for a compiler targeting an AST, not a fracture.

## Recommendations

- **Spec-worthy**: None immediately. Both candidates are medium-confidence and the counter-evidence is substantive. Before writing specs, verify the counter-evidence checks:
  - For Candidate 1: Count `EventSideEffectManifest` type modifications in last 6 months. If <3, defer.
  - For Candidate 2: Check whether `updateChoiceScope` references marker state. If not, proceed with spec.
- **Acceptable**: Event card execution pipeline, decision resolution system, global marker state machine
- **Needs investigation**: globalMarker defaultState projection drift (A), decision resolution test helper drift (B), CNL-kernel AST bridge coupling (C)
