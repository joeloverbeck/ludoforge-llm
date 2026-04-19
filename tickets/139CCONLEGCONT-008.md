## 139CCONLEGCONT-008: Hidden-information safety (T8) + performance gate (T9) + I2 diagnostic transcript

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — two new tests, one new diagnostic script; one Spec 138 performance test deleted (superseded)
**Deps**: `tickets/139CCONLEGCONT-005.md`

## Problem

Spec 139 has three deferred validation deliverables that the admission contract makes possible but does not itself guarantee at the corpus level:

1. **Hidden-information safety (T8)**: certificate generation must not depend on invisible bindings. For a Texas-Hold'em state with hidden hole cards, the certificate must be computed against the projected state available to the active seat, not the omniscient state. Foundation #4 (authoritative state and observer views) — the spec research report § 7 names this as a first-class correctness requirement.
2. **Performance gate (T9)**: certificate-emitting classifier overhead on the stable 17-seed comparable FITL corpus stays below `1.50x` of the disable-certificate baseline. This supersedes Spec 138's `1.25x` gate in `spec-138-guided-classifier-overhead.test.ts` — the wider bound accommodates full-path search; tighter bounds may be set later if observed performance is better.
3. **I2 diagnostic transcript**: a checked-in script that traces the memoized DFS + set-variable-propagation algorithm on seeds 1002, 1010 (NVA `march` with `arvn-evolved`) and 123 (RandomAgent FITL) at the captured pre-failure state. Records probe steps consumed, memo hits, nogood records, terminal verdict, generated certificate. Paired with an engine-agnostic fixture test reproducing the same shape with synthetic data — validates algorithm behavior on the live witness.

## Assumption Reassessment (2026-04-19)

1. Spec 138's performance gate lives at `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (confirmed via glob). It uses a deterministic probe-step proxy (not wall-clock timing) for reproducibility. T9 reuses the methodology with the wider threshold.
2. The Texas Hold'em game definition exposes hidden hole cards via the kernel's projected-state mechanism (Foundation #4). Hand-constructing states with identical unmasked bindings but differing masked bindings is supported by existing test helpers.
3. `diagnose-existing-classifier.mjs` and `diagnose-agent-stuck.mjs` live under `campaigns/fitl-arvn-agent-evolution/` and import from `packages/engine/dist/` for zero-rebuild runs. The new `diagnose-certificate-search.mjs` follows the same pattern.
4. The stable 17-seed comparable FITL corpus is established by Spec 138's gate — reuse the same seed set for T9 so the performance delta is apples-to-apples.

## Architecture Check

1. **Hidden-info safety is Foundation #4's primary invariant.** If certificate generation leaked omniscient state, agents operating on projected views could reference bindings not visible to their seat — breaking the observer-view contract. T8 is the property proof.
2. **Performance gate is a deterministic invariant, not a perf assertion.** The probe-step proxy is reproducible across machines (Foundation #8, Foundation #16). T9 is a property test in the performance directory, not a benchmark.
3. **I2 transcript is evidence, not implementation.** The diagnostic script is a human-readable record of the algorithm's behavior on the live witness. The accompanying fixture test reproduces the same shape synthetically — that's the durable regression gate.
4. **Test supersession is Foundation #14.** Spec 138's `1.25x` gate is deleted in the same change that introduces T9's `1.50x` gate. No deprecated fallback.

## What to Change

### 1. I2 — Diagnostic script

File: `campaigns/fitl-arvn-agent-evolution/diagnose-certificate-search.mjs`

Follow the pattern of existing campaign diagnostics (`diagnose-existing-classifier.mjs`, `diagnose-agent-stuck.mjs`): import from `packages/engine/dist/`, accept `--seed <n>` and `--profile <id>`, reproduce the pre-failure state via the existing seed-replay mechanism, invoke the new memoized DFS with certificate emission enabled, and print:

- Probe steps consumed.
- Param expansions consumed.
- Memo hits and memo-hit ratio.
- Nogood records recorded.
- Terminal verdict (`'satisfiable'`, `'unsatisfiable'`, `'unknown'`, `'explicitStochastic'`).
- Generated certificate (JSON-serialized for readability).

Run it for seeds 123, 1002, 1010 and check in the resulting transcripts under `campaigns/fitl-arvn-agent-evolution/transcripts/diagnose-certificate-search-seed-<N>.log` (one per seed). Reference the transcripts from this ticket's outcome and from the spec's I2 section.

### 2. I2 fixture test (engine-agnostic shape reproduction)

File: `packages/engine/test/integration/spec-139-i2-fixture-certificate-search.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Hand-author a synthetic GameDef whose `chooseN` shape mirrors the FITL `march` witness (`min:1, max:27, options:27`) at a synthetic state with a known-legal subset. Assert the memoized DFS produces a certificate within `MoveEnumerationBudgets` default budgets; assert memo hits are > 0 (exercising the cache); assert at least one nogood is recorded and short-circuits a repeated subtree (exercising the nogood path).

### 3. T8 — Hidden-information safety (integration test)

File: `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- For a Texas-Hold'em state with hidden hole cards, construct two states that differ ONLY in the masked (hidden) bindings — the unmasked bindings are identical. Compute `classifyDecisionSequenceSatisfiability(..., { emitCompletionCertificate: true })` on each.
- Assert the two certificates are byte-identical. Certificate generation depends only on the projected state available to the active seat; invisible bindings do not perturb the output.
- Assert the certificate materializes to a fully-bound legal `Move` whose decisions reference only unmasked bindings.

### 4. T9 — Performance gate (deterministic probe-step proxy)

File: `packages/engine/test/performance/spec-139-certificate-overhead.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Reuse Spec 138's methodology:

- For the stable 17-seed comparable FITL corpus, run `enumerateLegalMoves` twice per seed:
  - Once with `emitCompletionCertificate: true` (the new contract — baseline mode for the new gate).
  - Once with `emitCompletionCertificate: false` (disable-certificate baseline).
- Record total probe steps consumed across the corpus in each mode.
- Assert `probeSteps(withCertificate) / probeSteps(withoutCertificate) < 1.50`.

Note the threshold is wider than Spec 138's `1.25x` to accommodate full-path search plus memoization overhead; tighter bounds may be set later if observed performance is better.

### 5. Delete superseded Spec 138 performance test

Delete `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` per Spec 139 T0 migration table. T9 supersedes at the new threshold.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-certificate-search.mjs` (new — I2 script)
- `campaigns/fitl-arvn-agent-evolution/transcripts/diagnose-certificate-search-seed-123.log` (new — I2 transcript)
- `campaigns/fitl-arvn-agent-evolution/transcripts/diagnose-certificate-search-seed-1002.log` (new — I2 transcript)
- `campaigns/fitl-arvn-agent-evolution/transcripts/diagnose-certificate-search-seed-1010.log` (new — I2 transcript)
- `packages/engine/test/integration/spec-139-i2-fixture-certificate-search.test.ts` (new — I2 fixture)
- `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` (new — T8)
- `packages/engine/test/performance/spec-139-certificate-overhead.test.ts` (new — T9)
- `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (delete — T0 migration)

## Out of Scope

- Any behavioral change to the admission contract, classifier, or agent sampler. This ticket is pure validation and diagnostics.
- Cross-call memoization — spec Edge Cases lists it as future work, not in scope.
- New agent profiles or game-data changes.
- Tightening the `1.50x` threshold based on T9 results — that's a follow-up if observed performance warrants.

## Acceptance Criteria

### Tests That Must Pass

1. T8 passes: certificates are byte-identical across states differing only in masked bindings.
2. T9 passes: `probeSteps(withCert) / probeSteps(withoutCert) < 1.50` across the 17-seed corpus.
3. I2 fixture test passes on the synthetic `min:1, max:27, options:27` mirror.
4. `diagnose-certificate-search.mjs` runs for seeds 123, 1002, 1010 and produces three transcripts.
5. `grep -r 'spec-138-guided-classifier-overhead' packages/engine/` returns zero matches post-ticket.
6. Full suite `pnpm turbo test` green.

### Invariants

1. Certificate generation is hidden-information-safe: projected-state-only, no omniscient-state leak (Foundation #4).
2. Certificate-emitting classifier overhead is bounded at `1.50x` the disable-certificate baseline on the stable corpus (Foundation #10).
3. Memoized DFS + set-variable propagation produces a certificate on the adversarial shape within default budgets (I2 fixture proves this on synthetic data; diagnostic transcripts corroborate on live witness).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/spec-139-i2-fixture-certificate-search.test.ts` (new) — I2 fixture.
2. `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` (new) — T8.
3. `packages/engine/test/performance/spec-139-certificate-overhead.test.ts` (new) — T9.
4. `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (delete).

### Commands

1. `pnpm -F @ludoforge/engine build` — required before running diagnostics (they import from `dist/`).
2. `pnpm -F @ludoforge/engine test:integration` — T8 + I2 fixture.
3. `pnpm -F @ludoforge/engine test:performance` — T9.
4. `node campaigns/fitl-arvn-agent-evolution/diagnose-certificate-search.mjs --seed 123 > campaigns/fitl-arvn-agent-evolution/transcripts/diagnose-certificate-search-seed-123.log` — regenerate transcript (repeat for seeds 1002, 1010).
5. `pnpm turbo test` — full suite.
6. `pnpm turbo lint && pnpm turbo typecheck` — gates.
