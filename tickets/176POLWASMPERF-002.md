# 176POLWASMPERF-002: Phase 1 — H1 FFI marshaling decomposition report

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — analysis and report only; consumes Phase 0's timing instrumentation.
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 1 tests hypothesis **H1**: FFI marshaling overhead cancels per-call WASM speedup. With Phase 0's per-call timing instrumentation in place (split into `marshalingNs` / `executionNs` / `deserializationNs` per route class), this ticket decomposes a WASM-on slow-tier run into the three buckets and compares per-call WASM execution time to per-call TS-equivalent time.

The verdict must classify the dominant cost: marshaling-dominant, execution-dominant, or parity. This verdict is one of the five hypothesis verdicts the Phase 6 decision tree consumes.

## Assumption Reassessment (2026-05-17)

1. Phase 0 (ticket 001) lands the `POLICY_WASM_TIMING_PROFILE` flag and the per-call marshaling / execution / deserialization buckets exposed via `snapshotPolicyWasmTimingBuckets`. This ticket assumes those accessors exist as specified.
2. Per-call TS-equivalent time can be measured by running the same workload with `--no-wasm` (ticket 001) and dividing the per-route-class wall-time delta by the route call count. The route call count itself is preserved across WASM-on / WASM-off modes because TS-fallback routes are still counted in the agent path even without the WASM runtime initialized — verified by grep against `policy-wasm-score-routing.ts`'s null-return fallback path.
3. No new instrumentation is required beyond Phase 0.

## Architecture Check

1. **Analysis-only ticket**: No source change. Output is one report file. This honors spec 176 §7 #5 (no engine source change beyond Phase 0 instrumentation).
2. **Direct evidence**: Per-call timing buckets are measured, not inferred from end-to-end wall time. The verdict cites bucket sums per route class.
3. **Foundation #16 (Testing as Proof)**: Verdict is backed by measured bucket data captured in CSV form, not by narrative inference.

## What to Change

### 1. Run the Phase 1 measurement

Execute one slow-tier-focused run (15 seeds, but the analysis foregrounds slow-tier seeds `1005, 1011, 1008, 1013, 1009`) with `POLICY_WASM_TIMING_PROFILE=1`:

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-1-h1-marshaling
```

The Phase 0 ticket already produces an analogous run; if Phase 0's `phase-0-wasm-on-timed` artifacts are still current (no engine source changes since), this ticket may reuse them rather than re-running. Note the reuse decision in the report.

### 2. Write the H1 decomposition report

Write `reports/176-phase-1-ffi-marshaling-decomposition.md` containing:

- Per-route-class table: total `marshalingMs`, `executionMs`, `deserializationMs`, `wasmCallCount`, and derived per-call averages, summed across the 15-seed run.
- Slow-tier subtotal table (`1005, 1011, 1008, 1013, 1009`) with the same columns.
- Comparison to per-call TS-equivalent time, computed as `(slow-tier no-WASM wall-ms − slow-tier WASM-on wall-ms outside the WASM call) / wasmCallCount`. The "outside the WASM call" baseline uses Phase 0's `phase-0-no-wasm` witness CSV.
- Verdict: one of `marshaling-dominant`, `execution-dominant`, or `parity` (defined as the larger of marshaling+deserialization vs execution exceeds the other by ≥2×; otherwise parity).
- A one-paragraph implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 table — `H1 (marshaling overhead)` → Accelerate via batched WASM call).

## Files to Touch

- `reports/176-phase-1-ffi-marshaling-decomposition.md` (new) — the verdict report.
- Possibly `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-1-h1-marshaling.{md,csv}` (new) if a fresh run is needed. If reusing Phase 0's `phase-0-wasm-on-timed` artifacts, cite them in the report.

## Out of Scope

- Any source change to fix marshaling overhead — if marshaling is dominant, the follow-up spec named by Phase 6 (ticket 007) owns the fix design. This ticket only measures.
- H4 cache-amortization analysis (compile cost is a separate hypothesis; bytecode cache compile time MUST NOT be folded into the `marshaling` bucket — it is its own bucket measured in ticket 005).
- H5 state-serialization size attribution — also a separate hypothesis owned by ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required for this analysis-only ticket. The existing Phase 0 timing-flag tests guard the bucket-accessor invariants.
2. Existing suite: `pnpm turbo test` (sanity, no engine changes expected).

### Invariants

1. Verdict cites measured bucket sums per route class, not aggregate end-to-end wall time.
2. Per-call TS-equivalent comparison uses the canonical Phase 0 `--no-wasm` baseline; alternative baselines (e.g., older Phase 4i CSVs) MUST NOT be substituted.
3. Report is dated; the witness CSV filename is referenced explicitly so the analysis is reproducible.

## Test Plan

### New/Modified Tests

None — analysis ticket.

### Commands

1. `pnpm turbo test` (sanity baseline, no engine source changes).
2. (Manual) Phase 1 measurement command in §1 above; verify the report writes successfully and the verdict is one of the three defined values.
