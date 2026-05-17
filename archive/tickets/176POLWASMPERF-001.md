# 176POLWASMPERF-001: Phase 0 — Baseline reproduction + feature-flagged WASM timing instrumentation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — feature-flagged instrumentation in `packages/engine/src/agents/policy-wasm-runtime.ts`, `policy-wasm-score-routing.ts`, and the 15-seed decomposition profiler script.
**Deps**: `archive/specs/176-policy-wasm-perf-yield-investigation.md`

## Problem

Spec 176 §5 Phase 0 requires (a) reproducing the Phase 4i WASM-on / WASM-off equivalence finding within ±5% on slow-tier median (WASM-on `11536.43 ms`, no-WASM `11089.56 ms`) and (b) landing per-call timing instrumentation in the WASM glue, split into marshaling time vs WASM-execution time vs deserialization time. The instrumentation MUST be feature-flagged so production campaigns and CI runs are unaffected.

This ticket is the foundational substrate for the entire spec-176 investigation: Phases 1, 4, and 5 add further instrumentation behind the same flag and consume the per-call buckets established here; Phases 2 and 3 cross-reference the baseline witness CSV produced here.

## Assumption Reassessment (2026-05-17)

1. `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` exists and is the canonical 15-seed witness driver — verified. It already exposes `--profile-buckets` and routes the WASM runtime via `initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() })` at line 247.
2. There is no existing `POLICY_WASM_TIMING_PROFILE` env flag or equivalent — verified by grep. This ticket introduces it.
3. The WASM-off baseline is taken by *not* calling `initializePolicyWasmRuntimeSync`, per the Phase 4i methodology recorded in `reports/174-phase-4i-post-fix-wasm-gate-decision.md` (§"WASM-On vs No-WASM Reference Baseline"). The profiler script currently always initializes the runtime; this ticket must add an opt-out path to enable the second baseline.
4. Spec 175 (`archive/specs/175-wasm-ts-fallback-contract-enforcement.md`) is archived COMPLETED, so spec 176 §10 "if 175 has not landed by Phase 0, Phase 0 may need to repeat" does not apply — the baseline runs against current main.
5. Reference dependency `archive/specs/150-fitl-policy-vm-wasm-port.md` and `archive/specs/174-wasm-preview-drive-coverage-extension.md` are both archived COMPLETED — treated as contract references, not implementation prerequisites (per spec-to-tickets archived-and-completed rule).

## Architecture Check

1. **Feature-flagged isolation**: `POLICY_WASM_TIMING_PROFILE=1` gates every per-call timing bucket so production hot paths see a single short-circuiting branch when the flag is unset. The flag-off path MUST allocate no additional objects per WASM call and add no measurable overhead — verified by the Phase 0 baseline equivalence check below.
2. **Engine agnosticism preserved (Foundation #1)**: All instrumentation lives in the WASM glue (agents layer) and the profiler script (scripts/). No game-specific identifier or game-specific path is added to the kernel.
3. **No backwards compatibility shim (Foundation #14)**: The flag is a new addition, not a wrapper around legacy behavior. When spec 176 closes, the flag and its readers are deleted in the follow-up spec named by Phase 6 (Keep, Accelerate, or Retire) — not preserved as a legacy capability.
4. **Determinism unaffected (Foundation #8)**: Timing buckets are observational side-channel state. They MUST NOT influence kernel decisions, RNG state, or trace output. Cleared between seeds via the existing reset hook in the profiler script.
5. **Out-of-scope for kernel changes (spec 176 §7 #5)**: Instrumentation lands *only* in the WASM glue and the profiler driver. No kernel source, no compiler source, no GameSpecDoc / GameDef / visual-config changes.

## What to Change

### 1. Introduce the `POLICY_WASM_TIMING_PROFILE` env flag and per-call timing buckets

Add a module-local timing accumulator in `packages/engine/src/agents/policy-wasm-runtime.ts` that records, per WASM `evaluate_*` call, three monotonic-clock-delta buckets:

- `marshalingNs` — time spent encoding inputs (encoded state, policy bytecode context, candidate features, precomputed feature rows) into `ArrayBuffer`s and copying them into WASM linear memory.
- `executionNs` — time spent inside the WASM call itself (between the `instance.exports.evaluate_*(...)` invocation boundary and its return).
- `deserializationNs` — time spent reading WASM return data back into JS objects and discarding the linear-memory region.

Buckets accumulate into a per-route-class counter (mirrored on the existing `wasmScoreRowRouteCount` / `wasmPreviewCandidateFeatureRowRouteCount` / `wasmProductionPreviewDriveRouteCount` taxonomy already exposed by `policyWasmRuntimeInternals`).

When `POLICY_WASM_TIMING_PROFILE` is unset, the timing path short-circuits at the first env-read (cached at module import to avoid per-call `process.env` access). When the flag is set, `performance.now()` reads bracket each segment.

Expose a `snapshotPolicyWasmTimingBuckets(): { marshalingNs, executionNs, deserializationNs, callCount } per route class` accessor on `policyWasmRuntimeInternals`, mirroring the existing `getProductionScoreRowRouteCount` style.

### 2. Add a `--no-wasm` opt-out in the 15-seed decomposition profiler

In `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`:

- Add `--no-wasm` flag (parsed alongside `--profile-buckets`).
- When set, skip the `initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() })` call at line 247.
- Annotate the witness report and CSV filenames with a `-no-wasm` suffix when active, mirroring the date suffix convention (e.g., `2026-05-17-phase-0-no-wasm`).
- Echo the `--no-wasm` selection into the reproducer command line at line 465.

### 3. Surface timing buckets in the profiler output

When `POLICY_WASM_TIMING_PROFILE=1` is set, the profiler script reads the per-route-class timing buckets via the new `snapshotPolicyWasmTimingBuckets` accessor between seeds and emits them as additional CSV columns (`marshalingMs`, `executionMs`, `deserializationMs`, `wasmCallCount`) per existing per-bucket row. Columns are populated with `null` (or empty string per existing CSV-null convention) when the flag is off — same row layout in both modes for downstream consumers.

### 4. Run the Phase 0 baseline and write the report

Execute:

```
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-0-wasm-on
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-0-wasm-on-timed
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --no-wasm --date 2026-05-NN-phase-0-no-wasm
```

Write `reports/176-phase-0-baseline-reproduction.md` with:

- Slow-tier per-seed wall-ms comparison for both modes (table matching the format in `reports/174-phase-4i-post-fix-wasm-gate-decision.md` §"WASM-On vs No-WASM Reference Baseline").
- Verdict: equivalence within ±5% on slow-tier median (Phase 4i: `11536.43 ms` WASM-on, `11089.56 ms` no-WASM) — pass / fail.
- Timing-bucket summary from the `POLICY_WASM_TIMING_PROFILE=1` run (per-route-class marshaling / execution / deserialization breakdown), tagged as raw data for Phase 1 to consume.
- Confirmation that running with the flag off measures within seed-to-seed noise of the un-instrumented baseline (i.e., instrumentation cost is invisible to production).

## Files to Touch

- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify) — add `marshaling/execution/deserialization` bucket recorders behind cached env-flag read; expose accessor on `policyWasmRuntimeInternals`.
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify) — wrap the marshaling / deserialization segments of routed score-row and preview-drive calls with the new bucket recorders.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify) — `--no-wasm` flag, conditional `initializePolicyWasmRuntimeSync` skip, timing-bucket CSV columns, reproducer-command echo.
- `reports/176-phase-0-baseline-reproduction.md` (new) — baseline witness report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-0-wasm-on.{md,csv}` (new) — WASM-on baseline witness artifacts.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-0-wasm-on-timed.{md,csv}` (new) — WASM-on with timing instrumentation witness artifacts.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-0-no-wasm.{md,csv}` (new) — no-WASM baseline witness artifacts.

## Out of Scope

- Any decision about whether to keep, accelerate, or retire the WASM path — owned by ticket 176POLWASMPERF-007 (Phase 6 synthesis).
- Per-hypothesis attribution analysis — that's the work of tickets 002–006.
- Additional instrumentation beyond the marshaling / execution / deserialization split — Phase 4 (cache amortization) and Phase 5 (state serialization) add their own buckets in tickets 005 and 006 respectively, under the same feature flag.
- A/B routing scaffolding deletion (spec 174 §3 follow-up) — orthogonal and deferred per spec 176 §10.
- Cross-game generalization (Texas Hold'em, etc.) — spec 176 explicitly scopes to FITL ARVN per §10.

## Acceptance Criteria

### Tests That Must Pass

1. New unit test asserting `POLICY_WASM_TIMING_PROFILE` is read once at module import — repeated `process.env.POLICY_WASM_TIMING_PROFILE` mutations after import do not affect the cached flag value. (Documents the no-per-call-env-read invariant.) `@test-class: architectural-invariant`.
2. New unit test asserting `snapshotPolicyWasmTimingBuckets` returns zero-valued buckets when the flag is unset and non-zero buckets after one routed WASM call when the flag is set. `@test-class: architectural-invariant`.
3. Existing suite: `pnpm turbo test`.
4. Existing suite: `pnpm turbo lint`.
5. Existing suite: `pnpm turbo typecheck`.

### Invariants

1. With `POLICY_WASM_TIMING_PROFILE` unset, per-call WASM overhead is unchanged within seed-to-seed noise vs the un-instrumented baseline (verified by the Phase 0 report).
2. Timing buckets do not influence kernel decisions, RNG state, or trace event output (Foundation #8 determinism).
3. `--no-wasm` mode skips runtime initialization cleanly; all routed calls fall through to the per-feature TS evaluation path with no runtime errors and no spurious `unsupported` records (since the route is never attempted).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-wasm-timing-flag.test.ts` — new file. Tests env-flag caching invariant and bucket-zero / bucket-nonzero parity. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit packages/engine/test/agents/policy-wasm-timing-flag.test.ts`
2. `pnpm turbo lint typecheck`
3. `pnpm turbo test`
4. (Manual) Phase 0 baseline reproduction commands in §4 above; verify report writes successfully and slow-tier medians are within ±5% of Phase 4i (`11536.43 ms` / `11089.56 ms`).

## Outcome (2026-05-17)

### What Landed

- Added feature-flagged WASM timing buckets behind `POLICY_WASM_TIMING_PROFILE=1`.
- Added route-class timing snapshots for `scoreRows`, `previewCandidateFeatureRows`, and `productionPreviewDrive`.
- Added `--no-wasm` to `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`; the flag skips `initializePolicyWasmRuntimeSync(...)` and writes `-no-wasm` suffixed artifacts when needed.
- Added timing columns to the decomposition CSV: `marshalingMs`, `executionMs`, `deserializationMs`, `wasmCallCount`, plus route-class JSON in `wasmTimingBuckets`.
- Added the checked-in Phase 0 report at `reports/176-phase-0-baseline-reproduction.md`.
- Added the requested dated witness artifact pairs:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.{md,csv}`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.{md,csv}`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-no-wasm.{md,csv}`

### Ticket Corrections Applied

- Test path corrected from draft `packages/engine/test/agents/policy-wasm-timing-flag.test.ts` to live suite path `packages/engine/test/unit/agents/policy-wasm-timing-flag.test.ts`.
- Literal command `pnpm -F @ludoforge/engine test:unit packages/engine/test/agents/policy-wasm-timing-flag.test.ts` corrected to build plus direct compiled Node test: `node --test packages/engine/dist/test/unit/agents/policy-wasm-timing-flag.test.js`.
- Literal shorthand `pnpm turbo lint typecheck` is split into `pnpm turbo lint` and `pnpm turbo typecheck`.
- Draft date placeholder `2026-05-NN` resolved to actual run label `2026-05-17`.
- `policy-wasm-score-routing.ts` remains the route-class owner; the timing segment measurement itself lives at the WASM invocation boundary in `policy-wasm-runtime.ts`, with route-class labels passed from the scorer.

### Phase 0 Measurement Verdict

| Mode | Historical Phase 4i slow-tier median ms | 2026-05-17 slow-tier median ms | Delta vs historical | Verdict |
|---|---:|---:|---:|---|
| WASM-on | 11536.43 | 11293.29 | -2.11% | pass |
| No-WASM | 11089.56 | 11592.66 | +4.54% | pass |

The Phase 0 equivalence reproduction is within the required +/-5% slow-tier median bound for both modes. The flag-off WASM-on run is also the production-overhead witness for the instrumentation code and remains within the historical seed-to-seed noise band.

Timing bucket totals from the `POLICY_WASM_TIMING_PROFILE=1` run:

| Route class | Calls | Marshaling ms | WASM execution ms | Deserialization ms |
|---|---:|---:|---:|---:|
| scoreRows | 11498 | 761.3181 | 404.9374 | 11.2538 |
| previewCandidateFeatureRows | 766 | 122.9312 | 28.6358 | 0.9734 |
| productionPreviewDrive | 5784 | 339.6315 | 29.8027 | 191.4198 |
| total | 18048 | 1223.8808 | 463.3759 | 203.6470 |

### Source-Size Ledger

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1382 | 1337 | no | no; net -45 | Extracted runtime types and timing support so the preexisting oversize file did not grow. | none |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | 754 | 793 | no | +39 under cap | Extracted timing aggregation helpers to `profile-fitl-arvn-15-seed-timing.mjs`; retained script remains under 800. | none |
| `packages/engine/src/agents/policy-wasm-score-routing.ts` | 576 | 578 | no | +2 under cap | Route-class label wiring only. | none |

### Verification Ledger

Already run:

- `pnpm -F @ludoforge/engine build` — pass; rerun after the timing-test cwd fix.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-timing-flag.test.js` — pass from repo root; rerun after the timing-test cwd fix.
- `(cd packages/engine && node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js)` — pass; proves the direct compiled test is package-cwd safe.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — pass.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — pass.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-timing.mjs` — pass.
- `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 600000 --date 2026-05-17-phase-0-smoke-timed --output-dir /tmp/ludoforge-176-smoke` — pass; smoke output shape validated.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 600000 --date 2026-05-17-phase-0-smoke --no-wasm --output-dir /tmp/ludoforge-176-smoke` — pass; `--no-wasm` suffix/output shape validated.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on` — pass; all 15 seeds OK.
- `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-wasm-on-timed` — pass; all 15 seeds OK.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-0-no-wasm --no-wasm` — pass; all 15 seeds OK.
- `pnpm turbo lint` — pass after fixing active-ticket lint findings; final rerun after the test cwd fix passed. Runner lint was a turbo cache hit and is treated as supplemental.
- `pnpm turbo typecheck` — pass after the test cwd fix; no turbo cache hits.
- First `pnpm turbo test` attempt — failed in the new timing test because the subprocess probe built a repo-root-relative import while the engine default test task runs from `packages/engine`. This was active-ticket-owned, fixed in `policy-wasm-timing-flag.test.ts`, and the broad lane was rerun.
- Final `pnpm turbo test` — pass after the timing-test cwd fix. `@ludoforge/engine` and `@ludoforge/runner` tests ran fresh; `engine-wasm:build` and `engine:build` were turbo cache hits covered by the immediately preceding successful package build and typecheck build. Runner/jsdom emitted existing canvas/ticker advisory stderr while passing; no ticket-owned runner behavior changed.

- `pnpm run check:ticket-deps` — pass after setting this ticket to `COMPLETED`; checked 7 active tickets and 2375 archived tickets.
- `git diff --check` — pass for tracked changes.
- `rg -n '[ \t]+$' <new untracked implementation/report/ticket files>` — pass; no trailing whitespace matches.
- final source-size/status sweep — pass; ticket-owned source files remain under the active-growth/source-size boundary recorded above.

Late proof validity: the lint fixes and timing-test cwd fix invalidated earlier lint/typecheck/test evidence, so those lanes were rerun after the final source edit. The terminal status/proof transcription and post-status checker result changed only the ticket document and do not invalidate the code, measurement artifacts, or source-size proof.

### Schema / Generated Fallout

No schema or generated JSON artifact changes are expected. The implementation changes TypeScript source, Node measurement scripts, checked-in reports/CSV artifacts, and one focused unit test.

### Runtime Surface Breadth

Shared agents-layer WASM runtime/profiler instrumentation only. The flag-off path is observationally inert for production campaigns and CI; timing buckets are not written to kernel state, RNG state, trace events, GameSpecDoc, GameDef, or visual config.

### Deferred Scope

Phase 1-6 hypothesis attribution, keep/accelerate/retire decision-making, bytecode cache instrumentation, and state-serialization instrumentation remain with tickets `176POLWASMPERF-002` through `176POLWASMPERF-007`.
