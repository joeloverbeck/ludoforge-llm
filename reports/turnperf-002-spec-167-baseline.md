# TURNPERF-002 / Spec 167 Baseline Measurement (2026-05-13)

## Verdict

Spec 167's Phase 0-2 harness work materially changed the ARVN evolution cost profile. The old TURNPERF-001 one-card measurement took `8710.05 ms`; the post-Spec-167 one-card profile in this report took `2051.05 ms` with WASM policy routing active. The same one-card per-decision cost is now `12.8178 ms/decision` on the instrumented bucket run.

The full 15-seed harness still exceeds the original <=2 minute end-to-end goal when it includes the preserved full engine regression gate: `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` completed in `277.90s`. That is consistent with Spec 167's Phase 2 reassessment: the tournament-loop optimization landed, while test-gate scoping remains intentionally out of scope for Spec 167.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Kernel commit SHA | `e2346e8e84c403153f8133d6ee14afe9a49fea55` |
| Spec 167 content hash | `32ee281ca7499fbdb6e64a2d4efdd2ec327dd53752e9c37c25762ca4b8497ad0` |
| Node | `v22.17.0` |
| pnpm | `10.12.1` |
| OS | `Linux JOELOVERBECK 6.6.114.1-microsoft-standard-WSL2 x86_64` |
| CPU | `12th Gen Intel(R) Core(TM) i9-12900K`, WSL2, 12 vCPUs visible |
| Precedent report | `archive/reports/turnperf-001-investigation-2026-04-28.md` |
| Phase 2 predecessor | `archive/tickets/167ARVNEVOHAR-005.md` |

Raw CPU profile data was captured under `/tmp/ludoforge-167-turnperf-002-cpuprofile/` and parsed during the session. It is not checked in because the durable evidence needed for Spec 168 decomposition is transcribed below and the raw V8 profile is process-local diagnostic data.

## Methodology

All commands ran from the repository root after rebuilding `packages/engine/dist`.

Build prerequisite:

```bash
pnpm -F @ludoforge/engine build
```

Per-decision timing and bucket attribution:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-spec-167-baseline
```

CPU-profile sample:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-167-turnperf-002-cpuprofile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-spec-167-cpuprofile
node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-167-turnperf-002-cpuprofile/*.cpuprofile --targets fnv1a64,resolveRef,evalCondition,evaluatePolicyMoveCore,copyCachedTokenStateIndex,digestDecisionStackFrame
```

Tier-15 full harness:

```bash
SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

Component timing samples:

```bash
/usr/bin/time -p pnpm -F @ludoforge/engine build
/usr/bin/time -p pnpm -F @ludoforge/engine test
/usr/bin/time -p node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200 --concurrency 8
```

## Wall-Time Decomposition

The wrapper total and component rows are same-session timed samples. The component rows are not forced to sum exactly to the wrapper run because each command was rerun separately after cache warmup.

| Surface | Command | Result |
|---|---|---:|
| Full harness tier 15 | `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` | `real 277.90s` |
| Warm incremental engine build | `/usr/bin/time -p pnpm -F @ludoforge/engine build` | `real 2.55s` |
| Full engine regression gate | `/usr/bin/time -p pnpm -F @ludoforge/engine test` | `real 114.10s` |
| 15-seed tournament loop | `/usr/bin/time -p node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200 --concurrency 8` | `real 177.15s` |

15-seed harness result:

| Metric | Value |
|---|---:|
| `compositeScore` | `-3.4` |
| `avgMargin` | `-6.0667` |
| `winRate` | `0.2667` |
| `wins` | `4` |
| `completed` | `15` |
| `truncated` | `0` |
| `errors` | `0` |
| `concurrency` | `8` |

Direct tournament-loop result:

| Metric | Value |
|---|---:|
| `real` | `177.15s` |
| `compositeScore` | `-3.4` |
| `avgMargin` | `-6.0667` |
| `winRate` | `0.2667` |
| `wins` | `4` |
| `completed` | `15` |
| `truncated` | `0` |
| `errors` | `0` |
| `concurrency` | `8` |
| `wasmEnabled` | `true` |
| `gamedefCacheHit` | `true` |

## Per-Decision Cost Decomposition

Command:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-spec-167-baseline
```

Top-line result:

| Metric | Value |
|---|---:|
| `elapsedMs` | `2051.05` |
| per-card `elapsedMs` | `2050.85` |
| per-card decisions | `160` |
| per-card `msPerDecision` | `12.8178` |
| `stopReason` | `maxTurns` |
| `tokenStateIndexBuildCount` | `2903` |
| `draftTokenStateIndexDeltaCount` | `46` |
| `draftTokenStateIndexAttachCount` | `218` |
| `wasmScoreRowRouteCount` | `52` |
| `wasmScoreRowUnsupportedCount` | `0` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` |
| `wasmPreviewCandidateFeatureRowUnsupportedCount` | `0` |
| `wasmProductionPreviewDriveBatchCount` | `182` |
| `driveExitTotal` | `52` |

Profiler buckets:

| Bucket | Count | totalMs | Share of elapsed |
|---|---:|---:|---:|
| `simAgentChooseMove` | `160` | `913.64` | `44.5%` |
| `agent:evaluatePolicyExpression` | `160` | `912.06` | `44.5%` |
| `simApplyMove` | `160` | `187.41` | `9.1%` |
| `evalQuery:countMatchingTokens` | `958285` | `91.33` | `4.5%` |
| `zobrist:digestDecisionStackFrame` | `300` | `89.57` | `4.4%` |
| `tokenStateIndex:build` | `2903` | `87.91` | `4.3%` |
| `tokenStateIndex:refreshCachedEntries` | `10568` | `64.93` | `3.2%` |
| `policyWasmRuntime:encodeBytecodeInput` | `394` | `38.28` | `1.9%` |
| `zobrist:encodeDecisionStackFrame` | `305` | `36.88` | `1.8%` |
| `evalQuery:applyTokenFilter` | `9245` | `14.79` | `0.7%` |
| `simTerminalResult` | `161` | `2.52` | `0.1%` |
| `simLegalMoves` | `161` | `0.52` | `<0.1%` |

Compared with TURNPERF-001:

| Metric | TURNPERF-001 | Spec 167 baseline | Delta |
|---|---:|---:|---:|
| one-card `elapsedMs` | `8710.05` | `2051.05` | `-6659.00 ms` (`-76.5%`) |
| per-card decisions | `159` | `160` | `+1` |
| approx. ms/decision | `54.78` | `12.82` | `-41.96 ms` (`-76.6%`) |
| `simAgentChooseMove` | `5381.26 ms` | `913.64 ms` | `-4467.62 ms` (`-83.0%`) |
| `agent:evaluatePolicyExpression` | `5378.06 ms` | `912.06 ms` | `-4466.00 ms` (`-83.0%`) |
| `simApplyMove` | `1065.35 ms` | `187.41 ms` | `-877.94 ms` (`-82.4%`) |

The old report's headline that agent choice dominated remains directionally true, but the active bucket has shrunk from roughly 62% of elapsed to roughly 45%. The remaining cost is now more distributed across generic query/filter work, Zobrist decision-stack hashing, token-index rebuild/refresh work, and WASM input encoding.

## CPU-Profile Summary

CPU profile command:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-167-turnperf-002-cpuprofile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-spec-167-cpuprofile
```

The CPU-profile run reported `elapsedMs=1936.67`, per-card `elapsedMs=1936.5`, `160` decisions, and `12.1031 ms/decision`.

Top self-sample functions from the parsed profile:

| Function | Samples |
|---|---:|
| `(anonymous)` | `184` |
| garbage collector | `123` |
| `updateFnv1a64State` | `69` |
| `resolveRef` | `67` |
| `compileSourceTextModule` | `57` |
| `boundToken` | `48` |
| `buildTokenStateIndex` | `47` |
| `countMatchingTokens` | `42` |
| `refreshCachedTokenStateIndexEntries` | `41` |
| `encodeDecisionStackFrameDigestInput` | `37` |
| `zobristKey` | `36` |
| `applyEffectWithBudget` | `32` |

Top self-sample files:

| File | Samples |
|---|---:|
| `(no-url)` | `208` |
| `src/kernel/eval-query.js` | `132` |
| `src/kernel/token-state-index.js` | `111` |
| `src/kernel/fnv1a64.js` | `97` |
| `src/kernel/condition-compiler.js` | `93` |
| `src/kernel/zobrist.js` | `93` |
| `src/kernel/resolve-ref.js` | `80` |
| `src/kernel/effect-dispatch.js` | `76` |
| `src/agents/policy-wasm-production-preview-values.js` | `50` |
| `src/kernel/move-runtime-bindings.js` | `50` |
| `src/cnl/policy-bytecode/feature-table.js` | `47` |
| `src/kernel/legal-choices.js` | `46` |
| `src/agents/policy-wasm-runtime.js` | `42` |
| `src/kernel/eval-value.js` | `41` |
| `src/kernel/encoded-state/view.js` | `40` |

## Prioritized Targets for Spec 168

1. Generic query/filter hot path (`evalQuery:countMatchingTokens`, `boundToken`, `resolveRef`, `evalCondition`, `evalValue`).
   - Evidence: `evalQuery:countMatchingTokens` is `91.33 ms` in bucket timing, while CPU-profile file samples put `eval-query.js`, `resolve-ref.js`, `eval-value.js`, and `condition-compiler.js` among the top remaining owners.
   - Candidate optimization: preserve or extend compiled query/filter plans so repeated policy-preview queries avoid repeated per-token binding and ref resolution.
   - Estimated one-card savings: `80-160 ms` if the repeated token count/ref-resolution path is reduced by roughly 40-60%.

2. Token-state-index rebuild and refresh volume.
   - Evidence: `tokenStateIndex:build` is still called `2903` times for one card and costs `87.91 ms`; `refreshCachedEntries` adds `64.93 ms`.
   - Candidate optimization: reduce rebuild frequency for preview/draft states by carrying a more precise affected-token/affected-zone mutation summary through the policy-preview application path.
   - Estimated one-card savings: `60-120 ms` if rebuild/refresh work drops by roughly half without changing cache ownership semantics.

3. Zobrist decision-stack hashing and encoding.
   - Evidence: `zobrist:digestDecisionStackFrame` costs `89.57 ms`, `zobrist:encodeDecisionStackFrame` costs `36.88 ms`, and CPU-profile samples still include `updateFnv1a64State`, `encodeDecisionStackFrameDigestInput`, `zobristKey`, and `fnv1a64.js`.
   - Candidate optimization: continue the already-landed preview-inner no-final-hash direction by reducing decision-stack digest inputs on preview-only paths while preserving canonical public hash finalization.
   - Estimated one-card savings: `50-100 ms` if digest/encoding repetition is halved in preview-inner loops.

4. WASM input encoding for policy-preview scoring.
   - Evidence: WASM routing is active (`wasmScoreRowRouteCount=52`, unsupported `0`; preview candidate feature route `60`, unsupported `0`), but `policyWasmRuntime:encodeBytecodeInput` still costs `38.28 ms` and `policy-wasm-runtime.js` / `policy-wasm-production-preview-values.js` appear in CPU-profile top files.
   - Candidate optimization: cache or batch encoded bytecode input rows by stable preview-state shape and candidate feature table.
   - Estimated one-card savings: `20-40 ms`.

5. Full harness protocol scoping.
   - Evidence: the engine regression gate costs `114.10s`, while the full harness total is `277.90s`. Spec 167 explicitly deferred test-gate scoping, so this is not a Spec 168 engine hot-path item unless Spec 168 is expanded beyond per-decision runtime.
   - Candidate optimization: separate campaign iteration smoke gates from periodic full regression gates through a campaign-protocol amendment.
   - Estimated tier-15 harness savings: up to `~114s` per invocation, but this is workflow/protocol scope, not an engine per-decision optimization.

## Verification

Commands run:

```bash
pnpm -F @ludoforge/engine build
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-spec-167-baseline
node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-167-turnperf-002-cpuprofile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-spec-167-cpuprofile
node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-167-turnperf-002-cpuprofile/*.cpuprofile --targets fnv1a64,resolveRef,evalCondition,evaluatePolicyMoveCore,copyCachedTokenStateIndex,digestDecisionStackFrame
SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh
/usr/bin/time -p pnpm -F @ludoforge/engine build
/usr/bin/time -p pnpm -F @ludoforge/engine test
/usr/bin/time -p node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200 --concurrency 8
```

All listed commands completed successfully.

Schema, golden, and generated JSON artifacts were not modified.
