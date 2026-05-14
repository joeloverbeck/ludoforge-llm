# TURNPERF-009 / Spec 168 Phase 5 Final Re-profile (2026-05-13)

## Verdict

Spec 168 Phase 5 produced the final post-Phase-4 measurement and escalation
decision memo. The canonical one-card profile records:

- per-card `elapsedMs = 1800.57`
- per-card `msPerDecision = 11.2536`
- per-card decisions = `160`
- `wasmScoreRowUnsupportedCount = 0`
- `wasmPreviewCandidateFeatureRowUnsupportedCount = 0`
- `policyWasmRuntime:encodeBytecodeInput = 11.29 ms`
- `policyWasmRuntime:encodeBytecodeInput` calls = `394`
- Phase 4 marshalling-cost proxy = `11.29 / 394 = 0.0287 ms` per bytecode input call

The overall Spec 168 wall-time budget remains red: `1800.57 ms/card` is above
the `<= 1700 ms` target, and `11.2536 ms/decision` is above the
`<= 10.6 ms/decision` target.

The Spec 169 escalation gate does not trigger. The only remaining single
kernel-internal bucket over `40 ms` is `tokenStateIndex:build`, and the
Phase 5 marshalling proxy leaves only about `1.65 ms` of total WASM execution
headroom before the route would be slower than the current TypeScript bucket.
The larger `simApplyMove` bucket is an aggregate simulator wrapper, not a
narrow opcode/ABI candidate under Spec 168 §3.6.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Kernel commit SHA | `d9e0abc67aed1e276bbaf597f516587611f73f1c` |
| Node | `v22.17.0` |
| pnpm | `10.12.1` |
| OS | `Linux 6.6.114.1-microsoft-standard-WSL2 x86_64 GNU/Linux` |
| CPU | `12th Gen Intel(R) Core(TM) i9-12900K` |
| CPU topology | `12 CPUs, 6 cores/socket, 2 threads/core, 1 socket` |
| Generated raw artifact | none checked in; direct profiler stdout transcribed here |

## Methodology

Build prerequisite:

```bash
pnpm -F @ludoforge/engine build
```

Decisive final profile:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final
```

Optional fixed-seed campaign score/error sanity:

```bash
SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

The harness writes ignored logs under
`campaigns/fitl-arvn-agent-evolution/run.log.*`; the durable fields are
transcribed here.

## Top-Line Result

| Metric | Phase 0 baseline | Phase 1b | Phase 2 | Phase 3 | Phase 4 | Phase 5 final |
|---|---:|---:|---:|---:|---:|---:|
| per-card `elapsedMs` | `2145.94` | `1971.67` | `1873.32` | `2120.30` | `1949.83` | `1800.57` |
| per-card decisions | `160` | `160` | `160` | `160` | `160` | `160` |
| per-card `msPerDecision` | `13.4121` | `12.3230` | `11.7082` | `13.2519` | `12.1864` | `11.2536` |

Overall budget check:

| Gate | Target | Phase 5 final | Verdict |
|---|---:|---:|---|
| per-card `elapsedMs` | `<= 1700` | `1800.57` | red by `100.57 ms` |
| per-card `msPerDecision` | `<= 10.6` | `11.2536` | red by `0.6536 ms/decision` |

The final sample improved `345.37 ms/card` versus the Phase 0 baseline
(`16.09%`) but did not reach the full Spec 168 budget.

## Wall-Time Decomposition

| Bucket | Phase 0 totalMs | Phase 5 totalMs | Delta |
|---|---:|---:|---:|
| `simAgentChooseMove` | `955.91` | `835.45` | `-120.46` |
| `agent:evaluatePolicyExpression` | `953.90` | `833.85` | `-120.05` |
| `simApplyMove` | `199.71` | `128.87` | `-70.84` |
| `evalQuery:countMatchingTokens` | `94.54` | `13.30` | `-81.24` |
| `zobrist:digestDecisionStackFrame` | `91.47` | `26.93` | `-64.54` |
| `tokenStateIndex:build` | `90.32` | `50.70` | `-39.62` |
| `tokenStateIndex:refreshCachedEntries` | `65.94` | `6.59` | `-59.35` |
| `policyWasmRuntime:encodeBytecodeInput` | `40.17` | `11.29` | `-28.88` |
| `zobrist:encodeDecisionStackFrame` | `38.45` | `14.95` | `-23.50` |
| `evalQuery:applyTokenFilter` | `18.16` | `10.18` | `-7.98` |
| `simTerminalResult` | `2.84` | `2.40` | `-0.44` |
| `simLegalMoves` | `0.64` | `0.51` | `-0.13` |

Phase-owned aggregate deltas:

| Spec 168 surface | Baseline comparison | Phase 5 final | Cumulative delta |
|---|---:|---:|---:|
| Token index build + refresh | `156.26` | `57.29` | `-98.97` |
| Query/filter count + apply | `112.70` | `23.48` | `-89.22` |
| Zobrist digest + encode | `129.92` | `41.88` | `-88.04` |
| Bytecode input encoding | `40.17` | `11.29` | `-28.88` |

## Phase 5 Escalation Evaluation

Spec 168 §3.6 triggers a Spec 169 memo only when all three criteria hold for at
least one remaining non-policy bucket:

1. A single non-policy bucket sustains at least `40 ms` per card.
2. The candidate is a kernel-internal hot path that does not cross the WASM
   boundary today.
3. The cost model estimates `expected WASM execution + marshalling cost` below
   the current TypeScript-side bucket.

The Phase 5 marshalling proxy is:

| Field | Value |
|---|---:|
| `policyWasmRuntime:encodeBytecodeInput` totalMs | `11.29` |
| `policyWasmRuntime:encodeBytecodeInput` calls | `394` |
| Per-call proxy | `0.0287 ms` |

Per-bucket evaluation:

| Bucket | Phase 5 totalMs | Count | >= 40 ms? | Candidate? | Cost-model note | Verdict |
|---|---:|---:|---|---|---|---|
| `simApplyMove` | `128.87` | `160` | yes | no | Aggregate simulator/apply wrapper, not a narrow opcode/ABI hot path. Whole-state/action marshalling is not represented by the bytecode-row proxy. | no trigger |
| `tokenStateIndex:build` | `50.70` | `1711` | yes | yes | Proxy marshalling alone is `1711 * 0.0287 = 49.05 ms`, leaving only `1.65 ms` for all WASM execution before losing to current TypeScript. | no trigger |
| `zobrist:digestDecisionStackFrame` | `26.93` | `312` | no | yes | Below threshold as a single bucket. | no trigger |
| `zobrist:encodeDecisionStackFrame` | `14.95` | `322` | no | yes | Below threshold as a single bucket. | no trigger |
| `evalQuery:countMatchingTokens` | `13.30` | `14917` | no | yes | Below threshold as a single bucket. | no trigger |
| `policyWasmRuntime:encodeBytecodeInput` | `11.29` | `394` | no | excluded | Existing WASM boundary marshalling cost; this is the proxy, not a new non-policy candidate. | no trigger |
| `evalQuery:applyTokenFilter` | `10.18` | `3123` | no | yes | Below threshold as a single bucket. | no trigger |
| `tokenStateIndex:refreshCachedEntries` | `6.59` | `1148` | no | yes | Below threshold as a single bucket. | no trigger |

## Closure Note

Spec 168's bytecode-IR / WASM escalation arc is closed for now. The measured
data does not justify authoring Spec 169 under the published §3.6 criterion.

The residual overall budget gap is real, but it is not a validated WASM-expansion
handoff:

- `simApplyMove` remains large, but it is an aggregate wrapper rather than a
  single ABI-sized candidate.
- `tokenStateIndex:build` remains over `40 ms`, but the current marshalling
  proxy consumes almost the entire TypeScript bucket before any WASM execution
  cost is counted.
- The other remaining kernel-internal buckets are each below the `40 ms` trigger
  threshold.

Recommended next step if the `<= 1700 ms/card` target still matters: open a new
profiling/design slice against the current residual aggregate (`simApplyMove`
and policy/orchestration wall time) rather than drafting Spec 169 from this
evidence. Re-running Phases 1-4 as-is is not recommended; their named buckets
have already produced the expected reductions, and the final gap is outside the
published Spec 169 trigger.

## Determinism / Score Sanity

The direct profile preserved fixed-seed route health:

| Counter | Phase 5 final |
|---|---:|
| `wasmScoreRowRouteCount` | `52` |
| `wasmScoreRowUnsupportedCount` | `0` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` |
| `wasmPreviewCandidateFeatureRowUnsupportedCount` | `0` |
| `wasmProductionPreviewDriveBatchCount` | `182` |
| `driveExitTotal` | `52` |

The optional 15-seed campaign harness matched the pre-Spec-168 fixed-seed
baseline from `reports/turnperf-002-spec-167-baseline.md`, which recorded
`compositeScore=-3.4` and `errors=0` for the same tier-15 harness surface.

The Phase 5 harness produced:

| Field | Value |
|---|---:|
| `compositeScore` | `-3.4` |
| `avgMargin` | `-6.0667` |
| `winRate` | `0.2667` |
| `wins` | `4` |
| `completed` | `15` |
| `truncated` | `0` |
| `errors` | `0` |
| `concurrency` | `8` |
| wall time (`real`) | `270.38 s` |

This report does not claim a new campaign-quality improvement. The harness run
is residual fixed-seed score/error parity evidence for the engine changes that
already landed in Phases 1-4.

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final` | Passed; produced the decisive final bucket decomposition |
| `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` | Passed; `compositeScore=-3.4`, `errors=0`, `real=270.38 s` |
| `pnpm -F @ludoforge/engine test:perf` | Passed, 4/4 perf files; emitted known advisory warnings from older perf witnesses, but no failing tests |
| `pnpm turbo test` | Passed from Turbo cache replay, 5/5 tasks; cache-hit supplemental because direct profile, harness regression gate, and perf lane prove the ticket-owned measurement/report boundary |
| `pnpm run check:ticket-deps` | Passed for 1 active ticket and 2321 archived tickets |

## Durable State

Durable status: implemented. The report owns no production code, schema,
golden, or compiled GameDef change.

Late-edit validity: final report/ticket edits after the measured lanes
transcribe the already-run metrics, final proof results, and terminal status
only. They do not change runtime code, command semantics, thresholds,
acceptance boundaries, touched-file ownership, follow-up ownership, or dependency
classification. The dependency-check result transcription is clerical and does
not change ticket graph facts after the check.
