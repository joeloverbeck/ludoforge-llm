## 139CCONLEGCONT-004: Constructible admission rule + certificateIndex side channel + I1/I4 pre-implementation investigations

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel admission filter, engine-only `LegalMoveEnumerationResult` side channel with worker stripping, runtime-warning schema additions
**Deps**: `archive/tickets/139CCONLEGCONT-003.md`

## Problem

Spec 139 D5 replaces the current fail-open admission at `legal-moves.ts:710-726` (which admits both `'satisfiable'` AND `'unknown'`) with a four-case switch: `'unsatisfiable'` drops, `'satisfiable'` attaches a certificate and admits, `'explicitStochastic'` admits without a certificate, `'unknown'` drops with a `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` warning. The existing outcome-grant post-validation at lines 727-759 (free-operation grant resolution, `completionPolicy === 'required'` handling, `phase === 'ready'` transitions, `transitionReadyGrantForCandidateMove`) MUST be preserved inside the `'satisfiable'` and `'explicitStochastic'` arms.

D5.1 adds an engine-side `certificateIndex?: ReadonlyMap<string, CompletionCertificate>` side channel to `LegalMoveEnumerationResult`. Keys are produced by `toMoveIdentityKey(def, move)` — the same function `preparePlayableMoves` uses for `emittedPlayableMoveKey` (prepare-playable-moves.ts:106). The worker bridge strips this field before structured clone, so the public runner-facing `moves[]` shape remains unchanged.

I1 (inventory admission call sites that consume `'unknown'`) is a Foundation #15 prerequisite: closing fail-open must not silently drop legitimate moves. I4 (worker-bridge type surface verification) confirms `certificateIndex` stays out of the clone-compat contract.

## Assumption Reassessment (2026-04-19)

1. Admission at `legal-moves.ts:710` matches spec description: `classifyMoveDecisionSequenceAdmissionForLegalMove` call with `LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE` context. Current switch logic at lines 721-726: `'unsatisfiable' → false`, `!'satisfiable' → true` (fail-open for `'unknown'`), then fall-through to outcome-grant validation at 727-759 for `'satisfiable'`. Post-ticket-003, `'explicitStochastic'` is also passed through as admissible via the wrapper boolean — this ticket formalizes it in the switch.
2. Outcome-grant validation at `legal-moves.ts:727-759`: checks `turnOrderState.type === 'cardDriven'` + `pendingFreeOperationGrants.some(outcomePolicy === 'mustChangeGameplayState')`, resolves `strongestOutcomeGrant` via `resolveStrongestRequiredFreeOperationOutcomeGrant`, handles `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`, admits `completionPolicy === 'required'`, preserves the existing `phase === 'offered'` admission on non-ready grants, and only uses `transitionReadyGrantForCandidateMove` for `phase === 'ready'`. This block is preserved verbatim inside both the `'satisfiable'` and `'explicitStochastic'` arms.
3. `LegalMoveEnumerationResult` currently has `moves: readonly ClassifiedMove[]` and `warnings: readonly RuntimeWarning[]` (legal-moves.ts:110-113). Adding `certificateIndex?` is additive on the engine side only; the worker bridge must explicitly omit it from the cloned runner-facing result (verified by I4).
4. `toMoveIdentityKey(def, move)` exists in `packages/engine/src/kernel/move-identity.ts` — verified via the `prepare-playable-moves.ts:106` usage. Both the producer (this ticket) and consumer (ticket 005) use the same function.
5. The two new warning codes — `CONSTRUCTIBILITY_INVARIANT_VIOLATION` and `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` — must be registered in the `RuntimeWarning` schema in `types-core.ts`.

## Architecture Check

1. **Admission contract is single source of truth.** Post-switch, admission decisions are fully encoded in the classifier verdict + certificate presence. No out-of-band probe-level bypass (Foundation #5).
2. **Outcome-grant validation preserved.** The D5 switch replaces only the classification-handling prologue; the downstream free-operation grant logic at `:727-759` is preserved verbatim inside the admitting arms. Pre-existing behavior for `mustChangeGameplayState` grants is unchanged (no silent regression).
3. **Engine-side side channel with explicit bridge stripping.** `certificateIndex` exists on the engine-side `LegalMoveEnumerationResult` for kernel/agent use, but the worker bridge omits it before structured clone so the runner-facing contract remains unchanged (I4 audit).
4. **No shims.** Fail-open `'unknown' → admit` is deleted, not deprecated (Foundation #14).
5. **Engine-agnostic.** The switch, the index, and the warning codes are all game-generic.

## What to Change

### 1. I1 — Inventory admission call sites that consume `'unknown'`

Grep every consumer of `classifyMoveDecisionSequenceAdmissionForLegalMove`, `classifyMoveDecisionSequenceSatisfiabilityForLegalMove`, `isMoveDecisionSequenceAdmittedForLegalMove`, `isMoveDecisionSequenceSatisfiable`. For each call site, document whether the current fail-open behavior is load-bearing for any currently-passing seed/scenario. Output: a table in the PR description plus a kernel-only fixture test under `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` that demonstrates the drop behavior. Initial reassessment (2026-04-19) found no passing tests load-bearing on fail-open — the inventory confirms this or surfaces exceptions that must be resolved before admission is tightened.

File-top marker: `// @test-class: architectural-invariant`.

### 2. I4 — Worker-bridge type surface verification

Audit `packages/runner/src/worker/game-worker-api.ts` (currently references `LegalMoveEnumerationResult` at lines 37, 97, 338). Confirm zero references to `.certificateIndex` or `CompletionCertificate`, and explicitly strip `certificateIndex` before returning the result across the worker boundary. Audit `packages/runner/test/worker/clone-compat.test.ts` — assert the cloned worker-facing `LegalMoveEnumerationResult` does NOT expose `certificateIndex`. If I4 surfaces a public-shape leak, halt and amend the spec before proceeding.

### 3. Extend `LegalMoveEnumerationResult`

File: `packages/engine/src/kernel/legal-moves.ts:110`

```ts
export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];
  readonly warnings: readonly RuntimeWarning[];
  readonly certificateIndex?: ReadonlyMap<string, CompletionCertificate>;  // NEW — engine-side only; stripped at worker boundary
}
```

Populate `certificateIndex` inside `enumerateLegalMoves` as classified moves accumulate. For each move admitted via the `'satisfiable'` arm with a certificate, insert `(toMoveIdentityKey(def, move), certificate)`. `'explicitStochastic'`-admitted moves have no entry. The field is omitted when no admitted move carried a certificate (so backward-readers don't see a superfluous empty map).

### 4. Rewrite the admission switch at `legal-moves.ts:710-726`

Pass `emitCompletionCertificate: true` to a legal-move admission helper that preserves the existing missing-binding probe policy while returning `classification + certificate`. Replace the existing fail-open with the D5 four-case switch. Preserve the outcome-grant post-validation (lines 727-759) by placing the `break` in the `'satisfiable'` and `'explicitStochastic'` arms — the post-validation block falls through naturally. Add `return false` + warning emission for both the `'unknown'` case and the defensive `'satisfiable'`-with-missing-certificate case.

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
- Assert outcome-grant preservation: a `mustChangeGameplayState` grant with `phase === 'offered'` remains admitted as before, while a non-`ready` non-`offered` grant still drops moves post-switch.

## Files Touched

- `packages/engine/src/kernel/legal-moves.ts` (modified — D5 switch, certificateIndex population, `LegalMoveEnumerationResult` shape, required-completion fallback)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modified — classifier helper returning completion certificates for legal-move admission)
- `packages/engine/src/kernel/types-core.ts` (modified — add `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` and `CONSTRUCTIBILITY_INVARIANT_VIOLATION`)
- `packages/engine/src/kernel/schemas-core.ts` (modified — runtime-warning schema additions)
- `packages/engine/src/kernel/completion-certificate.ts` (modified — browser-safe deterministic fingerprinting)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modified — browser-safe deterministic fingerprinting helpers)
- `packages/engine/src/kernel/stable-fingerprint.ts` (new — canonical deterministic fingerprint helper)
- `packages/engine/schemas/Trace.schema.json` (modified — regenerated schema artifact)
- `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` (new — T3)
- `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` (new — I1 output)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modified — updated for unknown-drop and preserved outcome-grant behavior)
- `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts` (modified — export/helper guard)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modified — admission helper coverage)
- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` (modified — corrected constructibility fixture)
- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modified — aligned retry fixture)
- `packages/runner/src/worker/game-worker-api.ts` (modified — explicit worker-bridge stripping of `certificateIndex`)
- `packages/runner/test/worker/clone-compat.test.ts` (modified — I4 negative assertion derived from `LegalMoveEnumerationResult`)

## Out of Scope

- Agent certificate consumption — ticket 005.
- Agent throw deletion — ticket 005.
- FOUNDATIONS amendments — ticket 006.
- New stop reasons, new error classes — none (per spec Non-Goals).

## Acceptance Criteria

### Tests That Passed

1. T3 unit test passes.
2. I1 inventory test passes and shows `'unknown'` dropping instead of fail-open admission.
3. I4 worker-bridge negative assertion passes (`certificateIndex` absent from the cloned worker-facing result).
4. Migrated constructibility/certificate tests from ticket 003 continue to pass.
5. `pnpm -F @ludoforge/engine schema:artifacts` regenerated the runtime schema artifact, and the schema sync lane stayed green.
6. Broad verification is fully green; the draft expectation of three still-failing integration cases was no longer true after the final implementation/fix set.

### Invariants

1. `'unknown'` is never admitted (grep on source: no code path returns `true` for `'unknown'` verdict).
2. `'explicitStochastic'` is admitted without a certificate entry — `certificateIndex` is consulted only for `'satisfiable'` admissions.
3. Outcome-grant post-validation is applied to every admitted move (both `'satisfiable'` and `'explicitStochastic'`); no regression in `mustChangeGameplayState` handling.
4. Worker-bridge contract preserved: `LegalMoveEnumerationResult.moves[]` shape unchanged; `certificateIndex` stripped before worker serialization.
5. For every admitted incomplete move with verdict `'satisfiable'`, `certificateIndex` has an entry keyed by `toMoveIdentityKey(def, move)`. (The Foundation #18 conformance test in ticket 006 asserts this globally.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` (new) — T3 per spec § Testing Strategy.
2. `packages/engine/test/unit/kernel/admission-unknown-drop-inventory.test.ts` (new) — I1 output fixture.
3. `packages/runner/test/worker/clone-compat.test.ts` (modify) — I4 negative assertion.

### Commands Run

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-certificate.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-sequence-satisfiability-memo-isolation.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/legal-moves.test.js`
6. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/schema-artifacts-sync.test.js`
7. `pnpm -F @ludoforge/engine schema:artifacts`
8. `pnpm -F @ludoforge/engine test:unit`
9. `pnpm -F @ludoforge/runner build`
10. `pnpm turbo lint`
11. `pnpm turbo typecheck`
12. `pnpm turbo test`

## Outcome

**Completion date**: 2026-04-19

**What changed**

1. The engine-side boundary correction from reassessment was implemented as specified: `certificateIndex` exists on engine `LegalMoveEnumerationResult`, and `packages/runner/src/worker/game-worker-api.ts` explicitly strips it before worker serialization.
2. The admission contract now drops `'unknown'`, preserves `'explicitStochastic'` admission without a certificate entry, and indexes constructible `'satisfiable'` incomplete moves by `toMoveIdentityKey(def, move)`.
3. The ticket also fixed the browser-incompatible kernel fingerprinting path by introducing a browser-safe stable fingerprint helper and moving certificate/classifier fingerprint derivation to it.

**Deviations from original plan**

1. The outcome-grant preservation clause was corrected to the live contract: non-ready `phase === 'offered'` grants still admit, while non-ready non-offered grants still drop after post-validation.
2. The defensive constructibility invariant is narrower than the draft wording implied: an admitted incomplete `'satisfiable'` move must carry a certificate, but already-complete required-grant moves may still be admitted without one after direct sequence resolution.
3. The draft expectation that three integration failures would remain until ticket 005 was disproven by the final implementation/fix set; the broad verification lane finished fully green.

**Verification**

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. Focused `node --test` runs for the owned kernel/schema regression lanes
4. `pnpm -F @ludoforge/engine test:unit` (`453/453`)
5. `pnpm -F @ludoforge/runner build`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
8. `pnpm turbo test` (engine `510/510`; runner `205` files / `2119` tests)
