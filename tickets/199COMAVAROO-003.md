# 199COMAVAROO-003: P3 — Architectural invariants + correspondence + FITL witness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test additions only
**Deps**: `archive/tickets/199COMAVAROO-001.md`, `tickets/199COMAVAROO-002.md`

## Problem

With the probe (ticket 001) and proposer integration (ticket 002) in place, the architectural invariants underpinning the design need automated proof per Foundation #16 (testing as proof). The spec's §7 P3 row and §8 Test Plan bundle five distinct tests: probe purity, predict-fallback correspondence, tiebreaker behavior, trace integrity (golden), and a FITL convergence witness. This ticket implements all of them in two new files: one under `test/unit/agents/` for unit-level invariants, one under `test/architecture/` for the cross-component correspondence + FITL witness.

## Assumption Reassessment (2026-05-26)

1. Spec §7 P3 explicitly bundles all P3 tests in one phase deliverable — per the Spec-bundled test suite exception, tests live together in this ticket rather than attaching individually to 001/002.
2. Test placement convention (confirmed in Spec 199 reassessment): probe purity + tiebreaker + trace integrity → `packages/engine/test/unit/agents/`; predict-fallback correspondence → `packages/engine/test/architecture/`. Existing siblings include `test/unit/agents/plan-proposal.test.ts` and `test/architecture/plan-controller-legality-frontier.test.ts`.
3. Both `test/unit/agents/plan-proposal-compound-availability.test.ts` and `test/architecture/plan-controller-compound-availability-correspondence.test.ts` are absent (proposed-new — confirmed in Spec 199 reassessment).
4. FITL plan-template scenarios for the convergence witness live in the FITL game-data corpus under `data/games/fitl/` and have corresponding fixtures in the engine test tree.
5. Test-class marker convention is enforced per `.claude/rules/testing.md` — `// @test-class: architectural-invariant` for property-form tests; `// @test-class: convergence-witness` + `// @witness: <id>` for trajectory-pinned witnesses.

## Architecture Check

1. Foundation #16 — architectural properties (probe purity, predict-fallback correspondence, tiebreaker semantics) are proven via automated tests; the FITL witness is a convergence-style test guarding a specific past gap.
2. Test-class markers — both new property-form files use `// @test-class: architectural-invariant`; the FITL convergence witness uses `// @test-class: convergence-witness` with `// @witness: spec-199-compound-availability-witness`. If the witness mixes with property-form assertions in the same file, split into a sibling file per `.claude/rules/testing.md` (one file-top marker per file).
3. Determinism (Foundation #8) — replay byte-identity is asserted by the existing replay-identity tests; this ticket's additions do not alter the replay-identity contract.
4. No game-specific branches in the architecture-invariant tests — they operate over synthesized fixtures (probe purity, tiebreaker) or over a corpus of plan templates (predict-fallback correspondence) per Foundation #1. The FITL witness is allowed game-specific identifiers because that is the witness's scope.

## What to Change

### 1. Add `packages/engine/test/unit/agents/plan-proposal-compound-availability.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Three describe groups:
- **Probe purity** — synthesized `(def, state, seatId, rootDecision, compound)` fixtures produce expected `CompoundAvailability` outcomes covering `ready`, `provisional` (both reasons: `depth-capped`, `partial-grant`), and `unavailable` (both reasons: `no-continuation`, `no-grant-predicate`). Assert same inputs produce same output across two invocations.
- **Tiebreaker behavior** — construct two `PlanProposalAlternative` candidates with identical primary score and differing `compoundAvailability`; assert the proposer's `compareAlternatives` selects the `ready` candidate over `provisional`, and `provisional` over `unavailable`. Negative test: when primary scores differ, the tiebreaker does not fire (higher score wins regardless of availability).
- **Trace integrity** — assert the emitted plan trace records `compoundAvailability` for every compound-bearing alternative in `PolicyPlanTraceAlternative.compoundAvailability`. Verify alternatives without `compound` metadata retain `compoundAvailability === undefined`. Replay byte-identical (assert serialization equality across two runs).

### 2. Add `packages/engine/test/architecture/plan-controller-compound-availability-correspondence.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

One describe group:
- **Predict-fallback correspondence** — for a corpus of FITL plan templates (drawn from `data/games/fitl/` profiles or synthesized minimal fixtures, whichever the existing architecture test idiom uses), run each through the proposer (producing per-candidate `compoundAvailability` verdicts), then run the next microturn through `plan-controller.ts:28-76`. Assert:
  - Every probe `ready` verdict implies the controller does NOT fall back at the next microturn (i.e., `match: 'exact'`).
  - Every probe `unavailable` verdict implies the controller DOES fall back (`match: 'reselected'` or `'fallback'`).
  - No false `ready` cases across the corpus.

### 3. Add FITL convergence witness

Place under `packages/engine/test/architecture/` (or a sibling under `test/unit/agents/`, depending on which existing convention the reviewer prefers). Single-marker file:

```
// @test-class: convergence-witness
// @witness: spec-199-compound-availability-witness
```

Set up a previously-known overstated-trace scenario (e.g., a FITL plan whose proposer claimed `Train+Govern` but the controller fell back to `Train+stable-fallback`). Assert the new trace records `compoundProvisional` or `compoundUnavailable` for the offending candidate (rather than overstating coherence).

If keeping markers clean, place the witness in `plan-proposal-compound-availability-witness.test.ts` (a sibling file with the convergence-witness marker) rather than mixing it with the architectural-invariant file. Default to the sibling-file path to honor the testing-rules guidance that one file declares exactly one file-top class marker.

## Files to Touch

- `packages/engine/test/unit/agents/plan-proposal-compound-availability.test.ts` (new)
- `packages/engine/test/architecture/plan-controller-compound-availability-correspondence.test.ts` (new)
- `packages/engine/test/architecture/plan-proposal-compound-availability-witness.test.ts` (new — convergence-witness marker; sibling file to preserve one-marker-per-file)

## Out of Scope

- Probe source — owned by ticket 001.
- Proposer integration source + trace types — owned by ticket 002.
- Compile-time grant-vocabulary check + its test — owned by ticket 004.
- Modifying existing FITL plan-template authored data — Spec §2 Non-Goals (no FITL profile rewrite).

## Acceptance Criteria

### Tests That Must Pass

1. New tests pass:
   `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-proposal-compound-availability.test.js && node --test dist/test/architecture/plan-controller-compound-availability-correspondence.test.js && node --test dist/test/architecture/plan-proposal-compound-availability-witness.test.js`
2. Existing replay / determinism suite byte-identical: `pnpm -F @ludoforge/engine test`.
3. Full suite: `pnpm turbo test`.

### Invariants

1. No false `ready` cases in the predict-fallback correspondence test across the FITL plan-template corpus.
2. Probe is pure (same inputs → same outputs) under all synthesized fixtures.
3. Tiebreaker fires only when primary score ties — verified by negative tests (different primary scores → tiebreaker does not fire).
4. Trace replay byte-identical with and without compound-bearing candidates.
5. Test-class markers per `.claude/rules/testing.md` — each new test file declares exactly one file-top class marker.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-proposal-compound-availability.test.ts` — probe purity, tiebreaker behavior, trace integrity (architectural-invariant marker).
2. `packages/engine/test/architecture/plan-controller-compound-availability-correspondence.test.ts` — predict-fallback correspondence (architectural-invariant marker).
3. `packages/engine/test/architecture/plan-proposal-compound-availability-witness.test.ts` — FITL convergence witness for spec-199 (convergence-witness marker).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-proposal-compound-availability.test.js`
2. `node --test dist/test/architecture/plan-controller-compound-availability-correspondence.test.js`
3. `node --test dist/test/architecture/plan-proposal-compound-availability-witness.test.js`
4. `pnpm turbo test`
