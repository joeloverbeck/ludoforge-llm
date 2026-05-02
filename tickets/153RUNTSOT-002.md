# 153RUNTSOT-002: Architectural-invariant property test for runtime field propagation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test file under `packages/engine/test/determinism/`
**Deps**: `tickets/153RUNTSOT-001.md`, `archive/tickets/153RUNTSOT-003.md`

## Problem

Spec 150's test suite (`turn-flow-lifecycle-status.test.ts`, `lifecycle-stalled-deck-exhaustion.test.ts`) all passed with the PR #231 hang bug present, because none of those tests exercised `applyTurnFlowCardBoundary` through a path that goes through `finalizeSuspendedOrEndedCard`'s rebuild seam. The bug shipped to CI on commit `ddcf3ef9` and broke 12 lanes for one full day before being diagnosed.

After ticket 153RUNTSOT-001 converts the helpers to `state → state` and eliminates the rebuild seam, the bug class is structurally impossible at the helper-signature level. But the architectural invariant — *every kernel-mutated structural runtime field set by `applyTurnFlowCardBoundary` is observable to the next iteration of the simulator loop body* — must be proven through automated tests per Foundation 16, not assumed from the structural change.

This ticket adds the architectural-invariant property test that would have caught the regression at commit `ddcf3ef9`. The test is the load-bearing proof that the source-of-truth contract holds across every reachable simulator path.

## Assumption Reassessment (2026-05-02)

1. **Helper shapes** assumed to be `state → state` after ticket 001 lands — this ticket's test depends on that conversion and must be sequenced after.
2. **F11 corollary** assumed to exist in `docs/FOUNDATIONS.md` after ticket 003 lands — the test's `@test-class: architectural-invariant` marker comment references the corollary, anchoring the test to the documented principle. This ticket cannot land before 003.
3. **Test corpus selection criterion** is per Spec 153 D4: at least one trajectory must trigger `lifecycleStatus.stalled = true` AND at least one must trigger `consecutiveCoupRounds` mutation. Candidate starting points cited in the spec: `FITL_CANARY_SEEDS = [1002, 1005, 1010, 1013]` × `FITL_PROFILE_VARIANTS` at `packages/engine/test/integration/spec-140-foundations-conformance.test.ts:17-20`; the post-126FREOPEBIN inline corpus `[1020, 1040, 1049, 1054, 2046]` at `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts:51`. Neither is guaranteed to satisfy the criterion — implementation extends or replaces.
4. **Determinism lane** is `pnpm -F @ludoforge/engine test:determinism` (run via `node scripts/run-tests.mjs --lane determinism`). Confirmed against `packages/engine/package.json`.
5. **Witness check** against commit `ddcf3ef9`: the test, applied to that commit (the PR #231 main commit before the `05bf74c2` hot-fix), MUST fail with a deterministic counterexample naming `lifecycleStatus.stalled` as the dropped field. This is one-time evidence captured during implementation, not a recurring CI gate.

## Architecture Check

1. **Foundation 16 (Testing as Proof)**: the source-of-truth contract is converted from an assumed convention into a proven property. The test is `@test-class: architectural-invariant` per `.claude/rules/testing.md` — fails close on regression, not warning.
2. **Foundation 8 (Determinism)**: the test corpus is bounded (`maxTurns=200`) and produces deterministic counterexamples on failure (seed, profile, turn count, dropped field). No wall-clock dependence.
3. **Foundation 1 (Engine Agnosticism)**: the property is stated over arbitrary kernel-mutated runtime fields, not specific game data. The instrumentation taps `applyTurnFlowCardBoundary`'s post-effect state generically.
4. **F11 corollary alignment**: the test marker comment references the corollary added by ticket 003, making the test the proof that the corollary's "internal helpers MUST source kernel-mutated structural state fields from the post-effect state" is enforced.
5. **Witness-direction proof**: applying the test to `ddcf3ef9` (pre-fix) must fail; applying to HEAD-after-001 must pass. This dual-direction check is the proof the test is load-bearing rather than vacuous.

## What to Change

### 1. Author the property test

New file: `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts`

File-top markers (per `.claude/rules/testing.md`):

```ts
// @test-class: architectural-invariant
// References docs/FOUNDATIONS.md F11 corollary "Single source of truth for kernel-mutated structural state fields"
```

Property statement (in test prose):
> For every reachable trajectory of the selected FITL `(seed, policy-profile-set)` corpus under `runGameSteps`, every kernel-mutated structural runtime field set by `applyTurnFlowCardBoundary` (`lifecycleStatus.stalled`, `consecutiveCoupRounds`, and any future addition) is observable to the next iteration of the simulator loop body. Specifically: if `applyTurnFlowCardBoundary` ever sets `lifecycleStatus.stalled = true` on its returned state, the simulator's next iteration MUST observe that field as `true` and terminate with `stopReason='noLegalMoves'` within K = 1 iteration. If `consecutiveCoupRounds` is mutated, the next iteration's read of `cardDrivenRuntime(state).consecutiveCoupRounds` MUST equal the post-boundary value.

Implementation strategy:

- Wrap `applyTurnFlowCardBoundary` with an instrumentation tap that records every `(call, post-boundary-runtime-snapshot)` pair to a per-trajectory log.
- After the trajectory completes, walk the log and assert that for each recorded mutation, the simulator's next-iteration state-runtime read reflects the mutation (matched by `stateHash` continuity).
- Fail with a deterministic counterexample naming `seed`, `profile-set`, `turn count`, and the dropped field.

### 2. Select the seed corpus

Choose a small `(seed, policy-profile-set)` corpus that satisfies the D4 criterion:
- At least one trajectory must observe `applyTurnFlowCardBoundary` setting `lifecycleStatus.stalled = true` (typically a FITL deck-exhaustion + lookahead-exhaustion path).
- At least one trajectory must observe a `consecutiveCoupRounds` mutation (typically a sequence of consecutive coup-phase rounds).

Implementer authors a brief justification in the test file's header comment listing each chosen seed and which mutation it provokes. Bounded `maxTurns=200`. The selection rationale is captured in the implementing commit body so reviewers can audit corpus adequacy.

### 3. Witness-direction verification (one-time, captured in commit body)

- Check out commit `ddcf3ef9`. Apply this ticket's test file (the runtime helpers there are the buggy `runtime → runtime` shape). Run `pnpm -F @ludoforge/engine test:determinism`. Confirm a failure naming `lifecycleStatus.stalled` as the dropped field. Capture the failure output in the commit body.
- Return to HEAD (post-001, post-003). Run the same test. Confirm pass.

## Files to Touch

- `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts` (new)

## Out of Scope

- Modifying the determinism lane runner script (`packages/engine/scripts/run-tests.mjs`) — the existing `determinism` lane already discovers `packages/engine/test/determinism/**/*.test.{ts,mts}`.
- Adding the F11 corollary text to `docs/FOUNDATIONS.md` — owned by ticket 153RUNTSOT-003.
- Converting the runtime helpers to `state → state` — owned by ticket 153RUNTSOT-001.
- Extending the property test to non-FITL games. The property is stated over kernel-mutated runtime fields generically, but the corpus is FITL-specific because that is where `applyTurnFlowCardBoundary` is exercised today. A future spec may extend to other card-driven turn-order types if needed.
- Automating the witness-direction check as a recurring CI gate (per Spec 153 AC#4: "verified once during the spec's implementation as evidence the test is load-bearing; it is not a recurring CI gate").

## Acceptance Criteria

### Tests That Must Pass

1. New file `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts` passes against HEAD-after-001-and-003.
2. Same test, applied to commit `ddcf3ef9`, fails with a deterministic counterexample naming `lifecycleStatus.stalled` as the dropped field (one-time evidence; recorded in implementing commit body, not in CI).
3. Existing determinism corpus continues to pass: `pnpm -F @ludoforge/engine test:determinism`.
4. Existing suite: `pnpm turbo test`.

### Invariants

1. **Field propagation observability**: for every recorded `applyTurnFlowCardBoundary` mutation across every `(seed, profile-set)` in the corpus, the next simulator-loop iteration's state-runtime read reflects the mutation by `stateHash` continuity.
2. **Stall-trajectory coverage**: at least one trajectory in the corpus triggers `lifecycleStatus.stalled = true` (otherwise the test cannot prove the stalled-field invariant).
3. **CoupRound-trajectory coverage**: at least one trajectory in the corpus triggers `consecutiveCoupRounds` mutation (otherwise the test cannot prove the coupRound-field invariant).
4. **Deterministic counterexample on failure**: failure output names seed, profile-set, turn count, and dropped field.
5. **Bounded execution**: every trajectory terminates within `maxTurns=200`.
6. **Test-class marker** present and references the F11 corollary.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts` (new) — architectural-invariant property test for kernel-mutated runtime field propagation. Marker references F11 corollary. Corpus chosen per D4 selection criterion.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` — targeted determinism lane
2. `pnpm turbo test` — full suite
3. One-time witness-direction check: `git checkout ddcf3ef9 && cp <test-file> packages/engine/test/determinism/ && pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:determinism` — confirm failure with `lifecycleStatus.stalled` counterexample; record output in commit body; `git checkout -` to return.
