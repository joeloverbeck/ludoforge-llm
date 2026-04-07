# Missing Abstraction Analysis: FITL Playbook Golden Test

**Date**: 2026-04-07 (second pass)
**Input**: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`
**Engine modules analyzed**: ~300 (250 kernel + 89 cnl + 18 contracts + 13 sim)

## Executive Summary

Three concept clusters exceed the workaround-density threshold: **freeOperation** (23 files, density 0.61), **decision/choice** (15 files, density 0.67), and **turnFlow** (18 files, density 0.44). However, a closer architectural examination reveals that the kernel already has explicit lifecycle types and centralized policies for most of these. The workarounds are not symptoms of *missing* abstractions but rather of an *incomplete* abstraction: **discovery-time uncertainty classification**. The `ProbeResult` type exists but callers in 13+ files independently interpret "inconclusive" outcomes with different fallback strategies, and free-operation zone-filter deferral logic is scattered across 5+ catch blocks with a centralized-but-not-fully-used policy in `missing-binding-policy.ts`. The sim directory has zero compensation handlers — the kernel/sim boundary is clean (FOUNDATIONS §5 satisfied).

## Cluster Summary

| Cluster | Files | Workarounds | Density | Verdict |
|---------|-------|-------------|---------|---------|
| freeOperation | 23 named, 97 referencing | 14 | 0.61 | Incomplete abstraction |
| decision/choice | 15 named, 49 referencing | 10 | 0.67 | Incomplete abstraction |
| turnFlow | 18 named, 65 referencing | 8 | 0.44 | Acceptable complexity |
| effect | 37 named | 6 | 0.16 | Acceptable complexity |
| window | 1 named, 37 referencing | 2 | 0.05 | Acceptable complexity |

## Concept Clusters

### 1. freeOperation (Files: 23, Functions: ~153, Workarounds: 14)

**Modules** (23 named files in `kernel/`):
`free-operation-viability.ts`, `free-operation-discovery-analysis.ts`, `free-operation-grant-authorization.ts`, `free-operation-zone-filter-probe.ts`, `free-operation-zone-filter-contract.ts`, `free-operation-seat-resolution.ts`, `free-operation-sequence-context-schema.ts`, `free-operation-legality-policy.ts`, `free-operation-denial-contract.ts`, `free-operation-execution-context.ts`, `free-operation-sequence-progression.ts`, `free-operation-sequence-context-contract.ts`, `free-operation-grant-overlap.ts`, `free-operation-preflight-overlay.ts`, `free-operation-overlay.ts`, `free-operation-sequence-key-schema.ts`, `free-operation-captured-sequence-zones.ts`, `free-operation-grant-bindings.ts`, `free-operation-sequence-key.ts`, `free-operation-action-domain.ts`, `free-operation-outcome-policy.ts`, `free-operation-grant-zod.ts`, `free-operation-grant-authorization.ts`

Plus: `grant-lifecycle.ts`, `grant-lifecycle-trace.ts`, `missing-binding-policy.ts`, `contracts/turn-flow-free-operation-grant-contract.ts`

**State machine phases** (explicit in `grant-lifecycle.ts`):
```
sequenceWaiting → ready → offered → exhausted
                    ↓         ↓
                  skipped   expired
  handled by: grant-lifecycle.ts (transitions)
              free-operation-viability.ts (phase assignment at line 76)
              free-operation-sequence-progression.ts (readiness resolution)
              free-operation-discovery-analysis.ts (filtering by phase)
              turn-flow-eligibility.ts (lifecycle orchestration)
```

**Workarounds** (14 sites):
- `free-operation-viability.ts:587` — catch CHOICE_RUNTIME_VALIDATION_FAILED, invoke `hasTransportLikeStateChangeFallback()` as recovery
- `free-operation-viability.ts:348` — 67-line `hasTransportLikeStateChangeFallback()` heuristic that detects zone-transfer-like moves despite validation failure
- `free-operation-discovery-analysis.ts:101` — catch FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED with MISSING_BINDING, push to `unresolvedZoneFilterGrants` array instead of throwing
- `free-operation-discovery-analysis.ts:397` — catch zone filter error, check `shouldDeferZoneFilterFailure()`, conditional propagation
- `free-operation-discovery-analysis.ts:118` — broadened OR logic: falls back to unresolved grants when no zone-matched grants exist
- `free-operation-grant-authorization.ts:192` — catch zone filter base evaluation error, defer if applicable, return permissive `true`
- `free-operation-grant-authorization.ts:216` — catch zone filter probe error, same deferral pattern
- `free-operation-zone-filter-probe.ts:40` — MISSING_BINDING rebinding retry loop (catch-and-retry up to N times)
- `missing-binding-policy.ts:93-112` — `shouldDeferFreeOperationZoneFilterFailure()` — broadened multi-condition OR for MISSING_BINDING + MISSING_VAR deferral
- `free-operation-viability.ts:76` — phase assignment scattered (not in grant-lifecycle.ts)
- `free-operation-sequence-progression.ts:64-107` — redundant "readiness" check (blocking grant list empty)
- `free-operation-discovery-analysis.ts:159-168` — redundant phase === 'ready' filter
- `free-operation-captured-sequence-zones.ts:9-14` — redundant "captured zones empty" check
- `free-operation-grant-authorization.ts:133` — redundant "zone candidates empty" check

**FOUNDATIONS alignment**:
- §5 (One Rules Protocol): Satisfied — sim has zero freeOperation compensations
- §8 (Determinism): Not violated — deferral policies are deterministic given same inputs
- §15 (Architectural Completeness): Strained — 6 catch-and-defer blocks implement essentially the same "zone filter can't be evaluated yet, defer" pattern with slight variations. The centralized policy exists (`shouldDeferFreeOperationZoneFilterFailure`) but is not uniformly used at all call sites. Some call sites catch errors and apply their own deferral logic.

**Diagnosis**: **Incomplete abstraction**. The grant lifecycle state machine in `grant-lifecycle.ts` is well-designed with explicit phases and transitions. However, **zone-filter evaluation deferral** is an implicit sub-state-machine scattered across 6 catch blocks. The `shouldDeferFreeOperationZoneFilterFailure` policy centralizes the *decision* but not the *recovery flow*. Each caller independently catches, defers, and returns a permissive/fallback result. A `ZoneFilterEvaluationResult` type that carries `resolved | deferred | failed` status — rather than throwing and catching — would eliminate the catch-block scatter.

---

### 2. decision/choice (Files: 15 named, Functions: ~72, Workarounds: 10)

**Modules** (15 named files):
`decision-scope.ts`, `decision-sequence-satisfiability.ts`, `move-decision-completion.ts`, `move-decision-discoverer.ts`, `move-decision-sequence.ts`, `first-decision-compiler.ts`, `choice-target-kinds.ts`, `choice-option-policy.ts`, `choice-options-runtime-shape-contract.ts`, `choice-options-runtime-shape-diagnostic.ts`, `choice-options-runtime-shape-diagnostic-rendering.ts`, `effects-choice.ts`, `legal-choices.ts`, `choose-n-cardinality.ts`, `choose-n-session.ts`

Plus: `choose-n-selected-validation.ts`, `choose-n-option-resolution.ts`, `missing-binding-policy.ts`, `probe-result.ts`

**State machine phases** (implicit across multiple files):
```
probe → classify → resolve
  legal | inconclusive | illegal
    ↓          ↓            ↓
  admit    degrade→unknown   deny
  handled by: move-decision-sequence.ts    missing-binding-policy.ts    legal-choices.ts
              legal-choices.ts             decision-sequence-satisfiability.ts
              choose-n-option-resolution.ts
```

**Workarounds** (10 sites):
- `choice-option-policy.ts:44` — `allowIllegalFallback`: permits selection from illegal options when legal/unknown exhausted
- `move-decision-sequence.ts:63-74` — catch MISSING_BINDING, convert to `{ outcome: 'inconclusive' }` via `classifyMissingBindingProbeError()`
- `move-decision-sequence.ts:202` — `outcome === 'inconclusive' ? 'unknown' : result.value!` — silent degradation
- `legal-choices.ts:230, 472, 491, 662, 678` — five `outcome === 'inconclusive'` checks, each shifting status to `'unknown'` legality (5 sites with slightly different handling)
- `decision-sequence-satisfiability.ts:122-153` — three nested budget checks (maxDecisionProbeSteps, maxDeferredPredicates, maxParamExpansions), each returning 'unknown' on exhaustion
- `legal-choices.ts:594-627` — hybrid resolution: when combinations exceed 1024, switch to approximate singleton-probe + witness-search strategy
- `choose-n-option-resolution.ts:327, 357, 486, 507` — four `outcome === 'inconclusive'` checks, parallel to legal-choices.ts pattern

**ProbeResult spread**: The `ProbeResult` type (defined in `probe-result.ts`) is referenced in 13 files. Each consumer independently handles `'inconclusive'` with its own fallback strategy:
- Some degrade to `'unknown'` legality
- Some continue enumeration with reduced confidence
- Some silently return early with `complete: false`

**FOUNDATIONS alignment**:
- §5 (One Rules Protocol): Satisfied — no sim compensations for decision logic
- §10 (Bounded Computation): Satisfied — budget-driven degradation is the correct response to unbounded enumeration
- §15 (Architectural Completeness): Strained — the `ProbeResult` type defines outcomes but doesn't carry *what to do next*. Each of 13 consumers re-implements the "inconclusive → degrade to unknown" or "inconclusive → skip" transition. The result type is data without behavior.

**Diagnosis**: **Incomplete abstraction**. `ProbeResult` correctly identifies outcomes (legal/illegal/inconclusive) but provides no behavioral contract for what callers should do with each outcome. The `classifyMissingBindingProbeError` in `missing-binding-policy.ts` centralizes error→outcome classification, but the outcome→action mapping is scattered across 13 consumer files. A `ProbeResultHandler<T>` pattern or an `applyProbePolicy()` utility that encapsulates the fallback chain (legal→use, inconclusive→degrade, illegal→deny) would reduce the scatter. The budget-driven degradation in `decision-sequence-satisfiability.ts` is architecturally sound — it's the correct response to bounded computation (FOUNDATIONS §10).

---

### 3. turnFlow (Files: 18 named, Functions: ~160, Workarounds: 8)

**Modules** (18 named files across kernel/ and contracts/):
`turn-flow-lifecycle.ts`, `turn-flow-eligibility.ts`, `turn-flow-action-class.ts`, `turn-flow-seat-order-policy.ts`, `turn-flow-active-seat-invariant-surfaces.ts`, `turn-flow-runtime-invariants.ts`, `turn-flow-invariant-contracts.ts`, `turn-flow-invariant-contract-types.ts`, `turn-flow-error.ts`, `turn-flow-deferred-lifecycle-trace.ts`, `effects-turn-flow.ts`, `types-turn-flow.ts`, `compile-turn-flow.ts`, `turn-flow-contract.ts`, `turn-flow-action-class-contract.ts`, `turn-flow-linked-window-contract.ts`, `turn-flow-interrupt-selector-contract.ts`, `turn-flow-free-operation-grant-contract.ts`

**Workarounds** (8 sites):
- `effects-turn-flow.ts:236-237` — fallback ID generation when explicit grant.id missing
- `turn-flow-eligibility.ts:442-449` — silent `continue` when seat resolution fails for grants
- `turn-flow-eligibility.ts:413-425` — defensive logic for `strictInOrder` vs `implementWhatCanInOrder` policies
- `turn-flow-eligibility.ts:277` — silent skip of invalid override windows
- `turn-flow-eligibility.ts:233` — silent continuation if grant not viable
- `turn-flow-eligibility.ts:115-116, 139-140` — heavy `?? null` coalescing patterns
- `turn-flow-eligibility.ts:986-1023` — deferred event effect queuing system with batch dependencies
- `turn-flow-eligibility.ts` (pervasive) — defensive object spreading (~12 instances of conditional field inclusion)

**FOUNDATIONS alignment**:
- §5 (One Rules Protocol): Satisfied — zero sim compensations
- §15 (Architectural Completeness): Satisfied — the workarounds are concentrated in `turn-flow-eligibility.ts` (a 1000+ line file that is the orchestration hub). The defensive patterns are not scattered — they're localized to one file that handles the inherently complex task of sequencing grants across multiple dimensions (batch ordering, seat eligibility, window overrides, monsoon rules).

**Diagnosis**: **Acceptable complexity**. The turn-flow cluster is large but architecturally coherent. The workarounds concentrate in `turn-flow-eligibility.ts`, which is the legitimate orchestration point. The defensive null-coalescing and silent `continue` patterns reflect real business rules (invalid grants should be skipped, not crash the game). The file is long (~1000+ lines) and could benefit from extraction, but this is a file-size concern, not a missing-abstraction concern. The deferred event effect queuing (lines 986-1023) is a genuine feature, not a workaround.

---

### 4. effect (Files: 37, Functions: many, Workarounds: 6)

**Modules**: 37 files across kernel/ and cnl/ covering the full effect compilation and execution pipeline.

**Workarounds** (6 sites):
- `zobrist-phase-hash.ts:12` — "safety-net" patch function for mutations outside mutable `applyEffects` scope
- `effects-token.ts:26` — immutable spread fallback when DraftTracker not present
- `effects-turn-flow.ts:236-237` — fallback ID generation (counted in turnFlow cluster too)
- `effects-choice.ts:548, 1237` — error wrapping (rethrow as CHOICE_RUNTIME_VALIDATION_FAILED)
- `effects-reveal.ts:26-30` — catch token filter error, map to type mismatch

**FOUNDATIONS alignment**: All satisfied. The effect system is well-stratified: compilation (cnl), dispatch (kernel/effect-dispatch), and per-domain execution (effects-token, effects-choice, etc.).

**Diagnosis**: **Acceptable complexity**. The effect system is large because it covers many game mechanics (token, choice, var, resource, reveal, subset, binding, control, turn-flow). Workaround density is very low (0.16). The zobrist safety-net is architecturally intentional — it's the performance optimization path described in FOUNDATIONS §11 (scoped internal mutation exception).

---

### 5. window (Files: 1 named, 37 referencing, Workarounds: 2)

**Workarounds**: 1 diagnostic fallback suggestion + 1 silent skip of invalid windows in `turn-flow-eligibility.ts`.

**Diagnosis**: **Acceptable complexity**. Windows are a first-class concept in the turn-flow type system (`types-turn-flow.ts` defines 48+ exports including window types). The validation is appropriately placed in `turn-flow-linked-window-contract.ts`.

---

## Cross-Cutting Finding: Discovery-Time Uncertainty

The three highest-density clusters share a common pattern: **discovery-time uncertainty** — the kernel must enumerate legal moves/choices before all bindings are resolved. This creates a classification problem:

```
Evaluation attempt during discovery
         ↓
   binding present?
    ↙         ↘
  yes          no
   ↓            ↓
evaluate    classify as inconclusive/deferred
   ↓            ↓
legal/illegal   each caller independently decides what to do
                  ↙       ↓          ↘
              degrade   skip     return permissive
              to unknown  quietly  fallback result
```

**Where it manifests**:
1. **ProbeResult** (`probe-result.ts`) — `outcome: 'inconclusive'` handled in 13 files
2. **Zone filter deferral** (`missing-binding-policy.ts`) — `shouldDeferFreeOperationZoneFilterFailure()` and 6 catch blocks in free-operation files
3. **Budget-driven degradation** (`decision-sequence-satisfiability.ts`) — 3 budget checks all returning `'unknown'`

**What exists**: `ProbeResult` type, `classifyMissingBindingProbeError()`, `shouldDeferMissingBinding()`, `shouldDeferFreeOperationZoneFilterFailure()`

**What's missing**: A unified "what to do with uncertainty" contract. The classification (error → inconclusive) is centralized. The response (inconclusive → degrade/skip/permit) is scattered. Each consumer re-implements the fallback chain.

---

## Sim Boundary Assessment

**Finding**: Zero compensation handlers in `packages/engine/src/sim/`. The sim directory imports from the kernel's public API and does not catch or work around kernel errors. This is a strong positive signal that FOUNDATIONS §5 (One Rules Protocol) is fully satisfied. The kernel provides a clean, complete protocol that the sim consumes without patching.

---

## Recommendations

### Spec-worthy

1. **Discovery-Time Uncertainty Protocol** — The `ProbeResult` type needs a behavioral extension: either a `ProbeResultHandler<T>` pattern that encapsulates the fallback chain (legal→use, inconclusive→policy, illegal→deny), or a `resolveProbeOutcome()` utility that callers invoke instead of independently implementing the inconclusive→unknown/skip/permit branching. This would reduce the 13-file scatter to a single policy point. Scope: `probe-result.ts`, `missing-binding-policy.ts`, `legal-choices.ts`, `choose-n-option-resolution.ts`, `move-decision-sequence.ts`, `action-pipeline-predicates.ts`, `legal-moves.ts`.

2. **Zone Filter Evaluation Result Type** — Replace the throw-and-catch pattern in free-operation zone-filter evaluation with a result type (`resolved | deferred | failed`). The centralized policy `shouldDeferFreeOperationZoneFilterFailure()` would become the *constructor* of this result rather than a *post-hoc classifier* of caught exceptions. This eliminates 6 catch blocks across `free-operation-grant-authorization.ts`, `free-operation-discovery-analysis.ts`, and `free-operation-zone-filter-probe.ts`.

### Acceptable

- **turnFlow** — Large but architecturally coherent. Workarounds concentrate in the orchestration hub (`turn-flow-eligibility.ts`). File size (~1000+ lines) is a refactoring concern, not an abstraction concern.
- **effect** — Well-stratified system with very low workaround density. The zobrist safety-net is architecturally intentional.
- **window** — First-class concept in the type system with appropriate validation placement.

### Needs investigation

None. All clusters were fully assessed.
