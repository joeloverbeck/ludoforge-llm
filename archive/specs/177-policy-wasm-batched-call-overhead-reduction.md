# Spec 177 — Policy WASM Batched Call Overhead Reduction

**Status**: REJECTED
**Priority**: High
**Complexity**: TBD
**Date**: 2026-05-17
**Source**: `reports/176-phase-6-decision-and-rationale.md`

Spec 176 selected **Accelerate WASM** because Phase 1 measured marshaling plus deserialization as `3.16x` slow-tier WASM execution time, while Phase 5 measured serialization/marshaling as material but mixed rather than purely byte-linear. This follow-up should investigate and implement a batched policy-WASM call shape, or an equivalent host/guest transfer reduction, that reduces per-call overhead for `productionPreviewDrive`, `previewCandidateFeatureRows`, and related score-row work while preserving fail-closed TS fallback and preview-signal carriers. The notional success threshold is a measured slow-tier FITL ARVN 15-seed policy-agent wall-time improvement of at least 5% versus the current WASM-on baseline, with route activation counters proving the batched path ran and parity tests proving score/preview outputs still match the authoritative TypeScript path.

## Phase 0 Gate Result

`reports/177-phase-0-batching-shape-selection.md` measured the current batch-size distribution and found no transfer-reduction shape whose predicted ROI can plausibly clear the `>=5%` slow-tier wall-time bar. Slow-tier wall time was `78,030.23 ms`; the threshold requires about `3,901.51 ms` of improvement, while an impossible 100% elimination of measured transfer overhead across `scoreRows`, `previewCandidateFeatureRows`, and `productionPreviewDrive` would save only about `608.7484 ms`.

User-approved 2026-05-17 decision: stop at Phase 0, keep the evidence, and do not proceed to `177POLWASMBATCH-002` without a re-scoped spec or new evidence.

## Outcome (2026-05-17)

Spec 177 is rejected by its own Phase 0 measured gate. The intended policy-WASM batching or equivalent transfer-reduction route cannot plausibly satisfy the `>=5%` slow-tier FITL ARVN wall-time threshold: measured slow-tier wall time was `78,030.23 ms`, the threshold required about `3,901.51 ms`, and even eliminating all measured transfer overhead across `scoreRows`, `previewCandidateFeatureRows`, and `productionPreviewDrive` would save only about `608.7484 ms`.

Landed evidence:

- `archive/tickets/177POLWASMBATCH-001.md` completed Phase 0 telemetry and report generation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.csv`
- `reports/177-phase-0-batching-shape-selection.md`

Not implemented:

- `archive/tickets/177POLWASMBATCH-002.md` did not land any transfer-reduction shape.
- `archive/tickets/177POLWASMBATCH-003.md` did not run a post-implementation wall-time witness because there was no implementation to measure.

Future work should not re-spec this file in place unless it is still specifically about the rejected transfer-overhead batching hypothesis. A different acceleration hypothesis should start as a new spec or investigation ticket and cite `reports/177-phase-0-batching-shape-selection.md` as negative evidence.

Verification:

- `pnpm -F @ludoforge/engine build` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js dist/test/integration/policy-wasm-timing-profile-batch-size.test.js` passed: 4 tests / 2 suites / 0 failed.
- `pnpm turbo build`, `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm turbo test` passed before archival.
- `pnpm run check:ticket-deps` passed after terminal status and archive-path rewrites.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-17:

- [`archive/tickets/177POLWASMBATCH-001.md`](../tickets/177POLWASMBATCH-001.md) — Phase 0 — Batch-size profiling and transfer-reduction shape selection (completed as Phase 0 evidence; outputs `reports/177-phase-0-batching-shape-selection.md`)
- [`archive/tickets/177POLWASMBATCH-002.md`](../tickets/177POLWASMBATCH-002.md) — Implement selected transfer-reduction shape with parity tests and route-activation counters (not implemented; no shape authorized by Phase 0)
- [`archive/tickets/177POLWASMBATCH-003.md`](../tickets/177POLWASMBATCH-003.md) — Slow-tier wall-time witness + 5% improvement gate (not implemented; no implementation to measure)
