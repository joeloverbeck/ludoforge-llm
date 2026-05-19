# Spec 177 Phase 0 — Batch-Size Distribution and Shape Selection

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: `gate-not-met`
**Command**: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-batch-size-distribution`
**Witness Markdown**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.csv`
**Spec**: `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`
**Ticket**: `archive/tickets/177POLWASMBATCH-001.md`

## Verdict

`no-transfer-reduction-shape-authorized`

The measured Phase 0 batch-size and timing evidence does not support handing a transfer-reduction implementation to `archive/tickets/177POLWASMBATCH-002.md`. The slow-tier wall time in the current witness is `78,030.23 ms`; the spec's notional `>=5%` bar therefore requires about `3,901.51 ms` of slow-tier improvement.

The slow-tier measured overhead available in the current WASM timing buckets is much smaller:

| Route class | Slow-tier calls | Batch mean | Min | Max | Histogram | Marshaling ms | Deserialization ms | Overhead ms |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| `scoreRows` | 4,490 | 13.1849 | 1 | 83 | `{"1":898,"9-16":1336,"2-4":802,"5-8":390,"17-32":644,"33+":420}` | 304.4241 | 4.5784 | 309.0025 |
| `previewCandidateFeatureRows` | 314 | 7.9682 | 1 | 83 | `{"1":149,"2-4":94,"9-16":22,"33+":28,"17-32":14,"5-8":7}` | 48.3648 | 0.5046 | 48.8694 |
| `productionPreviewDrive` | 3,050 | 1.0000 | 1 | 1 | `{"1":3050}` | 162.0267 | 88.8498 | 250.8765 |

Even an impossible 100% elimination of all measured marshaling plus deserialization across these three route classes would save `608.7484 ms`, or about `0.78%` of the measured slow-tier wall time. That is below the `>=5%` threshold by more than a factor of six.

## All-Seed Distribution

| Route class | Calls | Batch mean | Min | Max | Histogram | Marshaling ms | Deserialization ms | Execution ms |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| `scoreRows` | 11,498 | 11.7869 | 1 | 83 | `{"1":2254,"9-16":3676,"17-32":1612,"5-8":964,"2-4":2140,"33+":852}` | 790.6300 | 11.8041 | 410.9553 |
| `previewCandidateFeatureRows` | 766 | 7.0078 | 1 | 83 | `{"1":366,"9-16":59,"2-4":234,"5-8":9,"17-32":47,"33+":51}` | 128.8842 | 1.1250 | 29.0396 |
| `productionPreviewDrive` | 5,784 | 1.0003 | 1 | 2 | `{"1":5782,"2-4":2}` | 368.2133 | 201.4879 | 32.5206 |

`productionPreviewDrive` has the highest overhead/execution ratio, but its measured batch size is already effectively one candidate per call in the slow tier. Cross-action batching cannot materially reduce call count because there are no multi-candidate slow-tier groups to merge in this witness.

`previewCandidateFeatureRows` has some larger candidate vectors, but its absolute slow-tier overhead is only `48.8694 ms`. Cross-feature batching would need to eliminate far more wall time than exists in this route's measured transfer overhead.

`scoreRows` has the largest candidate vectors and the largest slow-tier overhead among the three routes, but its measured overhead is still only `309.0025 ms`; by itself it cannot approach the `3,901.51 ms` bar.

## Phase 5 Payload-Size Context

Phase 5 (`reports/176-phase-5-state-serialization.md`) measured `407,142,300` serialized bytes across `18,048` WASM calls, with overall Pearson `r = 0.4705` and slow-tier Pearson `r = 0.5900` for bytes-per-call versus marshaling-ms-per-call. That report classified serialization as mixed rather than purely byte-linear.

Representative Phase 5 axes show why a payload-shrink-only implementation is also not justified by this Phase 0 evidence:

| Axis | Bytes/call | Marshaling ms/call | Interpretation |
|---|---:|---:|---|
| `train:chooseNStep:add|continuedDeepening` | 136.00 | 0.042113 | fixed per-call setup is visible even on tiny payloads |
| `train:chooseNStep:confirm|continuedDeepening` | 136.00 | 0.031699 | fixed overhead remains material |
| `event|singlePass` | 33,305.17 | 0.088195 | byte-size contributes, but not enough to dominate wall time |
| `govern|singlePass` | 31,690.65 | 0.083550 | large payload route with modest per-call marshaling |
| `rally|singlePass` | 23,097.23 | 0.097719 | mixed fixed and per-byte cost |

The current Phase 0 witness preserves that conclusion: transfer overhead is measurable and worth recording, but it is not the dominant slow-tier wall-time owner.

## Shape Selection

**Recommended transfer-reduction shape for `002`: none.**

This is a user-approved `FOUNDATIONS.md` alignment correction from 2026-05-17. Proceeding with `crossActionBatching(productionPreviewDrive)`, `crossFeatureBatching(previewCandidateFeatureRows)`, `payloadShrink(productionPreviewDrive)`, or `payloadShrink(scoreRows)` would implement a known-insufficient optimization and conflict with Foundation #15's root-cause requirement and Foundation #16's evidence requirement.

## 1-3-1 Decision

**Problem:** No measured transfer-reduction shape can plausibly clear the spec's `>=5%` slow-tier wall-time predicate.

**Options presented to the user:**

1. Mark `177POLWASMBATCH-001` blocked with the evidence report and do not proceed to `002`.
2. Re-investigate a different shape or broader metric before deciding.
3. Re-scope Spec 177's threshold or descope the spec.

**User-approved option:** Option 1.

## Foundation #20 Carrier Preservation

No new batched/merged call boundary is authorized by this report. The implemented Phase 0 instrumentation observes call shape only and does not alter `tiebreakAfterPreviewNoSignal`, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`, or the preview status taxonomy (`ready`, `unknown`, `hidden`, `stochastic`, `unresolved`, `failed`, `depthCap`, `partial`).

If a later re-scoped spec authorizes a new transfer-reduction implementation, that future ticket must preserve those carriers per row and prove the preservation through parity tests before any wall-time witness is accepted.

## Foundation #14 Transition Plan

No transition plan is authorized because no implementation shape is selected. `archive/tickets/177POLWASMBATCH-002.md` is closed as `NOT IMPLEMENTED`; any future transfer-reduction implementation must start from a new or re-scoped evidence report whose predicted ROI clears the threshold.

## Downstream Action

- `archive/tickets/177POLWASMBATCH-001.md`: records the instrumentation and evidence, then closes as completed Phase 0 evidence.
- `archive/tickets/177POLWASMBATCH-002.md`: closed as `NOT IMPLEMENTED`; no transfer-reduction implementation should start from the current evidence.
- `archive/tickets/177POLWASMBATCH-003.md`: closed as `NOT IMPLEMENTED` because there is no post-implementation wall-time witness target.
- `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`: closed as `REJECTED` by the Phase 0 measured gate.
