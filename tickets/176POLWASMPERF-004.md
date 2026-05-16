# 176POLWASMPERF-004: Phase 3 — H3 cheap-vs-expensive coverage attribution report

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — analysis only. Cross-references Phase 0's witness CSV against existing route / unsupported / batch counters.
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 3 tests hypothesis **H3**: WASM handles only the cheap paths; the expensive paths are exactly the unsupported ones that fall back to TS. Phase 4i recorded a "Top Hot Axes In Slow-Tier Seeds" table where the top wall-time axes are predominantly TS-fallback work (`govern:chooseNStep:confirm | continuedDeepening` had 520 unsupported routes vs 0 routed). This ticket cross-references Phase 0's witness CSV against the per-axis route / unsupported / batch counters and computes the weighted wall-time fraction of "WASM-handled" rows vs "TS-fallback" rows.

The verdict must report: if `X%` of slow-tier wall time is in TS-fallback axes, WASM's perf ceiling on this workload is `1/X` even with perfect FFI elimination. This is the H3 hypothesis verdict consumed by Phase 6.

## Assumption Reassessment (2026-05-17)

1. The Phase 0 ticket (001) produces witness CSVs containing per-axis wall-time and route / unsupported / batch counters via the existing `wasmScoreRowRouteCount`, `wasmScoreRowUnsupportedCount`, `wasmPreviewCandidateFeatureRowRouteCount`, etc., per-bucket columns already in `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (lines 348–411) — verified.
2. The per-axis wall-time decomposition uses the same axis taxonomy as Phase 4i's "Top Hot Axes In Slow-Tier Seeds" table — verified by inspecting `reports/174-phase-4i-post-fix-wasm-gate-decision.md` §"Top Hot Axes In Slow-Tier Seeds" and confirming the column shape matches `aggregateAxisRows` in the profiler.
3. No new instrumentation is required.

## Architecture Check

1. **Pure analysis ticket**: No source change. Honors spec 176 §7 #5.
2. **Reproducibility (Foundation #13)**: The verdict cites the exact Phase 0 witness CSV filename and the axis aggregation methodology so a future reader can recompute the ratio.
3. **Foundation #16**: Weighted wall-time fraction is computed from measured counts and times, not narrative inference.

## What to Change

### 1. Compute the cheap-vs-expensive attribution

Source: Phase 0's `phase-0-wasm-on` witness CSV (slow-tier seeds `1005, 1011, 1008, 1013, 1009`).

For each axis row in the CSV:

- `wasmHandledFraction = wasmScoreRowRouteCount / (wasmScoreRowRouteCount + wasmScoreRowUnsupportedCount)` for score-row axes; analogous formula for preview-drive axes using `wasmProductionPreviewDriveRouteCount` / `wasmProductionPreviewDriveUnsupportedCount`.
- Weighted wall-time contribution: `axisWallMs * wasmHandledFraction` → cumulative "WASM-handled wall time"; `axisWallMs * (1 − wasmHandledFraction)` → cumulative "TS-fallback wall time".

Aggregate across slow-tier seeds. Compute:

- `tsFallbackFraction = TS-fallback wall time / total slow-tier wall time`
- `wasmPerfCeiling = 1 / (1 − tsFallbackFraction)` — the maximum slow-tier speedup achievable if WASM's per-call cost goes to zero on the currently-routed axes.

### 2. Write the H3 attribution report

Write `reports/176-phase-3-cheap-vs-expensive-coverage.md` containing:

- Top-N axis table mirroring Phase 4i's format (rank, axis, total ms, route count, unsupported count) but extended with `wasmHandledFraction` and `wallMsWasmHandled / wallMsTsFallback` columns.
- Slow-tier subtotal: `tsFallbackFraction` and `wasmPerfCeiling`.
- Verdict: `cheap-paths-dominate` (TS-fallback fraction ≥60% — WASM perf ceiling ≤ ~1.67×) / `mixed` (40–60%) / `expensive-paths-routed` (TS-fallback fraction <40% — WASM perf ceiling > 1.67×).
- Implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 — `H3 alone` → Spec-174-style coverage extension with measured perf hypothesis; `H2 + H3` → Retire OR Keep-as-correctness-only).

## Files to Touch

- `reports/176-phase-3-cheap-vs-expensive-coverage.md` (new) — the H3 verdict report.

## Out of Scope

- Any code change to extend WASM coverage to expensive unsupported axes — owned by Phase 6's follow-up spec if the verdict warrants it.
- H2 hot-path attribution — owned by ticket 003. H3 is route/unsupported per-axis ratio analysis; H2 is symbol-level hot-bucket attribution. Do not blur.
- Recomputing the Phase 4i numbers — this ticket measures against the *current* Phase 0 witness CSV, not against Phase 4i's archived snapshot.

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required.
2. Existing suite: `pnpm turbo test` (sanity baseline).

### Invariants

1. `tsFallbackFraction` and `wasmPerfCeiling` are computed from measured per-axis counts and times in Phase 0's witness CSV; the computation methodology is documented in the report.
2. Verdict is one of the three defined classifications.

## Test Plan

### New/Modified Tests

None — analysis ticket.

### Commands

1. `pnpm turbo test` (sanity baseline).
2. (Manual) Verify the report writes successfully and `tsFallbackFraction + wasmHandledFraction ≈ 1.0` per the aggregation.
