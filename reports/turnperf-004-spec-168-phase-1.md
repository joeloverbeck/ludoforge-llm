# TURNPERF-004 / Spec 168 Phase 1 Persistent Token-State-Index (2026-05-13)

## Verdict

Spec 168 Phase 1 landed the run-local persistent token-state-index substrate,
but the canonical one-card metric stayed red. The persistent cache records
snapshots, but the canonical FITL probe does not revisit those state hashes
through the cache-aware read path: the decisive run recorded `0` persistent
cache hits, `0` persistent cache misses, and `66` writes.

The Phase 1 gate requires the combined
`tokenStateIndex:build + tokenStateIndex:refreshCachedEntries` buckets to drop
by at least `50 ms`. The decisive delta was `1.26 ms`, so
`tickets/168ENGHOTPATH-002.md` remains `BLOCKED` and the residual measured-gate
work moves to `tickets/168ENGHOTPATH-007.md`.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Fixture version | `spec-168-phase-0-v1` |
| Generated at | `2026-05-13T04:14:02.832Z` |
| Kernel commit SHA | `39ca28ec4fc8047f8ffa258f87f121eade15fd0f` |
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

| Metric | Phase 0 baseline | Phase 1 decisive |
|---|---:|---:|
| `elapsedMs` | `2146.12` | `2182.64` |
| per-card `elapsedMs` | `2145.94` | `2182.46` |
| per-card decisions | `160` | `160` |
| per-card `msPerDecision` | `13.4121` | `13.6404` |
| `turnsCount` | `1` | `1` |
| `stopReason` | `maxTurns` | `maxTurns` |

## Phase 1 Gate

| Field | Value |
|---|---:|
| Baseline `tokenStateIndex:build + refreshCachedEntries` | `156.26 ms` |
| Phase 1 `tokenStateIndex:build + refreshCachedEntries` | `155.00 ms` |
| Required drop | `>= 50.00 ms` |
| Actual drop | `1.26 ms` |
| Percent change | `0.81%` |
| Baseline `tokenStateIndexBuildCount` | `2903` |
| Phase 1 `tokenStateIndexBuildCount` | `2903` |
| Persistent cache hits / misses / writes | `0 / 0 / 66` |
| Verdict | `red` |

## Counters

| Counter | Phase 0 baseline | Phase 1 decisive |
|---|---:|---:|
| `tokenStateIndexBuildCount` | `2903` | `2903` |
| `draftTokenStateIndexDeltaCount` | `46` | `46` |
| `draftTokenStateIndexAttachCount` | `218` | `218` |
| `draftTokenStateIndexSnapshotCount` | `66` | `66` |
| `draftTokenStateIndexCowCopyCount` | `24` | `24` |
| `persistentTokenStateIndexCacheHitCount` | N/A | `0` |
| `persistentTokenStateIndexCacheMissCount` | N/A | `0` |
| `persistentTokenStateIndexCacheWriteCount` | N/A | `66` |
| `wasmScoreRowRouteCount` | `52` | `52` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` | `60` |
| `wasmProductionPreviewDriveBatchCount` | `182` | `182` |
| `driveExitTotal` | `52` | `52` |

## Profile Buckets

| Bucket | Phase 0 totalMs | Phase 1 totalMs | Delta |
|---|---:|---:|---:|
| `simAgentChooseMove` | `955.91` | `972.52` | `+16.61` |
| `agent:evaluatePolicyExpression` | `953.90` | `970.60` | `+16.70` |
| `simApplyMove` | `199.71` | `201.90` | `+2.19` |
| `evalQuery:countMatchingTokens` | `94.54` | `97.25` | `+2.71` |
| `zobrist:digestDecisionStackFrame` | `91.47` | `90.99` | `-0.48` |
| `tokenStateIndex:build` | `90.32` | `91.74` | `+1.42` |
| `tokenStateIndex:refreshCachedEntries` | `65.94` | `63.26` | `-2.68` |
| `zobrist:encodeDecisionStackFrame` | `38.45` | `40.99` | `+2.54` |
| `policyWasmRuntime:encodeBytecodeInput` | `40.17` | `33.61` | `-6.56` |
| `evalQuery:applyTokenFilter` | `18.16` | `17.05` | `-1.11` |

Only ticket-owned token-state-index buckets are used for the Phase 1 verdict.
Other bucket movements are diagnostic single-run noise or sibling-owned
optimization evidence.

## Follow-Up Ownership

`tickets/168ENGHOTPATH-007.md` owns the residual Phase 1 measured-gate miss. It
must not duplicate the completed substrate work from `002`; its first job is to
profile why the canonical workload records persistent writes but no hits, then
choose between a different token-index optimization, a narrower acceptance
rewrite, or skipping/reordering Phase 1 under Spec 168.

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/persistent-token-state-index-equivalence.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` | Passed structurally; Phase 1 measured gate red |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` | Passed |
| `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` | Passed |
| `pnpm run check:ticket-deps` | Passed for 6 active tickets and 2316 archived tickets |
