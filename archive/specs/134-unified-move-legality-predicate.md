# Spec 134: Unified Move Legality Predicate

**Status**: COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 17 (archived; §4 completion landed 2026-04-17 in commit `fd4cc8b4`)
**Source**: Post-ticket analysis from the Spec 17 §4 completion. That work consolidated probe → classifier routing and deleted `deriveDeferredFreeOperationOutcomePolicyVerdict`, but three structurally-duplicated sites of free-operation outcome-policy enforcement remain.

## Overview

Collapse the three surviving sites that each independently decide "is this free-operation move legal under the grant outcome-policy?" into a single `evaluateMoveLegality` predicate, evaluated uniformly pre-apply. `probeMoveViability` returns its verdict; `classifyMoveAdmissibility` returns its verdict; `applyMove` throws when its verdict is illegal. Today the three sites reach the same answer by duplicating the grant-resolution logic and reconciling two computation strategies (predictive probe at probe/classify, retrospective delta at apply); tomorrow they derive their answer from one pure predicate using one computation strategy.

## Problem Statement

After Spec 17 §4, outcome-policy legality is still enforced at three sites in the kernel:

1. `packages/engine/src/kernel/apply-move.ts:1912–1963` — `probeMoveViabilityRaw` inline checks for complete- and incomplete-move branches.
2. `packages/engine/src/kernel/move-admissibility.ts:84–110` — `classifyFreeOperationOutcomePolicyAdmissibility` (added by Spec 17 §4) layered into the shared classifier, with helper `resolveOutcomePolicyGrantForAdmissibility` at lines 42–70.
3. `packages/engine/src/kernel/apply-move.ts:284–301` — `validateFreeOperationOutcomePolicy`, the apply-time gate (currently post-apply, called at `apply-move.ts:1428`).

Sites (1) and (2) call `resolveStrongestRequiredFreeOperationOutcomeGrant` / `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant` and `hasLegalCompletedFreeOperationMoveInCurrentState` (or `doesCompletedProbeMoveChangeGameplayState` for Site 1's complete branch) against pre-apply state. Site (3) calls `resolveStrongestRequiredFreeOperationOutcomeGrant` against pre-apply state but evaluates state change with `doesMaterialGameplayStateChange(before, after)` post-`executeMoveAction`. Sites (1) and (2) pass `FREE_OPERATION_GRANT_MATCH_EVALUATION` as the surface argument; Site (3) defaults to `FREE_OPERATION_GRANT_CONSUMPTION`.

This is three enforcement points where FOUNDATIONS #5 asks for one, and two reconciled computation strategies where Foundation #8 (determinism) makes one sufficient. Every future change to the outcome-policy contract has to touch three files, reconcile the pre-apply vs post-apply split, and remember the surface-ID divergence. Every silent drift between the three sites produces exactly the failure class Spec 17 was written to close (a move surfaced as viable by one site, rejected by another, silently no-op'd by a third). Under Foundation #8, the predictive probe and the retrospective delta MUST yield identical verdicts for the same `(def, state, move)`; any divergence is itself a kernel bug that the unified predicate surfaces.

## Goals

- One pure predicate `evaluateMoveLegality(def, state, move, runtime?) -> LegalityVerdict` is the single source of outcome-policy / grant-authorization legality for free-operation moves.
- `probeMoveViabilityRaw`, `classifyMoveAdmissibility`, and `applyMove` all consume its verdict instead of re-deriving it.
- All three sites evaluate legality pre-apply using the same computation strategy (probe-based forecast). Site 3's current post-apply audit migrates to a pre-apply forecast, positioned before `executeMoveAction`.
- The internal branching between complete- and incomplete-move state-change checks, and the grant-resolution surface ID, are both owned by the predicate — external callers do not configure them.
- No change to externally-visible verdict codes (`ILLEGAL_MOVE` reasons, admissibility verdict shapes).

## Non-Goals

- No change to what legal-moves enumeration surfaces under a given `(def, state)` — the verdict that each site reaches today remains the verdict each site reaches tomorrow. The only change is that all three reach it through one call site and one evaluation strategy.
- No new outcome policies, no new grant shapes.
- No change to the rewrite layer (`deriveMoveViabilityVerdict`) or the admissibility-classifier verdict taxonomy.
- No change to `applyMove`'s effect-execution path other than relocating the outcome-policy gate from post-`executeMoveAction` to pre-`executeMoveAction`.

## Definitions

### LegalityVerdict

A closed union returned by the predicate:

```ts
type LegalityVerdict =
  | { kind: 'legal' }
  | { kind: 'illegal'; reason: IllegalMoveReason; context: IllegalMoveContext };
```

`IllegalMoveReason` is the existing set defined at `packages/engine/src/kernel/runtime-reasons.ts:34–53`, including `FREE_OPERATION_NOT_GRANTED`, `FREE_OPERATION_OUTCOME_POLICY_FAILED`, and `MOVE_NOT_LEGAL_IN_CURRENT_STATE`. `IllegalMoveContext` is defined at `packages/engine/src/kernel/runtime-error.ts:147`. The verdict carries enough context to reconstruct the existing `illegalMoveError` when a caller wants to throw.

### Call-site consequences

- **Probe (`probeMoveViabilityRaw`)**: on `illegal`, it constructs the corresponding `MoveViabilityResult` with `viable: false`. On `legal`, it proceeds to decision-sequence resolution. Both complete-move and incomplete-move branches consume the same predicate.
- **Classifier (`classifyMoveAdmissibility`)**: on `illegal`, it returns `{ kind: 'inadmissible', reason: <mapped> }`. The mapping from `IllegalMoveReason` to admissibility reason is explicit and table-driven.
- **Apply (`applyMove`)**: on `illegal`, it throws via `illegalMoveError(move, verdict.reason, verdict.context)` *before* `executeMoveAction` runs. The current post-apply `validateFreeOperationOutcomePolicy` is deleted, not replaced in place.

### Complete- vs. incomplete-move branching

Internally, the predicate branches on whether the move is complete in the decision-sequence sense:

- **Complete move**: uses `doesCompletedProbeMoveChangeGameplayState` (probe-based state-change forecast, defined at `packages/engine/src/kernel/free-operation-viability.ts:440`) to decide whether the move satisfies the grant's `mustChangeGameplayState` policy.
- **Incomplete move**: uses `hasLegalCompletedFreeOperationMoveInCurrentState` (defined at `packages/engine/src/kernel/free-operation-viability.ts:719`) to decide whether any legal completion of the move satisfies the grant.

Both branches live inside the predicate. Callers pass `state` and the move; the predicate selects the branch and returns a single `LegalityVerdict`.

### Surface-ID discipline

The predicate internally passes `FREE_OPERATION_GRANT_MATCH_EVALUATION` as the surface argument when calling `resolveStrongestRequiredFreeOperationOutcomeGrant` / `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant`. This unifies the current divergence where Sites 1 and 2 passed this surface but Site 3 (the current consumption-phase gate) defaulted to `FREE_OPERATION_GRANT_CONSUMPTION`. Under the uniform pre-apply migration, Site 3 is no longer a consumption gate — it is a match-evaluation gate like Sites 1 and 2 — so the match-evaluation surface is correct for all callers.

**Diagnostic-surface migration**: callers or tests that currently observe `FREE_OPERATION_GRANT_CONSUMPTION` on apply-time zone-filter-evaluation failures will now observe `FREE_OPERATION_GRANT_MATCH_EVALUATION`. This is the one observable behavioral shift introduced by the spec; it is a diagnostic-surface change only, not a verdict-code change.

## Contract

### 1. Single source of legality truth

`evaluateMoveLegality(def, state, move, runtime?)` MUST be the sole place in the kernel where free-operation outcome-policy / grant-authorization legality is decided. External callers (`probeMoveViabilityRaw`, `classifyMoveAdmissibility`, `applyMove`) consume its verdict and never independently call the grant-resolution or completion-legality helpers for legality purposes.

Non-legality uses of these helpers are explicitly exempt and documented in §Implementation Direction — Touched but not migrated: `legal-moves.ts:729` (enumeration surfacing policy — required grants are shown regardless of outcome policy for obligation visibility) and `grant-lifecycle.ts:408` (grant state-machine transitions). Primitive composition inside the predicate's own implementation dependency tree (e.g., `hasLegalCompletedProbeMove` at `free-operation-viability.ts:626` calling grant resolution as part of completion-legality computation) is internal detail of the primitive, not a separate decision site.

### 2. Determinism and purity

The predicate is pure: no mutation of `def`, `state`, `move`, or `runtime`. Same inputs → same verdict. Verdict is stable across calls and across serialization round-trips (FOUNDATIONS #8).

### 3. Apply/probe/classifier agreement

For every `(def, state, move)`: the verdict returned by `evaluateMoveLegality(def, state, move)` is the verdict consumed by all three sites. Specifically, `evaluateMoveLegality(def, S, M).kind === 'legal'` ⇔ `applyMove(def, S, M)` does not throw `ILLEGAL_MOVE`. The equivalence holds unconditionally because apply-time evaluation is now pre-apply, not post-apply — the same `(def, state, move)` that the predicate receives is the one that `applyMove` gates on.

### 4. Pre/post-apply equivalence

For every `(def, state, move)` where the move is otherwise applicable, the predicate's pre-apply state-change forecast MUST agree with the post-apply state-change audit. Formally:

> `doesCompletedProbeMoveChangeGameplayState(def, S, M) === doesMaterialGameplayStateChange(S, applyMove(def, S, M).newState)`

This is guaranteed by Foundation #8 and is proven by a property test. Any divergence discovered during implementation is a probe bug and MUST be fixed, not papered over with a dual-mode signature.

### 5. No semantic regressions

The verdict set and reason codes are the same surface the current three sites emit today. Any client that used to receive `{ viable: false, code: 'ILLEGAL_MOVE', context: { reason: 'freeOperationOutcomePolicyFailed', ... } }` MUST continue to receive exactly that shape. The only observable change is the surface ID on apply-time zone-filter-evaluation failures (see §Definitions — Surface-ID discipline).

## Required Invariants

1. **Single-decision-site invariant (semantic)**: outcome-policy legality decisions for free-operation moves are made in exactly one place — `evaluateMoveLegality`. External callers route through it; non-legality uses of grant-resolution helpers are explicitly enumerated and justified (see §Implementation Direction — Touched but not migrated).
2. **Purity**: the predicate is pure, enforced by a regression test that feeds it frozen inputs and confirms no mutation.
3. **Apply-time agreement**: for every `(def, S, M)`: `evaluateMoveLegality(def, S, M).kind === 'illegal'` ⇔ `applyMove(def, S, M)` throws `ILLEGAL_MOVE`. This is the structural expression of Foundation #5.
4. **Pre/post equivalence**: for every `(def, S, M)`: the pre-apply predicate's state-change forecast agrees with the post-apply state-change audit, per Contract §4. Enforced by property test across a representative fixture corpus.

## Foundations Alignment

- **#5 One Rules Protocol**: this spec finishes what Spec 17 started. After Spec 17 §4 there is one *client-boundary* classifier; Spec 134 makes one *implementation* predicate, consumed uniformly by probe, classifier, and apply.
- **#8 Determinism**: uniform pre-apply evaluation, combined with the pre/post-equivalence invariant, makes determinism a structural property rather than an assumption. A probe that fails to predict real execution is a bug the invariant surfaces.
- **#9 Replay, Telemetry, and Auditability**: unified `FREE_OPERATION_GRANT_MATCH_EVALUATION` surface for all legality-related zone-filter-evaluation failures gives deterministic diagnostic routing.
- **#14 No Backwards Compatibility**: the three existing duplicated check sites are migrated in the same change; no shim, no alias. Site 3's post-apply gate is deleted, not deprecated.
- **#15 Architectural Completeness**: closes the design gap where three sites must agree by discipline and where pre/post-apply strategies had to agree by coincidence. After this spec they agree by construction.
- **#16 Testing as Proof**: the apply/probe/classifier agreement invariant and the pre/post equivalence invariant both become test assertions, not reviewer checklist items.

## Required Proof

### Unit / Kernel Proof

1. `evaluateMoveLegality` is pure — regression test feeds frozen `def`/`state`/`move`, asserts no mutation and stable verdict across repeated invocations.
2. The verdict → `ILLEGAL_MOVE` mapping is exhaustive: for every `IllegalMoveReason` the predicate can emit, there exists a test showing each consumer site (`probeMoveViabilityRaw`, `classifyMoveAdmissibility`, `applyMove`) produces the correct local consequence.
3. Table-driven mapping tests for `classifyMoveAdmissibility`: input `evaluateMoveLegality` verdict → output admissibility verdict, one case per reason code.
4. Internal-branching coverage: the predicate produces the correct verdict for both complete- and incomplete-move inputs, exercising both the `doesCompletedProbeMoveChangeGameplayState` and `hasLegalCompletedFreeOperationMoveInCurrentState` branches end to end.

### Integration Proof

1. Extend `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` with a **three-site agreement test**: fix `(def, state, move)`, invoke probe, classifier, and apply; assert their verdicts agree. One case per reason code and one case per `(complete, incomplete)` move shape.
2. Add a **pre/post-apply equivalence property test** in the same file: for every `(def, state, move)` in the cross-pathway fixture corpus, assert `doesCompletedProbeMoveChangeGameplayState(def, S, M) === doesMaterialGameplayStateChange(S, applyMove(def, S, M).newState)` when the move is applicable.
3. The An Loc card-71 / Gulf of Tonkin / seed-1012 regression witnesses continue to pass.
4. `packages/engine/test/integration/classified-move-parity.test.ts` continues to pass with no per-site recomputation of outcome-policy.
5. **Surface-migration regression**: add a targeted test confirming that apply-time zone-filter-evaluation failures now surface through `FREE_OPERATION_GRANT_MATCH_EVALUATION` (previously `FREE_OPERATION_GRANT_CONSUMPTION`). Document the surface change in the commit body so downstream log consumers are on notice.

### New Test File

`packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` — unit coverage of the new predicate with:

- one legal fixture (complete free-op move + satisfying grant)
- one `FREE_OPERATION_NOT_GRANTED` fixture (no grant matches)
- one `FREE_OPERATION_OUTCOME_POLICY_FAILED` fixture — complete-branch (grant matches, move no-op under `doesCompletedProbeMoveChangeGameplayState`)
- one `FREE_OPERATION_OUTCOME_POLICY_FAILED` fixture — incomplete-branch (grant matches, no legal completion under `hasLegalCompletedFreeOperationMoveInCurrentState`)
- one `MOVE_NOT_LEGAL_IN_CURRENT_STATE` fixture (pending grant blocks action)
- purity test (frozen inputs, stable verdict)

## Implementation Direction

### New module

`packages/engine/src/kernel/move-legality-predicate.ts` — exports `evaluateMoveLegality`, `LegalityVerdict`. Internally:

- branches on whether the move is complete in the decision-sequence sense, selecting between `doesCompletedProbeMoveChangeGameplayState` and `hasLegalCompletedFreeOperationMoveInCurrentState`;
- bakes `FREE_OPERATION_GRANT_MATCH_EVALUATION` as the surface argument to the grant-resolution helpers;
- composes the existing primitives (`resolveStrongestRequiredFreeOperationOutcomeGrant`, `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant`, `hasLegalCompletedFreeOperationMoveInCurrentState`, `doesCompletedProbeMoveChangeGameplayState`) without introducing new grant-resolution or state-change primitives.

### Call-site migrations (same change, no shims)

- **`apply-move.ts:1912–1963`** (`probeMoveViabilityRaw` inline complete- and incomplete-move blocks): replace both blocks with a single `evaluateMoveLegality` call before the decision-sequence branch. On illegal verdict, construct the `MoveViabilityResult` with `viable: false` and the appropriate code/context. On legal, proceed.
- **`apply-move.ts:284–301`** (`validateFreeOperationOutcomePolicy`): **delete the function entirely**. Replace its call site at `apply-move.ts:1428` with an `evaluateMoveLegality` call positioned **before** `executeMoveAction` (pre-apply), throwing via `illegalMoveError` on illegal verdict. Update the contract comment at `apply-move.ts:1426–1427` to reflect the pre-apply gate and its pairing with `legal-moves.ts` enumeration surfacing. The import of `doesMaterialGameplayStateChange` in `apply-move.ts` is dropped; the remaining caller at `free-operation-viability.ts:564` is unaffected.
- **`move-admissibility.ts:42–110`** (`resolveOutcomePolicyGrantForAdmissibility` and `classifyFreeOperationOutcomePolicyAdmissibility`): replace the internal grant resolution and completion-legality check with a single `evaluateMoveLegality` call. Map its `LegalityVerdict` to the admissibility verdict via a table. The helper `resolveOutcomePolicyGrantForAdmissibility` is deleted.

### Touched but not migrated

- **`deriveMoveViabilityVerdict`** (`viability-predicate.ts:107–127`) — unchanged. It operates on the *output* of raw-probe rules, not on grant-outcome-policy logic.
- **`legal-moves.ts:729`** — keeps its direct call to `resolveStrongestRequiredFreeOperationOutcomeGrant`. This is an **enumeration surfacing** decision, not a legality decision: required grants are surfaced regardless of outcome policy so the obligation is visible to the player, and the predicate at apply-time is authoritative for legality. The existing comment at `legal-moves.ts:744–745` already documents this split; no change.
- **`grant-lifecycle.ts:408`** — keeps its call to `hasLegalCompletedFreeOperationMoveInCurrentState`. This is used by the grant state-machine transition (`transitionReadyGrantForCandidateMove`), not to decide move legality. The helper remains available to both the predicate and the lifecycle machine.
- **`free-operation-viability.ts:626`** — primitive composition inside `hasLegalCompletedProbeMove`, which the predicate consumes via `hasLegalCompletedFreeOperationMoveInCurrentState`. This is implementation detail of the primitive, not an external decision site.

### Consumer (no semantic change expected)

- `packages/engine/src/agents/prepare-playable-moves.ts` — consumes classifier verdicts only and already sits at the agent layer above the kernel. No code change expected.

## Out of Scope

- Migrating non-free-operation legality checks into the same predicate (e.g., phase gating, action applicability) — possible future spec.
- Per-grant custom outcome policies beyond `mustChangeGameplayState` — separate concern.
- Expanding the predicate to handle enumeration surfacing semantics. Foundation #5 is satisfied by the current two-path split: the predicate owns *legality*, `legal-moves.ts` owns *visibility*, and the two paths are documented as separate concerns.

## Outcome

- Completed: 2026-04-18
- What changed:
  - Ticket 001 added the standalone `evaluateMoveLegality` module and its predicate-focused unit coverage.
  - Ticket 002 migrated the probe, apply, and admissibility sites to consume the predicate, deleted the old duplicated helpers, and propagated the grant-match diagnostic surface through the supporting grant-authorization path.
  - The integration conformance work landed in `pending-move-admissibility-parity.test.ts`, including predicate/probe/classifier/apply agreement, pre/post gameplay-state equivalence, and the surface-migration regression.
- Deviations from original plan:
  - The migration required small supporting edits outside the originally emphasized three caller files so `FREE_OPERATION_GRANT_MATCH_EVALUATION` could propagate cleanly through grant authorization and outcome-policy resolution.
  - The spec’s intended architectural outcome landed across two tickets (`134UNIMOVLEG-001` and `134UNIMOVLEG-002`) rather than one monolithic implementation change.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `grep -rn "validateFreeOperationOutcomePolicy\|resolveOutcomePolicyGrantForAdmissibility" packages/engine/src/`
  - `grep -rn "doesMaterialGameplayStateChange" packages/engine/src/kernel/apply-move.ts`
