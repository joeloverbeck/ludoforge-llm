# ENGINEAGNO-004: Add Game-Agnostic Action Replay Harness and Bounded Advance Utilities

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test/runtime replay utilities, no game-specific logic
**Deps**: ENGINEAGNO-001, ENGINEAGNO-002, ENGINEAGNO-003

## Problem

Current real-play tests rely on hand-crafted mid-hand state snapshots and ad hoc phase-advance loops. This proves specific logs, but is not yet a reusable game-agnostic replay mechanism suitable for onboarding arbitrary board/card games from GameSpecDoc.

## What to Change

1. Introduce a generic replay helper API (kernel or test utility layer) that:
   - applies a sequence of moves deterministically,
   - supports strict per-step assertions,
   - supports replay policy options (for example phase-transition cap).
2. Add a bounded phase-advance helper (max steps + failure diagnostics) to prevent infinite/unbounded loops in tests.
3. Migrate Texas real-play e2e to use this generic helper rather than bespoke per-test logic where practical.
4. Keep helper contracts game-agnostic and GameSpecDoc-driven (no Texas assumptions).

## Invariants

1. Replay helper is generic and reusable across games.
2. Replay failure output includes actionable diagnostics (step index, move, phase, active player, key vars).
3. Bounded advance never hangs; it fails deterministically when boundary is not reached.
4. Existing deterministic behavior is preserved under same seed and move script.

## Tests

1. Unit: replay helper replays scripted moves and returns expected step snapshots.
2. Unit: bounded advance helper fails with clear diagnostics when target boundary is not reached within cap.
3. E2E: Texas real-play suites run through the helper and preserve existing assertions.
4. Regression: generic simulator/e2e suites remain green.

