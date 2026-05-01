# 150LIFECYCONTR-002: End-to-end FITL deck-exhaustion integration test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only addition (with optional fixture file)
**Deps**: `archive/tickets/150LIFECYCONTR-001.md`

## Problem

Spec 150 Acceptance Criterion #3 calls for a dedicated integration test proving the lifecycle-stall contract end-to-end on a FITL fixture configured for short-deck exhaustion. Ticket 001 implements the kernel contract and ships unit-level coverage (`legalMoves` returns empty on stalled state, `applyMove` returns post-finalize state shape, idempotency). What's still missing is the durable proof that a FITL game where the deck genuinely empties — driven through `runGame` end-to-end — exhibits both `lifecycleStatus.stalled === true` on the final state AND `stopReason === 'noLegalMoves'` on the trace.

This is the regression sentinel for the original PR #231 incident: maxTurns=2 made 1205+ `applyTurnFlowCardBoundary` calls in 90 s without completing turn 2 because the eligibility runtime kept resetting on the same already-resolved card. After ticket 001 lands, that exact scenario must terminate cleanly within bounded turns. The unit tests prove the contract surface; this test proves the regression scenario stays fixed.

## Assumption Reassessment (2026-05-01)

1. Ticket 001 introduces `lifecycleStatus.stalled` on `TurnFlowRuntimeState` and removes the PR #231 exception/flag pair — this ticket is structurally unimplementable until 001 has shipped.
2. `runGame` is the canonical simulator entry point at `packages/engine/src/sim/simulator.ts`; the test consumes its `GameTrace` output to assert both `stopReason` and `finalState.turnOrderState.runtime.lifecycleStatus.stalled`.
3. FITL fixtures with short decks (designed to exhaust before the natural final-coup terminal fires) are not in the existing test corpus. The instrumented evidence in commit `343912bc` shows that FITL's standard deck plus baseline profiles do reach this stall under specific seed/maxTurns combinations — so a reproducer may already exist among the slow-parity seeds; otherwise a minimal fixture under `packages/engine/test/fixtures/` is required.
4. The existing `packages/engine/test/integration/` directory already hosts the spec-140 conformance tests and is the natural home for this addition.

## Architecture Check

1. **End-to-end coverage of the F10 enforcement claim**: the kernel's lifecycle-bound contract from spec 150 is asserted at the highest integration scope — a real FITL game played to deck exhaustion through the canonical `runGame` entry point. Ticket 001's unit tests cover the contract *surface*; this ticket covers the *regression scenario* that motivated the spec.
2. **No game-specific kernel branching**: this is a test-only addition. Even the optional fixture (if Option B is chosen below) is a YAML/data file under `test/fixtures/`, not engine source — F1 preserved.
3. **F8 alignment**: the test uses a fixed seed and runtime, asserting deterministic `lifecycleStatus.stalled === true` on the final state. Replay-identity is implicit in the field assertion (re-running the same seed must produce the same field value).
4. **F16 (Testing as Proof)**: the regression that PR #231 patched gets a permanent guard. Without this test, a future kernel change could re-introduce the stall without tripping any signal until production CI.
5. **Architectural-invariant classification (per `.claude/rules/testing.md`)**: the test asserts a property that holds across any legitimate trajectory ending in deck exhaustion — not a single-trajectory witness. This survives sampler tweaks, profile updates, and other unrelated kernel evolutions because the property is structural, not seed-pinned.

## What to Change

### 1. Identify or construct the deck-exhaustion fixture

- **Option A (preferred if available)**: locate an existing FITL seed where the deck empties before the final-coup terminal fires. The PR #231 commit body (`343912bc`) names a specific configuration: maxTurns=2 produced the stall. Audit `packages/engine/test/integration/`, `packages/engine/test/determinism/`, and `packages/engine/test/fixtures/` for an existing seed/profile combination that exhibits this trajectory. If found, the test consumes it directly with no new fixture file.
- **Option B (fallback)**: author a minimal FITL scenario fixture under `packages/engine/test/fixtures/lifecycle-stalled-fitl.yaml` (or equivalent naming pattern matching the directory's convention) with a short deck explicitly configured to exhaust within ~10 turns. Keep the fixture isolated — referenced by no other test.

Document the choice in the test file's leading comment so a future maintainer understands the reproducer's provenance.

### 2. New integration test

File: `packages/engine/test/integration/lifecycle-stalled-deck-exhaustion.test.ts`

File-top marker: `// @test-class: architectural-invariant`

Body structure:

```ts
describe('FITL deck exhaustion produces lifecycle-stalled terminal', () => {
  it('runGame stops with noLegalMoves AND lifecycleStatus.stalled === true', () => {
    const trace = runGame(/* fixture/seed/runtime per §1 above */);
    assert.equal(trace.stopReason, 'noLegalMoves');
    assert.equal(
      trace.finalState.turnOrderState.runtime.lifecycleStatus.stalled,
      true,
    );
    // Sanity: the deck and lookahead are actually empty
    const drawZoneId = /* from def */;
    const lookaheadZoneId = /* from def */;
    assert.equal(trace.finalState.zones[drawZoneId].length, 0);
    assert.equal(trace.finalState.zones[lookaheadZoneId].length, 0);
  });

  it('replay produces identical lifecycleStatus and stateHash', () => {
    const trace1 = runGame(/* same inputs */);
    const trace2 = runGame(/* same inputs */);
    assert.equal(
      trace1.finalState.turnOrderState.runtime.lifecycleStatus.stalled,
      trace2.finalState.turnOrderState.runtime.lifecycleStatus.stalled,
    );
    assert.equal(trace1.finalState.stateHash, trace2.finalState.stateHash);
  });
});
```

The replay assertion reinforces F8 determinism for this trajectory specifically — the field is a deterministic function of inputs, just like every other state property.

## Files to Touch

- `packages/engine/test/integration/lifecycle-stalled-deck-exhaustion.test.ts` (new)
- (Conditional, only if Option B is taken) a new fixture file under `packages/engine/test/fixtures/` (path determined by the directory's existing naming convention)

## Out of Scope

- New `stopReason` discrimination — `'noLegalMoves'` covers the case per spec 150 Out of Scope.
- Coverage of non-deck-exhaustion stalls (e.g., final-coup scoring conflicts) — those are covered by spec-140 conformance.
- Runner-side UI test for "deck exhausted" rendering — runner consumes `stopReason` via trace, no kernel test needed.
- Property-style tests over many seeds — this ticket adds a single regression sentinel; broader fuzz coverage (if desired) is a separate spec.

## Acceptance Criteria

### Tests That Must Pass

1. The new integration test passes: `runGame(...)` on the deck-exhaustion fixture/seed produces `stopReason === 'noLegalMoves'` AND `finalState.turnOrderState.runtime.lifecycleStatus.stalled === true`.
2. Replay-identity check: re-running the same fixture produces an identical `stateHash` AND identical `lifecycleStatus.stalled` value.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. The test is classified `architectural-invariant` (per `.claude/rules/testing.md`) — it asserts a property of any deck-exhaustion trajectory, not a witness to a single seed. The property: deck + lookahead empty ⇒ `lifecycleStatus.stalled === true` AND `stopReason === 'noLegalMoves'`.
2. The fixture (if introduced under Option B) lives under `packages/engine/test/fixtures/` and is referenced by no other test (isolation).
3. The test does NOT assert specific turn counts or move counts — only the structural termination conditions. Trajectory-specific numbers belong in convergence-witness tests, not architectural-invariant tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/lifecycle-stalled-deck-exhaustion.test.ts` (new) — sentinel for the original PR #231 incident. Asserts the F10 + F18 contracts at the runGame integration scope.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. Targeted run of the new test (e.g., `node --test packages/engine/dist/test/integration/lifecycle-stalled-deck-exhaustion.test.js` or via the engine's `test:integration` script — confirm against `packages/engine/package.json`).
3. `pnpm -F @ludoforge/engine test` (full).
4. `pnpm turbo lint typecheck`.
