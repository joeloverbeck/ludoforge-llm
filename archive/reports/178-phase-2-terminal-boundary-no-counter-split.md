# Spec 178 Phase 2 - Terminal-Boundary / No-Counter Split

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 2 split report complete.
**Ticket**: `archive/tickets/178POLWASMPERF-003.md`

## Question

`reports/178-phase-1-fallback-wall-time-attribution.md` found two material but not implementation-ready residual families:

- `production-deep-choosenstep-continuation.projectedState`, with `17,716.9522 ms` attributed wall time, or `24.13%` of slow-tier FITL ARVN agent-call wall time.
- `coupArvnRedeployPolice:chooseOne | continuedDeepening`, with `7,041.9350 ms`, or `9.59%` of slow-tier wall time, but no route or unsupported counter signal.

This report checks whether the existing checked-in artifacts are enough to split those owners into a concrete implementation spec, another narrower investigation, or a stop decision.

The materiality gate remains the Spec 178 gate:

- `create-spec`: one concrete owner has a measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit.
- `create-investigation-ticket`: a narrower missing measurement remains before an implementation spec is honest.
- `stop`: no evidence-backed next owner exists.

The Phase 3 slow-tier agent-call denominator is `73,420.5845 ms`, so the `5%` bar is `3,671.0292 ms`.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv` | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on` | Same-command WASM-on per-decision rows, route counts, unsupported counts, unsupported-reason JSON, preview branch, microturn class, and selected move metadata. |
| `reports/178-phase-1-fallback-wall-time-attribution.md` | report-only synthesis from Phase 0/2/3 artifacts | Authoritative Phase 1 unsupported-owner and no-counter rankings plus the slow-tier denominator. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv` | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-2-h2-ts-only-hot-paths --profile-buckets --no-wasm` | Cross-run TS-only bucket evidence for matching no-counter axes. |
| `packages/engine/src/agents/policy-preview-inner-deepening.ts` | source inspection | Confirms the `projectedState` unsupported reason is emitted when deep continuation reaches a boundary before any WASM materialized state patch is produced. |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | source inspection | Confirms no-counter rows are per-decision `PolicyAgent.chooseDecision` rows and route/unsupported counters are captured as deltas around that decision. |

No profiler or report-rendering helper change was made. The existing artifacts are sufficient to classify the current evidence limit and choose the next owner, but not sufficient to select an implementation spec.

## Method

Slow-tier seeds: `1005`, `1011`, `1008`, `1013`, and `1009`.

For terminal-boundary projected-state rows, this report filtered the Phase 0 WASM-on CSV to rows whose `wasmProductionPreviewDriveUnsupportedReasons` contained:

```text
unsupportedOwner = production-deep-choosenstep-continuation.projectedState
reason = deep preview-drive reached a terminal boundary before materializing a WASM projected state
```

For the no-counter axis, this report filtered the Phase 0 WASM-on CSV to:

```text
microturnClass = coupArvnRedeployPolice:chooseOne
previewBranch = continuedDeepening
```

and confirmed the combined route/unsupported signal was zero across score rows, preview candidate-feature rows, and production preview-drive rows.

For TS-only overlap, this report filtered the Phase 2 `--profile-buckets --no-wasm` CSV to the same `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis and grouped `hotPathBuckets` by `zobrist:*`, `tokenStateIndex:*`, and `evalQuery:*` families.

## Terminal-Boundary Projected-State Split

The Phase 0 artifact can identify the material unsupported reason, but it cannot split that reason into expected terminal exits versus missing projected-state materialization. The live source emits the same `projectedState` unsupported reason from several boundary paths before recording a projected state patch:

- action-selection, outcome-grant, turn-retirement, seat/turn mismatch, stochastic, or depth-cap boundary before a materialized patch;
- no subreason, final boundary kind, or expected-vs-missing classification is serialized into the CSV.

Current split:

| Classification | Decision rows | Unsupported reason count | Attributed wall ms | Share of slow-tier wall | Basis |
|---|---:|---:|---:|---:|---|
| expected terminal-boundary exit | 0 proven | 0 proven | `0.0000` | `0.00%` | Existing artifacts do not serialize the exact boundary kind or whether no projected state should exist. |
| missing materialization/support | 0 proven | 0 proven | `0.0000` | `0.00%` | Existing artifacts do not prove that any row should have materialized a WASM projected state. |
| still ambiguous terminal-boundary before projected state | 55 | 241 | `17,716.9522` | `24.13%` | The unsupported reason is material, but current artifacts collapse all pre-materialization boundaries into one carrier. |

Breakdown of the ambiguous rows by axis:

| Axis | Decision rows | Unsupported reason count | Wall ms |
|---|---:|---:|---:|
| `govern:chooseNStep:confirm | continuedDeepening` | 33 | 182 | `15,783.4667` |
| `govern:chooseNStep:add | continuedDeepening` | 11 | 35 | `1,107.5838` |
| `event-decision:chooseNStep:add | continuedDeepening` | 2 | 14 | `476.0293` |
| `train:chooseNStep:add | continuedDeepening` | 4 | 5 | `207.7276` |
| `train:chooseNStep:confirm | continuedDeepening` | 5 | 5 | `142.1448` |

Classification: material missing measurement, not an implementation owner. A future implementation spec would need at least a same-run boundary-kind counter or row field that distinguishes expected terminal/outcome/depth/stochastic exits from cases where a projected state should have been materialized.

## No-Counter Continued-Deepening ChooseOne Attribution

Phase 0 same-run WASM-on evidence:

| Axis | Decision rows | Wall ms | Share of slow-tier wall | Route/unsupported signal |
|---|---:|---:|---:|---:|
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | `7,041.9350` | `9.59%` | 0 |

Why counters are absent: the decision rows have `previewBranch=continuedDeepening`, but the WASM route/unsupported deltas are zero across score rows, preview candidate-feature rows, and production preview-drive rows. The current profiler captures that this axis is inside policy-agent continued deepening, but it does not classify whether the cost belongs to unsupported preview-drive routing, TS-only hash/index/query work, search orchestration, or other outside-WASM work.

Phase 2 `--profile-buckets --no-wasm` evidence for the same axis:

| Family | Bucket count | Bucket ms | Share of matching Phase 2 axis wall | Share of slow-tier denominator |
|---|---:|---:|---:|---:|
| `tokenStateIndex:*` | 284,824 | `1,365.2646` | `17.84%` | `1.86%` |
| `evalQuery:*` | 14,241,794 | `189.6975` | `2.48%` | `0.26%` |
| `zobrist:*` | 3,412,545 | `54.6243` | `0.71%` | `0.07%` |
| instrumented bucket subtotal | 17,939,163 | `1,609.5864` | `21.03%` | `2.19%` |
| unbucketed / policy-search orchestration / cross-run residual | n/a | `6,044.7830` | `78.97%` | `8.23%` |

This implicates `tokenStateIndex:*` as the largest named TS-only family inside the matching no-counter axis, but it does not clear the `5%` slow-tier materiality bar by itself. The remaining axis wall time is material, but it is not attributable to a named implementation owner from the current bucket set because this is a no-WASM cross-run comparison, not same-run WASM-on attribution.

Classification: the no-counter axis is real and material, but current evidence points to missing same-run attribution rather than a spec-ready optimization. The next measurement should put bucket or search-shape attribution on the same WASM-on no-counter rows, or add a row-level reason explaining why no route/unsupported counter fires.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains a witness workload. No game-specific engine behavior is proposed. |
| #14 No Backwards Compatibility | No compatibility route, legacy counter, or lower-bar interpretation is proposed. |
| #15 Architectural Completeness | The report rejects an implementation spec until the root owner is identifiable. |
| #16 Testing as Proof | The decision is based on checked-in CSV/report artifacts and exact source inspection of the emitted counter surfaces. |
| #20 Preview Signal Integrity | Terminal-boundary unsupported rows, no-counter axes, TS-only buckets, and ambiguous residual wall time remain distinct carriers. |

## Decision

The two residual families remain material but not spec-ready:

1. `production-deep-choosenstep-continuation.projectedState` has `17,716.9522 ms` of attributed slow-tier wall time, but the current row shape serializes only a collapsed pre-materialization boundary reason. It cannot distinguish expected terminal/outcome/depth/stochastic exits from missing projected-state support.
2. `coupArvnRedeployPolice:chooseOne | continuedDeepening` has `7,041.9350 ms` in the same WASM-on Phase 0 artifact and zero route/unsupported counter signal. Cross-run TS-only buckets implicate `tokenStateIndex:*` at `1,365.2646 ms`, but that named family is only `1.86%` of slow-tier wall time and does not explain the material axis alone.

The report therefore should not create an implementation spec yet.

create-investigation-ticket: Add same-run terminal-boundary and no-counter attribution counters
