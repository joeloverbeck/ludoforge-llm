# ENGINEAGNO-004: Add Game-Agnostic Action Replay Harness and Bounded Advance Utilities

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test/runtime replay utilities, no game-specific logic
**Deps**: ENGINEAGNO-001, ENGINEAGNO-002, ENGINEAGNO-003

## Problem

Current tests include duplicated ad hoc replay helpers (`replayTrace` in multiple suites, bespoke `applyLoggedMove` patterns) and at least one unbounded phase-advance loop in real-play e2e. This proves specific logs, but it is not yet a reusable game-agnostic replay harness suitable for onboarding arbitrary board/card games from `GameSpecDoc`.

## Assumption Reassessment (Code/Test Reality)

1. `advanceToDecisionPoint` already exists in kernel with deterministic bounded auto-advancement and a tested `DECISION_POINT_STALL_LOOP_DETECTED` failure mode.
2. `applyMove` already supports replay boundary policy (`maxPhaseTransitionsPerMove`) and this is covered by unit tests, including compound/timing paths.
3. There is no shared replay harness API; replay logic is duplicated across test suites with inconsistent diagnostics.
4. Real-play e2e still contains bespoke move-application helpers and an unbounded `while (state.currentPhase !== 'showdown')` loop.

## Updated Scope

1. Keep kernel runtime unchanged unless a proven gap appears; focus this ticket on a reusable game-agnostic **test harness** layer.
2. Add a shared replay helper with deterministic step execution, policy options passthrough, and strict per-step assertions.
3. Add a bounded phase-advance helper for tests that need explicit boundary progression with deterministic failure diagnostics.
4. Migrate Texas real-play e2e to these helpers and remove bespoke replay plumbing where practical.
5. Keep helper contracts engine-generic and `GameSpecDoc`-driven (no Texas-specific assumptions in helper code).

## What to Change

1. Introduce a generic replay helper API (test utility layer) that:
   - applies a sequence of moves deterministically,
   - supports strict per-step assertions,
   - supports replay policy options (for example phase-transition cap).
2. Add a bounded phase-advance helper (max steps + failure diagnostics) to prevent infinite/unbounded loops in tests.
3. Migrate Texas real-play e2e to use this generic helper rather than bespoke per-test logic where practical.
4. Keep helper contracts game-agnostic and GameSpecDoc-driven (no Texas assumptions).

## Invariants

1. Replay helper is generic and reusable across games.
2. Replay failure output includes actionable diagnostics (step index, move, phase, active player, optional key vars).
3. Bounded advance never hangs; it fails deterministically when boundary is not reached.
4. Existing deterministic behavior is preserved under same seed and move script.

## Tests

1. Unit: replay helper replays scripted moves and returns expected step snapshots.
2. Unit: bounded advance helper fails with clear diagnostics when target boundary is not reached within cap.
3. E2E: Texas real-play suites run through the helper and preserve existing assertions.
4. Regression: generic simulator/e2e suites remain green.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Added reusable game-agnostic replay test harness in `test/helpers/replay-harness.ts`:
    - `replayScript(...)` for deterministic scripted move replay with step-level assertions, policy passthrough, and diagnostics.
    - `advancePhaseBounded(...)` for bounded boundary progression with deterministic failure diagnostics.
  - Migrated Texas real-play e2e (`test/e2e/texas-holdem-real-plays.test.ts`) to use the shared harness:
    - replaced bespoke move application with helper-backed replay calls;
    - replaced unbounded showdown phase loop with bounded helper progression.
  - Migrated Texas invariant replay in `test/unit/texas-holdem-properties.test.ts` to the shared replay helper to remove duplicate local replay logic.
  - Added focused unit coverage in `test/unit/replay-harness.test.ts` for:
    - scripted replay with strict per-step assertions;
    - deterministic illegal-step diagnostics;
    - action-id legality mode for replay scripts;
    - bounded advance failure diagnostics.
- Deviations from original plan:
  - Kept scope in test-helper layer only (no kernel runtime API changes), because kernel already has bounded phase-advance and replay boundary controls from prior tickets.
  - Did not migrate tournament e2e replay helper in this ticket to stay surgical to real-play + shared helper adoption.
- Verification results:
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/e2e/texas-holdem-real-plays.test.js` passed.
