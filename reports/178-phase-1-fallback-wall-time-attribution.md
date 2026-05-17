# Spec 178 Phase 1 — Fallback Wall-Time Attribution

**Date**: 2026-05-17
**Status**: Phase 1 attribution report complete.
**Ticket**: `archive/tickets/178POLWASMPERF-002.md`

## Question

`reports/178-policy-agent-bottleneck-discovery.md` identified the remaining material class after Spec 177 as TS-fallback / no-WASM-signal plus outside-WASM policy-agent work. This report attributes that class by unsupported preview-drive owner/reason, no-counter axis, and TS-only hot-bucket family before deciding whether the next artifact should be an implementation spec, another investigation ticket, or a stop decision.

The materiality gate remains the Spec 178 gate:

- `create-spec`: one concrete owner has a measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit.
- `create-investigation-ticket`: a narrower missing measurement remains before an implementation spec is honest.
- `stop`: no evidence-backed next owner exists.

The Phase 3 slow-tier agent-call denominator is `73,420.5845 ms`, so the `5%` bar is `3,671.0292 ms`.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv` | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on` | Same-command WASM-on per-decision rows, route counts, unsupported counts, unsupported-reason JSON, and selected move metadata. |
| `reports/176-phase-3-cheap-vs-expensive-coverage.md` | derived from the same Phase 0 WASM-on CSV | Authoritative Phase 3 fallback/no-signal aggregate and no-counter axis method. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv` | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-2-h2-ts-only-hot-paths --profile-buckets --no-wasm` | Hot-path bucket attribution for TS-only `zobrist:*`, `tokenStateIndex:*`, and `evalQuery:*` families. |
| `reports/176-phase-1-ffi-marshaling-decomposition.md` | derived from Phase 0 timed and no-WASM artifacts | Outside-WASM residual classification and noisy run-to-run comparison. |
| `reports/178-policy-agent-bottleneck-discovery.md` | report-only synthesis | Prior owner inventory and ticket handoff context. |

No profiler or report-rendering helper change was needed. The checked-in CSVs already include the required fields, and this report is a direct attribution/readout over those artifacts.

## Attribution Method

Slow-tier seeds: `1005`, `1011`, `1008`, `1013`, and `1009`.

The Phase 3 fallback/no-signal subtotal is reused as the authoritative aggregate:

```text
routeCount = wasmScoreRowRouteCount
  + wasmPreviewCandidateFeatureRowRouteCount
  + wasmProductionPreviewDriveRouteCount

unsupportedCount = wasmScoreRowUnsupportedCount
  + wasmPreviewCandidateFeatureRowUnsupportedCount
  + wasmProductionPreviewDriveUnsupportedCount

axisWasmHandledFraction = routeCount / (routeCount + unsupportedCount)
axisFallbackMs = axisWallMs * (1 - axisWasmHandledFraction)
```

Axes with no route or unsupported counter signal are classified as `no-wasm-signal` and assigned `axisFallbackMs = axisWallMs`.

Unsupported-reason wall time is a row-local attribution over the existing `wasmProductionPreviewDriveUnsupportedReasons` JSON. It distributes each row's production preview-drive unsupported share across the row's recorded owners/reasons. This is enough to rank current unsupported owners, but it is not exclusive proof that the owner is optimizable: a reason such as terminal-boundary-before-projected-state may be a semantic exit rather than missing WASM support.

## Slow-Tier Fallback / No-WASM-Signal Summary

| Field | Value |
|---|---:|
| Slow-tier agent-call wall ms | `73,420.5845` |
| Wall ms WASM-handled | `34,899.3662` |
| Wall ms TS-fallback / no-WASM-signal | `38,521.2183` |
| TS-fallback / no-WASM-signal share | `52.4665%` |
| No-counter wall ms | `9,562.3179` |
| No-counter share | `13.0240%` |

The broad class remains material, but the current evidence splits it across unsupported-reason and no-counter families.

## Unsupported Preview-Drive Owner / Reason Attribution

| Rank | Unsupported owner | Reason | Count | Attributed wall ms | Share of slow-tier wall | Classification |
|---:|---|---|---:|---:|---:|---|
| 1 | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 241 | `17,716.9522` | `24.13%` | Material, but needs semantic split before implementation: terminal boundary may mean no useful projected state exists rather than missing route coverage. |
| 2 | `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 244 | `3,661.7762` | `4.99%` | Borderline material by this attribution; concrete unsupported owner but just below the 5% slow-tier bar. |
| 3 | `production-preview-drive.actionBatch` | production preview-drive requires deterministic shared scalar runtime bindings | 262 | `1,228.6399` | `1.67%` | Below materiality alone. |
| 4 | `production-preview-drive.chooseN` | only origin-seat greedy chooseN publication is supported | 4 | `17.7592` | `0.02%` | Not material alone. |

The top unsupported owner clears the numeric screen, but its reason is not yet implementation-ready. The row says the deep continuation reached a terminal boundary before materializing a projected state; it does not distinguish an optimization gap from an expected semantic exit where no projected state should exist.

Foundation #20 interpretation: unsupported, terminal-boundary, and no-signal carriers must remain distinct. Treating the top row as "route all projected states into WASM" would collapse terminal-boundary provenance into a scalar wall-time target.

## No-Counter Axes

| Rank | Axis | Decisions | Wall ms | Share of slow-tier wall | Why current counters do not explain it |
|---:|---|---:|---:|---:|---|
| 1 | `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | `7,041.9350` | `9.59%` | No route count and no unsupported count; the current WASM counters do not show whether this is unsupported preview-drive, TS-only policy search, or another outside-WASM path. |
| 2 | `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` | 84 | `1,653.0150` | `2.25%` | No route/unsupported signal on this axis. |
| 3 | `coupArvnRedeployMandatory:chooseOne | continuedDeepening` | 12 | `296.4279` | `0.40%` | No route/unsupported signal on this axis. |
| 4 | `transport:chooseOne | continuedDeepening` | 8 | `279.9669` | `0.38%` | No route/unsupported signal on this axis. |
| 5 | `govern:chooseOne | continuedDeepening` | 58 | `192.6593` | `0.26%` | No route/unsupported signal on this axis. |
| 6 | other no-counter axes | 624 | `98.3138` | `0.13%` | Mostly low-ms `none` preview-branch chooseN/chooseOne rows. |

The largest no-counter axis independently clears the `5%` wall-time bar. It is also not implementation-ready because the existing counters do not identify which policy-agent subsystem owns the time.

## TS-Only Hot-Bucket Families

These rows come from the Phase 2 no-WASM hot-bucket run. They are not same-run WASM-on unsupported owners, but they identify TS-only families visible under `--profile-buckets`.

| Family | Total ms | Share of Phase 2 slow-tier agent-call ms | Interpretation |
|---|---:|---:|---|
| `zobrist:*` | `8,151.4448` | `11.0071%` | Material TS-only family, dominated by decision-stack frame digest/encoding. |
| `tokenStateIndex:*` | `4,291.5706` | `5.7950%` | Material TS-only family, dominated by refresh work. |
| `evalQuery:*` | `1,596.6862` | `2.1560%` | Not material alone under the 5% bar. |
| total timed TS-only buckets | `14,039.7016` | `18.9582%` | Material diagnostic family, but Phase 2 already classified it below the older `40%` structural-dominance threshold. |

This supports a narrowed investigation into TS-only policy search/hash/index work, especially where it overlaps the no-counter `chooseOne | continuedDeepening` axes. It does not by itself select a single implementation owner because it was measured in the no-WASM hot-bucket run rather than in the same WASM-on fallback attribution artifact.

## Outside-WASM / Run-to-Run Residual

Phase 1 recorded:

| Field | Value |
|---|---:|
| Slow-tier no-WASM wall ms | `71,009.1253` |
| Slow-tier WASM-on timed wall ms | `75,207.2901` |
| Measured slow-tier WASM bucket ms | `767.8955` |
| Slow-tier WASM-on outside-call wall ms | `74,439.3946` |

The cross-run comparison is noisy because the no-WASM slow-tier run was faster than the WASM-on outside-call wall time. It cannot be used as a positive outside-WASM cost estimate. It remains evidence that route-local WASM timing buckets are too narrow to explain slow-tier wall time, but not a standalone implementation owner.

## Decision

The evidence identifies two material but not-yet-implementation-ready families:

1. `production-deep-choosenstep-continuation.projectedState` carries the largest unsupported-reason wall-time attribution, but the reason is a terminal-boundary condition that needs a semantic split between expected terminal exits and missing projected-state materialization.
2. `coupArvnRedeployPolice:chooseOne | continuedDeepening` carries `7,041.9350 ms` with no route or unsupported counter signal, so the current instrumentation cannot say whether the owner is preview-drive support, TS-only hash/index/query work, policy search shape, or another outside-WASM path.

The report therefore should not create an implementation spec yet. A spec written now would either overfit the terminal-boundary unsupported reason or ignore the material no-counter axis.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains the witness workload only; the next owner must be generic engine/policy-agent work. |
| #14 No Backwards Compatibility | No compatibility mode, legacy route, or lower-bar replay of Spec 177 batching is proposed. |
| #15 Architectural Completeness | The recommendation preserves the root-cause investigation boundary instead of guessing an implementation target from ambiguous counters. |
| #16 Testing as Proof | The decision is derived from checked-in measured CSV/report artifacts and records where current counters are insufficient. |
| #20 Preview Signal Integrity | Unsupported owners, terminal-boundary statuses, no-counter axes, and noisy outside-WASM residuals remain separate carriers. |

create-investigation-ticket: Split terminal-boundary projected-state unsupported time from no-counter continued-deepening chooseOne policy work
