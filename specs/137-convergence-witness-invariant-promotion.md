# Spec 137: Promote FITL Convergence-Witness Trajectory Tests to Architectural Invariants

**Status**: DRAFT
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 133 [regression-test-classification-discipline] (archived), Spec 135 [choosen-sampler-semantics] (archived)
**Source**: Follow-up scoped out during Spec 135 remediation on PR #219. When the sampler-bias relocation shifted FITL canary trajectories, three convergence-witness tests had to be re-blessed in-place (`fitl-policy-agent-enumeration-hang.test.ts` ply-20 count; `fitl-seed-1002-regression.test.ts` allowed-stop-reasons; `fitl-seed-1005-1010-1013-regression.test.ts` allowed-stop-reasons). Per `.claude/rules/testing.md`, the cleaner long-run answer is to distill each witness into the property it guards and promote it to `architectural-invariant`.

## Overview

Rewrite the three FITL convergence-witness regression tests so each asserts a property that holds across every legitimate kernel evolution, not a `(seed, profile, kernel-version)`-specific trajectory. Once the property-form tests are in place, retire the seed-pinned assertions. The goal is trajectory-agnostic regression protection: any future RNG-stream-affecting change (e.g., further sampler tuning, new policy-profile heuristics, Spec 13 mechanic-bundle IR) must not require re-blessing these files.

## Problem Statement

The following tests currently encode a specific `(seed, profile, kernel-version)` observation as the regression guard:

- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` — asserts `legal.moves.length === 18` at seed 1040, ply 20, under the baseline policy profile set. The "18" is the post-Spec-135 trajectory; on `main` pre-PR-219 it was "19".
- `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` — asserts the post-retry-exhaustion trace uses one of `{terminal, maxTurns, noLegalMoves, noPlayableMoveCompletion}` and that `phuoc-long:none` remains `neutral` on support/opposition.
- `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` — asserts seeds 1005/1010/1013 each stay non-throwing under one of the allowed stop reasons.

Each witness was authored when a specific production trajectory hit a specific failure mode (enumeration stall, empty-move classification, campaign-seat no-playable). The authored assertions conflate two things:

1. **The invariant**: enumeration must terminate in finite time; legal classification must not produce empty sets while the game is live; the trace must be well-formed for every stop condition; population-0 spaces must not accrue support/opposition.
2. **The trajectory**: seed X with policy profile Y under kernel version Z reaches state S at ply P with observed legal-move count C.

When the engine changes in ways that shift RNG consumption (Spec 132 policy-fallback, Spec 135 sampler-bias relocation, Spec 134 unified legality predicate), (2) shifts even when (1) still holds. The test fails on the shifted trajectory and has to be re-blessed with the new observation. That is costly, noisy, and disguises which invariant actually matters.

This violates:

- **FOUNDATIONS #15 (Architectural Completeness)**: the test form pins *symptoms* of a past fix rather than the *property* the fix established. Every trajectory-shifting change pays re-bless tax on tests whose underlying invariant is unaffected.
- **FOUNDATIONS #16 (Testing as Proof)**: a trajectory-pinned assertion does not prove the invariant; it proves only that this one seed happens to exhibit the invariant today.

## Goals

- Rewrite each of the three convergence-witness tests so the body asserts a property of *any* legitimate trajectory through the kernel (typically: terminate bounded; never throw; satisfy a state invariant) rather than a specific `(seed, ply, count)` observation.
- Classify each rewritten test as `architectural-invariant` with the file-top marker.
- Preserve the defect-class coverage: any future change that reintroduces the enumeration stall, the classification/completion gap, or the population-0 support leak must still fail the rewritten tests.
- Retire or migrate the `@witness:` back-references to cite the property rather than the pinned trajectory.

## Non-Goals

- No change to FITL policy-profile corpus or agent-selection heuristics.
- No change to the kernel, compiler, sampler, or legality predicate. This spec is test-only.
- No change to Spec 132 / 133 / 134 / 135 archival artifacts.
- No change to the `noPlayableMoveCompletion` stop reason or the simulator's handling of agent retry exhaustion (established in PR #219).
- No attempt to distill every convergence-witness test in the repo; this spec covers only the three FITL trajectory-pinned witnesses listed in Problem Statement.

## Definitions

### Trajectory-pinned assertion

An assertion of the form `assert.equal(someObservation, pinnedValue)` where `pinnedValue` was computed on a specific kernel version by running a specific seed under a specific agent profile set. The assertion holds *iff* the trajectory is byte-equivalent to the recording run.

### Property assertion

An assertion of the form `assert.ok(trajectoryClass(trace).satisfies(invariant))` where `invariant` is a predicate that any legitimate trajectory must satisfy regardless of the seed-specific path. Examples: "terminates in finite time", "never produces a trace with a stop reason outside the allowed set", "never leaves population-0 spaces with non-neutral support/opposition".

### Distillation

The process of rewriting a trajectory-pinned assertion into one or more property assertions that cover the same defect class without pinning the trajectory.

## Contract

### 1. Enumeration-hang test (`fitl-policy-agent-enumeration-hang.test.ts`)

**Original intent** (witness `132AGESTUVIA-001`): prove enumeration does not hang at the former ply-20 hotspot on seed 1040.

**Distilled property**: `enumerateLegalMoves` returns a bounded move set in bounded time for *every* reachable in-flight state of the FITL production spec under the baseline policy profiles. Hang is defined as runtime exceeding a declared per-call budget (e.g., 200ms) or returning an unbounded result.

**Rewritten test shape**:

```ts
it('enumerates legal moves in bounded time across a sampled state corpus', () => {
  const corpus = generateFitlStateCorpus({ seeds: [1040, 1012, ...N_MORE], maxPly: 60 });
  for (const { state, ply } of corpus) {
    const started = performance.now();
    const legal = enumerateLegalMoves(def, state, undefined, runtime);
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs < 200, `ply ${ply}: enumerate took ${elapsedMs}ms`);
    assert.ok(legal.moves.length <= MAX_REASONABLE_MOVE_COUNT);
  }
});
```

The seed list becomes a corpus, not a witness. Adding / removing seeds in the corpus does not require re-blessing; it just grows coverage.

### 2. Seed 1002 test (`fitl-seed-1002-regression.test.ts`)

**Original intent** (witness `132AGESTUVIA-008`): seed 1002 completes without throwing and leaves `phuoc-long:none` neutral.

**Distilled property**: for *every* FITL canary seed, (a) `runGame` produces a trace with a stop reason in the canonical allowed set, and (b) every population-0 space remains neutral on support/opposition throughout the entire trace.

**Rewritten test shape**:

```ts
const POPULATION_ZERO_SPACES = derivePopulationZeroSpaces(def);
const CANARY_SEEDS = [1000, 1001, 1002, ...];
for (const seed of CANARY_SEEDS) {
  it(`seed ${seed}: population-0 spaces stay neutral throughout`, () => {
    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, {}, runtime);
    assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason));
    for (const space of POPULATION_ZERO_SPACES) {
      assert.equal(
        trace.finalState.markers[`${space}:none`]?.supportOpposition ?? 'neutral',
        'neutral',
      );
    }
  });
}
```

The property (population-0 invariance, bounded termination) is now provable across the canary corpus, not only seed 1002.

### 3. Seeds 1005/1010/1013 test (`fitl-seed-1005-1010-1013-regression.test.ts`)

**Original intent** (witness `132AGESTUVIA-009`): these seeds do not throw under the `arvn-evolved` policy profile.

**Distilled property**: under *any* policy profile set declared in the production corpus, `runGame` always produces a well-formed trace for every seed in the canary range. Non-throw is a strict subset — the trace exists and has a declared stop reason, regardless of whether retries exhausted.

**Rewritten test shape**: merge with the seed-1002 form above; the list `[1005, 1010, 1013]` joins `CANARY_SEEDS`. The assertion becomes "every canary seed produces a trace with an allowed stop reason under every supported profile set."

After distillation, the three files collapse into a smaller set (likely two: one for enumeration bounds, one for bounded-termination-with-state-invariants). The `@witness:` markers either disappear (the property is its own proof) or get retargeted to cite the invariant statement.

### 4. Classification migration

Each rewritten test file:

- Replaces `// @test-class: convergence-witness` with `// @test-class: architectural-invariant`.
- Removes the `// @witness: <id>` line.
- Adds a short JSDoc/block comment citing the distilled invariant and the defect class it guards (enumeration-stall, no-playable-after-preparation, population-0 drift).

### 5. Retirement of seed-pinned assertions

The seed-specific assertions currently in the three files are deleted. If any individual seed trajectory is a particularly high-value regression probe (e.g., seed 1040 has historically been the primary enumeration-hang canary), it can be retained as a *secondary* assertion inside the corpus loop — but only if the secondary assertion is itself property-form (e.g., "this seed completes in bounded time") not trajectory-form ("this seed has exactly 18 legal moves at ply 20").

## Required Invariants

1. Every test file in `packages/engine/test/integration/fitl-seed-*.test.ts` and `packages/engine/test/integration/fitl-policy-agent-*.test.ts` classified as `architectural-invariant` after this spec lands. No `convergence-witness` marker remains on the three files in scope.
2. Grep for `legal.moves.length === [0-9]+` inside the three files in scope returns zero matches — no trajectory-pinned enumeration counts.
3. The three distilled test files pass on a fresh RNG trajectory produced by any hypothetical kernel change that satisfies the invariants (verified by construction during rewriting; acceptance proof: deliberately perturb the sampler seed prefix and re-run — tests should still pass).

## Foundations Alignment

- **#15 Architectural Completeness**: after this spec, trajectory-shifting kernel changes no longer pay re-bless tax on these three files. The invariant being tested is orthogonal to the trajectory, so only genuine invariant violations will fail.
- **#16 Testing as Proof**: property-form assertions prove the invariant across a corpus; trajectory-pinned assertions only prove the invariant *at the witness point*.
- **#8 Determinism**: unchanged. The rewritten tests still exercise deterministic `runGame` execution; they just assert properties of the resulting trace rather than its exact contents.
- **#14 No Backwards Compatibility**: the pre-existing convergence-witness assertions are deleted, not retained as a legacy path.

## Required Proof

### Integration Proof

- The three rewritten files pass under the canary seed corpus.
- A deliberate "shift the RNG prefix" perturbation (e.g., change `AGENT_RNG_MIX` by one bit in a local branch) causes existing convergence-witness tests to fail but the rewritten tests to still pass. This proves the rewrite is trajectory-agnostic.

### Architectural Proof

- After landing, no file under `packages/engine/test/integration/` carries a `// @witness:` marker that references a trajectory-pinned enumeration count or a seed-pinned stop-reason allow-list.
- `grep "convergence-witness" packages/engine/test/integration/fitl-seed-*.test.ts packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` returns empty.

## Implementation Direction

1. **Enumeration-hang rewrite**: Fold `fitl-policy-agent-enumeration-hang.test.ts` into a new `fitl-enumeration-bounds.test.ts`. The new file exercises a generated state corpus (reuse or extend `packages/engine/test/helpers/production-spec-helpers.ts`) and asserts per-call enumeration bound.

2. **Bounded-termination rewrite**: Merge `fitl-seed-1002-regression.test.ts` and `fitl-seed-1005-1010-1013-regression.test.ts` into a canary-wide test `fitl-canary-bounded-termination.test.ts`. The file iterates `CANARY_SEEDS × POLICY_PROFILE_SETS` and asserts: (a) stop reason is in the canonical allowed set; (b) every population-0 space stays neutral on support/opposition in the final state.

3. **Witness retirement**: Archive or delete the three original files in the same change. The `@witness:` references are replaced with property-citing comments.

4. **Rule file clarification**: Update `.claude/rules/testing.md` with a short section titled "Distillation over re-bless" describing the pattern applied here — so future trajectory-pinned witness additions are challenged upfront.

## Out of Scope

- Distillation of other convergence-witness tests in the repo (e.g., golden-trace tests, Texas Hold'em witnesses). Those follow separately if they exhibit the same re-bless churn.
- Agent profile changes or corpus expansion. The existing `CANARY_SEEDS` range is sufficient; adding more seeds is an independent concern.
- Any runtime behavior change. This spec is test-code only.

## Tickets

To be decomposed.

## Outcome

TBD.
