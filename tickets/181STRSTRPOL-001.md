# 181STRSTRPOL-001: Phase 0 — Audit probe runner scaffold + replay-prefix integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/test/policy-profile-quality/probes/` (new harness, no engine src changes)
**Deps**: `specs/181-structured-strategy-policy-layer-probes-and-selectors.md`

## Problem

Today every policy-quality regression loop is a full 15-seed tournament against `arvn-evolved` (or similar) and a manual squint through the trace bundle (see `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` for an example where a custom aggregation script had to be written ad hoc). The May-17 report's per-seat readyRefStats discovery required hand-rolled scripting because there was no deterministic harness to drive policy P on state S to decision D and assert property X about the selected candidate in <200 ms. Spec 181 Phase 0 introduces that harness; this ticket lands the runner scaffold without any assertions or probes wired yet.

## Assumption Reassessment (2026-05-18)

1. `packages/engine/test/policy-profile-quality/` exists and contains the existing tournament tests (`arvn-evolved-convergence.test.ts`, `fitl-spec-143-*.test.ts`, etc.) — confirmed by Step 2 verification this session.
2. The canonical agent decision path goes through `packages/engine/src/agents/policy-agent.ts` → `policy-eval.ts` → `policy-evaluation-core.ts`; replay applies via `applyPublishedDecision` from `packages/engine/src/kernel/`. The runner consumes these public APIs; it does NOT add a parallel scoring pipeline.
3. `PolicyAgentDecisionTrace` (`packages/engine/src/kernel/types-core.ts:2123-2148`) is the canonical trace shape probes inspect. Confirmed present this session.

## Architecture Check

1. The runner is test-side infrastructure under `packages/engine/test/policy-profile-quality/probes/`. No kernel, compiler, or runtime change. Foundation #1 (Engine Agnosticism) preserved.
2. Probe data is game-specific by design (probes name a game, profile, seat, scenario); the runner is game-agnostic. The runner accepts probes via a generic `defineProbe()` API. No FITL-specific code in the runner.
3. The runner uses the same `applyPublishedDecision` / `pickInnerDecision` / `scoreCandidate` path that production agents and tournaments use — no shortcut around the kernel's published-legality contract (Foundation #5, #18).
4. Replay prefix uses `applyPublishedDecision` to walk a known decision sequence from initial state; state hash assertion (`expectedStateHash`) detects drift. Deterministic (Foundation #8).

## What to Change

### 1. Directory scaffold

Create `packages/engine/test/policy-profile-quality/probes/` with:

- `probes/probe-runner.ts` — the runner implementation
- `probes/probe-types.ts` — the `Probe`, `Assertion`, `ProbeResult` types (assertions are introduced as an empty union in this ticket; assertion kinds land in 002)
- `probes/define-probe.ts` — the `defineProbe()` factory
- `probes/README.md` — short explanation of the probe format and how to author one
- `probes/<game>.probes.test.ts` template (empty per-game wrapper Vitest/node:test file demonstrating how a game's probes are collected and iterated)

### 2. `defineProbe()` API (per spec §4.1)

```ts
type Probe = {
  readonly id: string;                             // unique within the game's probe set
  readonly game: GameId;
  readonly profile: AgentProfileId;
  readonly seat: SeatId;
  readonly stateBinding: ProbeStateBinding;
  readonly decisionBinding: ProbeDecisionBinding;
  readonly assertions: ReadonlyArray<ProbeAssertion>; // populated in 002+
  readonly severity: 'profileQuality' | 'architecturalInvariant';
  readonly tags: ReadonlyArray<string>;
};

type ProbeStateBinding = {
  readonly scenario: ScenarioId;
  readonly seed?: number;
  readonly seedRange?: { start: number; end: number };
  readonly replayPrefix?: ReadonlyArray<PublishedDecision>;
  readonly expectedStateHash?: string;
  readonly decisionFilter?: { phase?: PhaseId };    // used when occurrence: 'every'
};

type ProbeDecisionBinding = {
  readonly contextKind: 'actionSelection' | 'chooseOne' | 'chooseNStep' | 'stochasticResolve' | 'outcomeGrantResolve' | 'turnRetirement';
  readonly decisionKey?: string;                    // optional, for chooseN cases that need a particular subkey
  readonly occurrence: 'first' | 'every' | { kind: 'nth'; n: number };
};
```

Validate exactly one of `seed` / `seedRange` is set. Validate `occurrence: 'every'` only when assertions support aggregate semantics (the runner forwards `every` matches as a sequence to the assertion evaluator; aggregate assertion kinds in 002 handle the sequence).

### 3. Runner contract

`runProbe(probe: Probe): ProbeResult` performs:

1. Seed iteration: if `seedRange`, iterate each seed; if `seed`, single iteration.
2. Per-seed: instantiate game state via the existing scenario/seed loader, apply `replayPrefix` (if any) via `applyPublishedDecision`, then assert `expectedStateHash` (if any) against `state.stateHash`.
3. Walk decisions: for each published decision matching `decisionBinding.contextKind` (plus optional `decisionKey` / `phase` filter), record the selected candidate and the `PolicyAgentDecisionTrace`. Stop after the first match for `occurrence: 'first'`, after the `nth` match for `{kind:'nth',n}`, or collect all matches for `every`.
4. Per matched decision (or aggregate set for `every`): run each assertion in `probe.assertions` against the recorded candidate+trace+state. The assertion evaluator is a thin dispatcher keyed on `assertion.kind`; the kinds themselves are empty in this ticket and land in 002.
5. Return `ProbeResult { probe, perSeedOutcomes, aggregateOutcome, durationMs, traceBytes }`. Outcome is one of `pass` | `fail { assertionId, reason }` | `error { message }`.

### 4. Per-game test wrapper

`probes/<game>.probes.test.ts` collects all `Probe` exports under `probes/<game>/*.probe.ts` and iterates them through `runProbe`. Per-probe outcomes route by `severity`:

- `architecturalInvariant`: failures fail the test (gates CI).
- `profileQuality`: failures emit `POLICY_PROFILE_QUALITY_REGRESSION` via the existing reporter pattern in `packages/engine/test/policy-profile-quality/` and surface in a non-blocking summary — no test failure.

The Appendix and existing reporter pattern (see `arvn-evolved-convergence.test.ts` for the existing `POLICY_PROFILE_QUALITY_REGRESSION` warning shape) are the references — match the existing convention.

### 5. Determinism

Same probe + same engine version + same kernel + same seed = bit-identical `ProbeResult`. Add a determinism test asserting `runProbe(p)` produces identical `aggregateOutcome` and `traceBytes` across two consecutive invocations.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/probe-types.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/define-probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/README.md` (new)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` (new — runner-level tests, determinism, replay-prefix correctness)
- `packages/engine/test/policy-profile-quality/probes/fixtures/` (new directory for any runner-test fixtures)

## Out of Scope

- Assertion kinds (the empty union is fine for this ticket; 002 lands the library).
- Specific ARVN / architectural-invariant probes (003, 004).
- CI integration (`pnpm turbo test` wiring + per-probe overhead budget — 005).
- Any change to `packages/engine/src/`; this is test infrastructure only.

## Acceptance Criteria

### Tests That Must Pass

1. `probe-runner.test.ts` — `runProbe` correctly walks a no-assertion probe against a fixture game and returns a `ProbeResult` whose decision matches the published kernel decision for that state.
2. `probe-runner.test.ts` — replay-prefix correctness: `runProbe` with a `replayPrefix` reaches the same `state.stateHash` as a fresh run of the same decision sequence.
3. `probe-runner.test.ts` — determinism: two consecutive `runProbe(p)` invocations produce bit-identical `aggregateOutcome` and `traceBytes`.
4. `probe-runner.test.ts` — `expectedStateHash` mismatch causes a `ProbeResult` with `error { message: 'state hash drift' }` (or equivalent) rather than a hang or silent pass.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Runner uses only public engine APIs (`applyPublishedDecision`, `pickInnerDecision`, `scoreCandidate`); no shortcut around the published-legality contract (Foundation #5, #18).
2. Runner introduces no game-specific identifiers; all game references arrive via the `Probe` data (Foundation #1).
3. `ProbeResult` shape is deterministic — same probe → identical bytes across runs (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` — runner contract, replay-prefix, determinism, hash-drift error reporting. Use a small fixture game (Texas Hold'em or an architectural fixture) to keep wall-clock cost minimal.

### Commands

1. `pnpm -F @ludoforge/engine test -- probe-runner` (or the node:test equivalent path filter)
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
