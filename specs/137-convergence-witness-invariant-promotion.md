# Spec 137: Promote FITL Convergence-Witness Trajectory Tests to Architectural Invariants

**Status**: DRAFT
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 133 [regression-test-classification-discipline] (archived), Spec 135 [choosen-sampler-semantics] (archived)
**Related**: Spec 136 [policy-profile-quality-corpus] (DRAFT, non-overlapping — see Source)
**Source**: Follow-up scoped out during Spec 135 remediation on PR #219. When the sampler-bias relocation shifted FITL canary trajectories, three convergence-witness tests had to be re-blessed in-place (`fitl-policy-agent-enumeration-hang.test.ts` ply-20 count; `fitl-seed-1002-regression.test.ts` allowed-stop-reasons; `fitl-seed-1005-1010-1013-regression.test.ts` allowed-stop-reasons). Per `.claude/rules/testing.md`, the cleaner long-run answer is to distill each witness into the property it guards and promote it to `architectural-invariant`.

Spec 136 [policy-profile-quality-corpus] (DRAFT) lists two of these three files as reclassification candidates under its "depending on whether their assertions are profile-specific" criterion. The assertions here (bounded stop reason, population-0 neutrality, enumeration non-emptiness) are architectural invariants, not profile-specific — so distillation (this spec) is the right home, while Spec 136 targets the genuinely dual-duty test at `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`.

## Overview

Rewrite the three FITL convergence-witness regression tests so each asserts a property that holds across every legitimate kernel evolution, not a `(seed, profile, kernel-version)`-specific trajectory. Once the property-form tests are in place, retire the seed-pinned assertions. The goal is trajectory-agnostic regression protection: any future RNG-stream-affecting change (e.g., further sampler tuning, new policy-profile heuristics, Spec 13 mechanic-bundle IR) must not require re-blessing these files.

## Problem Statement

The three target tests fall on a spectrum of trajectory-pinnedness:

- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` — **fully trajectory-pinned**: asserts `legal.moves.length === 18` at seed 1040, ply 20, under the baseline policy profile set (line 47). The "18" is the post-Spec-135 trajectory; on `main` pre-PR-219 it was "19". A second `it` block in the same file (seed 1012, former ply-59 hotspot) already asserts property form (`legal.moves.length > 0`) and is not itself trajectory-pinned — it rides the same `@witness:` marker only because of file co-location.
- `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` — **property-form over hardcoded pins**: already asserts `trace.stopReason` is a member of `{terminal, maxTurns, noLegalMoves, noPlayableMoveCompletion}` and that `phuoc-long:none` remains `neutral` on `supportOpposition`. Both assertions generalize cleanly across trajectories; the witness pins are (a) the single seed 1002 and (b) the single space `phuoc-long:none` rather than all population-0 spaces derivable from the FITL map.
- `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` — **property-form over hardcoded seeds**: asserts allowed stop reason and `trace.moves.length > 0` for seeds 1005/1010/1013. Assertions are property-form; the seed list is the remaining witness pin.

Each witness was authored when a specific production trajectory hit a specific failure mode (enumeration stall, empty-move classification, campaign-seat no-playable). The authored tests conflate two things:

1. **The invariant**: enumeration must terminate in finite time with bounded output; legal classification must not produce empty sets while the game is live; the trace must be well-formed for every stop condition; population-0 spaces must not accrue support/opposition.
2. **The trajectory (or witness set)**: seed X with policy profile Y under kernel version Z reaches state S at ply P with observed legal-move count C — or, for the property-form tests, the invariant holds on *these specific seeds under this specific profile set* but the test does not prove it holds on any other.

When the engine changes in ways that shift RNG consumption (Spec 132 policy-fallback, Spec 135 sampler-bias relocation, Spec 134 unified legality predicate), (2) shifts even when (1) still holds. The test fails on the shifted trajectory and has to be re-blessed with the new observation. That is costly, noisy, and disguises which invariant actually matters.

This violates:

- **FOUNDATIONS #15 (Architectural Completeness)**: the test form pins *symptoms* of a past fix rather than the *property* the fix established. Every trajectory-shifting change pays re-bless tax on tests whose underlying invariant is unaffected.
- **FOUNDATIONS #16 (Testing as Proof)**: a trajectory-pinned or hardcoded-seed assertion does not prove the invariant; it proves only that the invariant holds on the witness seeds today.

## Goals

- Rewrite each of the three convergence-witness tests so the body asserts a property of *any* legitimate trajectory through the kernel (typically: terminate bounded; never throw; satisfy a state invariant) rather than a specific `(seed, ply, count)` observation or a property pinned to a hardcoded seed/space subset.
- Classify each rewritten test as `architectural-invariant` with the file-top marker.
- Preserve the defect-class coverage: any future change that reintroduces the enumeration stall, the classification/completion gap, or the population-0 support leak must still fail the rewritten tests.
- Retire the `@witness:` back-references; architectural-invariant tests do not carry them.

## Non-Goals

- No change to FITL policy-profile corpus or agent-selection heuristics.
- No change to the kernel, compiler, sampler, or legality predicate. This spec is test-only.
- No change to Spec 132 / 133 / 134 / 135 archival artifacts.
- No change to the `noPlayableMoveCompletion` stop reason or the simulator's handling of agent retry exhaustion (established in PR #219).
- No attempt to distill every convergence-witness test in the repo; this spec covers only the three FITL files in scope.

## Definitions

### Trajectory-pinned assertion

An assertion of the form `assert.equal(someObservation, pinnedValue)` where `pinnedValue` was computed on a specific kernel version by running a specific seed under a specific agent profile set. The assertion holds *iff* the trajectory is byte-equivalent to the recording run.

### Property assertion

An assertion of the form `assert.ok(trajectoryClass(trace).satisfies(invariant))` where `invariant` is a predicate that any legitimate trajectory must satisfy regardless of the seed-specific path. Examples: "terminates in finite time with bounded output", "never produces a trace with a stop reason outside the allowed set", "never leaves population-0 spaces with non-neutral support/opposition".

### Distillation

The process of rewriting a trajectory-pinned assertion (or a property-form assertion pinned to a hardcoded seed/space subset) into one or more property assertions that cover the same defect class without pinning the trajectory or the witness seed set.

## Contract

### 1. Enumeration-bounds test (`fitl-enumeration-bounds.test.ts`)

**Original intent** (witness `132AGESTUVIA-001`): prove enumeration does not hang at the former ply-20 hotspot on seed 1040.

**Distilled property**: `enumerateLegalMoves` returns a bounded move set in finite time for *every* reachable in-flight state of the FITL production spec. "Bounded" is asserted as `legal.moves.length <= MAX_REASONABLE_MOVE_COUNT`. "Finite time" is enforced by the node test runner's per-test timeout (e.g., 20s); a hang is detected as a timeout, not via a wall-clock assertion.

**Rewritten test shape**:

```ts
it('enumerates bounded legal-move sets across a sampled FITL state corpus', { timeout: 20_000 }, () => {
  const corpus = buildDeterministicFitlStateCorpus(def, {
    seeds: [1040, 1012, /* additional canary seeds */],
    maxPly: 60,
  });
  for (const { state, ply } of corpus) {
    const legal = enumerateLegalMoves(def, state, undefined, runtime);
    assert.ok(
      legal.moves.length <= MAX_REASONABLE_MOVE_COUNT,
      `ply ${ply}: enumeration produced ${legal.moves.length} moves (exceeds bound)`,
    );
  }
});
```

The seed list becomes a corpus, not a witness. Adding or removing seeds grows coverage without re-blessing.

**Rationale for non-wall-clock bound**: Earlier drafts proposed `assert.ok(performance.now() - started < 200)`. That form makes test pass/fail hardware-dependent (CI runner load, concurrent tests, GC pauses) and introduces ambient process-state dependence at the test-suite level. A move-count bound is a property of the enumeration output (FOUNDATIONS #10 Bounded Computation), and hang detection via test-runner timeout is portable and deterministic.

**Corpus helper**: Parameterize the existing `buildDeterministicFitlStateCorpus` at `packages/engine/test/helpers/compiled-condition-production-helpers.ts:120` to accept an optional `{ seeds, maxPly }` argument. Current hardcoded values (`STATE_CORPUS_SEEDS = [11, 23, 37, 53]`, `STATE_CORPUS_STEPS_PER_SEED = 4`) become defaults to preserve existing consumers: `compiled-condition-benchmark.test.ts`, `enumeration-snapshot-benchmark.test.ts`, `compiled-condition-equivalence.test.ts`, `first-decision-production-helpers.ts`. The new test calls it with the canary-seed parameters. The helper's deterministic move-selection (`moves[(seed + step) % moves.length]`) is trajectory-agnostic by construction — it does not depend on agent RNG state — which is exactly the property needed here.

### 2. Canary-bounded-termination test (`fitl-canary-bounded-termination.test.ts`)

**Original intent** (witnesses `132AGESTUVIA-008`, `132AGESTUVIA-009`): seed 1002 completes without throwing and leaves `phuoc-long:none` neutral; seeds 1005/1010/1013 complete without throwing.

**Distilled property**: for *every* FITL canary seed under *every* supported policy-profile variant, (a) `runGame` produces a trace with a stop reason in the canonical allowed set `{terminal, maxTurns, noLegalMoves, noPlayableMoveCompletion}`; (b) every population-0 space (derived from the FITL map, not hardcoded) remains `neutral` on `supportOpposition` in the final state; (c) `runGame` does not throw (an exception would fail the test before any assertion runs).

**Rewritten test shape**:

```ts
const CANARY_SEEDS = [1002, 1005, 1010, 1013, /* additional canary seeds */] as const;
const POLICY_PROFILE_VARIANTS = [
  ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
  ['us-baseline', 'arvn-evolved',  'nva-baseline', 'vc-baseline'],
] as const;
const POPULATION_ZERO_SPACES = deriveFitlPopulationZeroSpaces(def);
const ALLOWED_STOP_REASONS = new Set([
  'terminal', 'maxTurns', 'noLegalMoves', 'noPlayableMoveCompletion',
]);

for (const profiles of POLICY_PROFILE_VARIANTS) {
  for (const seed of CANARY_SEEDS) {
    it(
      `profiles=${profiles.join(',')} seed=${seed}: bounded stop and population-0 neutrality`,
      { timeout: 20_000 },
      () => {
        const agents = profiles.map(
          (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
        );
        const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

        assert.ok(
          ALLOWED_STOP_REASONS.has(trace.stopReason),
          `stop=${trace.stopReason} after ${trace.moves.length} moves`,
        );
        for (const space of POPULATION_ZERO_SPACES) {
          assert.equal(
            trace.finalState.markers[`${space}:none`]?.supportOpposition ?? 'neutral',
            'neutral',
            `population-0 space ${space} drifted on supportOpposition`,
          );
        }
      },
    );
  }
}
```

**Profile-variant rationale**: The pre-distillation files disagree on the ARVN profile — `fitl-policy-agent-enumeration-hang.test.ts:19` uses `arvn-baseline`; the seed-regression files (`fitl-seed-1002-regression.test.ts:15`, `fitl-seed-1005-1010-1013-regression.test.ts:12`) use `arvn-evolved`. The merged test iterates both variants so neither loses coverage.

**Population-0 helper**: `deriveFitlPopulationZeroSpaces(def)` is a FITL-specific derivation — it reads the map `dataAssets` entry where `kind === 'map' && id === 'fitl-map-production'` and returns zone IDs whose `attributes.population === 0`. Per FOUNDATIONS #1 (Engine Agnosticism), this function MUST NOT live in generic engine/kernel/runtime code. Add it to `packages/engine/test/helpers/production-spec-helpers.ts` (which already mixes FITL and Texas helpers) or to a dedicated `packages/engine/test/helpers/fitl-map-helpers.ts`. The `Fitl` name prefix makes the game specificity explicit in every call site.

### 3. Classification migration

The two new test files (`fitl-enumeration-bounds.test.ts`, `fitl-canary-bounded-termination.test.ts`):

- Declare `// @test-class: architectural-invariant` at file top.
- Do NOT declare `// @witness:` markers. Per `.claude/rules/testing.md`, architectural-invariant tests do not carry witness back-references.
- Carry a short block comment citing the distilled invariant and the defect class it guards (enumeration-stall, no-playable-after-preparation, population-0 drift).

### 4. Retirement of seed-pinned assertions

The seed-specific assertions currently in the three pre-distillation files are deleted. If any individual seed (e.g., 1040, historically the primary enumeration-hang canary) is high-value, it can be retained as an *explicit* entry inside `CANARY_SEEDS` or the enumeration-bounds corpus — but no secondary assertion may be trajectory-form (e.g., no "this seed has exactly N legal moves at ply P").

## Required Invariants

1. Every test file in `packages/engine/test/integration/fitl-seed-*.test.ts` and `packages/engine/test/integration/fitl-policy-agent-*.test.ts` is classified as `architectural-invariant` after this spec lands. No `convergence-witness` marker remains on the two distilled files.
2. `grep -n "legal.moves.length === [0-9]" packages/engine/test/integration/fitl-*.test.ts` returns zero matches — no trajectory-pinned enumeration counts remain.
3. The two distilled test files pass on a fresh RNG trajectory produced by any hypothetical kernel change that satisfies the invariants (verified by construction during rewriting; acceptance validated via the manual QA step in Implementation Direction).
4. Trajectory-shifting engine changes (sampler tweaks, policy-profile updates, legality-predicate adjustments) MUST NOT require editing the distilled files. If a future change forces a re-bless of either `fitl-enumeration-bounds.test.ts` or `fitl-canary-bounded-termination.test.ts`, the distillation failed — re-file to restore invariant orthogonality rather than re-blessing trajectories.

## Foundations Alignment

- **#1 Engine Agnosticism**: FITL-specific helpers (`deriveFitlPopulationZeroSpaces`, parameterized FITL state corpus) live in `packages/engine/test/helpers/`, not in runtime/compiler/kernel code. No game-specific logic added to engine modules.
- **#8 Determinism Is Sacred**: aligned. The rewritten tests use move-count and state-invariant assertions; the earlier draft's `performance.now() < 200ms` bound was rejected because wall-clock assertions introduce ambient process-state dependence at the test-suite level.
- **#10 Bounded Computation**: directly proven by the move-count bound on `enumerateLegalMoves` output plus the node test runner's per-test timeout.
- **#14 No Backwards Compatibility**: the pre-existing convergence-witness assertions are deleted, not retained as a legacy path.
- **#15 Architectural Completeness**: after this spec, trajectory-shifting kernel changes no longer pay re-bless tax on these files. The invariant being tested is orthogonal to the trajectory, so only genuine invariant violations will fail.
- **#16 Testing as Proof**: property-form assertions prove the invariant across a corpus × profile-variant cartesian; trajectory-pinned assertions only prove the invariant *at the witness point*.

## Required Proof

### Integration Proof

- Both rewritten files pass across `CANARY_SEEDS × POLICY_PROFILE_VARIANTS`.
- No `enumerateLegalMoves` call across the corpus exceeds `MAX_REASONABLE_MOVE_COUNT`.
- The pre-distillation files are deleted in the same change; source-code blast radius is zero (verified during spec reassessment — the three files have no importers).
- `buildDeterministicFitlStateCorpus`'s four existing test consumers continue to pass with default-preserving parameterization.

### Architectural Proof

- After landing, neither `packages/engine/test/integration/fitl-enumeration-bounds.test.ts` nor `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` carries a `// @witness:` marker.
- `grep -n "legal.moves.length === [0-9]" packages/engine/test/integration/fitl-*.test.ts` returns empty.
- `grep -n "@test-class: convergence-witness" packages/engine/test/integration/fitl-enumeration-bounds.test.ts packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` returns empty.

## Implementation Direction

1. **State-corpus helper**: Parameterize `buildDeterministicFitlStateCorpus` in `packages/engine/test/helpers/compiled-condition-production-helpers.ts` to accept an optional `{ seeds, maxPly }` argument, with current values as defaults. Verify existing consumers (`compiled-condition-benchmark.test.ts`, `enumeration-snapshot-benchmark.test.ts`, `compiled-condition-equivalence.test.ts`, `first-decision-production-helpers.ts`) still pass unchanged.

2. **Population-0 helper**: Add `deriveFitlPopulationZeroSpaces(def)` to `packages/engine/test/helpers/production-spec-helpers.ts` (or a dedicated `fitl-map-helpers.ts`). The function reads the FITL map `dataAssets` entry and returns zone IDs whose `attributes.population === 0`.

3. **Enumeration-bounds rewrite**: Create `packages/engine/test/integration/fitl-enumeration-bounds.test.ts` consuming the parameterized corpus helper. Delete `fitl-policy-agent-enumeration-hang.test.ts` in the same change.

4. **Bounded-termination rewrite**: Create `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` iterating `CANARY_SEEDS × POLICY_PROFILE_VARIANTS`. Delete `fitl-seed-1002-regression.test.ts` and `fitl-seed-1005-1010-1013-regression.test.ts` in the same change.

5. **Rule file clarification**: Append a short "Distillation over re-bless" subsection to `.claude/rules/testing.md` adjacent to the existing "Canary Example: Commit `820072e3`" section (lines 83–113). The subsection states the general rule ("when a convergence-witness can be distilled into an architectural invariant without losing defect-class coverage, prefer distillation to re-blessing") and references the spec 137 landing as a second worked example.

6. **Manual QA (post-implementation, one-time)**: Once both distilled files pass, manually verify trajectory-agnosticism by perturbing the sampler seed prefix (e.g., flip one bit of `AGENT_RNG_MIX` in a throwaway local branch) and re-running. The distilled tests should still pass; the pre-distillation files (checked out on a pre-landing branch) should fail on their trajectory pins. This is a one-time validation outside CI.

## Out of Scope

- Distillation of other convergence-witness tests in the repo (e.g., golden-trace tests, Texas Hold'em witnesses). Those follow separately if they exhibit the same re-bless churn.
- Agent profile changes or canary-seed expansion. The existing seed range is sufficient; adding more seeds is an independent concern.
- Any runtime behavior change. This spec is test-code only.
- Reclassification of `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — that file is already `architectural-invariant` (post-commit `820072e3`) and falls under Spec 136's dual-duty-split scope, not this spec's.

## Tickets

1. `tickets/137CONWITINV-001.md` — Parameterize `buildDeterministicFitlStateCorpus` with `{ seeds, maxPly }`
2. `tickets/137CONWITINV-002.md` — Add `deriveFitlPopulationZeroSpaces` test helper
3. `tickets/137CONWITINV-003.md` — Rewrite enumeration-hang test as `fitl-enumeration-bounds.test.ts`
4. `tickets/137CONWITINV-004.md` — Merge seed-regression tests into `fitl-canary-bounded-termination.test.ts`
5. `tickets/137CONWITINV-005.md` — Append "Distillation over re-bless" subsection to `.claude/rules/testing.md`

## Outcome

TBD.
