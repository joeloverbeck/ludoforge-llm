# 176POLWASMPERF-003: Phase 2 — H2 TS-only hot-path attribution report

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — uses existing `--profile-buckets` infrastructure and `snapshotHotPathProfilerCounters` from `packages/engine/src/kernel/perf-profiler.ts`.
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 2 tests hypothesis **H2**: hot paths are dominated by TS-only work outside WASM's scope. The Phase 4h hot-bucket telemetry (`archive/reports/174-phase-4h-post-4g-gate-decision.md`) identified four TS-only hot consumers (`tokenStateIndex:refreshCachedEntries`, `evalQuery:countMatchingTokens`, `zobrist:digestDecisionStackFrame`, `zobrist:encodeDecisionStackFrame`) that dwarf any score-evaluation work. This ticket re-measures the hot-bucket attribution under post-spec-175 conditions and quantifies the ceiling on speedup WASM extension could theoretically achieve.

The verdict must classify the structurally-TS-bound fraction of slow-tier wall time and name a concrete speedup ceiling for "if WASM somehow absorbed every TS-only hot path." This verdict feeds Phase 6's decision tree.

## Assumption Reassessment (2026-05-17)

1. `snapshotHotPathProfilerCounters` exists in `packages/engine/src/kernel/perf-profiler.ts:174` — verified.
2. The `--profile-buckets` flag in `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs:42` already enables hot-bucket telemetry capture per seed — verified.
3. The four hot consumers cited in spec 176 §3 H2 (under "Phase 4h hot-bucket telemetry") are real symbols in the perf-profiler taxonomy. This ticket's reassessment phase MUST re-grep the current snapshot to confirm naming hasn't drifted since Phase 4h (2026-04 era) and adjust the report's verbatim quotes if it has.
4. The hot-bucket data captured by `--profile-buckets` is per-seed; aggregation to slow-tier subtotal is done in the report.
5. No new instrumentation is required.

## Architecture Check

1. **Analysis-only ticket**: No source change; uses existing telemetry. Honors spec 176 §7 #5.
2. **Reuses Phase 0 substrate**: The `--no-wasm` baseline from ticket 001 is the canonical "WASM extension cannot improve this" comparison.
3. **Foundation #16**: Speedup ceiling is computed from measured bucket sums, not narrative inference. The ceiling formula is documented in the report so a future reader can reproduce it.

## What to Change

### 1. Run the Phase 2 measurement

Execute a `--no-wasm --profile-buckets` run on the 15 seeds:

```
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --profile-buckets --no-wasm \
  --date 2026-05-NN-phase-2-h2-ts-only-hot-paths
```

Reuse Phase 0's `phase-0-no-wasm` witness CSV if it was captured with `--profile-buckets` (Phase 0 ticket leaves this flag optional; if Phase 0 did not capture buckets, this ticket re-runs).

### 2. Write the H2 attribution report

Write `reports/176-phase-2-ts-only-hot-paths.md` containing:

- Slow-tier hot-bucket attribution table: top N hot symbols by total wall-ms across slow-tier seeds (`1005, 1011, 1008, 1013, 1009`), classifying each as `ts-only-outside-wasm-scope` (e.g., `tokenStateIndex:*`, `zobrist:*`, `evalQuery:*`), `ts-fallback-could-be-wasm` (the unsupported preview-drive paths), or `wasm-routed` (currently routed through WASM).
- Computed speedup ceiling: assume WASM could absorb every `ts-only-outside-wasm-scope` symbol with zero per-call overhead; what fraction of slow-tier wall time would remain? The complement is the maximum possible WASM-extension yield.
- Slow-tier median improvement projected under the ceiling assumption: if today's no-WASM slow-tier median is `~11090 ms` and the unaccelerable TS-only structural fraction is `X%`, projected median is `11090 * (1 − X%/100)`.
- Verdict: `ts-only-bound-high` (≥70% structurally TS-bound) / `ts-only-bound-moderate` (40–70%) / `ts-only-bound-low` (<40%).
- Implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 — `H2 alone` → Accelerate to extend WASM coverage; `H2 + H3` → Retire OR Keep-as-correctness-only).

## Files to Touch

- `reports/176-phase-2-ts-only-hot-paths.md` (new) — the H2 verdict report.
- Possibly `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-2-h2-ts-only-hot-paths.{md,csv}` (new) if Phase 0's `phase-0-no-wasm` artifacts did not include `--profile-buckets`. Otherwise cite Phase 0's CSV.

## Out of Scope

- Any code change to extend WASM coverage to TS-only hot paths — owned by Phase 6's follow-up spec if the verdict warrants it. This ticket only measures and projects.
- H3 cheap-vs-expensive analysis — owned by ticket 004. H2 and H3 are complementary but distinct; do not blur the analyses in this report.
- Re-baselining the four cited hot consumers' implementations against post-spec-175 code — the analysis takes the current implementations as-is. If hot symbols have been renamed since Phase 4h, the report MUST cite the current names (per Reassessment item 3) but does not refactor or rename.

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required.
2. Existing suite: `pnpm turbo test` (sanity, no engine source changes).

### Invariants

1. Speedup ceiling is derived from measured bucket sums, not narrative estimates. The derivation formula is reproducible from the witness CSV.
2. Hot-bucket symbol names in the report match the current snapshot taken by this measurement; stale names from Phase 4h are not copied verbatim if they have drifted.
3. Verdict is one of the three defined classifications.

## Test Plan

### New/Modified Tests

None — analysis ticket.

### Commands

1. `pnpm turbo test` (sanity baseline).
2. (Manual) Phase 2 measurement command in §1 above; verify the report writes successfully and the verdict is one of the three defined values.
