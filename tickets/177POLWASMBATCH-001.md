# 177POLWASMBATCH-001: Phase 0 — Batch-size profiling and transfer-reduction shape selection

**Status**: BLOCKED by measured gate
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-wasm-timing-profile.ts` (add per-call batch-size accumulation), `policy-wasm-runtime.ts` (emit batch size at the live timing recorder call sites), `scripts/profile-fitl-arvn-15-seed-timing.mjs` and `scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (surface batch-size columns)
**Deps**: `specs/177-policy-wasm-batched-call-overhead-reduction.md`

## Problem

Spec 177 calls for a batched policy-WASM call shape (or equivalent host/guest transfer reduction) targeting `productionPreviewDrive`, `previewCandidateFeatureRows`, and related `scoreRows` work, with a notional ≥5% slow-tier FITL ARVN 15-seed wall-time improvement. Phase 1 (`reports/176-phase-1-ffi-marshaling-decomposition.md`) measured slow-tier overhead/execution ratios of `16.55x` for `productionPreviewDrive`, `4.52x` for `previewCandidateFeatureRows`, and `1.89x` for `scoreRows`. Phase 5 confirmed serialization is material but only weakly byte-linear (`r = 0.4705` overall, `0.5900` slow-tier).

What Phase 1 and Phase 5 did **not** measure is the per-route batch-size distribution. `productionPreviewDrive` totals `3125` routes and `2648` batches (≈`1.18` candidates per batch from `policy-wasm-score-routing.ts:292` which groups by `actionId` via `groupPreviewCandidatesByAction`); `previewCandidateFeatureRows` calls once per preview-class feature inside the profile plan loop (`policy-wasm-score-routing.ts:480`). Without a histogram of actual batch sizes per route, the shape selection in this spec (cross-action batching vs cross-feature batching vs per-call payload shrink vs an alternative transfer-reduction shape) cannot be picked on measured evidence. This ticket adds the missing instrumentation, re-runs the 15-seed witness, and produces a decision report that downstream tickets `002` and `003` consume.

## Assumption Reassessment (2026-05-17)

1. `PolicyWasmTimingBucket` (`packages/engine/src/agents/policy-wasm-timing-profile.ts:6-11`) currently records `marshalingNs`, `executionNs`, `deserializationNs`, and `callCount`. No batch-size or per-call payload-size accumulation exists. **Confirmed.**
2. `PolicyWasmTimingRouteClass` is the union `'scoreRows' | 'previewCandidateFeatureRows' | 'productionPreviewDrive'` (`packages/engine/src/agents/policy-wasm-timing-profile.ts:1-4`). All three routes report through the same bucket shape today. **Confirmed.**
3. `policy-wasm-score-routing.ts:292` groups `productionPreviewDrive` candidates by `actionId` via `groupPreviewCandidatesByAction` (definition at line `189`); each grouping is a single WASM call (`evaluateProductionPreviewDriveBatchWithWasm`). **Confirmed.**
4. `policy-wasm-score-routing.ts:480` calls `evaluateWasmCandidateFeatureRow` once per preview-class feature inside the profile plan loop; candidate vector is the full microturn candidate set for that feature. **Confirmed.**
5. The 15-seed profiler script `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` already emits per-route timing-bucket columns; adding batch-size columns extends rather than replaces the schema. **Confirmed.**
6. The Phase 0 WASM-on baseline `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.md` is the reference point for downstream wall-time delta comparisons. **Confirmed.**

## Architecture Check

1. **Investigation-before-implementation.** The spec admits multiple shapes (batching across action groups, batching across features, shrinking per-call payload, or an "equivalent host/guest transfer reduction"). Picking one on Phase 1 totals alone risks targeting the route with the largest absolute overhead while missing a route whose batch-size distribution makes it cheaper to fix. A small batch-size histogram pass turns this into measured evidence, matching the same Phase-0→decision pattern that Spec 176 used (`reports/176-phase-6-decision-and-rationale.md`).
2. **Engine-agnostic instrumentation.** Batch-size accumulation is generic per-call telemetry. No game-specific identifiers, branches, or rule handlers leak into the timing recorder or the profiler script. Foundation #1 preserved.
3. **No backwards-compatibility shim.** The new batch-size field extends the existing `PolicyWasmTimingBucket` snapshot interface in place; no parallel "legacy bucket" type is introduced. Foundation #14 preserved.
4. **Foundation #20 alignment.** Batch-size instrumentation does not touch preview-signal carriers — it observes call shape, not advisory contents. The decision report must explicitly state how the recommended shape preserves `tiebreakAfterPreviewNoSignal`, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`, and the `ready/unknown/hidden/stochastic/unresolved/failed/depthCap/partial` status taxonomy; the implementation itself is owned by ticket `002`.
5. **Determinism preserved.** Profiler-only paths are gated on `POLICY_WASM_TIMING_PROFILE === '1'` (`policy-wasm-timing-profile.ts:29`); production hot paths see no behavior change. Foundation #8 preserved.

## What to Change

### 1. Extend the timing recorder to capture batch size per call

Add an optional `batchSize: number` argument to the `record()` step of `PolicyWasmTimingRecorder`, and a per-route accumulator in `PolicyWasmTimingBucket` (e.g., `batchSizeSum: number`, `batchSizeMin: number`, `batchSizeMax: number`, and a `batchSizeHistogram: Record<string, number>` keyed by bucket label like `"1"`, `"2-4"`, `"5-8"`, `"9-16"`, `"17-32"`, `"33+"`). The recorder is profile-only — gated on `isPolicyWasmTimingProfileEnabled()` — so production paths pay nothing.

Update `snapshotPolicyWasmTimingBuckets()` and `resetPolicyWasmTimingBuckets()` to round-trip the new fields. Keep the snapshot interface backwards-incompatible-but-not-shimmed: a single in-place type extension, no parallel `*WithBatch` snapshot variant.

### 2. Record batch size at each call site

- `policy-wasm-score-routing.ts:292-308` — `productionPreviewDrive`: record `group.length` per call (one record per `groupPreviewCandidatesByAction` group).
- `policy-wasm-score-routing.ts:480` — `previewCandidateFeatureRows`: record `wasmCandidates.length` per call (one record per feature iteration in the profile plan loop).
- `policy-wasm-score-routing.ts:531` — `scoreRows`: record candidate-vector length per call (single call per microturn, but still useful for comparison).

The recording site is the existing `record()` invocation inside each route's `evaluateWasm*` wrapper — extend the call to pass `batchSize`. If a route's recorder lives behind the runtime types in `policy-wasm-runtime.ts` or `policy-wasm-production-preview-drive.ts`, thread the batch size through the same path the timing recorder is already threaded.

### 3. Surface batch-size columns in the profiler script

In `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`, add per-route columns to the CSV and Markdown emit:

- `<routeClass>BatchSizeMean` (sum / callCount)
- `<routeClass>BatchSizeMin`
- `<routeClass>BatchSizeMax`
- `<routeClass>BatchSizeHistogram` (compact JSON column matching the timing-bucket histogram)

Keep existing columns and ordering intact so the new fields append rather than shift.

### 4. Re-run the 15-seed witness

Command:

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-batch-size-distribution
```

Outputs land at `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.{md,csv}`. Slow tier per the existing Spec 176 phase definition is seeds `1005, 1011, 1008, 1013, 1009`.

### 5. Produce the decision report

Write `reports/177-phase-0-batching-shape-selection.md` containing:

- Per-route batch-size distribution (all-seeds + slow-tier subtables, with histograms).
- Per-route per-call payload-size repetition: cite Phase 5 axis bytes/call from `reports/176-phase-5-state-serialization.md` and identify which axes are dominated by fixed setup vs by per-byte cost.
- A named recommended transfer-reduction shape — e.g., `crossActionBatching(productionPreviewDrive)`, `crossFeatureBatching(previewCandidateFeatureRows)`, `payloadShrink(productionPreviewDrive)`, or a combination. Exactly one shape is named as the primary work for ticket `002`. If the evidence supports a secondary shape, name it explicitly in an "Optional follow-on" subsection, but still recommend exactly one for `002`.
- A predicted slow-tier wall-time ROI for the chosen shape, derived from `(call-count reduction × fixed-per-call marshaling)` or `(payload-size reduction × bytes/ms slope)`. The prediction must clear the ≥5% slow-tier wall-time bar in `specs/177-policy-wasm-batched-call-overhead-reduction.md` line `9` before ticket `002` proceeds.
- A Foundation #20 carrier-preservation strategy: how the recommended shape preserves `tiebreakAfterPreviewNoSignal`, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory shape, and the preview-status taxonomy across the batched/merged call boundary.
- A Foundation #14 transition plan: explicit confirmation that ticket `002` will land the new path as an atomic cut with no shim.

If the chosen shape's predicted ROI is `<5%`, the report MUST flag this and present 1-3-1 to the user (re-investigate with a different shape, re-scope the spec's threshold, or descope the spec) rather than handing a failing predicate to ticket `002`.

## Outcome (2026-05-17)

**Durable state:** `BLOCKED by measured gate`.

**Landed scope:**

- Added profile-only batch-size telemetry to `PolicyWasmTimingBucket`: `batchSizeSum`, `batchSizeMin`, `batchSizeMax`, and `batchSizeHistogram`.
- Extended the timing recorder with optional `record(batchSize)` support.
- Threaded batch sizes through the live WASM runtime call sites:
  - `evaluatePolicyBytecodeBatch` for `scoreRows`.
  - `evaluatePolicyBytecodeBatch` with `timingRouteClass: 'previewCandidateFeatureRows'` for preview candidate-feature rows.
  - `evaluatePreviewDriveBatch` for `productionPreviewDrive`.
- Added the focused architectural-invariant test `packages/engine/test/integration/policy-wasm-timing-profile-batch-size.test.ts`.
- Extended `packages/engine/test/unit/agents/policy-wasm-timing-flag.test.ts` for the new bucket shape.
- Extended the FITL ARVN decomposition report output with appended per-route batch-size CSV columns and Markdown timing-bucket columns.
- Produced the 15-seed witness:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.csv`
- Produced the decision report:
  - `reports/177-phase-0-batching-shape-selection.md`

**Measured gate result:**

- Slow-tier wall time in the decisive witness: `78,030.23 ms`.
- Spec `>=5%` predicate: about `3,901.51 ms` improvement required.
- Slow-tier measured transfer overhead:
  - `scoreRows`: `309.0025 ms`.
  - `previewCandidateFeatureRows`: `48.8694 ms`.
  - `productionPreviewDrive`: `250.8765 ms`.
  - Combined: `608.7484 ms`, about `0.78%` of slow-tier wall time under an impossible 100% transfer-overhead elimination.
- Verdict: no transfer-reduction shape is authorized for `tickets/177POLWASMBATCH-002.md`.

**User-approved 1-3-1 option:** Option 1 from the 2026-05-17 reassessment: mark `177POLWASMBATCH-001` blocked with the evidence report and do not proceed to `002`.

**Ticket corrections applied:**

- `policy-wasm-production-preview-drive.ts` is `verified-no-edit`: it increments the existing production preview-drive batch counter, but the live timing recorder call is in `policy-wasm-runtime.ts`.
- `policy-wasm-score-routing.ts` is `verified-no-edit`: it supplies the route classes and candidate vectors, but the live batch-size recorder hook is in the runtime wrapper.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` is `verified-no-edit`: the script already delegates timing aggregation and rendering to helper modules; the owned output-column change landed in `profile-fitl-arvn-15-seed-timing.mjs` and `profile-fitl-arvn-15-seed-report-rendering.mjs`.

**Post-review correction (2026-05-17):**

- `snapshotPolicyWasmTimingBuckets()` now copies nested `batchSizeHistogram` objects instead of aliasing mutable module state through the public snapshot.
- `packages/engine/test/integration/policy-wasm-timing-profile-batch-size.test.ts` now mutates a returned snapshot histogram and re-snapshots to prove the internal bucket remains unchanged.

**Deferred/residual owner:**

- `tickets/177POLWASMBATCH-002.md` is blocked/not actionable until the spec is re-scoped or new evidence names a shape whose predicted ROI clears the threshold.
- `tickets/177POLWASMBATCH-003.md` is blocked because there is no post-implementation wall-time target.
- `specs/177-policy-wasm-batched-call-overhead-reduction.md` remains blocked/proposed pending user re-scope.

**Schema/generated fallout:** none. The change adds profile/report fields only; no kernel schema or generated schema artifact was changed.

**Source-size ledger:** `packages/engine/src/agents/policy-wasm-runtime.ts | before 1337 lines | after 1337 lines | crossed cap? no, preexisting oversize | active growth no net line growth | extraction/defer rationale: three call-site argument additions in canonical runtime wrapper; extraction would obscure the live timing seam | successor none`.

**Verification run after this outcome edit:**

- `pnpm -F @ludoforge/engine build` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js dist/test/integration/policy-wasm-timing-profile-batch-size.test.js` passed after build: 4 tests / 2 suites / 0 failed.
- `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-batch-size-distribution` passed and wrote the MD/CSV reports.
- `pnpm turbo build` passed: 3 successful / 3 total. The `@ludoforge/engine-wasm#build` replay was cache-backed; `@ludoforge/engine#build` and `@ludoforge/runner#build` ran fresh. The runner chunk-size advisory is preexisting/non-ticket-owned.
- Re-running the focused node test after `pnpm turbo build` passed: 4 tests / 2 suites / 0 failed.
- `pnpm turbo lint` passed: 2 successful / 2 total. The runner lint replay was cache-backed; engine lint ran fresh.
- `pnpm turbo typecheck` passed: 3 successful / 3 total.
- `pnpm turbo test` passed: 5 successful / 5 total, with `@ludoforge/engine:test` reporting 92/92 files passed. Three task replays were cache-backed.
- `pnpm run check:ticket-deps` passed for 3 active tickets and 2382 archived tickets.
- `git diff --check` passed for tracked changes. Explicit `git diff --no-index --check /dev/null <path>` checks produced no whitespace warnings for the untracked new test, ticket, and report artifacts.
- Post-review focused verification: `pnpm -F @ludoforge/engine build` passed, then `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js dist/test/integration/policy-wasm-timing-profile-batch-size.test.js` passed: 4 tests / 2 suites / 0 failed.

**Archive status:** blocked and not archive-ready. Next workflow: continue only after the user chooses a new spec scope or successor investigation.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-timing-profile.ts` (modify — add batch-size accumulator fields, extend `record()` signature, extend snapshot/reset)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify — pass `batchSize` at the live timing recorder calls for `scoreRows`, `previewCandidateFeatureRows`, and `productionPreviewDrive`)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (verified-no-edit — route grouping lives here, but recorder calls are in the runtime wrapper)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (verified-no-edit — counter lives here, but recorder calls are in the runtime wrapper)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-timing.mjs` (modify — aggregate batch-size fields)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify — emit batch-size columns)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (verified-no-edit — delegates timing aggregation/rendering to helper modules)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.md` (new — script output)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-batch-size-distribution.csv` (new — script output)
- `reports/177-phase-0-batching-shape-selection.md` (new — decision report)

## Out of Scope

- Implementing the chosen transfer-reduction shape (ticket `002`).
- Touching guest-side WASM ABI (`packages/engine/wasm-policy/`) — this ticket is host-side instrumentation only.
- Adding the batched-path route activation counter — that counter only makes sense once a batched variant exists; owned by ticket `002`.
- Re-capturing the wall-time witness against the post-implementation codebase — owned by ticket `003`.
- Cross-game generalization. Per spec line `9`, the witness is FITL ARVN 15-seed; Texas Hold'em or other games are explicitly out of scope.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine parity/integration coverage still passes under the full `pnpm turbo test` lane.
2. Existing timing-recorder unit tests still pass; if any assert the exact `PolicyWasmTimingBucket` shape, they are extended (not adapted to a bug) to cover the new batch-size fields.
3. Snapshot round-trip: `snapshotPolicyWasmTimingBuckets()` round-trips through `resetPolicyWasmTimingBuckets()` and re-recording without losing batch-size accumulators.
4. Full engine suite: `pnpm turbo test`.

### Invariants

1. **Profiler-only side effects.** When `POLICY_WASM_TIMING_PROFILE !== '1'`, no batch-size accumulation, allocation, or branching occurs on the hot path. Verified by direct read of `isPolicyWasmTimingProfileEnabled()` guards at each new recording site.
2. **Determinism preserved.** Same GameDef + initial state + seed + actions still produces identical kernel output; the timing recorder is observation-only.
3. **Schema additivity.** Existing profiler CSV/MD columns retain their position and meaning; new columns append.
4. **Foundation #20 untouched.** No change to preview-signal carrier types, advisory shapes, or status taxonomy in this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-timing-profile-batch-size.test.ts` (new) — architectural-invariant. Records two `productionPreviewDrive` calls with batch sizes `1` and `7`, asserts `batchSizeSum === 8`, `batchSizeMin === 1`, `batchSizeMax === 7`, histogram buckets `"1"` and `"5-8"` increment.
2. `packages/engine/test/unit/policy-wasm-timing-profile.test.ts` (modify if present, else add unit cases inline) — extend snapshot/reset round-trip coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js dist/test/integration/policy-wasm-timing-profile-batch-size.test.js`
3. `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-batch-size-distribution`
4. `pnpm turbo build`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm turbo test`
8. `pnpm run check:ticket-deps`
9. `git diff --check`
