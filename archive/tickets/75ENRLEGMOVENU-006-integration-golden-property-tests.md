# 75ENRLEGMOVENU-006: Production Cross-Game Parity Coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test files and ticket only, no production code expected
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-001-classifiedmove-type-and-always-complete-actions.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md, archive/tickets/75ENRLEGMOVENU-003-skip-move-validation-threading.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-004-agent-and-prepare-playable-moves-update.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-005-simulator-and-runner-type-threading.md

## Problem

Spec 75's production-path behavior already landed in the codebase, and several of the originally assumed gaps are already covered by existing unit, integration, and property tests. The remaining risk is narrower: we do not yet have one production-backed integration test that proves the three relevant legality surfaces stay aligned across both shipped games:

1. `legalMoves(def, state)` returns the raw template/candidate `Move[]` surface.
2. `enumerateLegalMoves(def, state)` returns the agent/simulator `ClassifiedMove[]` surface after viability classification, including probe-based rejection of raw templates that are not actually playable.
3. `applyMove(def, state, move, { skipMoveValidation: true })` stays behaviorally identical to validated execution for moves chosen from that enumerated surface.

Without that cross-game parity check, the current coverage is strong but fragmented.

## Assumption Reassessment (2026-03-22)

1. The production implementation for Spec 75 is already present. This ticket is no longer a speculative “tests-only after future implementation” task.
2. `enumerateLegalMoves()` returns `ClassifiedMove[]`, but `legalMoves()` still intentionally returns raw `Move[]`. The ticket must not assume the legacy facade was removed.
3. Existing coverage already includes key local invariants:
   - `packages/engine/test/unit/apply-move.test.ts` covers direct `skipMoveValidation` parity.
   - `packages/engine/test/unit/sim/simulator.test.ts` covers simulator replay parity under `skipMoveValidation`.
   - `packages/engine/test/unit/prepare-playable-moves.test.ts` covers classified-move routing and the free-operation template regression.
   - `packages/engine/test/integration/fitl-policy-agent.test.ts` and `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` cover production self-play/policy integration.
   - `packages/engine/test/integration/texas-holdem-properties.test.ts` and `packages/engine/test/unit/property/simulator.property.test.ts` already provide property-style coverage.
   - Existing FITL/Texas golden suites already exercise both production games and must remain unchanged.
4. The meaningful remaining gap is production-backed parity across the raw move surface, classified move surface, probe-rejection warnings, and skip-validation execution path.
5. The original assumption that this ticket should add a broad new property-test file is not justified by the current suite. That would duplicate existing coverage rather than harden the actual missing contract.

## Architecture Check

1. The current architecture is directionally sound for the hot path: the performance-sensitive simulator/agent pipeline consumes `enumerateLegalMoves()`, while the raw `legalMoves()` facade still serves template-centric tests and utilities that intentionally inspect unresolved `Move` shapes.
2. Forcing `legalMoves()` to also return `ClassifiedMove[]` would be a broader architectural migration than this ticket needs. It would touch many template-oriented callers without improving the hot path already optimized by Spec 75.
3. The better architecture for this ticket is to prove the actual relationship between the two legality surfaces, not to collapse them prematurely.
4. That relationship is stricter than “anything goes” but weaker than exact equality: `enumerateLegalMoves()` must preserve the ordered playable subset of `legalMoves()`, and any omissions must be explicitly explained by probe-rejection warnings.
5. If that contract fails, that is a correctness bug in the current implementation, not a cue to add aliasing or compatibility shims.

## What to Change

### 1. Add a production-backed cross-game parity integration test

Create a focused integration test that, for real FITL and Texas production states:
- runs fixed-seed short self-play traces,
- replays each pre-move state,
- asserts `enumerateLegalMoves(...).moves.map(({ move }) => move)` is the ordered surviving subset of `legalMoves(...)`,
- asserts any raw-only moves correspond to `MOVE_ENUM_PROBE_REJECTED` warnings and fail `probeMoveViability(...)`,
- asserts every returned `ClassifiedMove` is viable by contract,
- asserts the trace-selected move produces an identical `ApplyMoveResult` with and without `skipMoveValidation`,
- asserts repeated fixed-seed runs produce identical traces for the same game/seed.

### 2. Strengthen, do not duplicate, property expectations

Do not add a second generic property file unless the new integration test exposes a missing invariant that is best expressed property-style. Prefer one high-signal integration test over redundant coverage.

### 3. Verify golden and existing production suites remain green

Do not update any golden files. This ticket should only add coverage around the current architecture.

## Files to Touch

- `tickets/75ENRLEGMOVENU-006-integration-golden-property-tests.md`
- `packages/engine/test/integration/classified-move-parity.test.ts` (new)

## Out of Scope

- Production code changes unless the new parity test exposes a real bug
- Converting `legalMoves()` to `ClassifiedMove[]`
- Adding a duplicate property-test file without a newly discovered invariant
- Updating golden fixtures
- Runner-specific tests; the important contract here is engine legality/execution parity

## Acceptance Criteria

1. A new production-backed integration test covers FITL and Texas parity between `legalMoves()`, `enumerateLegalMoves()`, probe-rejection warnings, and `applyMove(skipMoveValidation)`.
2. The new test proves same-seed short self-play traces are reproducible for both games.
3. No golden files are modified.
4. `pnpm turbo test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/classified-move-parity.test.ts` — cross-game production parity for raw-vs-classified legality surfaces, probe-rejection warnings, selected-move skip-validation parity, and fixed-seed trace determinism.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Reassessed the ticket against the live codebase and narrowed scope to the real missing gap.
  - Added `packages/engine/test/integration/classified-move-parity.test.ts`.
  - Verified production FITL and Texas traces against the actual legality-surface contract:
    - `legalMoves()` exposes the raw template surface.
    - `enumerateLegalMoves()` preserves the ordered playable subset, may omit probe-rejected raw templates, and emits `MOVE_ENUM_PROBE_REJECTED` warnings for those omissions.
    - `applyMove(..., { skipMoveValidation: true })` remains parity-equivalent for complete enumerated moves and for trace-selected moves.
- Deviations from original plan:
  - Did not add a separate new property-test file, because the repo already had substantial property coverage and the real missing contract was better captured as a production-backed integration test.
  - Corrected the original assumption that `legalMoves()` and `enumerateLegalMoves()` should always be identical surfaces. FITL production states demonstrate intentional probe-based filtering in `enumerateLegalMoves()`.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
