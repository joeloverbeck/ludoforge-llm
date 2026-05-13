# TURNPERF-005 / Spec 168 Phase 1b Token-State-Index Gate Resolution (2026-05-13)

## Verdict

Spec 168 Phase 1b is green. The canonical one-card probe now records
`tokenStateIndex:build + tokenStateIndex:refreshCachedEntries = 57.09 ms`,
down from the Phase 0 baseline `156.26 ms`. The `99.17 ms` drop exceeds the
`>= 50.00 ms` Phase 1 gate.

The decisive optimization was not additional state-hash persistent-cache
activation. CPU profiling showed token write effects were doing single-token
occurrence lookups through full token-state-index builds. Tracked mutable write
scopes now use a direct single-token occurrence scan, while untracked read
scopes keep using the canonical token-state-index path and its run-local cache.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Fixture version | `spec-168-phase-0-v1` |
| Generated at | `2026-05-13T04:39:22.542Z` |
| Kernel commit SHA | `878e2b96ff7680a23f6d74f7565dc42cf136423f` |
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

CPU-profile probe used during root-cause analysis:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-168-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-phase-1b-stack-probe
node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-168-profile/CPU.20260513.063056.2.0.001.cpuprofile --targets buildTokenStateIndex,getTokenStateIndex,refreshCachedTokenStateIndexEntries
```

The CPU profile was an ephemeral `/tmp` artifact. Durable results are
transcribed here.

## Root Cause

The Phase 1 persistent state-hash cache substrate was correct but mostly
irrelevant to the canonical workload. The red Phase 1 report recorded
`0 / 0 / 66` persistent cache hits / misses / writes because the canonical
probe wrote snapshots at preview exits but did not revisit those exact state
hashes through a cache-aware read path.

The stack probe showed `buildTokenStateIndex` was predominantly reached through
single-token write-effect lookups:

| Stack owner | Samples |
|---|---:|
| `getTokenStateIndexEntry -> resolveTokenOccurrence -> applyMoveToken` | `29` |
| `getTokenStateIndexEntry -> resolveRef -> evalValue -> resolveZoneRef -> applyMoveToken` | `21` |
| `resolveTokenOccurrence -> applySetTokenProp` | `17` |
| `resolveRef -> evalValue -> applyLet` | `7` |

An attempted same-checkout cache-threading path exposed why tracked mutable
write scopes must not consult the persistent state-hash cache: a draft with a
lagging state hash produced a duplicate-token occurrence witness. The retained
solution therefore avoids the full index in tracked mutable write scopes by
scanning for only the requested token id. That preserves duplicate-occurrence
semantics without relying on stale draft hashes.

## Phase 1 Gate

| Field | Phase 0 baseline | Phase 1 red | Phase 1b decisive |
|---|---:|---:|---:|
| `tokenStateIndex:build` totalMs | `90.32` | `91.74` | `50.59` |
| `tokenStateIndex:refreshCachedEntries` totalMs | `65.94` | `63.26` | `6.50` |
| Combined owned bucket | `156.26` | `155.00` | `57.09` |
| Drop from Phase 0 | N/A | `1.26` | `99.17` |
| Percent drop from Phase 0 | N/A | `0.81%` | `63.46%` |
| Required drop | N/A | `>= 50.00` | `>= 50.00` |
| Verdict | baseline | red | green |

## Top-Line Result

| Metric | Phase 0 baseline | Phase 1b decisive |
|---|---:|---:|
| `elapsedMs` | `2146.12` | `1971.84` |
| per-card `elapsedMs` | `2145.94` | `1971.67` |
| per-card decisions | `160` | `160` |
| per-card `msPerDecision` | `13.4121` | `12.3230` |
| `turnsCount` | `1` | `1` |
| `stopReason` | `maxTurns` | `maxTurns` |

## Counters

| Counter | Phase 0 baseline | Phase 1 red | Phase 1b decisive |
|---|---:|---:|---:|
| `tokenStateIndexBuildCount` | `2903` | `2903` | `1711` |
| `draftTokenStateIndexDeltaCount` | `46` | `46` | `46` |
| `draftTokenStateIndexAttachCount` | `218` | `218` | `218` |
| `draftTokenStateIndexSnapshotCount` | N/A | `66` | `66` |
| `draftTokenStateIndexCowCopyCount` | N/A | `24` | `24` |
| `persistentTokenStateIndexCacheHitCount` | N/A | `0` | `3` |
| `persistentTokenStateIndexCacheMissCount` | N/A | `0` | `0` |
| `persistentTokenStateIndexCacheWriteCount` | N/A | `66` | `66` |
| `wasmScoreRowRouteCount` | `52` | `52` | `52` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` | `60` | `60` |
| `wasmProductionPreviewDriveBatchCount` | `182` | `182` | `182` |
| `driveExitTotal` | `52` | `52` | `52` |

## Profile Buckets

| Bucket | Phase 0 totalMs | Phase 1b totalMs | Delta |
|---|---:|---:|---:|
| `simAgentChooseMove` | `955.91` | `894.48` | `-61.43` |
| `agent:evaluatePolicyExpression` | `953.90` | `893.07` | `-60.83` |
| `simApplyMove` | `199.71` | `183.73` | `-15.98` |
| `evalQuery:countMatchingTokens` | `94.54` | `90.53` | `-4.01` |
| `zobrist:digestDecisionStackFrame` | `91.47` | `90.99` | `-0.48` |
| `tokenStateIndex:build` | `90.32` | `50.59` | `-39.73` |
| `tokenStateIndex:refreshCachedEntries` | `65.94` | `6.50` | `-59.44` |
| `zobrist:encodeDecisionStackFrame` | `38.45` | `35.90` | `-2.55` |
| `policyWasmRuntime:encodeBytecodeInput` | `40.17` | `30.16` | `-10.01` |
| `evalQuery:applyTokenFilter` | `18.16` | `13.75` | `-4.41` |

Only ticket-owned token-state-index buckets are used for the Phase 1b verdict.
Other bucket movements are single-run diagnostic context for later phases.

## Invariants

1. Direct single-token lookup matches canonical full-index occurrence semantics,
   including duplicate occurrences and zone ordering.
2. Persistent token-state-index cache hit/miss equivalence, run-local isolation,
   deterministic LRU behavior, and mutable-refresh snapshot detachment remain
   covered by `persistent-token-state-index-equivalence.test.ts`.
3. Runtime eval-resource contract explicitly permits `tokenStateIndexCache` so
   runtime-aware legal-move, apply-move, microturn, and terminal paths can carry
   the cache without weakening unknown-key validation.
4. Tracked mutable write scopes avoid persistent state-hash cache reads; the
   direct scan is bounded to the requested token id and cannot leak mutable
   descendants outside the synchronous write scope.

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | Passed, 12 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/persistent-token-state-index-equivalence.test.js` | Passed, 4 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/unit/eval-runtime-resources-contract.test.js` | Passed, 6 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` | Passed; Phase 1b measured gate green |
| `pnpm turbo test` | Passed via Turbo cache replay, 5 tasks; classified as cache-hit supplemental because the focused direct lanes above prove the owned changed surfaces |
| `pnpm run check:ticket-deps` | Passed for 6 active tickets and 2316 archived tickets |
