# 176POLWASMPERF-003: Phase 2 — H2 TS-only hot-path attribution report

**Status**: COMPLETED
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

## Outcome (2026-05-17)

### What Landed

- Added the Phase 2 H2 verdict report at `reports/176-phase-2-ts-only-hot-paths.md`.
- Produced fresh no-WASM profile-bucket witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv`
- No engine source, profiler script, schema, generated JSON, GameSpecDoc, GameDef, or visual-config files changed.

### Ticket Corrections Applied

- Phase 0's no-WASM CSV did not include `--profile-buckets`, so this ticket produced a fresh Phase 2 witness instead of reusing Phase 0.
- The script appended `-no-wasm` to the generated witness artifact basename because the ticket's date label did not already include that suffix.
- The four Phase 4h H2 symbol names still exist and were used unchanged. The report additionally records `evalQuery:applyTokenFilter` because it is a current measured TS-only bucket.

### Phase 2 Measurement Verdict

| Field | Value |
|---|---:|
| Slow-tier agent-call ms from CSV rows | 74056.2121 |
| Timed TS-only bucket ms | 14039.7016 |
| TS-only bucket fraction | 18.9582% |
| Current Phase 2 no-WASM slow-tier wall median | 12069.08 ms |
| Projected median under perfect TS-only bucket absorption | 9780.8366 ms |

The measured H2 verdict is `ts-only-bound-low` because the TS-only bucket fraction is below the ticket's `<40%` threshold. H2 does not explain the WASM/TS equivalence by itself under the current post-spec-175 witness.

### Verification Ledger

Already run:

- `pnpm -F @ludoforge/engine build` — pass; refreshed `packages/engine/dist` before the profiler consumed compiled artifacts.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 600000 --profile-buckets --no-wasm --date 2026-05-17-phase-2-h2-smoke --output-dir /tmp/ludoforge-176-phase2-smoke` — pass; smoke validated `hotPathBuckets` output shape.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --profile-buckets --no-wasm --date 2026-05-17-phase-2-h2-ts-only-hot-paths` — pass; all 15 seeds completed and wrote the Phase 2 report/CSV artifacts.

Final lanes:

- `pnpm turbo test` — pass. All five Turbo tasks were cache hits; classified as cache-covered sanity for this report-only ticket because no source, tests, schemas, manifests, generated runtime artifacts, or package outputs changed after the fresh measurement artifacts were written.
- `pnpm run check:ticket-deps` — pass after setting this ticket to `COMPLETED`; checked 5 active tickets and 2377 archived tickets.
- `git diff --check` — pass for tracked changes.
- `rg -n '[ \t]+$' tickets/176POLWASMPERF-003.md reports/176-phase-2-ts-only-hot-paths.md reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.md reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-2-h2-ts-only-hot-paths-no-wasm.csv` — pass; no trailing whitespace matches in the active ticket or retained untracked artifacts.

### Schema / Generated Fallout

None expected. This ticket adds Markdown/CSV measurement artifacts and updates this active ticket only.

### Runtime Surface Breadth

No runtime surface changed. This is an evidence-only report derived from existing profiler telemetry.

### Deferred Scope

H3 through H5 attribution and Phase 6 synthesis remain with tickets `176POLWASMPERF-004` through `176POLWASMPERF-007`.

### Late Proof Validity

Terminal status/proof transcription only. The status change records the already-produced report, the fresh Phase 2 measurement result, the just-run `pnpm turbo test` result, the post-status dependency-check result, and the final hygiene results; it does not change scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or Phase 6 handoff. Exact transcription of the dependency-check and hygiene results does not require a second dependency-check rerun.
