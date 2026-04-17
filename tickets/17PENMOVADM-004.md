# 17PENMOVADM-004: Cross-layer parity integration test + regression sweep

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `tickets/17PENMOVADM-002.md`, `tickets/17PENMOVADM-003.md`

## Problem

Spec 17 Contract §3 requires the four admissibility-surface layers — legality/discovery, viability probing, decision-sequence admission, and completion contract — to agree on whether a move is complete-executable, pending-admissible, or inadmissible. Tickets 002 and 003 landed the shared classifier at each call site, but nothing in the test suite explicitly asserts the four-layer agreement. Without this invariant test, a future refactor can silently weaken one layer while existing regression tests (FITL seed witnesses, completion-contract invariants) continue to pass.

This ticket introduces the cross-layer parity integration test and runs the final regression sweep verifying every Spec 17 proof obligation is met.

## Assumption Reassessment (2026-04-17)

1. Existing parity coverage: `packages/engine/test/integration/classified-move-parity.test.ts` covers FITL/Texas completed-move trusted-move parity; `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` covers legality-surface parity. Neither asserts four-layer admissibility agreement. Confirmed via grep.
2. `classifyMoveAdmissibility` is exported from `packages/engine/src/kernel/move-admissibility.ts` (landed in ticket 001) and re-exported via `packages/engine/src/kernel/index.ts`.
3. `enumerateLegalMoves`, `probeMoveViability`, `classifyMoveDecisionSequenceAdmissionForLegalMove`, and `completeTemplateMove` are all exported from `packages/engine/src/kernel/index.ts`.
4. `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` exists and documents seed-1000 as the canonical Spec 132 reproducer. Running it post-migration is a manual verification step, not an automated test.
5. Spec 132's regression seeds (1000, 1007, 1008, 1013) pass today per archived-spec outcome notes and the untracked `completion-contract-invariants.test.ts`.

## Architecture Check

1. Foundation #16 (Testing as Proof): locks in the Spec 17 Contract §3 parity invariant as an automated test. Prevents silent weakening of any one layer.
2. Foundation #1 (Engine Agnosticism): fixtures use minimal synthetic `GameDef` constructions; no FITL dependency in the new test file.
3. Foundation #8 (Determinism): parity assertions include a multi-seed determinism sweep — byte-equal verdicts across repeated invocations.
4. Foundation #14: not applicable (test-only; no production schema or API change).

## What to Change

### 1. Create `packages/engine/test/integration/pending-move-admissibility-parity.test.ts`

Use minimal synthetic `GameDef` fixtures (mirroring the style of `completion-contract-invariants.test.ts`) to build:

**Fixture A — Admissible deferred free-operation template**

A `GameDef` whose single action produces, when enumerated on the initial state, a move that viability-probes as `viable && !complete` with a real `nextDecision` (a `chooseN{min:1,max:1}` over a non-empty option set). Expected parity:

- `enumerateLegalMoves` returns the move in `classified`, no `MOVE_ENUM_PROBE_REJECTED` warning.
- `probeMoveViability` returns branch-2 (`viable: true, complete: false, nextDecision !== undefined`).
- `classifyMoveDecisionSequenceAdmissionForLegalMove` returns `'satisfied'` or `'unknown'` (not `'unsatisfiable'`).
- `classifyMoveAdmissibility` returns `{ kind: 'pendingAdmissible', continuation: 'decision' }`.
- `completeTemplateMove` under a clean RNG can return `completed` for at least one seed in a small sweep.

**Fixture B — Inadmissible floating-incomplete**

A `GameDef` that triggers the `isDeferredFreeOperationTemplateZoneFilterMismatch` branch in `deriveMoveViabilityVerdict` (a free-operation move with zone-filter mismatch) AND whose decision-sequence admission returns `'unsatisfiable'`. Expected parity:

- `enumerateLegalMoves` rejects the move with `MOVE_ENUM_PROBE_REJECTED` warning (`reason: 'decisionSequenceUnsatisfiable'`).
- `probeMoveViability` returns the floating shape (`viable: true, complete: false`, all three pending refs `undefined`).
- `classifyMoveDecisionSequenceAdmissionForLegalMove` returns `'unsatisfiable'`.
- `classifyMoveAdmissibility` returns `{ kind: 'inadmissible', reason: 'floatingUnsatisfiable' }`.

**Parity assertions**

For each fixture, assert that the verdicts from all four layers agree on the Spec 17 broad class:

- complete-executable ↔ `completed` completion + `viable && complete` viability + `classifyMoveAdmissibility.kind === 'complete'` + enumeration keeps the move.
- pending-admissible ↔ any `pendingAdmissible` verdict consistent with viability's pending refs and non-unsatisfiable admission and enumeration keeping the move.
- inadmissible ↔ enumeration emits `MOVE_ENUM_PROBE_REJECTED` OR preparation maps the move to `rejected`, consistent with `classifyMoveAdmissibility.kind === 'inadmissible'`.

**Determinism sweep**

For each fixture, run the classifier under 8 different seeds and assert the admissibility verdict is byte-equal across every run (via JSON-serialization equality).

### 2. Document the parity test's scope in a top-of-file comment

One paragraph summarizing: this test locks Spec 17 Contract §3; failure indicates a layer drifted from the shared classifier.

### 3. Run the regression sweep as part of acceptance

No code changes — only test execution. Any regression in the listed commands is a blocker.

## Files to Touch

- `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` (new)

## Out of Scope

- Any change to production code in `packages/engine/src/`
- Any change to existing tests
- Manual campaign runs (seed-1000 diagnose script invocation is a verification step documented in the commands, not an automated test file)
- Changes to the `classified-move-parity.test.ts` or `legality-surface-parity.test.ts` fixtures

## Acceptance Criteria

### Tests That Must Pass

1. New test green: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/pending-move-admissibility-parity.test.js`.
2. `packages/engine/test/integration/fitl-seed-stability.test.ts` green — including the previously-crashing seeds 1000, 1007, 1008, 1010, 1013.
3. `packages/engine/test/integration/classified-move-parity.test.ts` green.
4. `packages/engine/test/integration/fitl-policy-agent.test.ts` green.
5. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` green.
6. `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` green.
7. `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` green — Spec 16 client-boundary invariant preserved.
8. `packages/engine/test/unit/kernel/move-admissibility.test.ts` green (from ticket 001).
9. Full engine suite: `pnpm turbo test`.

### Invariants

1. Four-layer parity: for every fixture in the new parity test, `enumerateLegalMoves`, `probeMoveViability`, `classifyMoveDecisionSequenceAdmissionForLegalMove`, and `completeTemplateMove` agree on the broad admissibility class via `classifyMoveAdmissibility`.
2. Determinism: `classifyMoveAdmissibility` verdicts are byte-equal across 8-seed sweep for each fixture.
3. Regression witnesses: every Spec 132 reproducer seed continues to resolve without `agentStuck` or `NoPlayableMovesAfterPreparationError`.
4. No new `MOVE_ENUM_PROBE_REJECTED` warnings appear on fixtures that previously completed cleanly; conversely, inadmissible fixtures continue to emit the warning with the same context.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/pending-move-admissibility-parity.test.ts` — two fixtures (admissible + inadmissible), four-layer parity assertions, 8-seed determinism sweep.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/pending-move-admissibility-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. **Manual verification**: `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` — expect no `probeMoveViability disagreement` line and no `completionUnsatisfiable` verdict for the previously-crashing seeds. Record the output in the commit message.
6. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
