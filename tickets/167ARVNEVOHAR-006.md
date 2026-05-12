# 167ARVNEVOHAR-006: Baseline measurement report (turnperf-002)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — measurement script + checked-in report only
**Deps**: `tickets/167ARVNEVOHAR-005.md`

## Problem

Spec 167 §5 lists a Phase-2 deliverable: "Re-run baseline: `archive/reports/turnperf-001-investigation-2026-04-28.md`-style per-decision measurement, captured into `reports/turnperf-002-spec-167-baseline.md` once Phase 2 lands, to document the new wall-time decomposition and validate the deferred Spec 168 scope." Without this measurement, the follow-up engine per-decision optimization spec (spec §8) cannot prioritize its targets — the post-spec-167 cost profile is the input to that spec's decomposition. This ticket captures the measurement and writes the report.

## Assumption Reassessment (2026-05-12)

1. The precedent report `archive/reports/turnperf-001-investigation-2026-04-28.md` exists. Confirmed by spec §2.1 trigger-reports section. Re-read at implementation time to mirror its structure (cost categories, per-card decomposition, methodology section).
2. Per-decision measurement methodology in the precedent report relies on Node's CPU profiling or equivalent timing harness. The implementer reuses whichever methodology was used in turnperf-001; if the precedent script is no longer reproducible (e.g., relies on a removed flag), the implementer reconstructs an equivalent.
3. Spec 167 phases 0–2 (tickets 001–005) all close before this ticket runs. The baseline measurement reflects the post-spec-167 cost profile: WASM-on by default, incremental build, GameDef cache, worker-pool dispatch.
4. The follow-up spec (spec §8 working name: "engine per-decision hot-path optimizations") will consume this report; the report's prioritization section MUST be specific enough to drive that spec's ticket decomposition (e.g., "token-state-index rebuilds account for X% of remaining per-decision cost; observation projection memoization is candidate Y").
5. `reports/` directory exists at the repo root. Confirmed by repo layout (e.g., `reports/turnperf-002-spec-167-baseline.md` is the canonical landing path).

## Architecture Check

1. **Foundation #16 (Testing as Proof)**: the report is the documented evidence that spec 167's wall-time goals were met (or the precise gap from goal, with cost decomposition). Wall-time itself is not a test assertion (wall-time isn't deterministic per spec §6 row 6), so it lives as a checked-in report, not a test.
2. **Foundation #9 (Replay, Telemetry, and Auditability)**: capturing the measurement methodology + raw timing data alongside the report makes the result reproducible. The report includes the command lines used and the dev-box hardware profile, mirroring `archive/reports/turnperf-001-investigation-2026-04-28.md`.
3. **Foundation #1 (Engine Agnosticism)**: measurement script (if any) lives campaign-local under `campaigns/fitl-arvn-agent-evolution/` or alongside the precedent under `packages/engine/scripts/`. The report itself is a generic deliverable in `reports/`.
4. **No backwards-compat shim**: the report supersedes turnperf-001 as the operative baseline for follow-up spec planning; turnperf-001 remains archived as historical reference. No alias path or redirect is needed.

## What to Change

### 1. Re-execute the turnperf measurement methodology

Reuse the methodology from `archive/reports/turnperf-001-investigation-2026-04-28.md`. Specifically:

- Profile a representative FITL ARVN tournament run at `SEED_COUNT=1` post-spec-167 (workers, WASM, cache warm).
- Decompose per-decision cost into the same categories the precedent used (agent choice CPU, token-state-index rebuilds, observation projection, legal-move enumeration, etc.).
- Capture wall-time decomposition at `SEED_COUNT=15` across all three Phase-acceptance gates: harness-scaffolding cost, tournament-loop cost, per-decision cost.

If the precedent script (`packages/engine/scripts/profile-fitl-preview-drive.mjs` or similar) is the relevant measurement tool, run it post-spec-167 with the same parameters; capture both the raw output and the summary.

### 2. Write `reports/turnperf-002-spec-167-baseline.md`

Document:

- **Methodology**: command lines, hardware profile, kernel commit SHA, spec content hash, harness flags.
- **Wall-time decomposition at tier 15**: total + breakdown (build, test gate, compile + cache hit/miss, tournament loop). Compare against the spec §1 goal of ≤ 2 minutes.
- **Per-decision cost decomposition**: agent choice, token-state-index rebuilds, observation projection, legal-move enumeration. Compare against the turnperf-001 baseline (which reported ~62% agent choice, ~15 token-state-index rebuilds per decision).
- **Prioritized targets for spec 168**: a ranked list of remaining per-decision hot spots, each with a wall-time savings estimate and a sketched optimization. This section is the load-bearing input for spec 168's decomposition.
- **Cross-reference**: link to spec 167, ticket 167ARVNEVOHAR-005's wall-time evidence, and the precedent archive/reports/turnperf-001-investigation-2026-04-28.md.

### 3. (Optional) Commit the raw measurement data

If the measurement produces useful raw artifacts (e.g., V8 CPU profile, perf timestamps), commit them alongside the report under `reports/turnperf-002-data/` so future readers can reproduce the prioritization analysis. Skip this sub-step if the raw data is large enough to bloat the repo (use file-size judgment at implementation time; if > 10 MB total, link to an external artifact location instead).

## Files to Touch

- `reports/turnperf-002-spec-167-baseline.md` (new)
- `reports/turnperf-002-data/` (new, optional — raw measurement artifacts)
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` or similar (modify only if the precedent script needs adjustment to run against post-spec-167 code; otherwise no script change)

## Out of Scope

- Authoring spec 168 itself (this ticket produces the input data; spec 168 authorship is the next step after this report lands).
- Engine code changes to address the prioritized targets (those belong to spec 168's tickets).
- Updating `archive/reports/turnperf-001-investigation-2026-04-28.md` — that file remains the historical baseline; this ticket adds a new report, not an amendment.

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test` continues to pass (this ticket adds documentation; no code change beyond optional script reuse).
2. Manual: the measurement command lines documented in the report reproduce the cited timing figures on the dev box (run the commands once after the report is written; verify the numbers).

### Invariants

1. **Reproducible methodology**: every cited timing in the report MUST have a documented command line that reproduces it on the dev box.
2. **Cross-reference fidelity**: the report cites the spec content hash and engine commit SHA active at measurement time, mirroring the precedent's reproducibility metadata (Foundation #13).
3. **Prioritization section is decomposition-ready**: each ranked target has enough specificity (subsystem, hot-path mechanism, estimated savings) that spec 168 can decompose it into tickets without a second round of investigation.

## Test Plan

### New/Modified Tests

No new automated test. The deliverable is a checked-in report whose accuracy is gated by the manual verification step (running the documented commands and confirming the figures match).

### Commands

1. Run the measurement methodology from `archive/reports/turnperf-001-investigation-2026-04-28.md` post-spec-167 against the FITL ARVN tournament.
2. `SEED_COUNT=15 time bash campaigns/fitl-arvn-agent-evolution/harness.sh` — capture wall-time decomposition.
3. `pnpm -F @ludoforge/engine test` (regression parity; the ticket doesn't change engine code but the measurement should run against a clean tree).
4. Re-run cited measurement commands after writing the report to verify the documented figures are reproducible on the dev box.
