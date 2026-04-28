# 149FITLEVNUMVM-007: fitl-per-card-cost perf gate (5500 ms calibration)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — new test file
**Deps**: `tickets/149FITLEVNUMVM-006.md`

## Problem

Spec 149 §6 mandates a new perf gate `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` calibrated to 5500 ms after Phase 1 lands. The gate tightens at each phase boundary (3000 ms after Phase 2, 250 ms after Phase 4, 50 ms after Phase 5). This ticket adds the gate at its initial 5500 ms calibration after ticket 006's wiring lands.

## Assumption Reassessment (2026-04-28)

1. The existing `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` gates parity-drive cost on a different metric and continues to run unchanged. The new per-card gate is **additive**, not a replacement (per spec §6).
2. `packages/engine/scripts/profile-fitl-preview-drive.mjs` exists and exposes the `--perCard --profilesAll` measurement command shape this gate will exercise programmatically.
3. The 5500 ms target derives from the spec's Phase 1 acceptance budget (~15% gain from a baseline of ~6500 ms post-TURNPERF-002).

## Architecture Check

1. Gate is calibrated per spec; no arbitrary ad-hoc number. F8/F15 preserved.
2. Gate runs in the existing `test:perf` lane (`packages/engine/package.json:53`) — no new CI mechanism needed.
3. Gate exercises the wired encoded-state path from ticket 006; failure to meet 5500 ms means Phase 1's expected gain didn't materialize, triggering spec §12 stop conditions.

## What to Change

### 1. `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (new)

Test structure (`@test-class: architectural-invariant`):
- Setup: load FITL GameDef + 4 baseline policy profiles (us-baseline, arvn-baseline, nva-baseline, vc-baseline).
- For each profile, run a one-card simulation with `verifyIncrementalHash=true` and capture `elapsedMs`.
- Assert: max `elapsedMs` across all 4 profiles ≤ 5500 ms.
- Assertion failure should report all four per-profile elapsed values for diagnostic clarity.

Use the existing `runOnce` helper pattern from `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` to avoid duplication.

### 2. Calibration documentation

Add a top-of-file comment stating: this gate is calibrated to 5500 ms after Phase 1 (encoded-state wiring) lands. It tightens to 3000 ms after Phase 2 (apply/undo, ticket 009), 250 ms after Phase 4 (bytecode VM default-flip, ticket 016), and 50 ms after Phase 5 (Rust→WASM, separate spec).

## Files to Touch

- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (new)

## Out of Scope

- Recalibrating `fitl-parity-drive.perf.test.ts` (spec §6 says it remains unchanged through Phase 4).
- Tightening this gate to 3000 ms / 250 ms — those are downstream tickets (009 / 016).

## Acceptance Criteria

### Tests That Must Pass

1. New test: per-card cost ≤ 5500 ms across all 4 baseline profiles.
2. Existing perf gate `fitl-parity-drive.perf.test.ts` continues to pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:perf`.

### Invariants

1. Gate uses `verifyIncrementalHash=true` (no shortcut to meet the budget).
2. No game-specific FITL branches in the test scaffolding (other than loading the FITL GameDef as data).
3. F8 preserved — no probabilistic acceptance.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` — the gate itself.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test:perf`.
3. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`.
