# 141RUNCACHE-003: Forked-vs-fresh runtime parity witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/141RUNCACHE-001.md`

## Problem

Spec 141 Acceptance Criterion §3 states: "Reusing a shared runtime versus creating a fresh runtime produces identical observable outcomes for the same corpus." Existing determinism tests (e.g., `zobrist-incremental-parity.test.ts`, `fitl-seed-5000-regression.test.ts`) prove this indirectly — they show that same-seed runs hash-match — but none isolates the runtime-construction variable as the thing under test.

The forked-vs-fresh witness is the direct empirical proof of 141RUNCACHE-001's classification: after ticket 001 declares `runLocal` vs `sharedStructural`, this ticket proves via a corpus sweep that the two construction paths are observably equivalent at the `GameTrace` level. If the invariant ever breaks (e.g., a future `runLocal` member is accidentally classified `sharedStructural` and accumulates cross-run state), this test fails visibly instead of silently corrupting long-running harnesses.

## Assumption Reassessment (2026-04-22)

1. `createGameDefRuntime(def)` constructs a fresh runtime; `forkGameDefRuntimeForRun(runtime)` forks a shared one. Verified at `packages/engine/src/kernel/gamedef-runtime.ts:38-68`.
2. `runGame(def, seed, agents, maxTurns, playerCount, options, runtime?)` (`packages/engine/src/sim/simulator.ts:74-88`) forks the supplied runtime internally or constructs a fresh one if omitted. Both paths flow through the same execution after line 88.
3. `GameTrace` exposes `finalState.stateHash`, `stopReason`, `decisions`, `turnsCount` — sufficient observable surface for parity assertions.
4. Both FITL and Texas have existing compile helpers (`compileFitlDef`, `compileTexasDef`) in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:65-83`.
5. Test infrastructure: `packages/engine/test/determinism/` is the canonical home for architectural determinism invariants per `.claude/rules/testing.md`.

## Architecture Check

1. Foundation 8 (determinism is sacred) — this ticket converts the implicit assumption that forked = fresh into an automated proof.
2. Foundation 16 (testing as proof) — per-member classification (141RUNCACHE-001) alone is insufficient; the observable-equivalence witness is the property-level complement.
3. Test is generic — exercises the invariant across FITL and Texas without game-specific assertions. No Foundation 1 concern.
4. Per `.claude/rules/testing.md`, this is an **architectural-invariant** class test (`@test-class: architectural-invariant`) — the property holds across every legitimate trajectory, not one specific seed.

## What to Change

### 1. New test: forked-vs-fresh runtime parity

Create `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`:

```ts
// @test-class: architectural-invariant

// For each (game, seed) in the corpus:
//   fresh:  trace1 = runGame(def, seed, agents, maxTurns)           // no runtime supplied → fresh inside
//   shared: trace2 = runGame(def, seed, agents, maxTurns, ..., sharedRuntime)  // fork-internally path
// Assert:
//   trace1.finalState.stateHash === trace2.finalState.stateHash
//   trace1.stopReason === trace2.stopReason
//   trace1.decisions.length === trace2.decisions.length
//   trace1.turnsCount === trace2.turnsCount
```

The shared runtime is created once at the top of the test and reused across all seeds — this is the critical part: the invariant is "forked from shared ≡ freshly constructed", proven by sweeping the shared runtime through multiple seeds.

### 2. Cover both games

Use `compileFitlDef()` and `compileTexasDef()` from the existing helper module. Pick a small representative corpus — roughly 4-6 seeds per game is sufficient; the witness is a structural invariant, not a coverage sweep. Reuse `FITL_SHORT_DIVERSE_SEEDS` or a similar existing seed set if convenient, to keep the corpus consistent with other determinism tests.

### 3. Cross-reference with 141RUNCACHE-001

In the test file's top comment, note that this witness is the observable-equivalence complement to the per-member classification test from 141RUNCACHE-001. If 141RUNCACHE-001's classification is wrong (e.g., a `runLocal` member is mis-classified as `sharedStructural`), this test is expected to fail first on a cross-run state accumulation.

## Files to Touch

- `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` (new)

## Out of Scope

- Classification/annotation work — owned by 141RUNCACHE-001.
- API contract JSDoc — owned by 141RUNCACHE-002.
- Helper path vs canonical path equivalence — owned by 141RUNCACHE-004.
- Performance benchmarking of fork vs fresh — this ticket tests equivalence, not cost.

## Acceptance Criteria

### Tests That Must Pass

1. New forked-vs-fresh parity test passes on FITL and Texas corpora.
2. Existing determinism suite remains green: `pnpm -F @ludoforge/engine test`.

### Invariants

1. For every `(def, seed, agents, maxTurns)` tuple in the corpus, `runGame` with a caller-supplied shared runtime produces byte-identical `finalState.stateHash`, `stopReason`, `decisions.length`, and `turnsCount` to `runGame` with no runtime argument.
2. The invariant holds regardless of how many prior seeds have been run against the shared runtime — order-independence is part of the claim.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` (new) — architectural-invariant class; sweeps FITL + Texas corpora; asserts trace equivalence.

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted — the new test file is under `determinism/`)
2. `pnpm turbo test` (full suite sanity)
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
