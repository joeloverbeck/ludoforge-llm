# 168ENGHOTPATH-001: Phase 0 — baseline pin + per-decision benchmark fixture

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — adds new perf-test fixture under `packages/engine/test/perf/`
**Deps**: `specs/168-engine-per-decision-hot-path-optimizations.md`

## Problem

Phases 1-4 of Spec 168 require pre/post wall-time measurements against a stable, reproducible baseline. Spec §3.1 mandates a profiling-first protocol where each subsequent phase records its pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-N.md`. This ticket establishes the canonical measurement fixture and pins the baseline reference so downstream phases have an unambiguous diff target.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/scripts/profile-fitl-preview-drive.mjs` accepts `--seed`, `--maxTurns`, `--profilesAll`, `--perCard`, `--profileBuckets`, `--label` per `reports/turnperf-002-spec-167-baseline.md` §Methodology — verified.
2. `packages/engine/test/perf/` exists as the perf lane's test-file root (per spec §4 Phase 0 acceptance). Live repo correction: the opt-in perf lane is `pnpm -F @ludoforge/engine test:perf`, not `pnpm -F @ludoforge/engine test --lane perf`; the package script discovers `dist/test/perf/**/*.test.js`, including the new root-level fixture.
3. `reports/turnperf-002-spec-167-baseline.md` is the immediate predecessor baseline (`elapsedMs=2051.05`, `msPerDecision=12.82`) — verified earlier this session.

## Architecture Check

1. Cleaner than per-phase ad-hoc probing because the fixture provides a stable, repeatable measurement contract that Phases 1-4 reports consume verbatim — avoids the divergence risk where each phase author runs the script with subtly different flags.
2. Preserves engine agnosticism (Foundation #1) — fixture exercises the FITL profile but does not embed FITL-specific logic in kernel/agent code; the profiling script is generic.
3. No backwards-compat shims; new fixture is additive. No production code touched.

## What to Change

### 1. Benchmark fixture

Add `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts` that:

- Invokes the same workload as `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets`
- Emits structured per-bucket JSON to a stable path (e.g., `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`) capturing: top-line `elapsedMs`, `msPerDecision`, every bucket from spec §2.1 (`simAgentChooseMove`, `agent:evaluatePolicyExpression`, `simApplyMove`, `evalQuery:countMatchingTokens`, `zobrist:digestDecisionStackFrame`, `tokenStateIndex:build`, `tokenStateIndex:refreshCachedEntries`, `policyWasmRuntime:encodeBytecodeInput`, `zobrist:encodeDecisionStackFrame`, `evalQuery:applyTokenFilter`, `simTerminalResult`, `simLegalMoves`), plus `tokenStateIndexBuildCount`, `draftTokenStateIndexDeltaCount`, `wasmScoreRowRouteCount`, `wasmPreviewCandidateFeatureRowRouteCount`, `wasmProductionPreviewDriveBatchCount`, `driveExitTotal`
- Asserts only structural validity (expected JSON keys present, exit code 0, decision count > 0) — NO wall-time assertion (per Foundation #16 — wall-time isn't deterministic)

### 2. Reproducibility metadata in the JSON artifact

Each emission records: kernel commit SHA at measurement time, Node version, pnpm version, OS/CPU description, and the fixture's own version stamp. These are the minimum fields Phase 1-4 reports diff against.

### 3. Phase 0 baseline report

Capture one canonical run from the fixture into `reports/turnperf-NNN-spec-168-phase-0-baseline.md` (NNN allocated at write time — check `reports/` for the next available `turnperf-NNN-` slot). Format matches `reports/turnperf-002-spec-167-baseline.md` for downstream diffability.

## Files to Touch

- `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts` (new)
- `packages/engine/test/perf/.artifacts/.gitignore` (new — gitignore the JSON artifact directory if not already covered)
- `reports/turnperf-NNN-spec-168-phase-0-baseline.md` (new — NNN to be allocated)

## Out of Scope

- Any production code change (Phase 0 is pure measurement infrastructure)
- Asserting wall-time bounds in the test (Foundation #16 — wall-time isn't deterministic)
- Wiring a new `perf-budget` lane (deferred per spec §9 open question; if existing perf lane wiring suffices, no lane work is needed)
- Authoring CI canary on per-card budget (deferred per spec §9 open question)

## Acceptance Criteria

### Tests That Must Pass

1. New `per-decision-cost-budget.perf.test.ts` runs cleanly under the perf lane's focused compiled-file invocation and produces the JSON artifact with all expected keys; the broader `test:perf` lane is classified separately if pre-existing perf gates are red.
2. Existing suite: `pnpm turbo test`

### Invariants

1. Fixture produces structured per-bucket JSON in a stable shape that Phases 1-4 reports can diff against
2. No production engine/agent/runner code changed
3. Fixture is opt-in via lane (does not run by default in `pnpm turbo test` workspace lane)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts` — emits per-bucket JSON for canonical probe; structural assertions only

### Commands

1. `pnpm -F @ludoforge/engine test:perf`
2. `pnpm turbo test` (full sanity gate)

## Outcome (2026-05-13)

Phase 0 implementation landed the opt-in per-decision budget fixture and the checked-in baseline report.

What landed:

- Added `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts`.
- Added `packages/engine/test/perf/.artifacts/.gitignore`; the regenerated JSON artifact remains ignored at `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`.
- Added `reports/turnperf-003-spec-168-phase-0-baseline.md` as the durable Phase 0 baseline report.

Ticket corrections applied:

- Perf lane command corrected from `pnpm -F @ludoforge/engine test --lane perf` to `pnpm -F @ludoforge/engine test:perf`; live `run-tests.mjs` has no `perf` lane.
- Decision-count oracle corrected to the profiler's per-card recorder. The top-level retained-trace `decisions` field is `0` under `traceRetention: finalStateOnly`, while the per-card row records the required `160` decisions and `13.4121` ms/decision.

Generated fallout:

- No schema, golden, or compiled GameDef fallout.
- Ignored ephemeral artifact generated: `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`.

Deferred sibling/spec scope:

- Phases 1-5 remain owned by `tickets/168ENGHOTPATH-002.md` through `tickets/168ENGHOTPATH-006.md`.

Source-size ledger:

- `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts | before lines 0 | after lines 160 | crossed cap? no | active growth new fixture | extraction/defer rationale none needed | successor none`

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` — passed and generated the ignored JSON artifact; rerun after `pnpm turbo test` rebuilt `dist` also passed.
- `pnpm -F @ludoforge/engine test:perf` — non-final red before terminal closeout: pre-existing `fitl-per-card-cost.perf.test.ts` exceeded its `1800` ms wall-clock ceiling with `elapsedMs=2112.89`, and pre-existing `preview-pipeline.perf.test.ts` did not collect `50` ARVN action-selection decisions before `maxTurns`. The new Spec 168 fixture is green when run directly.
- `pnpm turbo test` — passed.
- `pnpm run check:ticket-deps` — passed for 6 active tickets and 2315 archived tickets.

Late-edit proof validity:

- Terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency ownership change after the final focused fixture rerun.
- Check-dependency result transcription is clerical; it changes no ticket graph, scope, acceptance, command semantics, touched-file ownership, proof claim, follow-up ownership, or dependency classification.
