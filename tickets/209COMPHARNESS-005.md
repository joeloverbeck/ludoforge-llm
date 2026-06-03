# 209COMPHARNESS-005: Deterministic-replay wrapper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: `tickets/209COMPHARNESS-001.md`

## Problem

Spec §3.6: the harness must prove that a competence fixture is deterministic — running it twice yields identical selected stable move keys, microturn decisions, trace statuses, and outcome deltas. This enforces FOUNDATIONS #8 (determinism) and #16 (testing as proof) and guards against any accidental dependence on iteration order or ambient state.

## Assumption Reassessment (2026-06-03)

1. The runner (001) is a pure function of `(def, seed, agents, predicate)` — re-invoking it with identical inputs must yield identical results, which is exactly the property this wrapper asserts.
2. Canonical serialized state is the source of truth for equality; hashes are accelerators only (FOUNDATIONS #8). The wrapper compares selected stable move keys, microturn decision sequences, trace `match`/`fallbackReason` statuses, and the outcome-delta results — all derived from canonical state.
3. `cross-family-conformance.test.ts` already proves replay identity at the engine level via `replayIdentity`; this wrapper provides the same guarantee scoped to a competence fixture's observable assertions.

## Architecture Check

1. Wraps a fixture thunk and runs it twice, asserting equality of the observable competence signals — no engine change, no new entry point (FOUNDATIONS #15).
2. Game-agnostic: compares structural signals (keys, statuses, deltas) with no game-specific knowledge (FOUNDATIONS #1).
3. Reinforces the determinism contract at the harness layer without duplicating the engine-level `determinism/` corpus (FOUNDATIONS appendix — profile-quality witnesses stay distinct from engine determinism proofs).

## What to Change

### 1. Deterministic-replay wrapper

`packages/engine/test/helpers/competence/replay-wrapper.ts`:
- `assertReplayIdentity(runFixture)` where `runFixture: () => CompetenceRunResult`: invoke twice and assert deep equality of `selectedDecision` stable move key, `decisions[]` sequence, `microturnTraces[]` `match`/`fallbackReason` statuses, and the computed outcome deltas. Report the first divergence on failure.

### 2. Barrel export

Append the helper export to `packages/engine/test/helpers/competence/index.ts`.

## Files to Touch

- `packages/engine/test/helpers/competence/replay-wrapper.ts` (new)
- `packages/engine/test/helpers/competence/index.ts` (modify — append one export; serialize with sibling tickets)

## Out of Scope

- The reference fixture proving replay identity end-to-end (AC#4) — ticket 007. This wrapper is the reusable mechanism; 007 applies it.

## Acceptance Criteria

### Tests That Must Pass

1. Exercised by ticket 007's reference fixture: a fixture run twice yields byte-identical selected move keys, microturn decisions, trace statuses, and outcome deltas; an intentionally-perturbed run (different seed) is detected as divergent.
2. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Equality is asserted over canonical-state-derived signals, not over hashes alone (FOUNDATIONS #8).
2. The wrapper carries zero game-specific identifiers (FOUNDATIONS #1).

## Test Plan

### New/Modified Tests

1. None standalone — applied by `packages/engine/test/architecture/competence-harness-reference.test.ts` (ticket 007) to satisfy spec AC#4.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine typecheck`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
