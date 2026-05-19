# Spec 178 Phase 3 - Same-Run Attribution Counters

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 3 attribution report complete.
**Ticket**: `archive/tickets/178POLWASMPERF-004.md`

## Question

`reports/178-phase-2-terminal-boundary-no-counter-split.md` found two material residuals that were still not implementation-ready:

- `production-deep-choosenstep-continuation.projectedState`, previously `17,716.9522 ms`, or `24.13%` of slow-tier FITL ARVN agent-call wall time, but with expected terminal/outcome/depth/stochastic exits collapsed together with possible missing projected-state support.
- `coupArvnRedeployPolice:chooseOne | continuedDeepening`, previously `7,041.9350 ms`, or `9.59%` of slow-tier wall time, with no same-run route/unsupported attribution.

This report records the new same-run attribution substrate and uses it to decide whether the next owner is implementation-ready.

The decisive Phase 3 slow-tier run measured `79,103.1353 ms` across seeds `1005`, `1011`, `1008`, `1013`, and `1009`, so the current same-run `5%` bar is `3,955.1568 ms`.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.csv` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-phase-3-same-run-attribution-counters --profile-buckets` | Decisive same-run slow-tier artifact with terminal-boundary split fields and same-run hot-path family attribution. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.md` | Same command as above. | Rendered rollup proving the new terminal-boundary projected-state split section is emitted. |
| `reports/178-phase-2-terminal-boundary-no-counter-split.md` | Historical report input. | Prior materiality and missing-measurement framing. |
| `packages/engine/src/agents/policy-preview-inner-deepening.ts` | Source change. | Emits `projectedStateBoundaryKind` and `projectedStateClassification` for pre-materialization terminal boundaries. |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` | Source change. | Adds CSV fields for `hotPathBucketFamilies`, `sameRunNoCounterAttribution`, and `terminalBoundaryProjectionSplit`. |

An initial same-command run completed all five seeds but failed only when writing checked-in files under `reports/` because the sandbox returned `EROFS`. That run is diagnostic only. The decisive artifact is the rerun above, which completed and wrote both checked-in files.

## Terminal-Boundary Projected-State Split

The new unsupported detail distinguishes pre-materialization terminal boundaries from missing projected-state support. In the decisive same-run slow-tier artifact, every `production-deep-choosenstep-continuation.projectedState` row is classified as an expected terminal boundary.

| Classification | Boundary kind | Decision rows | Unsupported reason count | Attributed wall ms | Share of same-run slow-tier wall | Basis |
|---|---|---:|---:|---:|---:|---|
| expected terminal-boundary exit | `seat-or-turn-boundary` | 55 | 241 | `19,240.3706` | `24.32%` | `terminalBoundaryProjectionSplit=expected-terminal-boundary/seat-or-turn-boundary` in the same-run CSV. |
| missing materialization/support | n/a | 0 | 0 | `0.0000` | `0.00%` | No row emitted a missing-support projected-state classification. |
| still ambiguous projected-state boundary | n/a | 0 | 0 | `0.0000` | `0.00%` | No projected-state row lacked the classification fields. |

Classification: the terminal-boundary residual is material wall time, but it is not a missing projected-state implementation owner. It is expected boundary behavior in this witness workload.

## No-Counter Continued-Deepening ChooseOne Attribution

The same-run artifact confirms that `coupArvnRedeployPolice:chooseOne | continuedDeepening` remains material and still has zero WASM route/unsupported counters:

| Axis | Decision rows | Wall ms | Share of same-run slow-tier wall | Route/unsupported signal |
|---|---:|---:|---:|---:|
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | `7,743.6802` | `9.79%` | 0 |

Same-run hot-path family attribution inside those no-counter rows:

| Family | Bucket count | Bucket ms | Share of no-counter axis wall | Share of same-run slow-tier wall |
|---|---:|---:|---:|---:|
| `tokenStateIndex:*` | 284,824 | `1,405.1714` | `18.15%` | `1.78%` |
| `evalQuery:*` | 14,241,794 | `193.6024` | `2.50%` | `0.24%` |
| `zobrist:*` | 3,412,545 | `56.3323` | `0.73%` | `0.07%` |
| instrumented bucket subtotal | 17,939,163 | `1,655.1061` | `21.37%` | `2.09%` |
| unbucketed / continued-deepening orchestration / policy search residual | n/a | `6,088.5741` | `78.63%` | `7.70%` |

Classification: same-run TS bucket families are now attributable, but no named family clears the `5%` slow-tier materiality bar. The remaining unbucketed/orchestration residual still clears the bar and is not yet specific enough for an implementation spec.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains a witness workload. The added fields are generic policy-agent / preview-drive instrumentation. |
| #14 No Backwards Compatibility | The current profiler/report shape was extended in place. No legacy alias, compatibility shim, or parallel report format was added. |
| #15 Architectural Completeness | The report rejects a guessed implementation spec because the material residual still lacks a concrete generic owner. |
| #16 Testing as Proof | The decision is backed by a checked-in same-run CSV/Markdown artifact plus focused automated tests for the new output shape. |
| #20 Preview Signal Integrity | Terminal-boundary, route/unsupported, same-run hot buckets, and unbucketed residual wall time remain separate carriers. |

## Decision

The terminal-boundary projected-state branch is no longer an implementation candidate in this witness: the same-run split classifies all `241` unsupported reasons as expected `seat-or-turn-boundary` exits.

The no-counter `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis remains material at `7,743.6802 ms`, or `9.79%` of same-run slow-tier wall time. Same-run buckets explain `1,655.1061 ms`, or `2.09%` of slow-tier wall time, led by `tokenStateIndex:*` at `1.78%`; those named families do not clear the `5%` bar. The unbucketed/orchestration residual is still material at `6,088.5741 ms`, or `7.70%`, but it is not a concrete implementation owner.

create-investigation-ticket: Split continued-deepening orchestration residual from unbucketed policy search work
