## 139CCONLEGCONT-005: Agent certificate fallback + agent throw deletion + T4/T5/T6

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent sampler, all three agent implementations, three new test files
**Deps**: `archive/tickets/139CCONLEGCONT-004.md`

## Problem

Spec 139 D6 makes the certificate the deterministic fallback when the agent's retry loop hits a dead-end. After the existing `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP` retry budget exhausts without producing a completion or a stochastic move, the agent looks up the certificate for the offending template in `input.legalMoves.certificateIndex` (from ticket 004) and materializes it via `materializeCompletionCertificate` (from ticket 001) — no RNG advance, no further search. If the certificate is missing for a move classified `'satisfiable'`, that's a kernel invariant violation: a warning is emitted and the move is dropped, but the agent does NOT throw.

This ticket also deletes the three agent `Error('… could not derive a playable move …')` throws in `random-agent.ts:29-31`, `policy-agent.ts:133-135`, and `greedy-agent.ts:62-64`. Under the new contract, that code path is structurally unreachable: `'satisfiable'` moves have certificates (guaranteed fallback), `'explicitStochastic'` moves flow through `stochasticMoves`, and `'unknown'` is no longer admitted. Foundation #14: delete, do not keep as a defensive fallback.

T4 (unit test on agent fallback), T5 (global no-throw property), and T6 (failing-seed regression for seeds 123, 1002, 1010) land in this ticket as the test counterparts of the behavioral change. This is the ticket that closes the CI failures on PR #221.

## Assumption Reassessment (2026-04-19)

1. Agent throws confirmed: `random-agent.ts:29-31`, `policy-agent.ts:133-135`, `greedy-agent.ts:62-64`. All three fire when `completedMoves.length === 0` (and, for PolicyAgent, also `stochasticMoves.length === 0`). Post-certificate-fallback, these conditions are unreachable.
2. Retry loop is at `prepare-playable-moves.ts:304` (`for (let attempt = 0; attempt < pendingTemplateCompletions + notViableRetries; attempt += 1)`). After ticket 003 deleted `maybeActivateGuidance` and `buildCanonicalGuidedChoose`, the loop runs its random/policy-driven first attempts and exits on exhaustion. The certificate fallback inserts AFTER the loop, AFTER the guard `!sawCompletedMove && stochasticCount === 0 && duplicateOutputOutcome === undefined`.
3. `toMoveIdentityKey(def, move)` — used by ticket 004 to produce `certificateIndex` keys — is also used at `prepare-playable-moves.ts:106` for `emittedPlayableMoveKey`. The agent's lookup uses the identical function.
4. `materializeCompletionCertificate` (ticket 001) accepts `(def, state, baseMove, certificate, runtime)` and returns a fully-bound `Move`. The agent passes its existing `input.def`, `input.state`, the classified move, the certificate, and `input.runtime`.
5. PR #221 CI failures reproduce on: zobrist-incremental-parity seed=123 (RandomAgent), fitl-canary seeds 1002 and 1010 (PolicyAgent `arvn-evolved`). Post-ticket, all three must pass.

## Architecture Check

1. **Certificate is deterministic fallback, not correctness retry.** The certificate is pre-computed by the classifier (ticket 004); materialization is RNG-free and produces a guaranteed-legal completion. Retries remain as a policy-quality/diversity mechanism but no longer gate correctness (Foundation #5 — one rules protocol; classifier is authoritative for admission AND constructibility).
2. **Foundation #14 atomic deletion.** All three agent throws are deleted in the same change that wires the fallback. No defensive `throw` retained — the new contract makes the condition unreachable, and a retained throw would be dead code plus a misleading "we might still fail" signal.
3. **Replay identity preserved (Spec 138 G6).** On seeds where the retry loop's first attempt succeeds, the certificate fallback never fires, no RNG is advanced by it, and the canonical serialized final state remains byte-identical. Ticket 007 validates this empirically across the passing corpus.
4. **Engine-agnostic.** Certificate fallback logic uses generic `ClassifiedMove`, `LegalMoveEnumerationResult.certificateIndex`, `toMoveIdentityKey`. No per-game branches.
5. **Kernel invariant violation surfacing.** If a `'satisfiable'` move reaches the agent without a certificate, the `CONSTRUCTIBILITY_INVARIANT_VIOLATION` warning is emitted (non-throwing) and the move is dropped. Under the new contract this branch is structurally unreachable; the warning is a bug-signal, not an operational path.

## What to Change

### 1. Certificate fallback in `prepare-playable-moves.ts`

Insert the fallback after the retry loop exits, inside the existing `for (const classified of input.legalMoves)` iteration (around line 120+). Guard: `!sawCompletedMove && stochasticCount === 0 && duplicateOutputOutcome === undefined`. Inside the guard:

```ts
const stableMoveKey = toMoveIdentityKey(input.def, move);
const certificate = input.legalMoves.certificateIndex?.get(stableMoveKey);
if (certificate !== undefined) {
  const certifiedMove = materializeCompletionCertificate(
    input.def, input.state, move, certificate, input.runtime,
  );
  // Admit certifiedMove as a complete playable move (use recordPlayableMove).
  // Do NOT advance input.rng.
} else {
  // Defensive — under the new contract this branch is structurally unreachable
  // for a 'satisfiable'-admitted move. Emit the invariant-violation warning
  // and drop the move. Do NOT throw.
  warnings.push({
    code: 'CONSTRUCTIBILITY_INVARIANT_VIOLATION',
    message: 'Admitted incomplete legal move had no certificate at agent fallback time.',
    context: { actionId: String(move.actionId), stateHash: input.state.hash },
  });
}
```

`'explicitStochastic'`-admitted moves do NOT trigger the fallback: they resolve via the existing `stochasticMoves` path inside `evaluatePlayableMoveCandidate` during the retry loop, and the `stochasticCount === 0` guard keeps them from reaching the certificate lookup.

### 2. Delete agent throws

- `packages/engine/src/agents/random-agent.ts:28-32` — delete the `if (completedMoves.length === 0) { throw new Error(...) }` block. Replace with a fallback return path: when `completedMoves.length === 0` post-fallback (structurally unreachable, defensive), return an empty-agent-decision or select from `stochasticMoves` if present. The simulator's `'noLegalMoves'` stop reason handles the genuinely-empty-after-drops case.
- `packages/engine/src/agents/policy-agent.ts:132-136` — delete the `throw new Error('PolicyAgent could not derive...')` block. Apply the same fallback semantics.
- `packages/engine/src/agents/greedy-agent.ts:61-65` — delete the `throw new Error('GreedyAgent could not derive...')` block. Apply the same fallback semantics.

The `input.legalMoves.length === 0` pre-condition throw in each agent remains — that's a caller contract, not a sampler outcome.

### 3. T4 — Agent sampler certificate fallback (unit test)

File: `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- Hand-construct a state with one classified-legal incomplete template AND a matching certificate in `certificateIndex`.
- Inject a chooser into `preparePlayableMoves` that always returns illegal selections (forces the retry loop to dead-end).
- Assert `preparePlayableMoves` returns `completedMoves.length === 1` — the fallback materialized the certificate.
- Assert no `Error` was thrown.
- Assert `input.rng.state` is equal to the RNG state after the retry loop's RNG advances (certificate fallback MUST NOT advance the RNG further).
- Negative case: classified-legal incomplete template with NO entry in `certificateIndex`. Assert `completedMoves.length === 0`, the `CONSTRUCTIBILITY_INVARIANT_VIOLATION` warning is emitted, and no throw.

### 4. T5 — Global no-throw property (integration test)

File: `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Property test: for a corpus of synthetic GameDef × state × seed × agent triples (RandomAgent, PolicyAgent baseline, PolicyAgent evolved), assert that whenever `enumerateLegalMoves` returns a non-empty `moves[]`, the agent's `chooseMove` returns a result and does not throw. Corpus includes adversarial sparse-`chooseN` cases derived from T2 (ticket 002).

### 5. T6 — Failing-seed regression (integration test)

File: `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts`

File-top marker: `// @test-class: architectural-invariant`. No `@witness:` (per Spec 137 distillation — the assertion holds across any legitimate trajectory).

Assertions:

- FITL seed 123 with 4 × `RandomAgent` at `maxTurns=200`: `runGame` does not throw; `trace.stopReason ∈ {'terminal', 'maxTurns', 'noLegalMoves'}`; `trace.moves.length > 0`.
- FITL seed 1002 with profiles `[us-baseline, arvn-evolved, nva-baseline, vc-baseline]`: same assertions.
- FITL seed 1010 with the same profile set: same assertions.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — add certificate fallback)
- `packages/engine/src/agents/random-agent.ts` (modify — delete throw)
- `packages/engine/src/agents/policy-agent.ts` (modify — delete throw)
- `packages/engine/src/agents/greedy-agent.ts` (modify — delete throw)
- `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts` (new — T4)
- `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` (new — T5)
- `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` (new — T6)

## Out of Scope

- FOUNDATIONS amendments — ticket 006.
- Replay-identity corpus sweep over passing seeds — ticket 007.
- Hidden-information safety and performance gate — ticket 008.
- `noPlayableMoveCompletion` stop reason — NOT restored (per Spec 139 Non-Goals; Spec 138's deletion stands).
- Changes to `NOT_VIABLE_RETRY_CAP` or `pendingTemplateCompletions` — budgets unchanged.

## Acceptance Criteria

### Tests That Must Pass

1. T4, T5, T6 all pass.
2. The three pre-existing CI failures (zobrist-incremental-parity seed=123, fitl-canary seeds 1002/1010 with `arvn-evolved`) pass — PR #221 CI turns green.
3. Full suite `pnpm turbo test` green.
4. No source or test file under `packages/engine/` throws `'could not derive a playable move'` (grep verifies deletion).

### Invariants

1. No agent throws when `input.legalMoves.length > 0` (T5 proves this as a property).
2. Certificate fallback advances no RNG (T4 RNG-state assertion proves this).
3. For the passing corpus, certificate fallback never activates — first-attempt retry produces a completion (ticket 007's T7 replay-identity gate proves byte-identical final state).
4. Failing seeds produce bounded outcomes (`terminal | maxTurns | noLegalMoves`) — T6 proves this.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts` (new) — T4.
2. `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` (new) — T5.
3. `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` (new) — T6.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted.
2. `pnpm -F @ludoforge/engine test:integration` — integration including T5 and T6.
3. `pnpm -F @ludoforge/engine test:determinism` — zobrist seed=123 must pass.
4. `pnpm turbo test` — full suite (PR #221 CI parity).
5. `pnpm turbo lint && pnpm turbo typecheck` — gates.
6. `grep -rE 'could not derive a playable move' packages/engine/` — must return zero matches.
