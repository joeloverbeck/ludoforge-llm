# Missing Abstraction Analysis: FITL Playbook Golden Test

**Date**: 2026-04-07
**Input**: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`
**Engine modules analyzed**: 127 kernel modules + 5 test helpers + CNL pipeline

## Executive Summary

Two concept clusters exceed the 5-file / 3-workaround threshold. The **free-operation grant** cluster is massive (44 kernel files, 22 dedicated files, 60+ exported functions, 7+ workarounds) but already has an explicit lifecycle state machine (`grant-lifecycle.ts` with `GrantLifecyclePhase`). The real issue isn't a *missing* abstraction — it's an **incomplete** one: the lifecycle type exists but key predicates that determine grant readiness/applicability are scattered across many files, and phase-advance must compensate for predicate broadening with pre-expiration workarounds. The **probe error recovery** cluster (10 catch-and-recover sites across 5 files) represents a missing first-class concept: "speculative move evaluation" has no unified error contract, forcing each call site to independently catch and classify errors.

---

## Concept Clusters

### 1. Free-Operation Grant Lifecycle (Files: 44, Dedicated Files: 22, Exported Functions: 60+, Workarounds: 7+)

**Modules** (22 dedicated `free-operation-*.ts` files + 22 other kernel files referencing the concept):

Dedicated files:
- `free-operation-viability.ts`, `free-operation-grant-authorization.ts`, `free-operation-discovery-analysis.ts`
- `free-operation-grant-overlap.ts`, `free-operation-preflight-overlay.ts`, `free-operation-overlay.ts`
- `free-operation-legality-policy.ts`, `free-operation-denial-contract.ts`, `free-operation-outcome-policy.ts`
- `free-operation-action-domain.ts`, `free-operation-grant-bindings.ts`, `free-operation-seat-resolution.ts`
- `free-operation-execution-context.ts`, `free-operation-zone-filter-probe.ts`, `free-operation-zone-filter-contract.ts`
- `free-operation-sequence-progression.ts`, `free-operation-sequence-key.ts`, `free-operation-sequence-key-schema.ts`
- `free-operation-sequence-context-schema.ts`, `free-operation-sequence-context-contract.ts`
- `free-operation-captured-sequence-zones.ts`, `free-operation-grant-zod.ts`

Cross-cutting files: `legal-moves.ts`, `apply-move.ts`, `turn-flow-eligibility.ts`, `phase-advance.ts`, `grant-lifecycle.ts`, `effects-turn-flow.ts`, `event-execution.ts`, `legal-choices.ts`, `missing-binding-policy.ts`, `effect-context.ts`, `eval-context.ts`, `eval-query.ts`, `resolve-ref.ts`, `trigger-dispatch.ts`, `effect-dispatch.ts`, `move-identity.ts`, `move-runtime-bindings.ts`, `action-applicability-preflight.ts`, `scoped-var-name-resolution.ts`, `scoped-var-runtime-access.ts`, `predicate-value-resolution.ts`, `tooltip-normalizer-compound.ts`

**Lifecycle phases** (explicit in `GrantLifecyclePhase`):
```
sequenceWaiting → ready → offered → consumed/exhausted/skipped/expired
  grant-lifecycle.ts  grant-lifecycle.ts  grant-lifecycle.ts  grant-lifecycle.ts
```

**Key functions** (selection of 60+):
- Creation: `applyGrantFreeOperation`, `resolveEventFreeOperationGrants`
- Authorization: `resolveAuthorizedPendingFreeOperationGrants`, `resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity`
- Readiness: `advanceSequenceReadyPendingFreeOperationGrants`, `hasActiveSeatRequiredPendingFreeOperationGrant`, `isMoveAllowedByRequiredPendingFreeOperationGrant`
- Viability: `isFreeOperationGrantUsableInCurrentState`, `hasLegalCompletedFreeOperationMoveInCurrentState`, `canResolveAmbiguousFreeOperationOverlapInCurrentState`, `resolveFreeOperationGrantViabilityPolicy`
- Discovery: `resolveFreeOperationDiscoveryAnalysis`, `isFreeOperationApplicableForMove`, `isFreeOperationGrantedForMove`, `isFreeOperationAllowedDuringMonsoonForMove`
- Lifecycle: `advanceToReady`, `markOffered`, `consumeUse`, `skipGrant`, `expireGrant`, `transitionReadyGrantForCandidateMove`
- Consumption: `consumeAuthorizedFreeOperationGrant`

**Workarounds**:

1. **`phase-advance.ts:548-553`** — Broadened `isRequiredPendingFreeOperationGrant` predicate causes skippable grants to surface as legal moves. Compensation: pre-expiration of blocking grants runs BEFORE `hasLegal()` to prevent agent deadlock.

2. **`phase-advance.ts:561-571`** — `expireBlockingPendingFreeOperationGrants()` — a recovery mechanism that expires grants that leave state with no legal moves, re-checking afterward. This is a loop-based retry, not a clean state machine transition.

3. **`missing-binding-policy.ts:75`** — `shouldDeferFreeOperationZoneFilterFailure()` — converts zone filter evaluation failures to deferred status instead of failing, used in 4 call sites across the kernel.

4. **`free-operation-viability.ts:698-758`** — Three separate "is this grant usable right now?" predicates (`canResolveAmbiguousFreeOperationOverlapInCurrentState`, `hasLegalCompletedFreeOperationMoveInCurrentState`, `isFreeOperationGrantUsableInCurrentState`) — each computing readiness from scratch against current state rather than having readiness as cached/derived state.

**FOUNDATIONS alignment**:
- **F5 (One Rules Protocol)**: Satisfied — no sim-only shortcuts (0 catch blocks in `sim/`)
- **F8 (Determinism)**: Strained — the `expireBlockingPendingFreeOperationGrants` retry loop in phase-advance depends on execution order of grant expiration
- **F11 (Immutability)**: Satisfied — all transitions return new grant objects
- **F15 (Architectural Completeness)**: **Strained** — the broadened-predicate workaround in phase-advance.ts:548 is explicitly compensating for a predicate that doesn't properly distinguish required vs. skippable grants

**Diagnosis**: **Incomplete abstraction, not missing.** The `GrantLifecyclePhase` state machine exists and is well-structured in `grant-lifecycle.ts`. However, the *readiness/applicability determination* is scattered across `free-operation-viability.ts`, `free-operation-discovery-analysis.ts`, `free-operation-grant-authorization.ts`, and `turn-flow-eligibility.ts` — each computing grant fitness from scratch. The phase-advance workaround suggests the lifecycle type doesn't carry enough information to make skip/expire decisions without re-probing legal moves.

---

### 2. Probe Error Recovery (Files: 5, Catch Sites: 14, Workarounds: 14)

**Modules**:
- `legal-choices.ts` (6 catch blocks)
- `choose-n-option-resolution.ts` (4 catch blocks)
- `pipeline-viability-policy.ts` (2 catch blocks)
- `action-pipeline-predicates.ts` (2 catch blocks)
- `move-decision-sequence.ts` (1 catch block)

**Key functions**: `isChoiceDecisionOwnerMismatchDuringProbe` (10 call sites across 2 files), `shouldDeferMissingBinding` (5 call sites across 4 files), `isEffectErrorCode(error, 'STACKING_VIOLATION')` (2 call sites in 1 file)

**Implicit state machine**:
```
speculative evaluation → success | ownerMismatch | missingBinding | stackingViolation | otherError
  legal-choices.ts       normal    catch→unknown    catch→deferred    catch→illegal       rethrow
  choose-n-option.ts     normal    catch→ambiguous   —                 —                  rethrow
  pipeline-viability.ts  normal    —                catch→unknown      —                  rethrow
  action-predicates.ts   normal    —                catch→unknown      —                  rethrow
  move-decision-seq.ts   normal    —                catch→unknown      —                  rethrow
```

Each call site independently: (a) wraps a move-evaluation call in try/catch, (b) pattern-matches on error type, (c) translates to a domain-specific "inconclusive" status, (d) rethrows unknown errors. The classification logic is duplicated — the same 3 error categories appear across all files with identical catch structure.

**Workarounds**:
- `legal-choices.ts:264-272, 290-298` — Stacking violations during probe converted to `pipelineLegalityFailed` (2 sites, identical code)
- `legal-choices.ts:426-435, 453-456, 628-631, 652-655` — Choice owner mismatch during probe resets legality to `unknown` (4 sites, identical pattern)
- `choose-n-option-resolution.ts:280-282, 307-309, 437-439, 455-457` — Choice owner mismatch during probe returns `ambiguous` outcome (4 sites)
- `pipeline-viability-policy.ts:122`, `action-pipeline-predicates.ts:34`, `move-decision-sequence.ts:174`, `legal-moves.ts:449` — Missing binding deferred (4 sites)

**FOUNDATIONS alignment**:
- **F5 (One Rules Protocol)**: Satisfied — probe errors are kernel-internal
- **F15 (Architectural Completeness)**: **Violated** — 14 identical catch-and-recover blocks are a clear symptom of a missing "probe result" abstraction
- **F10 (Bounded Computation)**: Satisfied — probes are bounded by move enumeration budgets

**Diagnosis**: **Missing abstraction.** The concept of "speculative move evaluation" (probing whether a move is legal/completable without committing to it) has no first-class result type. Instead, callers wrap evaluation in try/catch and pattern-match on error types. A `ProbeResult` type (e.g., `{ outcome: 'legal' | 'illegal' | 'inconclusive' | 'ownerMismatch'; reason?: string }`) returned from probe functions would eliminate all 14 catch blocks, make the probe contract explicit, and prevent future callers from forgetting to handle a probe error category.

---

### 3. Turn Flow Window Management (Files: 36 with "turnFlow", Workarounds: 0)

**Modules**: 36 files reference `turnFlow` — concentrated in turn/phase management.

**Diagnosis**: **Acceptable complexity.** The turn flow concept is inherently cross-cutting (it governs eligibility, phase advance, grant issuance, legal moves). The abstraction boundary is clean: `TurnFlowWindowDef`, `TurnFlowEligibilityDef`, `TurnFlowPendingFreeOperationGrant` are well-defined types. No workarounds found. The high file count reflects the concept's legitimate scope, not a missing abstraction.

---

## Recommendations

- **Spec-worthy**: **Probe Error Recovery** — The 14 catch-and-recover blocks across 5 files with 3 distinct error categories strongly indicate a missing `ProbeResult` abstraction. A spec should define a first-class probe result type and migrate all speculative evaluation call sites to return results instead of throwing.

- **Needs investigation**: **Free-Operation Grant Readiness** — The phase-advance broadened-predicate workaround (phase-advance.ts:548) and the 3 separate "is usable now?" functions suggest the grant lifecycle type may need to carry pre-computed readiness state rather than re-probing legal moves on every check. This is a performance and correctness concern, not necessarily a missing abstraction. Needs deeper investigation into whether caching grant readiness at transition time would eliminate the workarounds.

- **Acceptable**: **Turn Flow Window Management** — Complex but correctly architected. No action needed.
