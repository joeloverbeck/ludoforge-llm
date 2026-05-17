# Spec 178 Phase 0 - Inner-Preview Subroutine Split

**Date**: 2026-05-17
**Status**: Phase 0 measurement complete.
**Ticket**: `archive/tickets/178CONTDEEPINNER-001.md`

## Question

Spec 178 identified `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the remaining material no-counter axis, but the Phase 4 report only named the inclusive inner-preview orchestration bucket. This report records the subroutine split inside `runChooseOneInnerPreview` and identifies the Phase 1 optimization owner.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-0-inner-preview-subroutine-split.csv` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-0-inner-preview-subroutine-split --profile-buckets` | Decisive five-seed slow-tier CSV with the new `policyInnerPreviewSubroutine:*` buckets. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-0-inner-preview-subroutine-split.md` | Same command as above. | Rendered rollup proving the existing `Continued-Deepening No-Counter Residual Split` section includes the new nested family. |
| `reports/178-phase-4-continued-deepening-orchestration-residual.md` | Historical Phase 4 report input. | Baseline owner framing and pre-Phase-0 residual gap. |

The decisive witness completed all five seeds: `1005`, `1011`, `1008`, `1013`, and `1009`. Same-run slow-tier wall time was `93,769.23 ms`, so the current `5%` materiality bar is `4,688.46 ms`.

## Target Axis Split

The target axis remains `coupArvnRedeployPolice:chooseOne | continuedDeepening`.

| Row | Count | Wall ms | Share of target axis wall | Share of same-run slow-tier wall | Verdict |
|---|---:|---:|---:|---:|---|
| `continued-deepening-orchestration-inclusive` | 116 | `7,578.43` | `99.2695%` | `8.0819%` | Inclusive parent bucket; material. |
| `inner-preview-subroutine-nested` | 3,606 | `7,568.11` | `99.1343%` | `8.0700%` | Nested subroutine family; diagnostic child evidence, not additive with the parent. |
| `existing-hot-path-bucket-nested` | 3,953,862 | `1,606.43` | `21.0425%` | `1.7131%` | Nested child evidence. |
| `policy-search-candidate-scoring-nested` | 1,954 | `1,521.70` | `19.9327%` | `1.6230%` | Nested child evidence. |
| `unattributed-after-top-level-orchestration` | n/a | `55.77` | `0.7305%` | `0.0595%` | Small residual outside the inclusive parent bucket. |

Rows ending in `-nested` overlap with the inclusive parent and can overlap with one another when one nested subroutine calls a lower-level instrumented hot path. They are attribution evidence, not additive cost buckets.

## Subroutine Owner

The generated hot-path bucket table breaks out the `inner-preview-subroutine-nested` family by sub-key:

| Subroutine key | Count | Wall ms | Share of target axis wall | Share of same-run slow-tier wall | Verdict |
|---|---:|---:|---:|---:|---|
| `policyInnerPreviewSubroutine:driveOption` | 1,774 | `6,804.08` | `89.1287%` | `7.2562%` | Named Phase 1 owner; clears the `5%` bar. |
| `policyInnerPreviewSubroutine:resolveRefs` | 1,774 | `762.97` | `9.9941%` | `0.8137%` | Below the `5%` bar. |
| `policyInnerPreviewSubroutine:surfaceSetup` | 58 | `1.06` | `0.0139%` | `0.0011%` | Below the `5%` bar. |

`driveOption` is the only subroutine key that clears the same-run slow-tier `5%` bar, so Phase 1 should optimize `driveOption`.

## Sister Axis Check

The sister axis `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` remains below the materiality bar alone but supports the same generic owner shape.

| Subroutine key | Count | Wall ms | Share of sister axis wall | Share of same-run slow-tier wall |
|---|---:|---:|---:|---:|
| `policyInnerPreviewSubroutine:driveOption` | 696 | `1,453.32` | `80.8888%` | `1.5499%` |
| `policyInnerPreviewSubroutine:resolveRefs` | 696 | `298.53` | `16.6156%` | `0.3184%` |
| `policyInnerPreviewSubroutine:surfaceSetup` | 84 | `1.59` | `0.0885%` | `0.0017%` |

The same `driveOption` sub-key dominates both chooseOne continued-deepening axes, which supports a generic Phase 1 optimization rather than a target-axis-specific branch.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains the witness workload only. The new instrumentation lands in generic policy preview code and uses generic bucket keys. |
| #14 No Backwards Compatibility | The existing report renderer was extended in place. No legacy key alias or parallel report section was added. |
| #15 Architectural Completeness | Phase 1 now has a concrete subroutine owner instead of guessing inside the inclusive orchestration bucket. |
| #16 Testing as Proof | The decision is backed by the checked-in CSV/Markdown witness and the focused renderer test. |
| #20 Preview Signal Integrity | Route/unsupported/advisory carriers are not changed by this measurement-only instrumentation. The witness recorded `1,299` production preview-drive routes and `751` unsupported counts with the existing reason taxonomy. |

## Recommendation

create-implementation-ticket: Optimize `policyInnerPreviewSubroutine:driveOption`

Phase 1 owner: `tickets/178CONTDEEPINNER-002.md`.
