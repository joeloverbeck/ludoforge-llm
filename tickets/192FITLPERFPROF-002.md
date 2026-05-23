# 192FITLPERFPROF-002: Measurement harness scripts + harness-smoke test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — scripts only (`packages/engine/scripts/perf-baseline/`); no changes to `packages/engine/src/`
**Deps**: `archive/tickets/192FITLPERFPROF-001.md`

## Problem

Spec 192's methodology (§4.2) requires reproducible per-workload capture across CPU profile, allocation profile, per-decision cost, and cache statistics for the six workloads in §4.1, with one orchestrator script driving the whole campaign. The existing diagnostic-script family under `packages/engine/scripts/` (`profile-fitl-preview-drive.mjs`, `profile-fitl-arvn-15-seed-timing.mjs`, `measure-preview-pipeline-hard-target.mjs`, `measure-fitl-lane-cumulative-cost.mjs`, and siblings) handles ad-hoc per-script measurement but lacks the orchestrated multi-workload + HEAD-vs-pre-Spec-190 delta + category-driven findings surface the campaign needs. This ticket adds the harness scripts that ticket -003 (baseline capture) and ticket -004 (categorisation) will drive.

## Assumption Reassessment (2026-05-23)

1. `packages/engine/scripts/perf-baseline/` does not yet exist — verified during reassessment.
2. The existing `profile-*.mjs` and `measure-*.mjs` family is the correct neighbourhood for the new scripts; the directory convention is `packages/engine/scripts/<purpose>/` for grouped script families.
3. `node --cpu-prof --cpu-prof-dir=<dir>` and `node --prof` + `node --prof-process` are standard V8 tooling; no engine changes required to use them.
4. `reports/perf-baseline/` does not yet exist — verified. Each per-workload JSON summary is one new file at `reports/perf-baseline/<workload>-<HEAD-sha>.json` (ticket -003 will populate these; this ticket only proves they can be written).
5. Per-decision-cost capture depends on `ENGINE_PER_DECISION_PROFILE` shipped by ticket -001 — that's the hard dependency.
6. The `[per-decision-profile]` emit prefix from ticket -001 is the grep anchor for the per-decision-cost summariser.

## Architecture Check

1. **No engine source changes**: Scripts live entirely under `packages/engine/scripts/perf-baseline/`. They are tooling, not engine code, so Foundation 1 (Engine Agnosticism) is preserved by construction — no game-specific paths.
2. **Reuse over duplication**: Where the existing `profile-*.mjs` family has utility functions (workload bootstrapping, output parsing for the harness-witness emit lines like `SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT` or `172POLEVASTA_STATIC_REBUILD_WITNESS`), import them; do NOT duplicate. The spec's §3.3 acknowledgment explicitly notes the new harness complements the existing scripts.
3. **Output shape is the contract**: Each capture script writes a JSON summary at a deterministic path so ticket -003 can find them and ticket -004 can parse them. The JSON shape is the contract between this ticket and downstream tickets.
4. **Smoke test proves harness correctness**: Per spec §9, the harness-smoke test is a Foundation 16 proof obligation — the harness's correctness is itself testable.

## What to Change

### 1. `packages/engine/scripts/perf-baseline/capture-cpu-prof.mjs`

CLI: `node packages/engine/scripts/perf-baseline/capture-cpu-prof.mjs <workload-key>`

Wraps `node --cpu-prof --cpu-prof-dir=<reports/perf-baseline/cpu-prof/<workload>-<HEAD-sha>/> <node-args> --test <compiled-test-path>`. Workload keys map to compiled test paths per spec §4.1 table. Returns path(s) to the `.cpuprofile` files.

### 2. `packages/engine/scripts/perf-baseline/summarize-cpu-prof.mjs`

CLI: `node packages/engine/scripts/perf-baseline/summarize-cpu-prof.mjs <cpuprofile-path>`

Reads V8 cpu-profile JSON, walks the call tree, produces top-30 self-time table + top-30 total-time table. Output: stdout in markdown table form + JSON sidecar at `<cpuprofile-path>.summary.json` with the same data.

### 3. `packages/engine/scripts/perf-baseline/capture-alloc-prof.mjs`

CLI: `node packages/engine/scripts/perf-baseline/capture-alloc-prof.mjs <workload-key>`

Wraps `node --prof` to produce `isolate-*.log`, then runs `node --prof-process isolate-*.log` to summarise. Output: text summary at `reports/perf-baseline/alloc-prof/<workload>-<HEAD-sha>.txt` + the raw `isolate-*.log` for archival.

### 4. `packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs`

CLI: `node packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs <workload-key>`

Runs the workload with `ENGINE_PER_DECISION_PROFILE=1` (shipped by ticket -001). Collects the emitted `[per-decision-profile]` JSON line(s) from stderr; aggregates entries by `decisionKind` (`actionSelection` / `chooseOne` / `chooseNStep` / `kernel`); reports median / p50 / p95 / p99 / max per kind. Also reports steady-state (warmed) metrics by skipping the first `playerCount × 2` decisions per spec §7 edge case.

### 5. `packages/engine/scripts/perf-baseline/run-baseline.mjs`

CLI: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload-key | all>`

Orchestrator. For each workload:
- 3 uninstrumented wall-clock runs → median + CV; flag if CV > 15% per spec §7.
- 1 cpu-prof capture + summary.
- 1 alloc-prof capture + summary.
- 1 per-decision-cost capture + summary.
- 1 cache-statistics scrape (grep workload's stderr/stdout for the existing emit lines like `policyEncodedStateCacheObjectHit`, `previewDriveBatchCount`).
- Aggregate into `reports/perf-baseline/<workload>-<HEAD-sha>.json` with fields:

```json
{
  "workload": "...",
  "headSha": "...",
  "runs": { "wallClockMs": [...], "median": ..., "cv": ... },
  "cpuProfTop30SelfTime": [...],
  "cpuProfTop30TotalTime": [...],
  "allocProfTopN": [...],
  "perDecisionByKind": { "actionSelection": { "p50": ..., "p95": ..., ... }, ... },
  "cacheStats": { ... },
  "caveats": [ "CV > 15% — increase to 5 runs", ... ]
}
```

### 6. Harness-smoke integration test

`packages/engine/test/integration/perf-baseline-harness-smoke.test.ts` — runs each capture script against the smallest workload variant (e.g., `parity-drive` with maxTurns=1, seed 42, single baseline instead of 4) and asserts:
- Each script exits 0.
- Output JSON parses and contains required keys.
- No script writes outside `reports/perf-baseline/`.

Declare `// @test-class: architectural-invariant` — the property "the harness produces well-shaped output" must hold across every workload, not just the smoke seed.

### 7. Reuse existing script logic where applicable

Inventory `packages/engine/scripts/profile-*.mjs` and `measure-*.mjs` for: workload spawning (child_process patterns), V8 cpu-profile JSON walking, harness-emit-line parsing. Import shared helpers if they're already exported; otherwise, factor minimally into `packages/engine/scripts/perf-baseline/lib/` only when the same helper is used in two or more harness scripts.

### 8. Report directory bootstrap

Create `reports/perf-baseline/` directory in the repo. A `.gitkeep` file is acceptable if the directory would otherwise be empty after this ticket lands; ticket -003 populates it with the actual baseline JSONs.

## Files to Touch

- `packages/engine/scripts/perf-baseline/capture-cpu-prof.mjs` (new)
- `packages/engine/scripts/perf-baseline/summarize-cpu-prof.mjs` (new)
- `packages/engine/scripts/perf-baseline/capture-alloc-prof.mjs` (new)
- `packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs` (new)
- `packages/engine/scripts/perf-baseline/run-baseline.mjs` (new)
- `packages/engine/scripts/perf-baseline/lib/*.mjs` (new, only if shared helpers warrant it — keep YAGNI)
- `packages/engine/test/integration/perf-baseline-harness-smoke.test.ts` (new)
- `reports/perf-baseline/.gitkeep` (new — placeholder until ticket -003 populates)

## Out of Scope

- The env-gated hook itself (ticket -001 — hard dependency)
- Capturing actual baselines at PR HEAD or in the pre-Spec-190 worktree (ticket -003 — consumes this ticket's output)
- Writing the categorisation report (ticket -004)
- Refactoring or replacing the existing `profile-*.mjs` and `measure-*.mjs` family — the spec is explicit that the new harness complements, does not replace
- Any change to engine source — scripts only
- Cross-game extension; FITL workloads only per §2

## Acceptance Criteria

### Tests That Must Pass

1. New: harness-smoke test passes — `pnpm -F @ludoforge/engine build && node --test dist/test/integration/perf-baseline-harness-smoke.test.js`. Each capture script runs end-to-end on the smoke workload variant; each produces well-shaped JSON.
2. Existing engine suite unaffected: `pnpm -F @ludoforge/engine test` passes.
3. Lint + typecheck: `pnpm turbo lint typecheck` passes.
4. Manual: `node packages/engine/scripts/perf-baseline/run-baseline.mjs parity-drive` produces `reports/perf-baseline/parity-drive-<HEAD-sha>.json` with all required fields populated.

### Invariants

1. **Determinism preserved**: Running `run-baseline.mjs` MUST NOT change the trajectory of any workload — the trajectory-identity test from ticket -001 still passes.
2. **Output-shape contract**: Every per-workload JSON written under `reports/perf-baseline/` MUST conform to the field shape documented in §5 above; ticket -004 relies on it.
3. **No engine source touched**: `git diff --stat packages/engine/src/` MUST be empty for this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/perf-baseline-harness-smoke.test.ts` (new) — architectural-invariant: the harness produces well-shaped output for every workload variant. Required acceptance gate for P1 per spec §9.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine build && node --test dist/test/integration/perf-baseline-harness-smoke.test.js`
2. Engine full suite: `pnpm -F @ludoforge/engine test`
3. Lint + typecheck: `pnpm turbo lint typecheck`
4. Manual one-workload smoke: `node packages/engine/scripts/perf-baseline/run-baseline.mjs parity-drive` (expect a single JSON in `reports/perf-baseline/`)
