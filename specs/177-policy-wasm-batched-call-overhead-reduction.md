# Spec 177 — Policy WASM Batched Call Overhead Reduction

**Status**: PROPOSED
**Priority**: High
**Complexity**: TBD
**Date**: 2026-05-17
**Source**: `reports/176-phase-6-decision-and-rationale.md`

Spec 176 selected **Accelerate WASM** because Phase 1 measured marshaling plus deserialization as `3.16x` slow-tier WASM execution time, while Phase 5 measured serialization/marshaling as material but mixed rather than purely byte-linear. This follow-up should investigate and implement a batched policy-WASM call shape, or an equivalent host/guest transfer reduction, that reduces per-call overhead for `productionPreviewDrive`, `previewCandidateFeatureRows`, and related score-row work while preserving fail-closed TS fallback and preview-signal carriers. The notional success threshold is a measured slow-tier FITL ARVN 15-seed policy-agent wall-time improvement of at least 5% versus the current WASM-on baseline, with route activation counters proving the batched path ran and parity tests proving score/preview outputs still match the authoritative TypeScript path.

