# 134UNIMOVLEG-002: Atomic migration of probe/classifier/apply sites to unified predicate

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — three kernel call sites + integration tests; diagnostic-surface shift at apply time
**Deps**: `archive/tickets/134UNIMOVLEG-001.md`

## Problem

After ticket 001, the unified `evaluateMoveLegality` predicate exists as a pure module with no production callers. This ticket completes Spec 134 by atomically migrating the three existing duplication sites to consume the predicate: the `probeMoveViabilityRaw` inline blocks, the apply-time `validateFreeOperationOutcomePolicy` gate, and the `classifyFreeOperationOutcomePolicyAdmissibility` classifier helper. Per Foundation 14 and the spec's §Foundations Alignment #14, migration is atomic — no shim, no alias, no transitional period where some sites use the predicate and others re-derive. Site 3's post-apply audit is simultaneously relocated to a pre-apply forecast, unifying the evaluation strategy across all three sites and making the spec's Required Invariants #3 and #4 structural properties rather than reviewer checklist items.

## Assumption Reassessment (2026-04-18)

1. Verified during `/reassess-spec` on `specs/134-unified-move-legality-predicate.md` (same session): three call sites confirmed at `apply-move.ts:1912–1963` (probe blocks), `apply-move.ts:284–301` (`validateFreeOperationOutcomePolicy` definition), `apply-move.ts:1428` (apply-time call site), and `move-admissibility.ts:42–70 + 84–110` (`resolveOutcomePolicyGrantForAdmissibility` and `classifyFreeOperationOutcomePolicyAdmissibility`). Line ranges within ±1–3 lines of spec-cited ranges.
2. `doesCompletedProbeMoveChangeGameplayState` at `free-operation-viability.ts:440` is the pre-apply probe predicate Site 3 adopts. `doesMaterialGameplayStateChange` at `free-operation-outcome-policy.ts:62` retains one remaining caller at `free-operation-viability.ts:564`, so the function itself stays; only the `apply-move.ts` import is dropped.
3. Existing integration test files verified at `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` and `packages/engine/test/integration/classified-move-parity.test.ts`.
4. Spec §Definitions — Surface-ID discipline documents the diagnostic shift: apply-time zone-filter-evaluation failures will surface through `FREE_OPERATION_GRANT_MATCH_EVALUATION` after this ticket (previously `FREE_OPERATION_GRANT_CONSUMPTION`). This is a one-time migration, not a regression.
5. Exempt sites that keep their grant-resolution / completion-legality helper calls: `legal-moves.ts:729` (enumeration surfacing — comment at `legal-moves.ts:744–745` documents this already), `grant-lifecycle.ts:408` (grant state-machine transition), `free-operation-viability.ts:626` (primitive composition inside `hasLegalCompletedProbeMove`, which is itself a primitive the predicate consumes).

## Architecture Check

1. **Foundation 5 (One Rules Protocol)**: after this ticket, `evaluateMoveLegality` is the sole site that decides free-operation outcome-policy legality. Probe, classifier, and apply all consume its verdict. The spec's Required Invariant #1 (semantic form) becomes true.
2. **Foundation 8 (Determinism)**: uniform pre-apply evaluation makes pre/post-apply equivalence a structural property provable by test. Under determinism, `doesCompletedProbeMoveChangeGameplayState(def, S, M)` MUST equal `doesMaterialGameplayStateChange(S, applyMove(def, S, M).newState)` for every applicable move — any divergence is a probe bug to be fixed, not routed around with a dual-mode signature.
3. **Foundation 14 (No Backwards Compatibility)**: all three migrations land in this single ticket. `validateFreeOperationOutcomePolicy` and `resolveOutcomePolicyGrantForAdmissibility` are deleted, not deprecated. No alias functions, no feature flag, no compat shim. Site 3's post-apply gate is deleted; the pre-apply gate is the only path.
4. **Foundation 14 exception (Large effort justification)**: the spec mandates atomic migration, so this diff exceeds normal review size. Reviewability is preserved because the three sites share a common consumer contract — each replaces bespoke inline logic with a single `evaluateMoveLegality` call plus a verdict-to-local-consequence mapping. The mapping is constructor-based at the probe site (verdict → `MoveViabilityResult`), table-driven at the classifier site (verdict → admissibility verdict), and throw-based at the apply site (verdict → `illegalMoveError`). All three follow the same verdict→consequence pattern, making the diff scannable as one coherent transition even though the three mappings differ.
5. **Foundation 15 (Architectural Completeness)**: closes the design gap where three sites must agree by discipline. After this ticket they agree by construction. The spec's Required Invariants #3 (apply/probe/classifier agreement) and #4 (pre/post equivalence) become test-enforced structural properties.

## What to Change

### 1. Probe site migration — `packages/engine/src/kernel/apply-move.ts:1912–1963`

Replace the two inline outcome-policy blocks (complete branch lines 1912–1940, incomplete branch lines 1941–1963) inside `probeMoveViabilityRaw` with a single `evaluateMoveLegality` call before the decision-sequence branch. On `{ kind: 'illegal' }`, construct the existing `MoveViabilityResult` shape:

```ts
const legalityVerdict = evaluateMoveLegality(def, state, sequence.move);
if (legalityVerdict.kind === 'illegal') {
  return {
    viable: false,
    complete: sequence.complete,
    move: sequence.move,
    code: 'ILLEGAL_MOVE',
    context: { reason: legalityVerdict.reason, ...legalityVerdict.context },
    // preserve the other fields the existing blocks produce
  };
}
```

On `{ kind: 'legal' }`, proceed to the existing decision-sequence branch. Remove the now-unused direct calls to `resolveStrongestRequiredFreeOperationOutcomeGrant`, `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant`, `hasLegalCompletedFreeOperationMoveInCurrentState`, and `doesCompletedProbeMoveChangeGameplayState` from `probeMoveViabilityRaw`. Drop imports that become unused in this file (confirm by a typecheck run — do not drop imports that still have other call sites in `apply-move.ts`).

### 2. Apply site migration — `packages/engine/src/kernel/apply-move.ts:284–301, 1428`

**Delete** `validateFreeOperationOutcomePolicy` (lines 284–301) entirely. At the call site, relocate the gate from post-`executeMoveAction` to pre-`executeMoveAction`:

Before (today's code at lines 1421–1429):
```ts
const t0_exec = perfStart(profiler);
const executed = executeMoveAction(def, mutableState, move, seatResolution, options, coreOptions, shared, tracker, cachedRuntime);
perfEnd(profiler, 'executeMoveAction', t0_exec);

const t0_freeOp = perfStart(profiler);
// CONTRACT: Pair with legal-moves.ts `isFreeOperationCandidateAdmitted`.
// Required grants stay visible during enumeration; outcome policy is enforced here.
validateFreeOperationOutcomePolicy(def, state, executed.stateWithRng, move, seatResolution);
perfEnd(profiler, 'validateFreeOperationOutcomePolicy', t0_freeOp);
```

After:
```ts
// CONTRACT: Pair with legal-moves.ts `isFreeOperationCandidateAdmitted`.
// Required grants stay visible during enumeration; outcome policy is enforced here pre-apply
// via the unified evaluateMoveLegality predicate.
const t0_freeOp = perfStart(profiler);
const legalityVerdict = evaluateMoveLegality(def, state, move);
perfEnd(profiler, 'evaluateMoveLegality', t0_freeOp);
if (legalityVerdict.kind === 'illegal') {
  throw illegalMoveError(move, legalityVerdict.reason, legalityVerdict.context);
}

const t0_exec = perfStart(profiler);
const executed = executeMoveAction(def, mutableState, move, seatResolution, options, coreOptions, shared, tracker, cachedRuntime);
perfEnd(profiler, 'executeMoveAction', t0_exec);
```

Drop the `doesMaterialGameplayStateChange` import from `apply-move.ts` (line 84 of the current import block); the function stays in its module because `free-operation-viability.ts:564` still uses it. Drop `validateFreeOperationOutcomePolicy` from any internal export/reference.

### 3. Classifier site migration — `packages/engine/src/kernel/move-admissibility.ts:42–110`

**Delete** `resolveOutcomePolicyGrantForAdmissibility` (lines 42–70). Replace the body of `classifyFreeOperationOutcomePolicyAdmissibility` (lines 84–110) so it delegates to the predicate:

```ts
const LEGALITY_TO_ADMISSIBILITY: Readonly<Partial<Record<IllegalMoveReason, AdmissibilityReason>>> = Object.freeze({
  [ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED]: 'freeOperationOutcomePolicyFailed',
  // Add every other IllegalMoveReason the predicate can emit, mapped to its admissibility reason.
  // If the predicate can emit a reason that has no admissibility mapping, fail loudly during
  // classifier compilation via exhaustiveness check — do not silently pass through.
});

const classifyFreeOperationOutcomePolicyAdmissibility = (
  def: GameDef,
  state: GameState,
  viability: MoveViabilityResult,
): MoveAdmissibilityVerdict | null => {
  if (!viability.viable || viability.move.freeOperation !== true) {
    return null;
  }
  const verdict = evaluateMoveLegality(def, state, viability.move);
  if (verdict.kind === 'legal') {
    return null;
  }
  const admissibilityReason = LEGALITY_TO_ADMISSIBILITY[verdict.reason];
  if (admissibilityReason === undefined) {
    // Exhaustiveness: every reason the predicate can emit MUST be mapped.
    throw unmappedLegalityReasonError(verdict.reason);
  }
  return {
    kind: 'inadmissible',
    reason: admissibilityReason,
    outcomePolicyGrantId: verdict.context.grantId,
    // preserve whatever other admissibility-verdict fields the current classifier emits
  };
};
```

Drop imports of `resolveStrongestRequiredFreeOperationOutcomeGrant`, `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant`, and `hasLegalCompletedFreeOperationMoveInCurrentState` from `move-admissibility.ts` if they become unused (confirm by typecheck).

### 4. Integration tests — `packages/engine/test/integration/pending-move-admissibility-parity.test.ts`

Add three new test blocks. Use file-top marker `// @test-class: architectural-invariant` (the file may already have one; if so, new blocks inherit it — do not add a duplicate marker).

1. **Three-site agreement test** — fix `(def, state, move)`; invoke `probeMoveViabilityRaw`, `classifyMoveAdmissibility`, and `applyMove`; assert all three produce congruent verdicts. One case per `IllegalMoveReason` the predicate can emit, one case per `(complete, incomplete)` move shape. This encodes spec Invariant #3 as a structural property.
2. **Pre/post-apply equivalence property test** — for every `(def, state, move)` in the cross-pathway fixture corpus where the move is applicable, assert `doesCompletedProbeMoveChangeGameplayState(def, S, M) === doesMaterialGameplayStateChange(S, applyMove(def, S, M).newState)`. Skip cases where the move throws on apply (those are illegal-verdict cases, not equivalence cases). This encodes spec Invariant #4.
3. **Surface-migration regression** — construct a scenario where apply-time grant resolution encounters a zone-filter evaluation failure. Assert the failure is routed through `FREE_OPERATION_GRANT_MATCH_EVALUATION` (not `FREE_OPERATION_GRANT_CONSUMPTION` as before). Document the commit-time diagnostic shift.

### 5. Regression witness preservation

The An Loc card-71, Gulf of Tonkin, and seed-1012 regression witnesses already in the integration suite must continue to pass unchanged. `classified-move-parity.test.ts` continues to pass with no per-site recomputation of outcome-policy.

### 6. Commit message guidance

Commit body should explicitly note the surface-migration diagnostic shift (`FREE_OPERATION_GRANT_CONSUMPTION` → `FREE_OPERATION_GRANT_MATCH_EVALUATION` for apply-time zone-filter failures) so downstream log consumers are on notice.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify — probe site replacement, delete `validateFreeOperationOutcomePolicy`, relocate apply-time call to pre-execute)
- `packages/engine/src/kernel/move-admissibility.ts` (modify — delete `resolveOutcomePolicyGrantForAdmissibility`, replace `classifyFreeOperationOutcomePolicyAdmissibility` body with predicate call + mapping table)
- `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` (modify — three-site agreement, pre/post-apply equivalence, surface-migration regression)

## Out of Scope

- No changes to `packages/engine/src/kernel/move-legality-predicate.ts` — that is ticket 001.
- No changes to `legal-moves.ts`, `grant-lifecycle.ts`, or `free-operation-viability.ts`. Their calls to grant-resolution / completion-legality helpers are exempt per spec §Touched but not migrated.
- No changes to `packages/engine/src/agents/prepare-playable-moves.ts` — consumer at the agent layer, no code change expected.
- No changes to `deriveMoveViabilityVerdict` (`viability-predicate.ts`) — rewrite layer operates on raw-probe output, not outcome-policy logic.
- No new `IllegalMoveReason` variants; no change to admissibility verdict taxonomy.
- No expansion of the predicate to cover non-free-operation legality (phase gating, action applicability) — possible future spec.

## Acceptance Criteria

### Tests That Must Pass

1. **Three-site agreement test** passes — probe, classifier, and apply produce congruent verdicts for every `(def, state, move)` × reason code × (complete, incomplete) case.
2. **Pre/post-apply equivalence property test** passes across the cross-pathway fixture corpus for all applicable moves.
3. **Surface-migration regression test** passes — apply-time zone-filter-evaluation failures surface through `FREE_OPERATION_GRANT_MATCH_EVALUATION`.
4. `classified-move-parity.test.ts` passes unchanged.
5. An Loc card-71, Gulf of Tonkin, and seed-1012 regression witnesses pass unchanged.
6. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions anywhere in the engine.
7. Full workspace: `pnpm turbo test` — no runner or agent regressions from upstream classifier/probe verdict surface.

### Invariants

1. **Single decision site (semantic, Invariant #1)**: after this ticket, no production source file outside `move-legality-predicate.ts` decides free-operation outcome-policy legality. `validateFreeOperationOutcomePolicy` and `resolveOutcomePolicyGrantForAdmissibility` are deleted; `classifyFreeOperationOutcomePolicyAdmissibility` delegates to the predicate via a closed mapping table.
2. **Apply-time agreement (Invariant #3)**: for every `(def, S, M)`, `evaluateMoveLegality(def, S, M).kind === 'illegal'` iff `applyMove(def, S, M)` throws `ILLEGAL_MOVE`. Enforced structurally — the apply-time gate IS a consumer of the predicate.
3. **Pre/post equivalence (Invariant #4)**: for every applicable `(def, S, M)`, the pre-apply probe forecast agrees with the post-apply state-change audit. Enforced by the property test.
4. **No shim**: `grep -rn "validateFreeOperationOutcomePolicy\|resolveOutcomePolicyGrantForAdmissibility" packages/engine/src/` returns zero matches post-ticket.
5. **Determinism preserved (Foundation 8)**: seed-1012 and other regression witnesses continue to pass; canonical serialized state remains bit-identical across replay.
6. **Surface consistency**: apply-time zone-filter-evaluation failures surface through `FREE_OPERATION_GRANT_MATCH_EVALUATION` — consistent with probe-time and classifier-time failures.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` (modify) — adds three new test blocks covering spec §Required Proof Integration items 1 (three-site agreement), 2 (pre/post equivalence), and 5 (surface-migration regression). Consolidated into one cross-pathway conformance file because all three test properties stress the same unified predicate path.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine suite including the new integration tests.
2. `pnpm turbo test` — full workspace suite; verifies no runner regressions from changed classifier/probe verdict surface.
3. `pnpm turbo lint && pnpm turbo typecheck` — workspace lint and typecheck.
4. Structural check: `grep -rn "validateFreeOperationOutcomePolicy\|resolveOutcomePolicyGrantForAdmissibility" packages/engine/src/` — must return zero matches.
5. Structural check: `grep -rn "doesMaterialGameplayStateChange" packages/engine/src/kernel/apply-move.ts` — must return zero matches (import dropped; function still exists for `free-operation-viability.ts:564`).
