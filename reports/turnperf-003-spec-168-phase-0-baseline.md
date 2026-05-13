# TURNPERF-003 / Spec 168 Phase 0 Baseline Fixture (2026-05-13)

## Verdict

Spec 168 Phase 0 now has a repeatable opt-in fixture for the canonical one-card
per-decision probe. The fixture emits an ignored JSON artifact at
`packages/engine/test/perf/.artifacts/per-decision-cost-budget.json` and asserts
only structural validity: required keys, required buckets, exit code 0, and a
positive per-card decision count.

This report is the checked-in durable baseline for Phases 1-4. The raw JSON is
not checked in because it is a regenerated perf artifact; the fields needed for
downstream diffs are transcribed here.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Fixture version | `spec-168-phase-0-v1` |
| Generated at | `2026-05-13T03:47:39.300Z` |
| Kernel commit SHA | `3a6becc8978803d30d41d5bf16b6f61d989a38bc` |
| Node | `v22.17.0` |
| pnpm | `10.12.1` |
| OS | `Linux 6.6.114.1-microsoft-standard-WSL2 linux` |
| CPU | `12th Gen Intel(R) Core(TM) i9-12900K` |

## Methodology

Build prerequisite:

```bash
pnpm -F @ludoforge/engine build
```

Fixture command:

```bash
pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js
```

The fixture invokes:

```bash
node scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-phase-0-fixture
```

## Top-Line Result

| Metric | Value |
|---|---:|
| `elapsedMs` | `2146.12` |
| per-card `elapsedMs` | `2145.94` |
| per-card decisions | `160` |
| per-card `msPerDecision` | `13.4121` |
| `turnsCount` | `1` |
| `stopReason` | `maxTurns` |

The profiler's retained-trace top-level `decisions` field is `0` because the
script runs with `traceRetention: finalStateOnly`. The per-card recorder is the
decision-count oracle for this fixture and records `160` decisions.

## Counters

| Counter | Value |
|---|---:|
| `tokenStateIndexBuildCount` | `2903` |
| `draftTokenStateIndexDeltaCount` | `46` |
| `draftTokenStateIndexAttachCount` | `218` |
| `wasmScoreRowRouteCount` | `52` |
| `wasmScoreRowUnsupportedCount` | `0` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` |
| `wasmPreviewCandidateFeatureRowUnsupportedCount` | `0` |
| `wasmProductionPreviewDriveBatchCount` | `182` |
| `driveExitTotal` | `52` |

## Profile Buckets

| Bucket | Count | totalMs |
|---|---:|---:|
| `simAgentChooseMove` | `160` | `955.91` |
| `agent:evaluatePolicyExpression` | `160` | `953.90` |
| `simApplyMove` | `160` | `199.71` |
| `evalQuery:countMatchingTokens` | `958285` | `94.54` |
| `zobrist:digestDecisionStackFrame` | `300` | `91.47` |
| `tokenStateIndex:build` | `2903` | `90.32` |
| `tokenStateIndex:refreshCachedEntries` | `10568` | `65.94` |
| `policyWasmRuntime:encodeBytecodeInput` | `394` | `40.17` |
| `zobrist:encodeDecisionStackFrame` | `305` | `38.45` |
| `evalQuery:applyTokenFilter` | `9245` | `18.16` |
| `simTerminalResult` | `161` | `2.84` |
| `simLegalMoves` | `161` | `0.64` |

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` | Passed |
| `pnpm -F @ludoforge/engine test:perf` | Non-final red: existing `fitl-per-card-cost.perf.test.ts` exceeded its 1800 ms wall-clock ceiling, and existing `preview-pipeline.perf.test.ts` did not collect its historical 50-decision sample before `maxTurns`; the new Spec 168 fixture passed when run directly. |

Full workspace sanity and ticket dependency checks are recorded in the active
ticket outcome.
