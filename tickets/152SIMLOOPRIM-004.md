# 152SIMLOOPRIM-004: Add `runGameSteps` protocol and replay-identity tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test additions only
**Deps**: `archive/tickets/152SIMLOOPRIM-001.md`

## Problem

After 152SIMLOOPRIM-001 lands, `runGameSteps` is exposed as a public kernel primitive without dedicated protocol or replay-identity coverage. The existing `runGame` trace-equality tests cover the wrapper indirectly, but the generator's own contract — exactly one terminal step per run, deterministic step sequence — needs explicit guardrails so future kernel-protocol changes can't silently break it.

This ticket adds two tests: a protocol invariant test (one-and-only-one terminal step) and a replay-identity test (two runs of the same input yield byte-identical step sequences).

## Assumption Reassessment (2026-05-02)

1. `packages/engine/test/integration/` and `packages/engine/test/determinism/` directories both exist and follow the established convention: integration tests verify cross-module behavior; determinism tests verify replay-identity / canonical-equality invariants.
2. The replay-identity pattern matches the existing `spec-140-replay-identity.test.ts` shape — run twice, compare canonical step output.
3. `runGameSteps` from 001 yields a `RunGameStep` union whose terminal variants are `kind: 'terminal' | 'maxTurns' | 'noLegalMoves'`; non-terminal variants are `kind: 'auto' | 'player' | 'recovery'`.
4. A small fixture corpus is already available for protocol testing — FITL game-spec fixtures plus any synthetic test specs already used in the engine test suite. No new fixture authoring is required.
5. Step-sequence equality requires comparing key step fields (`kind`, `state.stateHash`, `state.turnCount`, and decision-bearing fields like `decisionLog.decisionId` for player steps). Full structural equality on `state` is unnecessary — the hash is sufficient given F8.

## Architecture Check

1. **F16 (Testing as Proof)**: the generator's structural contract (one terminal step, deterministic sequence) is proven by these tests rather than assumed.
2. **F8 (Determinism)**: replay-identity test directly validates Foundation 8 for the new primitive.
3. **Engine-agnostic**: protocol test exercises any well-formed `(def, seed, agents)` triple — no game-specific branches.
4. **No coverage overlap with 001's regression guard**: 001 verifies pre-vs-post-refactor `runGame` trace equality; this ticket verifies the generator's own protocol independent of `runGame`. Both layers are needed.

## What to Change

### 1. Add `packages/engine/test/integration/run-game-steps-protocol.test.ts`

For each fixture in a small corpus (e.g., FITL with 2-3 seeds + a synthetic game-def fixture):

- Run `runGameSteps(input)` to completion, collecting every yielded step into an array.
- Assert: exactly one step in the array has `kind ∈ {'terminal', 'maxTurns', 'noLegalMoves'}`.
- Assert: that terminal step is at `array[array.length - 1]` (i.e., it is the LAST yielded step).
- Assert: no step after a terminal step (this is implied by the generator semantics but worth an explicit guard).

### 2. Add `packages/engine/test/determinism/run-game-steps-replay-identity.test.ts`

For each fixture in a small determinism corpus:

- Run `runGameSteps(input)` twice with identical `(def, seed, agents, maxTurns, options)`.
- For each run, collect a canonical content-equality projection of each step: `{ kind, stateHash: step.state.stateHash, turnCount: step.state.turnCount, ...kind-specific-fields }`.
- Assert: the two projections are deep-equal.
- Concretely check player steps' `decisionLog.decisionId` and auto steps' `autoResolvedLogs` length to catch divergences in decision emission.

## Files to Touch

- `packages/engine/test/integration/run-game-steps-protocol.test.ts` (new)
- `packages/engine/test/determinism/run-game-steps-replay-identity.test.ts` (new)

## Out of Scope

- Replay-identity for `runGame` itself — already covered by `spec-140-replay-identity.test.ts` and `spec-140-spec-id-replay-canary.test.ts`.
- Performance benchmarks for the generator — separate concern.
- Stress-testing under exotic kernel options (the existing `runGame` stress tests already cover this; the protocol invariants hold regardless of options).
- Cross-game conformance corpus — covered by F16's existing conformance suite, not this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. New `run-game-steps-protocol.test.ts` passes: every fixture produces a step sequence with exactly one terminal step at the end.
2. New `run-game-steps-replay-identity.test.ts` passes: two runs of the same input yield byte-identical (per the canonical projection) step sequences.
3. Existing suite: `pnpm -F @ludoforge/engine test`.
4. Existing suite: `pnpm turbo lint typecheck`.

### Invariants

1. `runGameSteps` is deterministic given deterministic inputs (F8).
2. `runGameSteps` emits exactly one terminal step per run.
3. The terminal step is always the last yielded step.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/run-game-steps-protocol.test.ts` (new) — protocol invariant: one terminal step per run, terminal step is last.
2. `packages/engine/test/determinism/run-game-steps-replay-identity.test.ts` (new) — replay identity: same input twice → same step sequence.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/run-game-steps-protocol.test.js`
3. `node --test packages/engine/dist/test/determinism/run-game-steps-replay-identity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`
