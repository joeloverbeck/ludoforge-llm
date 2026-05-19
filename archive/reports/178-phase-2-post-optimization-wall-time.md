# Spec 178 Phase 2 - Post-Optimization Wall-Time Validation

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Phase 2 measured gate red; Spec 178 remains open.
**Ticket**: `tickets/178CONTDEEPINNER-003.md`

## Question

Spec 178 Phase 2 re-runs the same five-seed FITL ARVN decomposition witness after the Phase 1 `driveOption` optimization. The report checks whether the named Phase 0 owner and its sister axis moved enough to close Spec 178.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.csv` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-2-post-optimization-wall-time --profile-buckets` | Decisive post-optimization five-seed slow-tier CSV. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.md` | Same command as above. | Rendered rollup with the `Continued-Deepening No-Counter Residual Split` section and route/unsupported counters. |
| `reports/178-phase-0-inner-preview-subroutine-split.md` | Historical Phase 0 report. | Baseline subroutine-owner values and Phase 1 owner selection. |
| `archive/tickets/178CONTDEEPINNER-002.md` | Phase 1 implementation ticket. | Confirms the landed optimization and outcome-parity proof for selected options and Foundation #20 provenance carriers. |

The Phase 2 witness completed all five seeds: `1005`, `1011`, `1008`, `1013`, and `1009`. Same-run slow-tier wall time was `90,710.98 ms`, so the current `5%` materiality bar is `4,535.55 ms`.

## Primary Axis Delta

Target axis: `coupArvnRedeployPolice:chooseOne | continuedDeepening`.

| Row | Phase 0 wall ms | Phase 2 wall ms | Delta ms | Reduction | Verdict |
|---|---:|---:|---:|---:|---|
| `continued-deepening-orchestration-inclusive` | `7,578.43` | `7,114.21` | `464.22` | `6.13%` | Pass for directional drop only. |
| `policyInnerPreviewSubroutine:driveOption` | `6,804.08` | `6,382.68` | `421.40` | `6.19%` | Fail: required `>= 40%` reduction. |
| `policyInnerPreviewSubroutine:resolveRefs` | `762.97` | `720.62` | `42.35` | `5.55%` | Diagnostic child row. |
| `policyInnerPreviewSubroutine:surfaceSetup` | `1.06` | `0.98` | `0.08` | `7.55%` | Diagnostic child row. |

The top-level chooseOne continued-deepening bucket is still material after Phase 1: `7,114.21 ms`, or `7.8427%` of Phase 2 slow-tier wall time. The named `driveOption` owner is also still material at `6,382.68 ms`, or `7.0363%` of Phase 2 slow-tier wall time.

## Sister Axis Delta

Sister axis: `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`.

| Row | Phase 0 wall ms | Phase 2 wall ms | Delta ms | Reduction | Verdict |
|---|---:|---:|---:|---:|---|
| `continued-deepening-orchestration-inclusive` | `1,760.19` | `1,611.66` | `148.53` | `8.44%` | Directionally down. |
| `policyInnerPreviewSubroutine:driveOption` | `1,453.32` | `1,317.64` | `135.68` | `9.34%` | Fail: required `>= 25%` reduction. |
| `policyInnerPreviewSubroutine:resolveRefs` | `298.53` | `286.54` | `11.99` | `4.02%` | Diagnostic child row. |
| `policyInnerPreviewSubroutine:surfaceSetup` | `1.59` | `1.43` | `0.16` | `10.06%` | Diagnostic child row. |

The sister axis improved in the same direction, but not enough to satisfy the Spec 178 Phase 2 threshold.

## Acceptance Verdict

| Criterion | Result | Verdict |
|---|---|---|
| Phase 2 witness completes 5/5 seeds and writes CSV/Markdown artifacts. | 5/5 seeds completed; both artifacts are checked in. | Pass |
| Named owner on primary axis drops `>= 40%` from Phase 0. | `6,804.08 ms -> 6,382.68 ms`, `6.19%` reduction. | Fail |
| Primary-axis inclusive bucket shows the same directional drop. | `7,578.43 ms -> 7,114.21 ms`, `6.13%` reduction. | Pass |
| Sister-axis named owner drops `>= 25%` from Phase 0. | `1,453.32 ms -> 1,317.64 ms`, `9.34%` reduction. | Fail |
| Route counters and unsupported reason counts remain unchanged within noise. | Route count `1,299 -> 1,299`; unsupported count `751 -> 751`; unsupported reason rows are unchanged. | Pass |

## Foundation #20 Carrier Preservation

| Carrier | Phase 0 | Phase 2 | Verdict |
|---|---:|---:|---|
| WASM production preview-drive route count | `1,299` | `1,299` | Pass |
| WASM production preview-drive unsupported count | `751` | `751` | Pass |
| Unsupported reason taxonomy | Existing reason rows only. | Existing reason rows only. | Pass |
| Advisory provenance | Phase 1 parity test covers per-decision preview provenance and advisories; Phase 2 witness does not emit a separate advisory-total column. | No new unsupported/advisory category is visible in the Phase 2 witness; Phase 1 parity remains the advisory oracle. | Pass with oracle split |

The Phase 2 witness preserves route and unsupported carriers exactly. Advisory totals are not serialized as a separate field by the decomposition script, so this report relies on the checked-in Phase 1 outcome-parity test for advisory/provenance parity while using Phase 2 for wall-time and route/unsupported counters.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains the witness workload only; no engine or game-specific source changed in Phase 2. |
| #14 No Backwards Compatibility | The existing profiler/report output is reused; no parallel report format or compatibility alias was added. |
| #15 Architectural Completeness | The failed threshold is recorded as a measured gate, not hidden behind prose or a same-ticket code patch. |
| #16 Testing as Proof | The verdict is backed by checked-in CSV/Markdown witness artifacts and exact command output. |
| #20 Preview Signal Integrity | Route and unsupported carriers are unchanged, and advisory parity remains covered by the Phase 1 invariant test. |

## Final Recommendation

create-investigation-ticket: 178CONTDEEPINNER-004 residual `policyInnerPreviewSubroutine:driveOption` wall time after Phase 1 under-delivery
