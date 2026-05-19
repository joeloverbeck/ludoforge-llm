# Spec 176 Phase 3 H3 Cheap-vs-Expensive Coverage Attribution

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 3 witness complete.
**Ticket**: `archive/tickets/176POLWASMPERF-004.md`

## Measurement Source

This report uses the Phase 0 WASM-on witness CSV:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv`

Slow-tier seeds: `1005`, `1011`, `1008`, `1013`, `1009`.

The CSV's per-row `elapsedMs` measures the `PolicyAgent.chooseDecision` call. Rows are grouped by the same axis used by the profiler's "Top Hot Axes In Slow-Tier Seeds" table: `microturnClass | previewBranch`.

## Formula Correction

The active ticket contained a stale formula line, `wasmPerfCeiling = 1 / (1 - tsFallbackFraction)`. That line reverses the H3 hypothesis. Spec 176 describes the ceiling as the maximum speedup left when TS-fallback work is the unaccelerable remainder, and the ticket's verdict thresholds say a `60%` TS-fallback fraction implies a `~1.67x` ceiling.

This report therefore uses the spec-aligned formula:

```text
tsFallbackFraction = tsFallbackWallMs / totalSlowTierWallMs
wasmPerfCeiling = 1 / tsFallbackFraction
```

This is a proof-only correction approved during implementation. It does not change the source CSV, axis taxonomy, verdict thresholds, or report artifact path.

## Attribution Method

For each slow-tier axis row:

```text
routeCount = wasmScoreRowRouteCount
  + wasmPreviewCandidateFeatureRowRouteCount
  + wasmProductionPreviewDriveRouteCount

unsupportedCount = wasmScoreRowUnsupportedCount
  + wasmPreviewCandidateFeatureRowUnsupportedCount
  + wasmProductionPreviewDriveUnsupportedCount

wasmHandledFraction = routeCount / (routeCount + unsupportedCount)
```

When an axis has no route or unsupported counter signal, the report classifies it as `no-wasm-signal` and assigns `wasmHandledFraction = 0`. That keeps the denominator honest: wall time with no observed WASM route cannot be counted as WASM-handled work.

Weighted wall time:

```text
wallMsWasmHandled = axisWallMs * wasmHandledFraction
wallMsTsFallback = axisWallMs * (1 - wasmHandledFraction)
```

## Top Slow-Tier Axes

| Rank | Axis | Decisions | Total ms | Route count | Unsupported count | WASM-handled fraction | Wall ms WASM-handled | Wall ms TS-fallback |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `govern:chooseNStep:confirm | continuedDeepening` | 33 | 15783.4667 | 0 | 182 | 0.0000% | 0.0000 | 15783.4667 |
| 2 | `train:chooseNStep:add | continuedDeepening` | 14 | 12791.6977 | 180 | 5 | 97.2973% | 12445.9761 | 345.7216 |
| 3 | `govern:chooseNStep:add | continuedDeepening` | 55 | 11330.6652 | 261 | 35 | 88.1757% | 9990.8906 | 1339.7746 |
| 4 | `event | singlePass` | 109 | 7985.0107 | 109 | 244 | 30.8782% | 2465.6265 | 5519.3842 |
| 5 | `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | 7041.9350 | 0 | 0 | 0.0000% | 0.0000 | 7041.9350 |
| 6 | `train:chooseNStep:confirm | continuedDeepening` | 12 | 6073.8523 | 58 | 5 | 92.0635% | 5591.8005 | 482.0518 |
| 7 | `govern | singlePass` | 47 | 2881.9400 | 63 | 238 | 20.9302% | 603.1967 | 2278.7433 |
| 8 | `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` | 84 | 1653.0150 | 0 | 0 | 0.0000% | 0.0000 | 1653.0150 |
| 9 | `event-decision:chooseNStep:add | continuedDeepening` | 6 | 1509.7683 | 39 | 14 | 73.5849% | 1110.9616 | 398.8067 |
| 10 | `coupArvnRedeployOptionalTroops | singlePass` | 32 | 1277.3123 | 46 | 192 | 19.3277% | 246.8755 | 1030.4368 |
| 11 | `rally | singlePass` | 67 | 1253.4275 | 315 | 166 | 65.4886% | 820.8517 | 432.5758 |
| 12 | `coupArvnRedeployPolice | singlePass` | 27 | 821.5151 | 27 | 162 | 14.2857% | 117.3593 | 704.1558 |

## Slow-Tier Subtotal

| Field | Value |
|---|---:|
| Slow-tier agent-call wall ms | 73420.5845 |
| Total route count | 2149 |
| Total unsupported count | 1527 |
| Wall ms WASM-handled | 34899.3662 |
| Wall ms TS-fallback / no-WASM-signal | 38521.2183 |
| WASM-handled fraction | 47.5335% |
| TS-fallback fraction | 52.4665% |
| `wasmPerfCeiling = 1 / tsFallbackFraction` | 1.9060x |
| No-counter wall ms classified as no-WASM-signal | 9562.3179 |

Manual aggregation check:

```text
wasmHandledFraction + tsFallbackFraction = 47.5335% + 52.4665% = 100.0000%
```

## Verdict

**H3 verdict: `mixed`.**

The ticket thresholds define:

- `cheap-paths-dominate`: TS-fallback fraction >= 60%
- `mixed`: TS-fallback fraction 40-60%
- `expensive-paths-routed`: TS-fallback fraction < 40%

The current measured TS-fallback fraction is `52.4665%`, so the result is `mixed`. H3 is materially present, but it does not reach the `cheap-paths-dominate` threshold.

## Phase 6 Implication

Spec 176 maps `H3 alone` to a Spec-174-style coverage extension when unsupported expensive paths dominate and H2 does not dominate. This Phase 3 result is weaker: H3 is mixed, not dominant. Phase 6 should treat H3 as contributing evidence, not as a standalone coverage-extension mandate.

Combined with Phase 2's `ts-only-bound-low` verdict, the current evidence does not support the "H2 + H3" retire/keep-as-correctness-only branch by itself. Phase 6 should combine this mixed H3 result with H1, H4, and H5 before choosing Keep, Accelerate, or Retire.

## Reproduction Notes

The report was computed directly from the Phase 0 CSV by:

1. Parsing `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv`.
2. Filtering rows to slow-tier seeds `1005`, `1011`, `1008`, `1013`, and `1009`.
3. Grouping rows by `microturnClass | previewBranch`.
4. Summing `elapsedMs` and route/unsupported counters per group.
5. Applying the formula documented above.

No engine source, profiler script, schema, generated JSON, GameSpecDoc, GameDef, or visual-config files changed for this report.
