# Spec 176 Phase 1 H1 FFI Marshaling Decomposition

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 1 witness complete.
**Ticket**: `archive/tickets/176POLWASMPERF-002.md`

## Measurement Source

This report reuses the Phase 0 timed and no-WASM witness artifacts:

- WASM-on timing buckets: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv`
- WASM-on timing report: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.md`
- No-WASM baseline: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.csv`
- No-WASM baseline report: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.md`

Reuse decision: no engine source, profiler script, or Phase 0 artifact commits appear after `cb124a071` (`Implemented 176POLWASMPERF-001`) for the Phase 0 source/artifact set, so the Phase 0 timing and no-WASM CSVs remain current for Phase 1.

The timing columns used here are `marshalingMs`, `executionMs`, `deserializationMs`, `wasmCallCount`, and the per-route-class `wasmTimingBuckets` JSON column.

## Full 15-Seed Route-Class Buckets

| Route class | WASM calls | Marshaling ms | Execution ms | Deserialization ms | Marshaling ms/call | Execution ms/call | Deserialization ms/call | Overhead / execution |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `scoreRows` | 11498 | 761.3181 | 404.9374 | 11.2538 | 0.066213 | 0.035218 | 0.000979 | 1.91x |
| `previewCandidateFeatureRows` | 766 | 122.9312 | 28.6358 | 0.9734 | 0.160485 | 0.037384 | 0.001271 | 4.33x |
| `productionPreviewDrive` | 5784 | 339.6315 | 29.8027 | 191.4198 | 0.058719 | 0.005153 | 0.033095 | 17.82x |
| **total** | **18048** | **1223.8808** | **463.3759** | **203.6470** | **0.067813** | **0.025675** | **0.011284** | **3.08x** |

Across all 15 seeds, marshaling plus deserialization totals `1427.5278 ms`, while WASM execution totals `463.3759 ms`.

## Slow-Tier Route-Class Buckets

Slow-tier seeds: `1005`, `1011`, `1008`, `1013`, `1009`.

| Route class | WASM calls | Marshaling ms | Execution ms | Deserialization ms | Marshaling ms/call | Execution ms/call | Deserialization ms/call | Overhead / execution |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `scoreRows` | 4490 | 295.3469 | 158.7273 | 3.9962 | 0.065779 | 0.035351 | 0.000890 | 1.89x |
| `previewCandidateFeatureRows` | 314 | 52.6496 | 11.7465 | 0.3987 | 0.167674 | 0.037409 | 0.001270 | 4.52x |
| `productionPreviewDrive` | 3050 | 147.4066 | 13.9641 | 83.6596 | 0.048330 | 0.004578 | 0.027429 | 16.55x |
| **total** | **7854** | **495.4031** | **184.4379** | **88.0545** | **0.063077** | **0.023483** | **0.011211** | **3.16x** |

Across the slow-tier seeds, marshaling plus deserialization totals `583.4576 ms`, while WASM execution totals `184.4379 ms`.

## TS-Equivalent Per-Call Comparison

Ticket formula:

```text
(slow-tier no-WASM wall ms - slow-tier WASM-on wall ms outside the WASM call) / wasmCallCount
```

Measured inputs:

| Field | Value |
|---|---:|
| Slow-tier no-WASM wall ms | 71009.1253 |
| Slow-tier WASM-on timed wall ms | 75207.2901 |
| Slow-tier WASM call bucket ms | 767.8955 |
| Slow-tier WASM-on outside-call wall ms | 74439.3946 |
| Slow-tier WASM call count | 7854 |
| Derived TS-equivalent per-call ms | -0.436754 |

The slow-tier TS-equivalent comparison is negative under this witness because the no-WASM slow-tier run (`71009.1253 ms`) is faster than the timed WASM run's outside-call wall time (`74439.3946 ms`) before assigning any cost to the measured WASM call buckets. This makes the per-call TS-equivalent value unsuitable as a positive estimate of TS evaluator cost for the slow-tier subset. It does, however, reinforce the Phase 0 observation that run-to-run and outside-WASM work dominate the wall-clock comparison at this granularity.

For the H1 verdict, the decisive evidence is therefore the direct measured bucket split, not the noisy cross-run wall-clock residual.

## Verdict

**H1 verdict: `marshaling-dominant`.**

Definition: if the larger of `(marshaling + deserialization)` and `execution` exceeds the other by at least `2x`, classify by the larger bucket; otherwise classify as `parity`.

The slow-tier route set is marshaling-dominant because `(495.4031 + 88.0545) / 184.4379 = 3.16x`. The full 15-seed route set is also marshaling-dominant at `3.08x`.

This finding is strongest for `productionPreviewDrive`, where overhead exceeds execution by `16.55x` in slow-tier seeds, and `previewCandidateFeatureRows`, where overhead exceeds execution by `4.52x`. `scoreRows` is near parity by the ticket's `2x` threshold (`1.89x` slow-tier), but it does not overturn the aggregate route-class result.

## Phase 6 Implication

Spec 176's decision tree maps H1 marshaling overhead to:

> Accelerate via a follow-up spec to batch more work per WASM call.

Phase 1 therefore supports the **Accelerate** branch if later phases do not show that WASM is structurally unable to reach the dominant workload. The concrete optimization direction is reducing per-call overhead by batching more policy work per WASM invocation, especially around `productionPreviewDrive` and `previewCandidateFeatureRows`.
