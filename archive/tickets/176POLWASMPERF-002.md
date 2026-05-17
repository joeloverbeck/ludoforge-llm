# 176POLWASMPERF-002: Phase 1 — H1 FFI marshaling decomposition report

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — analysis and report only; consumes Phase 0's timing instrumentation.
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 1 tests hypothesis **H1**: FFI marshaling overhead cancels per-call WASM speedup. With Phase 0's per-call timing instrumentation in place (split into `marshalingNs` / `executionNs` / `deserializationNs` per route class), this ticket decomposes a WASM-on slow-tier run into the three buckets and compares per-call WASM execution time to per-call TS-equivalent time.

The verdict must classify the dominant cost: marshaling-dominant, execution-dominant, or parity. This verdict is one of the five hypothesis verdicts the Phase 6 decision tree consumes.

## Assumption Reassessment (2026-05-17)

1. Phase 0 (ticket 001) lands the `POLICY_WASM_TIMING_PROFILE` flag and the per-call marshaling / execution / deserialization buckets exposed via `snapshotPolicyWasmTimingBuckets`. This ticket assumes those accessors exist as specified.
2. Per-call TS-equivalent time can be measured by running the same workload with `--no-wasm` (ticket 001) and dividing the per-route-class wall-time delta by the route call count. The route call count itself is preserved across WASM-on / WASM-off modes because TS-fallback routes are still counted in the agent path even without the WASM runtime initialized — verified by grep against `policy-wasm-score-routing.ts`'s null-return fallback path.
3. No new instrumentation is required beyond Phase 0.

## Architecture Check

1. **Analysis-only ticket**: No source change. Output is one report file. This honors spec 176 §7 #5 (no engine source change beyond Phase 0 instrumentation).
2. **Direct evidence**: Per-call timing buckets are measured, not inferred from end-to-end wall time. The verdict cites bucket sums per route class.
3. **Foundation #16 (Testing as Proof)**: Verdict is backed by measured bucket data captured in CSV form, not by narrative inference.

## What to Change

### 1. Run the Phase 1 measurement

Execute one slow-tier-focused run (15 seeds, but the analysis foregrounds slow-tier seeds `1005, 1011, 1008, 1013, 1009`) with `POLICY_WASM_TIMING_PROFILE=1`:

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-1-h1-marshaling
```

The Phase 0 ticket already produces an analogous run; if Phase 0's `phase-0-wasm-on-timed` artifacts are still current (no engine source changes since), this ticket may reuse them rather than re-running. Note the reuse decision in the report.

### 2. Write the H1 decomposition report

Write `reports/176-phase-1-ffi-marshaling-decomposition.md` containing:

- Per-route-class table: total `marshalingMs`, `executionMs`, `deserializationMs`, `wasmCallCount`, and derived per-call averages, summed across the 15-seed run.
- Slow-tier subtotal table (`1005, 1011, 1008, 1013, 1009`) with the same columns.
- Comparison to per-call TS-equivalent time, computed as `(slow-tier no-WASM wall-ms − slow-tier WASM-on wall-ms outside the WASM call) / wasmCallCount`. The "outside the WASM call" baseline uses Phase 0's `phase-0-no-wasm` witness CSV.
- Verdict: one of `marshaling-dominant`, `execution-dominant`, or `parity` (defined as the larger of marshaling+deserialization vs execution exceeds the other by ≥2×; otherwise parity).
- A one-paragraph implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 table — `H1 (marshaling overhead)` → Accelerate via batched WASM call).

## Files to Touch

- `reports/176-phase-1-ffi-marshaling-decomposition.md` (new) — the verdict report.
- Possibly `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-1-h1-marshaling.{md,csv}` (new) if a fresh run is needed. If reusing Phase 0's `phase-0-wasm-on-timed` artifacts, cite them in the report.

## Out of Scope

- Any source change to fix marshaling overhead — if marshaling is dominant, the follow-up spec named by Phase 6 (ticket 007) owns the fix design. This ticket only measures.
- H4 cache-amortization analysis (compile cost is a separate hypothesis; bytecode cache compile time MUST NOT be folded into the `marshaling` bucket — it is its own bucket measured in ticket 005).
- H5 state-serialization size attribution — also a separate hypothesis owned by ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required for this analysis-only ticket. The existing Phase 0 timing-flag tests guard the bucket-accessor invariants.
2. Existing suite: `pnpm turbo test` (sanity, no engine changes expected).

### Invariants

1. Verdict cites measured bucket sums per route class, not aggregate end-to-end wall time.
2. Per-call TS-equivalent comparison uses the canonical Phase 0 `--no-wasm` baseline; alternative baselines (e.g., older Phase 4i CSVs) MUST NOT be substituted.
3. Report is dated; the witness CSV filename is referenced explicitly so the analysis is reproducible.

## Test Plan

### New/Modified Tests

None — analysis ticket.

### Commands

1. `pnpm turbo test` (sanity baseline, no engine source changes).
2. (Manual) Phase 1 measurement command in §1 above; verify the report writes successfully and the verdict is one of the three defined values.

## Outcome (2026-05-17)

### What Landed

- Added `reports/176-phase-1-ffi-marshaling-decomposition.md` as the Phase 1 H1 verdict report.
- Reused the tracked Phase 0 timed/no-WASM artifacts rather than rerunning the 15-seed witness:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.{md,csv}`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.{md,csv}`
- No engine source, profiler script, schema, generated JSON, GameSpecDoc, GameDef, or visual-config files changed.

### Ticket Corrections Applied

- Fresh Phase 1 raw `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-1-h1-marshaling.{md,csv}` artifacts were not produced because the ticket explicitly allows reusing Phase 0's `phase-0-wasm-on-timed` artifacts when current. Reuse was verified with `git log cb124a071..HEAD -- packages/engine/src packages/engine/scripts <phase0 artifacts>`, which returned no commits.
- The placeholder date label `2026-05-NN` is resolved by the reused artifact date `2026-05-17`.
- The slow-tier TS-equivalent comparison from the ticket formula is negative under the reused witness: `(71009.1253 - 74439.3946) / 7854 = -0.436754 ms/call`. The Phase 1 report records this as cross-run outside-work/noise evidence and bases the H1 verdict on the direct measured bucket split.

### Phase 1 Measurement Verdict

| Scope | WASM calls | Marshaling ms | Execution ms | Deserialization ms | Overhead / execution | Verdict |
|---|---:|---:|---:|---:|---:|---|
| Full 15-seed run | 18048 | 1223.8808 | 463.3759 | 203.6470 | 3.08x | marshaling-dominant |
| Slow-tier seeds `1005, 1011, 1008, 1013, 1009` | 7854 | 495.4031 | 184.4379 | 88.0545 | 3.16x | marshaling-dominant |

The Phase 6 implication is the spec 176 H1 branch: if later phases do not prove a stronger structural blocker, the H1 result supports an Accelerate follow-up focused on batching more work per WASM call.

### Verification Ledger

Final lanes:

- `pnpm turbo test` — pass. All five Turbo tasks were cache hits; classified as cache-covered sanity for this report-only ticket because no source, tests, schemas, manifests, generated runtime artifacts, or package outputs changed.
- `pnpm run check:ticket-deps` — pass; ticket dependency integrity check passed for 6 active tickets and 2376 archived tickets.
- `git diff --check` — pass for tracked changes.
- `node -e "<trailing-whitespace check>" reports/176-phase-1-ffi-marshaling-decomposition.md` — pass; retained untracked report has no trailing whitespace.

### Schema / Generated Fallout

None expected. This ticket adds a checked-in Markdown report and updates this active ticket only.

### Runtime Surface Breadth

No runtime surface changed. This is an evidence-only report derived from existing Phase 0 profiler artifacts.

### Deferred Scope

H2 through H5 attribution and Phase 6 synthesis remain with tickets `176POLWASMPERF-003` through `176POLWASMPERF-007`.

### Late Proof Validity

Terminal status/proof transcription only. The status change records the already-produced report, the just-run `pnpm turbo test` result, and the post-status dependency-check result; it does not change scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or Phase 6 handoff. Exact transcription of the dependency-check result does not require a second dependency-check rerun.
