# Spec 176 Phase 2 H2 TS-Only Hot-Path Attribution

**Date**: 2026-05-17
**Status**: Phase 2 witness complete.
**Ticket**: `archive/tickets/176POLWASMPERF-003.md`

## Measurement Source

This report uses a fresh no-WASM run with hot-path buckets enabled:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --profile-buckets --no-wasm --date 2026-05-17-phase-2-h2-ts-only-hot-paths
```

Artifacts:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv`

The script appends `-no-wasm` to the artifact basename because the date label did not already include that suffix.

Slow-tier seeds: `1005`, `1011`, `1008`, `1013`, `1009`.

## Symbol Reassessment

The four Phase 4h H2 symbols still exist in the current source and in the Phase 2 measurement:

| Phase 4h symbol | Current status | Phase 2 slow-tier count | Phase 2 slow-tier ms |
|---|---|---:|---:|
| `tokenStateIndex:refreshCachedEntries` | unchanged | 379479 | 4290.8183 |
| `evalQuery:countMatchingTokens` | unchanged | 646720 | 762.6554 |
| `zobrist:digestDecisionStackFrame` | unchanged | 35958 | 4965.3302 |
| `zobrist:encodeDecisionStackFrame` | unchanged | 37070 | 3186.1146 |

The current top timed bucket also includes `evalQuery:applyTokenFilter`, which is another TS-only query path outside the policy-WASM route.

## Slow-Tier Wall-Time Basis

The CSV's per-row `elapsedMs` measures the `PolicyAgent.chooseDecision` call and is the denominator for this attribution, matching the hot-bucket measurement scope.

| Seed | Slow-tier agent-call ms | Decisions |
|---:|---:|---:|
| 1005 | 37708.6538 | 393 |
| 1008 | 14529.3068 | 346 |
| 1009 | 9453.3419 | 292 |
| 1011 | 6262.3766 | 206 |
| 1013 | 6102.5330 | 258 |
| **total** | **74056.2121** | **1495** |

The generated Markdown witness's full per-seed wall-time median for the same slow tier is `12069.08 ms` (seed `1009`). The CSV agent-call median is `9453.3419 ms`.

## Slow-Tier Hot-Bucket Attribution

| Rank | Hot bucket | Classification | Count | Total ms | Share of slow-tier agent-call ms |
|---:|---|---|---:|---:|---:|
| 1 | `zobrist:digestDecisionStackFrame` | `ts-only-outside-wasm-scope` | 35958 | 4965.3302 | 6.7048% |
| 2 | `tokenStateIndex:refreshCachedEntries` | `ts-only-outside-wasm-scope` | 379479 | 4290.8183 | 5.7940% |
| 3 | `zobrist:encodeDecisionStackFrame` | `ts-only-outside-wasm-scope` | 37070 | 3186.1146 | 4.3023% |
| 4 | `evalQuery:applyTokenFilter` | `ts-only-outside-wasm-scope` | 468771 | 834.0308 | 1.1262% |
| 5 | `evalQuery:countMatchingTokens` | `ts-only-outside-wasm-scope` | 646720 | 762.6554 | 1.0298% |
| 6 | `tokenStateIndex:build` | `ts-only-outside-wasm-scope` | 18 | 0.7523 | 0.0010% |

Zero-time diagnostic/count buckets such as cache hits, filtered item counts, and encoded-character counts are present in the CSV but excluded from the timed ranking because they contribute `0 ms`.

Prefix subtotal:

| Prefix | Classification | Count | Total ms | Share of slow-tier agent-call ms |
|---|---|---:|---:|---:|
| `zobrist:*` | `ts-only-outside-wasm-scope` | 608448036 | 8151.4448 | 11.0071% |
| `tokenStateIndex:*` | `ts-only-outside-wasm-scope` | 1608318 | 4291.5706 | 5.7950% |
| `evalQuery:*` | `ts-only-outside-wasm-scope` | 65614232 | 1596.6862 | 2.1560% |
| **total timed TS-only buckets** | **`ts-only-outside-wasm-scope`** | **67670586** | **14039.7016** | **18.9582%** |

No measured hot-path bucket in this run is `wasm-routed`. Unsupported preview-drive rows are visible in the witness, but this H2 report does not count them as TS-only structural buckets; those rows are H3 input and belong to ticket `176POLWASMPERF-004`.

## Speedup Ceiling

Formula:

```text
ts_only_fraction = timed_ts_only_bucket_ms / slow_tier_agent_call_ms
remaining_fraction_after_perfect_ts_bucket_absorption = 1 - ts_only_fraction
projected_median_ms = no_wasm_slow_tier_median_ms * remaining_fraction_after_perfect_ts_bucket_absorption
```

Measured inputs:

| Field | Value |
|---|---:|
| Slow-tier agent-call ms | 74056.2121 |
| Timed TS-only bucket ms | 14039.7016 |
| TS-only bucket fraction | 18.9582% |
| Remaining fraction under perfect absorption | 81.0418% |
| Current Phase 2 no-WASM slow-tier wall median | 12069.08 ms |
| Projected median under perfect TS-only bucket absorption | 9780.8366 ms |
| Projected median delta | -2288.2434 ms |

Under this strict hot-bucket denominator, even an impossible implementation that moved every currently timed `tokenStateIndex:*`, `zobrist:*`, and `evalQuery:*` bucket to zero-cost WASM would leave about `81.0418%` of slow-tier agent-call time in other work.

## Verdict

**H2 verdict: `ts-only-bound-low`.**

The ticket threshold defines low as `<40%` structurally TS-bound. The current measured timed TS-only bucket fraction is `18.9582%` of slow-tier agent-call time. The report therefore does not support H2 as the dominant explanation by itself.

This is a correction to the Phase 4h framing, not a symbol-name correction: the cited symbols still exist and are still TS-only, but their current measured share is below the H2 dominance threshold.

## Phase 6 Implication

Spec 176's decision tree maps `H2 alone` to an Accelerate branch only when TS-only hot paths dominate. Phase 2 does **not** support that branch by itself under the current measurement. Phase 6 should combine this low H2 result with H1 and the remaining H3-H5 reports before choosing Keep, Accelerate, or Retire.
