# Spec 178 Phase 3 - Residual driveOption Investigation

**Date**: 2026-05-17
**Status**: Implementation-ready sub-owner identified; Spec 178 remains open.
**Ticket**: `archive/tickets/178CONTDEEPINNER-004.md`

## Question

Spec 178 Phase 3 splits the still-material `policyInnerPreviewSubroutine:driveOption` residual after the Phase 1 lazy draft-index optimization under-delivered. The investigation asks whether the residual is still a single implementation owner or whether the remaining time is too fragmented to pursue.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/178-phase-2-post-optimization-wall-time.md` | Historical Phase 2 report. | Baseline red-gate verdict and post-optimization `driveOption` values. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.md` | Historical Phase 2 witness. | Phase 2 route/unsupported carrier baseline and pre-Phase-3 bucket shape. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-3-residual-drive-option-split.csv` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-3-residual-drive-option-split --profile-buckets` | Decisive Phase 3 five-seed CSV with `policyInnerPreviewDriveOption:*` buckets. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-3-residual-drive-option-split.md` | Same command as above. | Rendered rollup with the continued-deepening residual split and route/unsupported counters. |

The Phase 3 witness completed all five seeds: `1005`, `1011`, `1008`, `1013`, and `1009`. Same-run wall time was `90,695.79 ms`, so the current 5% materiality bar is `4,534.79 ms`.

## Instrumentation Added

The investigation extended the existing profiler/report surface in place. It added nested `policyInnerPreviewDriveOption:*` hot-path buckets inside the existing `driveOption` wrapper:

- `initialDecisionApply`
- `publishMicroturn`
- `pickInnerDecision`
- `continuationDecisionApply`
- `syncDraftTokenStateIndex`
- `canonicalizeForExit`

The report renderer classifies these rows as `drive-option-subroutine-nested`. They are child evidence inside `policyInnerPreviewSubroutine:driveOption`; they are not additive with the parent wrapper or with sibling nested rows such as `policyMicroturnSearch:*`.

## Primary Axis Residual Split

Target axis: `coupArvnRedeployPolice:chooseOne | continuedDeepening`.

| Row | Count | Wall ms | Share of same-run wall | Share of axis wall | Share of driveOption |
|---|---:|---:|---:|---:|---:|
| Axis total | 58 decisions | `7,286.87` | `8.0344%` | `100.0000%` | n/a |
| `continued-deepening-orchestration-inclusive` | 58 | `7,230.43` | `7.9722%` | `99.2255%` | n/a |
| `policyInnerPreviewSubroutine:driveOption` | 1,774 | `6,494.10` | `7.1603%` | `89.1189%` | `100.0000%` |
| `policyInnerPreviewDriveOption:publishMicroturn` | 1,896 | `3,056.07` | `3.3696%` | `41.9367%` | `47.0558%` |
| `policyInnerPreviewDriveOption:pickInnerDecision` | 1,896 | `1,509.22` | `1.6641%` | `20.7115%` | `23.2383%` |
| `policyInnerPreviewDriveOption:continuationDecisionApply` | 1,896 | `650.79` | `0.7176%` | `8.9304%` | `10.0212%` |
| `policyInnerPreviewDriveOption:canonicalizeForExit` | 1,774 | `621.20` | `0.6850%` | `8.5249%` | `9.5656%` |
| `policyInnerPreviewDriveOption:initialDecisionApply` | 1,774 | `528.01` | `0.5822%` | `7.2461%` | `8.1306%` |
| `policyInnerPreviewDriveOption:syncDraftTokenStateIndex` | 2,844 | `106.32` | `0.1172%` | `1.4590%` | `1.6373%` |

`publishMicroturn` is the largest child row. It does not clear the generic 5% same-run materiality bar by itself, but it accounts for `47.0558%` of the still-material `driveOption` wrapper. That makes it the only measured child large enough to plausibly satisfy the original Spec 178 Phase 2 `>= 40%` owner-reduction target if optimized successfully.

## Sister Axis Check

Sister axis: `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`.

| Row | Count | Wall ms | Share of same-run wall | Share of axis wall | Share of driveOption |
|---|---:|---:|---:|---:|---:|
| Axis total | 84 decisions | `1,679.06` | `1.8513%` | `100.0000%` | n/a |
| `continued-deepening-orchestration-inclusive` | 84 | `1,641.82` | `1.8103%` | `97.7821%` | n/a |
| `policyInnerPreviewSubroutine:driveOption` | 696 | `1,350.80` | `1.4894%` | `80.4498%` | `100.0000%` |
| `policyInnerPreviewDriveOption:publishMicroturn` | 732 | `357.82` | `0.3945%` | `21.3107%` | `26.4895%` |
| `policyInnerPreviewDriveOption:continuationDecisionApply` | 732 | `262.35` | `0.2893%` | `15.6248%` | `19.4218%` |
| `policyInnerPreviewDriveOption:canonicalizeForExit` | 696 | `239.18` | `0.2637%` | `14.2449%` | `17.7065%` |
| `policyInnerPreviewDriveOption:initialDecisionApply` | 696 | `222.13` | `0.2449%` | `13.2294%` | `16.4443%` |
| `policyInnerPreviewDriveOption:pickInnerDecision` | 732 | `213.80` | `0.2357%` | `12.7333%` | `15.8277%` |
| `policyInnerPreviewDriveOption:syncDraftTokenStateIndex` | 1,160 | `44.57` | `0.0491%` | `2.6544%` | `3.2995%` |

The sister axis has a flatter distribution, but `publishMicroturn` is still the largest measured child row. The generic owner is therefore not a FITL-specific branch or a one-axis artifact.

## Carrier Preservation

| Carrier | Phase 2 | Phase 3 | Verdict |
|---|---:|---:|---|
| WASM production preview-drive route count | `1,299` | `1,299` | Pass |
| WASM production preview-drive unsupported count | `751` | `751` | Pass |
| Unsupported reason taxonomy | Existing reason rows only. | Existing reason rows only. | Pass |
| Advisory provenance | Covered by the Phase 1 outcome-parity test; no separate advisory-total column in this decomposition artifact. | No new unsupported/advisory category is visible in the Phase 3 witness. | Pass with oracle split |

The new buckets are timing attribution only. They do not alter route, unsupported, advisory, hidden/stochastic/depthCap, or selection-outcome carriers.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains only the witness workload. The measured owner is the generic `driveOption` publication path. |
| #10 Bounded Computation | The investigation records the active `deep1024` preview cap class from the decomposition artifact and does not change bounds. |
| #14 No Backwards Compatibility | The existing profiler and report renderer were extended in place. No parallel report family or compatibility alias was added. |
| #15 Architectural Completeness | The report identifies the measured child owner before proposing another implementation slice. |
| #16 Testing as Proof | The recommendation is backed by checked-in CSV/Markdown witness artifacts plus a focused report-rendering test for the new bucket family. |
| #20 Preview Signal Integrity | Route and unsupported counters are unchanged, and unavailable-preview provenance remains visible in the existing witness/report surfaces. |

## Recommendation

create-implementation-ticket: 178CONTDEEPINNER-005 optimize `policyInnerPreviewDriveOption:publishMicroturn` inside `driveOption`
