# TURNPERF-001 Phase 1 Investigation (2026-04-28)

## Verdict

Phase 1 produced a repeatable harness extension and a bounded live measurement, but did not run the originally drafted 5-card or full-game corpus to completion. The user approved narrowing Phase 1 to the completed one-card evidence plus the bounded-probe timeouts after both 5-card probes exceeded a normal feedback window.

Current evidence is enough to reject the draft's `<= 250 ms` per-card target as immediately attainable on this checkout and to identify the first implementation owner: `tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md`, which should reduce preview-drive policy evaluation and token-index rebuild cost before adding a hard per-card gate.

## Harness Changes

`packages/engine/scripts/profile-fitl-preview-drive.mjs` now accepts:

- `--perCard`: emits one row per simulator turn/card, including elapsed time, decision count, drive exits, token-index builds, draft-index delta count, and draft-index attach count.
- `--profileBuckets`: enables the existing `PerfProfiler` and prints the largest simulator/kernel/agent timing buckets.

Both flags are diagnostic-only. They do not change production kernel behavior or game semantics.

## Completed Measurement

Command:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-smoke
```

Configuration:

- `seed=42`
- `maxTurns=1`
- profiles: `us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`
- `verifyIncrementalHash=true`
- `traceRetention=finalStateOnly`

Top-line result:

| Metric | Value |
|---|---:|
| elapsedMs | 8710.05 |
| turnsCount | 1 |
| stopReason | maxTurns |
| tokenStateIndexBuildCount | 2381 |
| draftTokenStateIndexDeltaCount | 198 |
| draftTokenStateIndexAttachCount | 623 |
| driveExitTotal | 211 |

Per-card row:

| turnCount | elapsedMs | decisions | driveExitTotal | tokenStateIndexBuildCount | draftTokenStateIndexAttachCount |
|---:|---:|---:|---:|---:|---:|
| 0 | 8709.72 | 159 | 211 | 2381 | 623 |

Drive-depth completed quantiles:

| Profile | n | p50 | p75 | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|---:|
| arvn-baseline | 100 | 3 | 3 | 4 | 5 | 5 |
| us-baseline | 43 | 1 | 4 | 5 | 5 | 6 |
| vc-baseline | 38 | 1 | 4 | 4 | 4 | 5 |
| nva-baseline | 28 | 3 | 4 | 4 | 4 | 4 |

Top profiler buckets:

| Bucket | Count | totalMs |
|---|---:|---:|
| simAgentChooseMove | 159 | 5381.26 |
| agent:evaluatePolicyExpression | 159 | 5378.06 |
| simApplyMove | 159 | 1065.35 |
| simTerminalResult | 160 | 7.45 |
| simLegalMoves | 160 | 1.56 |

Interpretation:

- The first real card is already about 8.7 seconds under all four FITL baseline profiles with incremental hash verification enabled.
- Policy evaluation inside agent choice is the largest measured bucket in this instrumented one-card probe.
- Token-index rebuilds remain high enough to keep Option B from the ticket's candidate list live: 2381 builds for one card.
- The current per-card cost is roughly 35x above the draft `<= 250 ms` target before any safety margin or five-card median is considered.

## Bounded Probes Not Completed

Two five-card prefix attempts were deliberately stopped after exceeding the bounded feedback window:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 5 --profilesAll --perCard --profileBuckets --label turnperf-seed42-max5
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 5 --profilesAll --perCard --label turnperf-seed42-max5-light
```

The `--profileBuckets` probe is classified as too invasive for a five-card smoke measurement because bucket timing wraps hot calls. The no-bucket five-card probe still exceeded the normal bounded-probe window. This is not a passing acceptance result; it is evidence that the originally drafted Phase 1 corpus is currently too expensive to use as the first feedback loop.

## Recommended Phase 2 Surface

Implement Phase 2 as a measured experiment loop, one candidate at a time:

1. Start with Option B from the ticket: persist the mutable token-state index structure in the WeakMap so refreshes reuse occurrence maps instead of rebuilding or rescanning.
2. Re-run the one-card probe above without `--profileBuckets` and with `--profileBuckets` separately to distinguish target cost from observer overhead.
3. If one-card cost remains dominated by `simAgentChooseMove`, profile `PolicyAgent.chooseDecision` / policy-preview evaluation next before adding a hard per-card test.
4. Only add or recalibrate `fitl-per-card-cost.perf.test.ts` after the smallest bounded probe reaches a plausible budget range.

Do not lower the parity workload, turn caps, or incremental-hash verification to satisfy this ticket. The current evidence points to real per-card cost, not a stale CI ceiling.

## Verification

Commands run:

```bash
node --check packages/engine/scripts/profile-fitl-preview-drive.mjs
pnpm -F @ludoforge/engine build
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-smoke
```

Stopped bounded probes:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 5 --profilesAll --perCard --profileBuckets --label turnperf-seed42-max5
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 5 --profilesAll --perCard --label turnperf-seed42-max5-light
```

Schema and generated artifacts were not touched.
