# 176POLWASMPERF-006: Phase 5 — H5 state serialization cost instrumentation + report

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — feature-flagged encoded-state serialization byte/time instrumentation in `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts` and `policy-wasm-runtime.ts` (the WASM `evaluate_*` callers).
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 5 tests hypothesis **H5**: state serialization (encoded state, bytecode input cache) dominates the per-call cost. The encoded-state representation includes full zone-token state and decision-stack frames; serializing this into WASM linear memory for every batch is non-trivial. The `policy-wasm-bytecode-input-cache.ts` hit/miss telemetry already partially measures this but has not been correlated with wall-time-per-axis.

This ticket adds feature-flagged per-axis instrumentation that records bytes serialized per call and ms-per-call for the encoded-state serialization path, runs a 15-seed campaign, and writes the serialization-cost verdict. Per spec 176 §11 Open Questions, bytecode-input-cache write cost is also instrumented as a separate sub-bucket (default: yes).

## Assumption Reassessment (2026-05-17)

1. `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts` exists (size ~2.1 KB) and exposes hit/miss telemetry — verified.
2. `packages/engine/src/agents/policy-wasm-runtime.ts` contains the WASM `evaluate_*` callers and the encoded-state-into-linear-memory marshaling logic — verified (file is ~55 KB).
3. The `POLICY_WASM_TIMING_PROFILE` flag established by ticket 001 is the canonical gate for all spec-176 timing-related instrumentation. This ticket reuses it; per-call `marshalingNs` and `deserializationNs` buckets from Phase 0 cover *time* spent in marshaling — this ticket adds the orthogonal axis of *bytes* per call (which Phase 0 does not capture) and a separate bytecode-input-cache write-time sub-bucket.
4. "Per axis" partitioning follows the same axis taxonomy as Phase 4 (ticket 005).
5. Phase 5 does NOT overlap with Phase 4's bytecode-compile measurement; this ticket measures the input-side serialization, not the bytecode-shape compile.

## Architecture Check

1. **Single flag (Foundation #14)**: Reuses `POLICY_WASM_TIMING_PROFILE`. No parallel flag.
2. **Engine agnosticism (Foundation #1)**: Instrumentation in WASM glue only. No kernel changes, no game-specific identifiers.
3. **Determinism (Foundation #8)**: Byte-count and wall-time recording is observational. Serialized buffer contents are unchanged.
4. **Orthogonal to Phase 0**: Phase 0 captures *time*; Phase 5 captures *bytes* and *cache write time*. Together they answer "is the per-call marshaling cost proportional to the serialized state size, or is it dominated by fixed overhead?"

## What to Change

### 1. Add per-axis bytes-per-call accumulator to the WASM runtime marshaling sites

In `packages/engine/src/agents/policy-wasm-runtime.ts`:

- Wherever the encoded-state buffer is written into WASM linear memory before an `evaluate_*` call (typically inside a `writeEncodedStateIntoMemory` or similar helper — locate during implementation), record `bytesWritten` per call into a per-axis accumulator.
- Gate behind the cached `POLICY_WASM_TIMING_PROFILE` flag (no per-call env-read; reuse the cached read established by Phase 0).
- Expose `snapshotPolicyWasmSerializationStats(): Record<axisLabel, { totalBytes, callCount }>` on the runtime's `*Internals` export surface.

### 2. Add bytecode-input-cache write-time sub-bucket

In `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts`:

- For each cache *write* (i.e., a miss that triggers a fresh serialization-and-store), record the write wall-time-ms and write-bytes into a per-axis accumulator. Cache *reads* (hits) are excluded — their cost is already covered by the existing hit/miss telemetry.
- Gate behind the cached `POLICY_WASM_TIMING_PROFILE` flag.
- Expose `snapshotPolicyWasmBytecodeInputCacheWriteStats(): Record<axisLabel, { totalWriteMs, totalWriteBytes, writeCount }>` on the cache's `*Internals` export surface.

### 3. Surface the new accessors in the profiler

In `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`:

- When `POLICY_WASM_TIMING_PROFILE=1`, snapshot the new per-axis stats between seeds and emit additional CSV columns: `bytesSerialized`, `bytesPerCall`, `cacheWriteMs`, `cacheWriteBytes`, `cacheWriteCount`.
- Aggregate per-axis totals into the witness markdown report.

### 4. Run the Phase 5 measurement

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-5-h5-serialization
```

### 5. Write the H5 verdict report

Write `reports/176-phase-5-state-serialization.md` containing:

- Per-axis table: `axisLabel`, `wasmCallCount`, `totalBytes`, `bytesPerCall`, `marshalingMsPerCall` (from Phase 0 buckets), `cacheWriteMs`, `cacheWriteBytes`, `cacheWriteCount`.
- Correlation analysis: scatter (or tabular sort) of `bytesPerCall` vs `marshalingMsPerCall` across axes. Compute Pearson `r` or report-rank-correlation.
- Slow-tier subtotal table.
- Verdict:
  - `serialization-linear-in-bytes` — Pearson `r ≥ 0.7` between `bytesPerCall` and `marshalingMsPerCall`; marshaling cost is proportional to state size.
  - `serialization-fixed-overhead-dominant` — Pearson `r < 0.4` AND mean `marshalingMsPerCall` ≥2× the implied per-byte cost extrapolated from the largest axis — i.e., a fixed setup cost dominates regardless of state size.
  - `serialization-not-dominant` — `marshalingMs / executionMs` slow-tier total <10%; serialization is not the bottleneck regardless of byte/time correlation.
  - `serialization-mixed-overhead-dominant` — user-approved Foundation-aligned taxonomy correction for the measured middle case where serialization/marshaling is material, byte-size correlation is positive but below `0.7`, and the fixed-overhead threshold is not strictly met. This label was approved on 2026-05-17 after the Phase 5 measurement showed the original enum was incomplete.
- Implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 — `H5 (serialization cost)` → Accelerate with ABI / encoding follow-up spec).

## Files to Touch

- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify) — per-axis bytes-written accumulator + accessor.
- `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts` (modify) — per-axis write-ms/bytes accumulator + accessor.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify) — capture and surface per-axis serialization stats.
- `reports/176-phase-5-state-serialization.md` (new) — H5 verdict report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-5-h5-serialization.{md,csv}` (new) — witness artifacts.

## Out of Scope

- Any encoding / ABI redesign — even if the verdict is `serialization-fixed-overhead-dominant`, the fix design is owned by Phase 6's follow-up spec.
- Cross-correlating bytes-per-call with cache hit rate — cache effectiveness is owned by Phase 4 (ticket 005); Phase 5 measures the cost of a write, not when writes happen.
- Modifying the existing bytecode-input-cache hit/miss telemetry — the new write-time accumulator is additive.

## Acceptance Criteria

### Tests That Must Pass

1. New unit test asserting `snapshotPolicyWasmSerializationStats` returns empty when `POLICY_WASM_TIMING_PROFILE` is unset, and `totalBytes > 0` after a single routed WASM call when the flag is set. `@test-class: architectural-invariant`.
2. New unit test asserting `snapshotPolicyWasmBytecodeInputCacheWriteStats` records non-zero `totalWriteBytes` and `writeCount = 1` after exactly one cache miss with the flag set. `@test-class: architectural-invariant`.
3. Existing suite: `pnpm turbo test`.
4. Existing suite: `pnpm turbo lint`.
5. Existing suite: `pnpm turbo typecheck`.

### Invariants

1. With the flag unset, neither accumulator allocates per call (verified by the tests above).
2. Serialized buffer contents are byte-identical with and without the flag — verified by an existing determinism / replay-identity test passing.
3. Per-axis byte totals reconcile with `wasmCallCount * mean(bytesPerCall)` ± rounding.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-serialization-stats.test.ts` — new file. Tests both new accessors' flag-gated behavior. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-serialization-stats.test.js`
2. `pnpm turbo lint` and `pnpm turbo typecheck`
3. `pnpm turbo test`
4. (Manual) Phase 5 measurement command in §4 above; verify the report writes successfully and the verdict is one of the defined values.

## Outcome (2026-05-17)

### What Landed

- Added feature-flagged serialized-input byte counters behind the existing `POLICY_WASM_TIMING_PROFILE=1` flag.
- Added `snapshotPolicyWasmSerializationStats()` / `resetPolicyWasmSerializationStats()` on the policy WASM runtime internals.
- Added bytecode input-cache write stats with `snapshotPolicyWasmBytecodeInputCacheWriteStats()`, gated by the same flag and recording writes only on misses.
- Updated the 15-seed decomposition profiler and report renderer to emit `bytesSerialized`, `serializationCallCount`, `wasmSerializationStats`, `cacheWriteMs`, `cacheWriteBytes`, and `cacheWriteCount`.
- Added `packages/engine/test/unit/agents/policy-wasm-serialization-stats.test.ts` to prove flag-gated serialization stats and a one-miss cache-write stat.
- Added the checked-in Phase 5 witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-5-h5-serialization.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-5-h5-serialization.csv`
- Added the H5 verdict report at `reports/176-phase-5-state-serialization.md`.

### Ticket Corrections Applied

- Test path corrected from draft `packages/engine/test/agents/policy-wasm-serialization-stats.test.ts` to live suite path `packages/engine/test/unit/agents/policy-wasm-serialization-stats.test.ts`.
- Literal focused command corrected to the repo-valid compiled-test flow: `pnpm -F @ludoforge/engine build` then `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-serialization-stats.test.js`.
- Literal shorthand `pnpm turbo lint typecheck` is split into `pnpm turbo lint` and `pnpm turbo typecheck`.
- Draft date placeholder `2026-05-NN` resolved to actual run label `2026-05-17`.
- Verdict taxonomy corrected by user-approved option 1 on 2026-05-17: the measured result did not fit the original three labels, so the active ticket, report, spec, and Phase 6 ticket now include `serialization-mixed-overhead-dominant`.

### Phase 5 Measurement Verdict

`serialization-mixed-overhead-dominant`

| Scope | WASM calls | Total bytes | Bytes/call | Marshaling ms | Execution ms | Marshaling / execution | Pearson r |
|---|---:|---:|---:|---:|---:|---:|---:|
| All 15 seeds | 18048 | 407142300 | 22558.85 | 1309.86 | 479.28 | 2.73x | 0.4705 |
| Slow tier only | 7854 | 159855164 | 20354.62 | 529.53 | 191.59 | 2.76x | 0.5900 |

The result is not `serialization-linear-in-bytes` because the overall Pearson result is below `0.7`. It is not strictly `serialization-fixed-overhead-dominant` because the overall Pearson result is not `<0.4`. It is not `serialization-not-dominant` because slow-tier marshaling is `2.76x` WASM execution, not `<10%` of execution.

Bytecode input-cache write cost was not observed in the 15-seed campaign (`0` writes, `0` bytes, `0.0000 ms`). The focused unit test proves the write accumulator on a miss; the campaign evidence says cache-write cost is not a Phase 5 factor for this workload.

### Source-Size Ledger

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1337 | 1337 | no; preexisting over cap | no net growth (`10` added / `10` deleted) | Instrumentation is delegated to `policy-wasm-serialization-profile.ts`; runtime only wires calls and remains net-neutral. | none |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | 778 | 780 | no | +2 under cap | Extracted `classifyMicroturn` to keep the profiler below 800 while adding serialization columns. | none |
| `packages/engine/src/agents/policy-wasm-score-routing.ts` | 593 | 601 | no | +8 near-cap | Shared axis-label helper avoids passing the wrong candidate type while keeping the file below 800. | none |
| `packages/engine/src/agents/policy-preview-inner-deepening.ts` | 433 | 434 | no | +1 under cap | Adds serialization axis for deep continuation preview-drive calls so timing rows reconcile with byte rows. | none |

### Verification Ledger

Already run:

- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — pass.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — pass.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-timing.mjs` — pass.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-classify.mjs` — pass.
- First `pnpm -F @ludoforge/engine build` — failed on a type mismatch in the preview-drive serialization axis-label call; fixed by deriving the axis from action ids at the typed boundary.
- Final `pnpm -F @ludoforge/engine build` after source edits — pass.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-serialization-stats.test.js` — pass, `2` tests passed.
- `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 600000 --date 2026-05-17-phase-5-smoke --output-dir /tmp/ludoforge-176-phase5-smoke` — pass; smoke validated new CSV columns and Markdown section.
- The first full Phase 5 measurement exposed a proof-noun gap: deep continuation preview-drive calls had timing but no byte axis. That run is diagnostic only.
- Corrected full Phase 5 measurement: `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-5-h5-serialization` — pass; `15/15` seeds completed and `3769` per-decision rows written.
- `pnpm turbo lint` — pass, `2` tasks successful; runner lint was a cache-hit supplemental lane, engine lint was fresh.
- `pnpm turbo typecheck` — pass, `3` tasks successful and `0` cached.
- `pnpm turbo test` — pass, `5` tasks successful and `2` cached. Engine and runner tests completed green; runner jsdom/canvas and expected contained ticker-error stderr were advisory emissions from existing runner tests, not ticket-owned failures.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-serialization-stats.test.js` after the broad test lane — pass, `2` tests passed.
- Pre-terminal-status `pnpm run check:ticket-deps` — pass for `2` active tickets and `2380` archived tickets.
- Post-terminal-status `pnpm run check:ticket-deps` — pass for `2` active tickets and `2380` archived tickets.
- `git diff --check` after terminal status update — pass.
- Retained-untracked trailing-whitespace scan (`rg -n '[ \t]+$' ...`) — pass; no matches.

### Schema / Generated Fallout

No schema or generated JSON artifact changes are expected. The implementation changes TypeScript source, Node measurement scripts, checked-in reports/CSV artifacts, and one focused unit test.

### Runtime Surface Breadth

Shared agents-layer WASM runtime/profiler instrumentation only. The flag-off path is observationally inert for production campaigns and CI; byte and write-time counters are not written to kernel state, RNG state, trace events, GameSpecDoc, GameDef, or visual config.

### Deferred Scope

Phase 6 synthesis and any ABI/encoding or batching optimization decision remain with `tickets/176POLWASMPERF-007.md`. This ticket supplies the H5 evidence and expanded verdict label; it does not choose Keep / Accelerate / Retire.
