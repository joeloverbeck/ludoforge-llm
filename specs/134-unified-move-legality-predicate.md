# Spec 134: Unified Move Legality Predicate

**Status**: DRAFT
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 17 (archived; §4 completion landed 2026-04-17 in commit `fd4cc8b4`)
**Source**: Post-ticket analysis from the Spec 17 §4 completion. That work consolidated probe → classifier routing and deleted `deriveDeferredFreeOperationOutcomePolicyVerdict`, but three structurally-duplicated sites of free-operation outcome-policy enforcement remain.

## Overview

Collapse the three surviving sites that each independently decide "is this free-operation move legal under the grant outcome-policy?" into a single `evaluateMoveLegality` predicate. `probeMoveViability` returns its verdict; `classifyMoveAdmissibility` returns its verdict; `applyMove` throws when its verdict is illegal. Today the three sites reach the same answer by duplicating the grant-resolution logic and the `hasLegalCompletedFreeOperationMoveInCurrentState` / `doesMaterialGameplayStateChange` calls; tomorrow they derive their answer from one pure predicate.

## Problem Statement

After Spec 17 §4, outcome-policy legality is still enforced at three sites in the kernel:

1. `packages/engine/src/kernel/apply-move.ts:1911–1962` — `probeMoveViabilityRaw` inline checks for complete- and incomplete-move branches.
2. `packages/engine/src/kernel/move-admissibility.ts` — `classifyFreeOperationOutcomePolicyAdmissibility` (added by Spec 17 §4) layered into the shared classifier.
3. `packages/engine/src/kernel/apply-move.ts:283–300` — `validateFreeOperationOutcomePolicy`, the apply-time gate.

All three call `resolveStrongestRequiredFreeOperationOutcomeGrant` / `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant` with nearly-identical arguments. (1) and (2) further call `hasLegalCompletedFreeOperationMoveInCurrentState`; (3) calls `doesMaterialGameplayStateChange` post-apply.

This is three enforcement points where FOUNDATIONS #5 asks for one. Every future change to the outcome-policy contract has to touch three files and three argument shapes. Every silent drift between them produces exactly the failure class Spec 17 was written to close (a move surfaced as viable by one site, rejected by another, silently no-op'd by a third).

## Goals

- One pure predicate `evaluateMoveLegality(def, state, move, runtime?) -> LegalityVerdict` is the single source of outcome-policy / grant-authorization legality for free-operation moves.
- `probeMoveViabilityRaw`, `classifyMoveAdmissibility`, and `applyMove` all consume its verdict instead of re-deriving it.
- The probe-time / apply-time distinction (verdict vs. throw) is preserved as a *consequence* of consuming the verdict, not as a re-derivation.
- No change to externally-visible verdict codes (`ILLEGAL_MOVE` reasons, admissibility verdict shapes).

## Non-Goals

- No change to what legal-moves enumeration surfaces under a given `(def, state)` — the verdict that each site reaches today remains the verdict each site reaches tomorrow. The only change is that all three reach it through one call site.
- No new outcome policies, no new grant shapes.
- No change to the rewrite layer (`deriveMoveViabilityVerdict`) or the admissibility-classifier verdict taxonomy.
- No change to `applyMove`'s effect-execution path.

## Definitions

### LegalityVerdict

A closed union returned by the predicate:

```ts
type LegalityVerdict =
  | { kind: 'legal' }
  | { kind: 'illegal'; reason: IllegalMoveReason; context: IllegalMoveContext };
```

`IllegalMoveReason` is the existing set (`FREE_OPERATION_NOT_GRANTED`, `FREE_OPERATION_OUTCOME_POLICY_FAILED`, `MOVE_NOT_LEGAL_IN_CURRENT_STATE`, etc.). The verdict carries enough context to reconstruct the existing `illegalMoveError` when a caller wants to throw.

### Call-site consequences

- **Probe (`probeMoveViabilityRaw`)**: on `illegal`, it constructs the corresponding `MoveViabilityResult` with `viable: false`. On `legal`, it proceeds to decision-sequence resolution.
- **Classifier (`classifyMoveAdmissibility`)**: on `illegal`, it returns `{ kind: 'inadmissible', reason: <mapped> }`. The mapping from `IllegalMoveReason` to admissibility reason is explicit and table-driven.
- **Apply (`applyMove` / `validateFreeOperationOutcomePolicy`)**: on `illegal`, it throws via `illegalMoveError(move, verdict.reason, verdict.context)`.

## Contract

### 1. Single source of legality truth

`evaluateMoveLegality(def, state, move, runtime?)` MUST be the sole site in the kernel that decides whether a move is legal under free-operation grant authorization and outcome policy. No other site may independently call `resolveStrongestRequiredFreeOperationOutcomeGrant` or `hasLegalCompletedFreeOperationMoveInCurrentState` for legality purposes.

### 2. Determinism

The predicate is pure: no mutation of `def`, `state`, `move`, or `runtime`. Same inputs → same verdict. Verdict is stable across calls and across serialization round-trips (FOUNDATIONS #8).

### 3. Apply/probe/classifier agreement

For every `(def, state, move)`: the verdict returned by `evaluateMoveLegality` is the verdict consumed by all three sites. The agreement is proven by test, not by inspection (see Required Proof).

### 4. No semantic regressions

The verdict set and reason codes are the same surface the current three sites emit today. Any client that used to receive `{ viable: false, code: 'ILLEGAL_MOVE', context: { reason: 'freeOperationOutcomePolicyFailed', ... } }` MUST continue to receive exactly that shape.

## Required Invariants

1. Grep for `resolveStrongestRequiredFreeOperationOutcomeGrant` / `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant` call sites in `packages/engine/src/kernel/` returns exactly one file (the predicate itself) after migration.
2. The predicate is pure (enforced by a regression test that feeds it immutable inputs and confirms no mutation).
3. For every move M and state S: `evaluateMoveLegality(def, S, M).kind === 'illegal'` ⇔ `applyMove(def, S, M)` throws `ILLEGAL_MOVE`. This is the conformance guard that makes FOUNDATIONS #5 a structural property.

## Foundations Alignment

- **#5 One Rules Protocol**: this spec finishes what Spec 17 started. After Spec 17 §4 there is one *client-boundary* classifier; Spec 134 makes one *implementation* predicate.
- **#14 No Backwards Compatibility**: the three existing duplicated check sites are migrated in the same change; no shim, no alias.
- **#15 Architectural Completeness**: closes the design gap where three sites must agree by discipline. After this spec they agree by construction.
- **#16 Testing as Proof**: the apply/probe/classifier agreement invariant becomes a test assertion, not a reviewer's checklist item.

## Required Proof

### Unit / Kernel Proof

1. `evaluateMoveLegality` is pure — regression test feeds frozen `def`/`state`/`move`, asserts no mutation and stable verdict across repeated invocations.
2. The verdict → `ILLEGAL_MOVE` mapping is exhaustive: for every `IllegalMoveReason` the predicate can emit, there exists a test showing each consumer site (`probeMoveViabilityRaw`, `classifyMoveAdmissibility`, `applyMove`) produces the correct local consequence.
3. Table-driven mapping tests for `classifyMoveAdmissibility`: input `evaluateMoveLegality` verdict → output admissibility verdict, one case per reason code.

### Integration Proof

1. Extend `pending-move-admissibility-parity.test.ts`'s cross-pathway conformance suite with the new invariant: `evaluateMoveLegality(def, S, M).kind === 'legal' ⇔ applyMove(def, S, M)` does not throw `ILLEGAL_MOVE`.
2. The An Loc card-71 / Gulf of Tonkin / seed-1012 regression witnesses continue to pass.
3. `classified-move-parity.test.ts` continues to pass with no per-site recomputation of outcome-policy.

### New Test File

`packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` — unit coverage of the new predicate with:

- one legal fixture (complete free-op move + satisfying grant)
- one `FREE_OPERATION_NOT_GRANTED` fixture (no grant matches)
- one `FREE_OPERATION_OUTCOME_POLICY_FAILED` fixture (grant matches, move no-op)
- one `MOVE_NOT_LEGAL_IN_CURRENT_STATE` fixture (pending grant blocks action)
- purity test (frozen inputs, stable verdict)

## Implementation Direction

### New module

`packages/engine/src/kernel/move-legality-predicate.ts` — exports `evaluateMoveLegality`, `LegalityVerdict`. Imports the grant/outcome helpers it needs; no other kernel module imports those helpers for legality purposes.

### Call-site migrations (same change, no shims)

- `apply-move.ts:1911–1962` — replace the two inline blocks with a single `evaluateMoveLegality` call before the decision-sequence branch.
- `apply-move.ts:283–300` (`validateFreeOperationOutcomePolicy`) — replace with `evaluateMoveLegality` + conditional throw, preserving post-apply `doesMaterialGameplayStateChange` semantics (post-apply state is what the verdict is evaluated against here).
- `move-admissibility.ts` (`classifyFreeOperationOutcomePolicyAdmissibility`) — replace internal grant resolution with a `evaluateMoveLegality` call.

### Touched but not migrated

- `deriveMoveViabilityVerdict` (`viability-predicate.ts`) — unchanged. It operates on the *output* of raw-probe rules, not on grant-outcome-policy logic.

### Consumer (no semantic change expected)

- `prepare-playable-moves.ts` — consumes classifier verdicts only. No code change expected.

## Out of Scope

- Migrating non-free-operation legality checks into the same predicate (e.g., phase gating, action applicability) — possible future spec.
- Per-grant custom outcome policies beyond `mustChangeGameplayState` — separate concern.

## Outcome

TBD.
