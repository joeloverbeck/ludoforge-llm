## 139CCONLEGCONT-007: Replay-identity sweep (I3) + T7 determinism test

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — one new determinism test; one Spec 138 determinism test deleted (superseded); one tiny internal trace-field addition to prove fallback inertness at the live seam
**Deps**: `archive/tickets/139CCONLEGCONT-005.md`

## Problem

Spec 139 G7 requires that the passing corpus — seeds where the current first-attempt sampler already succeeds — produces byte-identical canonical serialized final state under the new admission contract. This carries Spec 138 G6 forward: certificate materialization must not activate when the first-attempt sampler succeeds, must not advance the agent's RNG, and must not perturb the canonical state hash.

I3 executes the replay-identity sweep twice per seed in the passing corpus under the live admission contract. Byte-identity of canonical serialized final state is asserted, and representative seeds prove the certificate fallback seam remains inert when first-attempt completion already succeeds.

T7 is the checked-in determinism test that codifies the sweep's contract. It supersedes Spec 138's `fitl-seed-guided-sampler-replay-identity.test.ts` — that test asserted the Spec 138 replay-identity contract over the head-guided sampler, which no longer exists.

## Assumption Reassessment (2026-04-19)

1. The passing corpus is those seeds where the retry loop's first attempt produces a completion. By inspection, that's most FITL seeds except 123 (RandomAgent), 1002, 1010 (PolicyAgent with `arvn-evolved`). Ticket 005 closes those failures; T7 covers the remaining corpus.
2. `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` exists (confirmed via glob). The spec T0 migration table lists it as "Delete — superseded by T7".
3. Canonical state hash is a product of the kernel (see `state-hash.ts`) — byte-identical canonical serialization is the authoritative equality test (Foundation #8 appendix). Hashes accelerate comparison; canonical serialized state remains the source of truth.
4. The Texas Hold'em corpus has its own determinism suite (`draft-state-determinism-parity.test.ts`). Ticket 008 references it; this ticket confirms it runs green under the new contract.
5. Live contract correction (2026-04-20): the old “compare against pre-spec-139 path” framing is stale. The remaining `disableGuidedChooser` switch affects legacy head-guidance behavior in `PolicyAgent`, not certificate fallback. T7 therefore proves replay identity by rerunning the same corpus twice under the current contract and separately asserting that the real fallback seam stays inert on representative seeds.

## Architecture Check

1. **Replay identity is Foundation #8's primary invariant.** T7 encodes the "same GameDef + same initial state + same seed + same actions = identical result" commandment for the Spec 139 delta.
2. **Certificate fallback is inert on passing seeds.** If it activated on the passing corpus, it would change the real replay seam. T7 proves inertness directly at the current fallback path instead of comparing against a stale pre-spec compatibility branch.
3. **Test supersession is Foundation #14 atomic cut.** Spec 138's `fitl-seed-guided-sampler-replay-identity.test.ts` is deleted in the same change that introduces T7, not left as a deprecated fallback.
4. **Corpus breadth.** Sweeping both FITL and Texas Hold'em exercises two distinct game families (asymmetric COIN-series vs. stochastic card game) — broad coverage that Foundation #16's conformance-corpus requirement implicitly benefits from.

## What to Change

### 1. T7 — Replay-identity preservation (determinism test)

File: `packages/engine/test/determinism/spec-139-replay-identity.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- For each seed in the FITL passing corpus (all canary seeds excluding the three formerly-failing ones, which now pass via certificate fallback — they are covered separately by T6 in ticket 005):
  - Run `runGame` twice with identical inputs under the current admission contract.
  - Assert canonical serialized final state is byte-identical between the two runs.
- For each seed in the Texas Hold'em determinism corpus (existing `draft-state-determinism-parity.test.ts` shape):
  - Run twice under the new contract.
  - Assert canonical serialized final state is byte-identical.
- For one representative seed from each corpus, instrument the real fallback seam to assert the certificate fallback path is NOT invoked during the run (sentinel counter on the fallback branch incremented; assert count is zero).

### 2. Delete superseded Spec 138 test

Delete `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` per Spec 139 T0 migration table. The T7 determinism assertions cover the same property (canonical-state byte-identity) without the Spec 138 head-guidance-specific scaffolding.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — expose certificate-fallback source in internal move-preparation trace)
- `packages/engine/src/kernel/types-core.ts` (modify — add optional trace field for fallback-source diagnostics)
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (new — T7)
- `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (delete — T0 migration)

## Out of Scope

- Performance gate — ticket 008.
- Hidden-information safety — ticket 008.
- I2 diagnostic script for failing-seed algorithm characterization — ticket 008 (I2 is separate from I3).
- Any behavioral change to the admission contract or agent sampler — this ticket is pure instrumentation.

## Acceptance Criteria

### Tests That Must Pass

1. T7 passes across the FITL passing corpus.
2. T7 passes across the Texas Hold'em determinism corpus.
3. Certificate-fallback-inert assertion fires zero times on the instrumented sample seed.
4. `grep -r 'fitl-seed-guided-sampler-replay-identity' packages/engine/` returns zero matches post-ticket.
5. Full suite `pnpm turbo test` green.

### Invariants

1. Canonical serialized final state is byte-identical across runs for the passing corpus under the new contract.
2. Certificate fallback never activates for representative passing-corpus seeds; replay identity across the full passing corpus proves the live contract remains deterministic and stable.
3. Foundation #8's replay-identity commandment holds for every seed in the corpus.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (new) — T7.
2. `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (delete) — superseded.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` — targeted.
2. `pnpm turbo test` — full suite.
3. `grep -r 'fitl-seed-guided-sampler-replay-identity' packages/engine/` — zero matches.

## Outcome

Completed on 2026-04-20.

The original replay-identity boundary needed one live correction before implementation: the ticket's old “compare against the pre-spec path” wording was stale. The remaining `disableGuidedChooser` switch only affects legacy head-guidance behavior, not certificate fallback, so T7 was rewritten to prove replay identity under the current contract and to check fallback inertness directly at the live fallback seam.

What changed:

1. Added `packages/engine/test/determinism/spec-139-replay-identity.test.ts` as the new T7 proof:
   - FITL passing canary seeds `1005` and `1013` replay to byte-identical canonical serialized final state under the current contract
   - the Texas determinism corpus replays to byte-identical canonical serialized final state under the current contract
   - representative FITL and Texas runs prove that certificate fallback stays inert
2. Deleted `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` in the same change.
3. Added one tiny internal diagnostic seam in `types-core.ts` and `prepare-playable-moves.ts` so move-preparation traces can record when a completed move came from certificate fallback. T7 uses that field for the inertness proof; runtime behavior is unchanged.

Deviations from original plan:

1. `ticket corrections applied`: `compare against unmodified pre-spec path -> replay twice under the live contract and prove fallback inertness directly at the real fallback seam`
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` was run as two sequential commands to preserve single-lane artifact discipline while still directly proving both named steps.

Verification set:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-139-replay-identity.test.js`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `grep -r 'fitl-seed-guided-sampler-replay-identity' packages/engine/`
5. `pnpm turbo test`
