# 194ZOBDIGEST-001: Phase 1 — Zobrist residual-cost capture and report

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign tooling + report only; the six hot-path counters this ticket consumes already exist in `packages/engine/src/kernel/zobrist.ts`
**Deps**: `specs/194-zobrist-decision-stack-digest-optimization.md`, `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`, `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`, `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`

## Problem

Spec 168 Phase 3 (ticket `archive/tickets/168ENGHOTPATH-004.md`, COMPLETED 2026-05-13) landed the `(frame identity, parent-frame digest)` tuple-keyed cache in `packages/engine/src/kernel/zobrist.ts`. Despite that cache, the Zobrist digest pipeline (`digestEncodedDecisionStackFrame` + `encodeDecisionStackFrameDigestInput` + `zobristKey`) still costs 12.7–25.2% of CPU self-time across five regressed FITL workloads per `reports/fitl-perf-baseline-2026-05-24.md`. Root cause is unconfirmed.

Spec 194 reframes the remediation as instrument-first (per Foundation #15: evidence-driven rather than assumed root cause). This ticket delivers Phase 1 — the measurement and decision artifact that selects the Phase 2 lever from {2A binary-canonical encoding, 2B encoded-surface reduction, 2C structural-identity cache, 2D cost-is-floor archive} per spec §4.2's decision matrix.

## Assumption Reassessment (2026-05-24)

1. **Counter availability**: the six counters this ticket consumes — `zobrist:decisionStackFrameWeakCacheHit` (L219), `zobrist:encodeDecisionStackFrame` (L227, ms), `zobrist:decisionStackFrameRunLocalCacheHit` (L232), `zobrist:decisionStackFrameRunLocalCacheMiss` (L238), `zobrist:decisionStackFrameEncodedChars` (L239), `zobrist:digestDecisionStackFrame` (L201, ms) — exist in `packages/engine/src/kernel/zobrist.ts` at the cited lines (verified during Spec 194 reassessment, 2026-05-24).
2. **Profiling flag**: `hotPathProfilingEnabled` gates the counters. The capture script must set `ENGINE_HOT_PATH_PROFILE=1` at engine boot and assert non-zero counter values before computing rates (per spec §7 "Phase 1 counter availability" edge case).
3. **Measurement-shape boundary reset** (user-approved 2026-05-24): live `PerfHotPathBucket` values expose only `count` and `totalMs`; they do not retain per-call samples. To preserve the Phase 1 observation-only boundary, this ticket reports mean per-call encode/digest times and mean encoded characters per miss from existing buckets rather than adding profiler state to produce medians.
4. **Harness sibling pattern**: `campaigns/fitl-perf-optimization/run-benchmark.mjs` is the established Spec 192 baseline harness; the new capture script lives as a sibling `.mjs` file in the same directory.
5. **Report destination**: `reports/perf-baseline/` exists and houses the Spec 192 baseline JSONs; the new markdown report file conforms to that location.
6. **Five regressed workloads identified by name** in `reports/fitl-perf-baseline-2026-05-24.md`: `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`. The flat control lane `arvn-tournament-wasm-equivalence` is excluded.
7. **Archived dependencies are contract references, not implementation prerequisites**: Spec 80 (incremental Zobrist contract), Spec 168 (the predecessor cache that this ticket measures), and Spec 192 (the baseline methodology this ticket extends) are all COMPLETED. The spec file is the canonical Deps citation per the `/spec-to-tickets` "Archived-and-completed dependencies" rule.
8. **Foundation-aligned prerequisites completed** (2026-05-25): `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`, `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`, and `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md` restored the determinism corpus required by `docs/FOUNDATIONS.md`. `pnpm -F @ludoforge/engine run test:determinism` now passes 31/31 files, and this ticket can proceed to Phase 1 capture/report work.

## Architecture Check

1. **Pure observation, zero engine source drift**: the deliverable is a new `.mjs` capture script + a new markdown report. No changes to `packages/engine/src/kernel/zobrist.ts` or any other engine source. Canonical Zobrist key output is byte-identical pre- and post-ticket; the Foundation #8 sacred guarantee is preserved by construction (no behavioral change).
2. **No parallel caching infrastructure**: per spec §4.4, the original Spec 194 draft proposed three caches that Spec 168 already shipped. Instrument-first preserves Foundation #14 (no compat shims, no parallel caches) and Foundation #15 (architecturally complete: evidence drives Phase 2 lever choice rather than assumed root cause). This ticket itself adds zero cache infrastructure.
3. **No backwards-compatibility aliasing/shims introduced**: deliverable is two new files. Nothing wrapped, aliased, or marked deprecated.

## What to Change

### 1. New capture script `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`

Sibling to `run-benchmark.mjs`. Responsibilities:

1. Iterate the five regressed workloads listed in §Assumption Reassessment item 5.
2. For each workload, run twice:
   - **Profiled run**: `ENGINE_HOT_PATH_PROFILE=1` set at engine boot — captures the six counters listed in §Assumption Reassessment item 1.
   - **Unprofiled baseline run**: counters off — captures pure wall-clock time for the same workload.
3. Aggregate counter values per workload and compute the hit-rate decomposition per spec §4.1 step 3:
   - Identity-cache hit rate = `decisionStackFrameWeakCacheHit / total digestDecisionStackFrame calls`.
   - Content-cache hit rate (after identity miss) = `decisionStackFrameRunLocalCacheHit / (decisionStackFrameRunLocalCacheHit + decisionStackFrameRunLocalCacheMiss)`.
   - Encode-call rate = `decisionStackFrameRunLocalCacheHit + decisionStackFrameRunLocalCacheMiss`.
   - Mean per-call encode time (ms), mean per-call digest time (ms), mean encoded-chars per miss.
4. Decompose `digestEncodedDecisionStackFrame` aggregate self-time into encode-pass vs FNV-1a portions using the aggregate `totalMs` buckets from `zobrist:encodeDecisionStackFrame` and `zobrist:digestDecisionStackFrame`.
5. Assert non-zero counter values before computing rates (per spec §7 "Phase 1 counter availability"); an all-zero counter set indicates the profiling flag did not propagate — script aborts with an error in that case.
6. Emit a structured JSON intermediate (per-workload object) that the report-authoring step consumes.

### 2. New report `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md`

Filename date set at run time (YYYY-MM-DD format matching `fitl-perf-baseline-2026-05-24.md`). Required sections:

1. **Per-workload table** with columns: workload name, identity-cache hit rate, content-cache hit rate, encode-call rate, mean per-call encode time (ms), mean per-call digest time (ms), mean encoded-chars per miss.
2. **Profiled-vs-unprofiled wall-clock comparison table** — confirms counter overhead does not distort hit-rate measurements (per spec §7 "Counter-driven sampling skew" edge case). Per-workload columns: profiled wall-clock (s), unprofiled wall-clock (s), overhead ratio.
3. **Explicit hypothesis verdict on H1, H2, H3 from spec §1.2** — for each hypothesis, one of `accepted` / `refined` / `refuted`, with a one-paragraph evidence justification quoting the relevant counter values:
   - **H1** (identity-cache hit rate low due to Foundation #11 immutability churn).
   - **H2** (content-cache hit rate bounded by encode-pass cost).
   - **H3** (JSON.stringify dominates per-call cost on cache miss).
4. **Phase 2 lever selection per spec §4.2 decision matrix** — names exactly one lever from `{2A, 2B, 2C, 2D}` (the matrix is exclusive per spec §4.2 closing paragraph), with the evidence trail justifying the selection by quoting the row's selection criterion alongside the matching measurement.

### 3. Determinism verification (post-script-run)

Confirm zero regression in the three existing proof surfaces named in spec §6:

- Replay-identity corpus (`packages/engine/test/determinism/`) — 100% green.
- Spec 168 frame-digest-cache equivalence (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) — 100% green.
- Spec 192 trajectory-identity (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) — 100% green across all six workloads.

Pure observation cannot regress these; the verification confirms the contract.

## Files to Touch

- `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs` (new)
- `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md` (new; filename date set at run time, e.g., `zobrist-residual-cost-2026-05-25.md`)

## Out of Scope

- **Any change to `packages/engine/src/kernel/zobrist.ts` or its caches** — Phase 1 is observation-only per spec §2 ("No determinism-corpus re-bless or kernel-version bump in Phase 1. Instrumentation is observation-only.").
- **Phase 2 lever implementation** — deferred to a future `/spec-to-tickets` invocation authored against this ticket's report once it lands. The lever choice is made by this report (per §4.2); the implementation ticket is separate.
- **Phase 3 perf-witness re-capture** — also deferred to a future invocation, conditional on Phase 2 lever choice (skipped entirely if Phase 2 = 2D per spec §8 P3 row).
- **Engine-WASM Zobrist** — out of scope per spec §2 (no Rust Zobrist implementation exists in `packages/engine-wasm/policy-vm/`; canonical keys are TS-only).
- **New automated tests** — this ticket is an observation deliverable; the capture script is the test instrument and the report is the audit artifact. Determinism is proven by existing tests staying green, not by new test files.

## Acceptance Criteria

### Tests That Must Pass

1. Existing replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green (no behavioral change introduced).
2. Existing Spec 168 frame-digest-cache equivalence test (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) runs unchanged — 100% green.
3. Existing Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) runs unchanged across all six workloads.
4. Full engine suite: `pnpm -F @ludoforge/engine run test` — 100% green.

### Invariants

1. **Zero engine source drift**: `git diff packages/engine/src/ packages/engine/test/` is empty after the ticket lands — Phase 1 is observation-only.
2. **Report format**: the report file conforms to the four required sections in §What to Change item 2 (per-workload table, profiled-vs-unprofiled comparison, explicit H1/H2/H3 verdict, named Phase 2 lever with evidence trail).
3. **Exclusive lever selection**: the report names exactly one Phase 2 lever from `{2A, 2B, 2C, 2D}` (per spec §4.2 closing paragraph: "The matrix is exclusive in Phase 2: at most one lever lands.").
4. **Counter overhead bounded**: the profiled-vs-unprofiled wall-clock comparison demonstrates counter overhead does not distort the hit-rate measurements; if overhead is unbounded, the report flags it and the verdict is refined accordingly.

## Test Plan

### New/Modified Tests

1. No new automated tests — this is an observation deliverable per spec §9 ("Phase 1: zero behavioral change. Phase 2: ...; instrumentation is observation-only."). The capture script itself is the test instrument; the report is the audit artifact.
2. Manual end-to-end verification: run the capture script, confirm the report file is written, confirm per-workload tables are populated with non-zero counter values, confirm hypothesis verdicts and Phase 2 lever selection sections are rendered with quoted evidence.

### Commands

1. Build engine (required before running the capture script): `pnpm turbo build`.
2. Run capture script: `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs` — emits report to `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md`.
3. Verify zero engine source drift: `git diff packages/engine/src/ packages/engine/test/` — must be empty.
4. Verify existing test suites green: `pnpm -F @ludoforge/engine run test`.
5. Lint + typecheck (project canonical): `pnpm turbo lint typecheck`.

## Outcome

Completed on 2026-05-25.

Changed:

- Added `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`, an observation-only capture script that runs the five regressed FITL workload shapes once with `ENGINE_HOT_PATH_PROFILE=1` and once without profiling, asserts non-zero Zobrist hot-path counters, and renders the residual-cost report.
- Added the current Phase 1 report at `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`, generated at HEAD `0003afbc8b`.
- No `packages/engine/src/` or `packages/engine/test/` source drift was introduced by this ticket.

Report result:

- Aggregate identity-cache hit rate: 67.28%.
- Aggregate content-cache hit rate after identity miss: 1.05%.
- Aggregate encode-call rate: 32.72%.
- Aggregate mean encoded chars per miss: 23647.62.
- Aggregate encode total: 44355.641 ms.
- Aggregate FNV-1a digest total: 82289.213 ms.
- H1/H2/H3 verdicts: `refined`, `refined`, `refined`.
- Exclusive Phase 2 lever selected by the report: `2B - Encoded-surface reduction`.

Generated artifact provenance:

- artifact path(s): `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`
- generation command: `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`
- canonical inputs: current HEAD `0003afbc8b`, `data/games/fire-in-the-lake.game-spec.md`, the five Spec 194 workload definitions embedded in `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`, and the existing hot-path counters in `packages/engine/src/kernel/zobrist.ts`
- expected refresh reason: current-head Phase 1 evidence after the `194ZOBDIGEST-000/000A/000B` determinism prerequisites restored the replay-identity proof lane
- generator durability: retained generator: `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`
- hygiene proof: `git diff --no-index --check /dev/null reports/perf-baseline/zobrist-residual-cost-2026-05-25.md` reported no whitespace diagnostics; `git diff --check` passed for edited tracked files

Verification:

- `pnpm turbo build` — passed from cache.
- `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs` — passed; wrote `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md` with all five workload rows populated and final state hashes matching between profiled and unprofiled runs.
- `git diff packages/engine/src/ packages/engine/test/` — empty.
- `pnpm -F @ludoforge/engine run test:determinism` — passed, 31/31 files.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — passed, 4 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/perf-baseline-trajectory-identity.test.js` — passed, 6 tests.
- `pnpm -F @ludoforge/engine run test` — passed, 169/169 files.
- `pnpm turbo lint typecheck` — passed from cache, 5/5 tasks.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2507 archived tickets.

Deferred:

- Phase 2 lever implementation is out of scope for this ticket. A future `/spec-to-tickets` invocation should decompose the selected `2B - Encoded-surface reduction` lever and include the field-irrelevance audit, kernel-version/reproducibility obligations, and replay-corpus proof required by Spec 194.
- Phase 3 perf witness recapture remains gated on the Phase 2 result.
