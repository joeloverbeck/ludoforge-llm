## 139CCONLEGCONT-004: Constructible admission rule + certificateIndex side channel + I1/I4 pre-implementation investigations

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel admission filter, `LegalMoveEnumerationResult` shape extension (internal-only), runtime-warning schema additions
**Deps**: `tickets/139CCONLEGCONT-003.md`

## Problem

Spec 139 D5 replaces the current fail-open admission at `legal-moves.ts:710-726` (which admits both `'satisfiable'` AND `'unknown'`) with a four-case switch: `'unsatisfiable'` drops, `'satisfiable'` attaches a certificate and admits, `'explicitStochastic'` admits without a certificate, `'unknown'` drops with a `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` warning. The existing outcome-grant post-validation at lines 727-759 (free-operation grant resolution, `completionPolicy === 'required'` handling, `phase === 'ready'` transitions, `transitionReadyGrantForCandidateMove`) MUST be preserved inside the `'satisfiable'` and `'explicitStochastic'` arms.

D5.1 adds an internal-only `certificateIndex?: ReadonlyMap<string, CompletionCertificate>` side channel to `LegalMoveEnumerationResult`. Keys are produced by `toMoveIdentityKey(def, move)` — the same function `preparePlayableMoves` uses for `emittedPlayableMoveKey` (prepare-playable-moves.ts:106). The public `moves[]` shape is unchanged; the worker bridge sees no new field.

I1 (inventory admission call sites that consume `'unknown'`) is a Foundation #15 prerequisite: closing fail-open must not silently drop legitimate moves. I4 (worker-bridge type surface verification) confirms `certificateIndex` stays out of the clone-compat contract.

## Assumption Reassessment (2026-04-19)

1. Admission at `legal-moves.ts:710` matches spec description: `classifyMoveDecisionSequenceAdmissionForLegalMove` call with `LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE` context. Current switch logic at lines 721-726: `'unsatisfiable' → false`, `!'satisfiable' → true` (fail-open for `'unknown'`), then fall-through to outcome-grant validation at 727-759 for `'satisfiable'`. Post-ticket-003, `'explicitStochastic'` is also passed through as admissible via the wrapper boolean — this ticket formalizes it in the switch.
2. Outcome-grant validation at `legal-moves.ts:727-759`: checks `turnOrderState.type === 'cardDriven'` + `pendingFreeOperationGrants.some(outcomePolicy === 'mustChangeGameplayState')`, resolves `strongestOutcomeGrant` via `resolveStrongestRequiredFreeOperationOutcomeGrant`, handles `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`, admits based on `completionPolicy === 'required'` and `phase === 'ready'`, terminal `transitionReadyGrantForCandidateMove` call. This block is preserved verbatim inside both the `'satisfiable'` and `'explicitStochastic'` arms.
3. `LegalMoveEnumerationResult` currently has `moves: readonly ClassifiedMove[]` and `warnings: readonly RuntimeWarning[]` (legal-moves.ts:110-113). Adding `certificateIndex?` is additive and the worker bridge references it only via the existing `.moves[]` shape (verified by I4).
4. `toMoveIdentityKey(def, move)` exists in `packages/engine/src/kernel/move-identity.ts` — verified via the `prepare-playable-moves.ts:106` usage. Both the producer (this ticket) and consumer (ticket 005) use the same function.
5. The two new warning codes — `CONSTRUCTIBILITY_INVARIANT_VIOLATION` and `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` — must be registered in the `RuntimeWarning` schema in `types-core.ts`.

## Architecture Check

1. **Admission contract is single source of truth.** Post-switch, admission decisions are fully encoded in the classifier verdict + certificate presence. No out-of-band probe-level bypass (Foundation #5).
2. **Outcome-grant validation preserved.** The D5 switch replaces only the classification-handling prologue; the downstream free-operation grant logic at `:727-759` is preserved verbatim inside the admitting arms. Pre-existing behavior for `mustChangeGameplayState` grants is unchanged (no silent regression).
3. **Internal-only side channel.** `certificateIndex` is a non-serialized, non-public field on `LegalMoveEnumerationResult`. Worker bridge clone-compat contract is preserved (I4 audit).
4. **No shims.** Fail-open `'unknown' → admit` is deleted, not deprecated (Foundation #14).
5. **Engine-agnostic.** The switch, the index, and the warning codes are all game-generic.

## What to Change

### 1. I1 — Inventory admission call sites that consume `'unknown'`

Grep every consumer of `classifyMoveDecisionSequenceAdmissionForLegalMove`, `classifyMoveDecisionSequenceSatisfiabilityForLegalMove`, `isMoveDecisionSequenceAdmittedForLegalMove`, `isMoveDecisionSequenceSatisfiable`. For each call site, document whether the current fail-open behavior is load-bearing for any currently-passing seed/scenario. Output: a table in the PR description plus a kernel-only fixture test under `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` that demonstrates the drop behavior. Initial reassessment (2026-04-19) found no passing tests load-bearing on fail-open — the inventory confirms this or surfaces exceptions that must be resolved before admission is tightened.

File-top marker: `// @test-class: architectural-invariant`.

### 2. I4 — Worker-bridge type surface verification

Audit `packages/runner/src/worker/game-worker-api.ts` (currently references `LegalMoveEnumerationResult` at lines 37, 97, 338). Confirm zero references to `.certificateIndex` or `CompletionCertificate`. Audit `packages/runner/test/worker/clone-compat.test.ts` — assert the `certificateIndex` field is NOT part of the clone-compat contract (it's internal-only). Add a negative assertion: attempting to read `.certificateIndex` on a cloned `LegalMoveEnumerationResult` in the clone-compat test must return `undefined`. If I4 surfaces a public-shape leak, halt and amend the spec before proceeding.

### 3. Extend `LegalMoveEnumerationResult`

File: `packages/engine/src/kernel/legal-moves.ts:110`

```ts
export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];
  readonly warnings: readonly RuntimeWarning[];
  readonly certificateIndex?: ReadonlyMap<string, CompletionCertificate>;  // NEW — internal-only
}
```

Populate `certificateIndex` inside `enumerateLegalMoves` as classified moves accumulate. For each move admitted via the `'satisfiable'` arm with a certificate, insert `(toMoveIdentityKey(def, move), certificate)`. `'explicitStochastic'`-admitted moves have no entry. The field is omitted when no admitted move carried a certificate (so backward-readers don't see a superfluous empty map).

### 4. Rewrite the admission switch at `legal-moves.ts:710-726`

Pass `emitCompletionCertificate: true` to `classifyMoveDecisionSequenceAdmissionForLegalMove`. Replace the existing fail-open with the D5 four-case switch. Preserve the outcome-grant post-validation (lines 727-759) by placing the `break` in the `'satisfiable'` and `'explicitStochastic'` arms — the post-validation block falls through naturally. Add `return false` + warning emission for both the `'unknown'` case and the defensive `'satisfiable'`-with-missing-certificate case.

### 5. Runtime-warning schema additions

File: `packages/engine/src/kernel/types-core.ts`

Add two new codes to the `RuntimeWarning` code union / schema:

- `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` — emitted when admission drops a move whose classification was `'unknown'`. Context: `actionId`, `stateHash`.
- `CONSTRUCTIBILITY_INVARIANT_VIOLATION` — emitted when the classifier returned `'satisfiable'` but did not emit a certificate (defensive; should not fire). Context: `actionId`, `stateHash`.

### 6. T3 — Constructible admission contract unit test

File: `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- Synthetic GameDef forcing classifier `'unknown'` via tight budget injection: assert the move is NOT in `moves[]` and the `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` warning is emitted.
- Same GameDef with sufficient budget: assert the move IS in `moves[]` and `certificateIndex.has(toMoveIdentityKey(def, move))` is `true`.
- Synthetic GameDef with `pendingStochastic` first decision: assert verdict is `'explicitStochastic'`, move is in `moves[]`, `certificateIndex.has(key) === false`.
- Assert `moves[]` shape is unchanged (`.forEach` over `ClassifiedMove` fields produces only `move`, `viability`, `trustedMove` — no new public field).
- Assert outcome-grant preservation: a `mustChangeGameplayState` grant with `phase !== 'ready'` still drops moves as before, even post-switch.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — switch, certificateIndex population, `LegalMoveEnumerationResult` shape)
- `packages/engine/src/kernel/types-core.ts` (modify — add two warning codes)
- `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` (new — T3)
- `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` (new — I1 output)
- `packages/runner/test/worker/clone-compat.test.ts` (modify — I4 negative assertion for certificateIndex)

## Out of Scope

- Agent certificate consumption — ticket 005.
- Agent throw deletion — ticket 005.
- FOUNDATIONS amendments — ticket 006.
- New stop reasons, new error classes — none (per spec Non-Goals).

## Acceptance Criteria

### Tests That Must Pass

1. T3 unit test passes.
2. I1 inventory test passes (demonstrates drop behavior for `'unknown'` without breaking existing passing paths).
3. I4 worker-bridge negative assertion passes (certificateIndex absent from clone).
4. Migrated `decision-sequence-satisfiability.test.ts` (from ticket 003) continues to pass.
5. Integration tests: the three pre-existing CI failures (seed 123, 1002, 1010) still fail until ticket 005 wires the agent fallback — noted as transitional.
6. Full suite: all tests except the known-failing three pass.

### Invariants

1. `'unknown'` is never admitted (grep on source: no code path returns `true` for `'unknown'` verdict).
2. `'explicitStochastic'` is admitted without a certificate entry — `certificateIndex` is consulted only for `'satisfiable'` admissions.
3. Outcome-grant post-validation is applied to every admitted move (both `'satisfiable'` and `'explicitStochastic'`); no regression in `mustChangeGameplayState` handling.
4. Worker-bridge contract preserved: `LegalMoveEnumerationResult.moves[]` shape unchanged; `certificateIndex` not serialized.
5. For every admitted incomplete move with verdict `'satisfiable'`, `certificateIndex` has an entry keyed by `toMoveIdentityKey(def, move)`. (The Foundation #18 conformance test in ticket 006 asserts this globally.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` (new) — T3 per spec § Testing Strategy.
2. `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` (new) — I1 output fixture.
3. `packages/runner/test/worker/clone-compat.test.ts` (modify) — I4 negative assertion.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted.
2. `pnpm -F @ludoforge/runner test` — runner clone-compat.
3. `pnpm turbo test` — full suite (expect three known failures until ticket 005).
4. `pnpm turbo lint && pnpm turbo typecheck` — gates.
