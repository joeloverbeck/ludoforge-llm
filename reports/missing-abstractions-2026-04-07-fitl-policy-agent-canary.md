# Missing Abstraction Analysis: FITL PolicyAgent Determinism Canary

**Date**: 2026-04-07
**Input**: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`
**Engine modules analyzed**: ~318 (248 kernel + 35 sim/agents + 34 cnl + 1 contracts)

## Executive Summary

One incomplete abstraction was found — the **speculative probe evaluation boundary** — where catch-classify-defer error handling is scattered across 10+ call sites instead of being absorbed into probe functions that return result types. The codebase is **actively addressing this** (ProbeResult in ticket 116, ZoneFilterEvaluationResult in ticket 117), but the migration is not yet complete. No missing abstractions were found. The effect system and simulator boundary are clean.

## Cluster Summary

| Cluster | Defining files | Workarounds | Density (W/F) | Verdict |
|---------|---------------|-------------|---------------|---------|
| freeOperation | 43 | 25 | 0.58 | Incomplete abstraction (actively improving) |
| grant | 33 | 15 | 0.45 | Overlaps freeOperation — same root cause |
| effect | 47 | 2 | 0.04 | Acceptable |

## Concept Clusters

### freeOperation (Files: 43, Workarounds: 25)

**Defining modules** (22 dedicated + 21 with freeOperation exports):
- `free-operation-*.ts` (22 files): action-domain, captured-sequence-zones, denial-contract, discovery-analysis, execution-context, grant-authorization, grant-bindings, grant-overlap, grant-zod, legality-policy, outcome-policy, overlay, preflight-overlay, seat-resolution, sequence-context-contract, sequence-context-schema, sequence-key, sequence-key-schema, sequence-progression, viability, zone-filter-contract, zone-filter-probe
- Additional exporters: apply-move.ts, legal-moves.ts, legal-choices.ts, event-execution.ts, effects-turn-flow.ts, eval-context.ts, move-runtime-bindings.ts, legality-reasons.ts, validate-effects.ts, validate-gamedef-behavior.ts, pipeline-viability-policy.ts, action-pipeline-predicates.ts, move-decision-sequence.ts, turn-flow-eligibility.ts, turn-flow-invariant-contracts.ts, turn-flow-error.ts, missing-binding-policy.ts, tooltip-normalizer-compound.ts, token-view.ts, schemas-extensions.ts, types-turn-flow.ts

**State machine phases** (explicit in `grant-lifecycle.ts`):
```
sequenceWaiting → ready → offered → consumed/exhausted
                    ↓        ↓
                  skipped   expired
  handled by: effects-turn-flow.ts → grant-lifecycle.ts → phase-advance.ts
```

The grant lifecycle type IS explicit and well-designed — transitions enforce phase preconditions, completion policy, and remaining-use counts. This is NOT a missing state machine.

**The incomplete part**: Speculative probe evaluation during move enumeration. When the kernel checks whether a grant's free-operation moves have viable completions, it runs speculative evaluation that encounters errors (MISSING_BINDING, MISSING_VAR, CHOICE_RUNTIME_VALIDATION_FAILED) because bindings aren't yet resolved. These errors must be classified and deferred:

**Workarounds (catch-classify-defer pattern)**:

| File | Line | Description |
|------|------|-------------|
| `legal-choices.ts` | 278-285 | catch → classifyDiscoveryProbeError → ProbeResult |
| `legal-choices.ts` | 304-311 | catch → classifyDiscoveryProbeError → ProbeResult |
| `legal-choices.ts` | 330-337 | catch → classifyChoiceProbeError → ProbeResult |
| `legal-choices.ts` | 348-355 | catch → classifyChoiceProbeError → ProbeResult |
| `legal-moves.ts` | 386-388 | catch → return false |
| `legal-moves.ts` | 685-690 | catch → return true if FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED |
| `pipeline-viability-policy.ts` | 115-122 | catch → classifyMissingBindingProbeError |
| `action-pipeline-predicates.ts` | 18-32 | catch → classifyMissingBindingProbeError |
| `move-decision-sequence.ts` | 65-75 | catch → classifyMissingBindingProbeError |
| `eval-query.ts` | 46-50 | catch → return null for recoverable errors |
| `eval-query.ts` | 585-592 | catch → return [] for recoverable errors |
| `free-operation-grant-authorization.ts` | 211-214 | catch → classifyError |
| `free-operation-viability.ts` | 587-592 | catch CHOICE_RUNTIME_VALIDATION_FAILED → hasTransportLikeStateChangeFallback() |
| `free-operation-zone-filter-probe.ts` | 45-49 | catch → zoneFilterFailed(error) |

**Workarounds (predicate broadening)**:
- `phase-advance.ts:548-553` — Explicit comment: "the broadened isRequiredPendingFreeOperationGrant predicate makes skippable grants surface as legal moves". Requires a pre-filtering pass (`expireBlockingPendingFreeOperationGrants`) to prevent agent deadlock.
- `free-operation-discovery-analysis.ts:427-431` — MISSING_BINDING || MISSING_VAR both return `true` (grants potential authorization despite missing data)
- `free-operation-grant-authorization.ts:241-245` — `unwrapZoneFilterResult`: deferred → true (broadens to pass)

**Workarounds (heuristic fallback)**:
- `free-operation-viability.ts:348-415` — `hasTransportLikeStateChangeFallback()`: 67-line heuristic that inspects move params for zone/token selections when CHOICE_RUNTIME_VALIDATION_FAILED prevents normal viability evaluation. This compensates for the fact that viability cannot be determined through normal execution when choice validation fails mid-probe.

**FOUNDATIONS alignment**:
- **F5 (One Rules Protocol)**: Satisfied — simulator has zero try/catch blocks, zero compensation handlers. The kernel owns all legality logic.
- **F8 (Determinism)**: Not directly strained by probe errors — ProbeResult's `inconclusive` outcome produces deterministic behavior.
- **F10 (Bounded Computation)**: Satisfied — probe budgets (`STRICT_FREE_OPERATION_PROBE_BUDGETS`) cap speculative evaluation.
- **F11 (Immutability)**: Satisfied — grant lifecycle transitions return new objects.
- **F15 (Architectural Completeness)**: Strained — the catch-classify-defer pattern addresses symptoms (thrown errors) rather than the root cause (probe functions that throw instead of returning result types). The `hasTransportLikeStateChangeFallback` heuristic is a symptom-level patch.

**Diagnosis**: **Incomplete abstraction**. The grant lifecycle state machine exists and is correct. The probe result types (ProbeResult, ZoneFilterEvaluationResult) exist and are correctly designed. But the boundary between "functions that throw" and "functions that return result types" hasn't fully migrated — 10+ call sites still wrap throwing functions in try-catch and manually classify errors, rather than calling probe-native functions that return result types directly.

Recent tickets (116-probe-result-behavioral-contract, 117-zone-filter-evaluation) are actively completing this migration.

---

### grant (Files: 33, Workarounds: 15)

This cluster **overlaps heavily** with freeOperation — 20+ of its 33 defining files are also in the freeOperation cluster. The dedicated grant files are:

- `grant-lifecycle.ts` — Phase transition functions (advanceToReady, markOffered, consumeUse, skipGrant, expireGrant)
- `grant-lifecycle-trace.ts` — Structured trace entries for lifecycle transitions
- `hidden-info-grants.ts` — Grant-based visibility/reveal handling
- `effect-grant-execution-paths.ts` — Grant execution routing
- `sequence-context-linkage-grant-reference.ts` — Sequence context linkage

**Central infrastructure**:
- `missing-binding-policy.ts` — 7 policy contexts, centralized defer/classify decisions
- `eval-error-classification.ts` — hasEvalErrorDeferClass(), isRecoverableEvalResolutionError()
- `eval-error-defer-class.ts` — UNRESOLVED_BINDING_SELECTOR_CARDINALITY defer class
- `probe-result.ts` — ProbeResult<T> discriminated union (legal/illegal/inconclusive)

**FOUNDATIONS alignment**: Same as freeOperation (shared root cause).

**Diagnosis**: **Same root cause as freeOperation** — the speculative probe evaluation boundary. Not a separate missing abstraction. The grant-specific lifecycle type is well-designed and complete.

---

### effect (Files: 47, Workarounds: 2)

**Defining modules**: 13 `effect-*.ts` files + 9 `effects-*.ts` files + 25 other files exporting effect-related symbols.

**Key architecture**:
- Single dispatch table: `effect-dispatch.ts` (TAG_TO_KIND → registry lookup)
- Single registry: `effect-registry.ts` (24 effect handlers)
- Structured error taxonomy: `eval-error-classification.ts`, `eval-error-defer-class.ts`
- Conditional error handling: `selector-resolution-normalization.ts` (passthrough vs. normalize modes)

**Workarounds**:
- `token-filter-runtime-boundary.ts:4-14` — `mapTokenFilterTraversalToTypeMismatch()` error type translation (used in 3 files, minor)
- `effects-turn-flow.ts:236` — `fallbackBaseId` variable for grant ID generation (explicit, documented)

**Simulator compensation**: Zero. No try/catch in any sim file.

**FOUNDATIONS alignment**:
- **F5 (One Rules Protocol)**: Satisfied — centralized dispatch, no duplication
- **F8 (Determinism)**: Satisfied — deterministic dispatch table, no ambient state
- **F15 (Architectural Completeness)**: Satisfied — proper error taxonomy, no symptom-level patches

**Diagnosis**: **Acceptable complexity**. The effect system is a mature, well-structured core abstraction. 47 files reflect the breadth of the DSL instruction set, not scattered concerns. The two minor workarounds are justified and contained.

## Cross-Cutting Findings

**Pattern: catch → classifyError → return ProbeResult/boolean**

This pattern appears in BOTH the freeOperation and grant clusters. The same mechanism repeats across 10+ call sites:

1. A probe function calls an evaluation function that may throw (e.g., `evalCondition`, `resolveQuery`, `executeEffects`)
2. The caller wraps in try-catch
3. The catch block calls a classifier (`classifyMissingBindingProbeError`, `classifyDiscoveryProbeError`, `classifyChoiceProbeError`, `isRecoverableEvalResolutionError`)
4. The classifier returns a ProbeResult (inconclusive) or null (re-throw)

**Files spanning the pattern**: legal-choices.ts (4), legal-moves.ts (2), eval-query.ts (2), pipeline-viability-policy.ts (1), action-pipeline-predicates.ts (1), move-decision-sequence.ts (1), free-operation-grant-authorization.ts (1), free-operation-viability.ts (1), free-operation-zone-filter-probe.ts (1)

**Assessment**: This cross-cutting pattern does NOT warrant its own abstraction — it's the boundary symptom of the incomplete probe migration. The fix is to continue the direction established by ProbeResult and ZoneFilterEvaluationResult: migrate the underlying evaluation functions to return result types instead of throwing, so callers don't need catch blocks. The classifier functions in `missing-binding-policy.ts` would then move from error-classification into result-construction at the source.

**Structural parallel**: `ProbeResult<T>` (legal/illegal/inconclusive) and `ZoneFilterEvaluationResult` (resolved/deferred/failed) have isomorphic shapes. A future spec could consider whether they share a common generic `SpeculativeResult<T>` base, or whether domain-specific names provide better clarity. This is a design question, not a bug.

## Recommendations

- **Spec-worthy**: The **speculative probe evaluation boundary completion** — migrating remaining catch-classify-defer call sites to use probe-native functions returning result types. This continues the direction of tickets 116 and 117. Key targets:
  - `legal-choices.ts` (4 catch blocks → probe functions returning ProbeResult)
  - `eval-query.ts` (2 catch blocks → result-returning variants)
  - `pipeline-viability-policy.ts`, `action-pipeline-predicates.ts`, `move-decision-sequence.ts` (1 catch block each)
  - `free-operation-viability.ts:hasTransportLikeStateChangeFallback` — investigate whether this 67-line heuristic can be replaced by a proper viability probe that handles CHOICE_RUNTIME_VALIDATION_FAILED without heuristic param inspection

- **Acceptable**: **effect** cluster — well-structured, centralized, minimal workarounds, clean sim boundary

- **Needs investigation**: Whether `hasTransportLikeStateChangeFallback` (free-operation-viability.ts:348-415) should be treated as a separate spec or folded into the probe boundary completion spec. It's the densest single workaround (67 lines of heuristic) but may be solvable once the probe boundary is complete.
