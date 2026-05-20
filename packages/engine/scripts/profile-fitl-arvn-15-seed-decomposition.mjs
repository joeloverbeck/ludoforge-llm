#!/usr/bin/env node
// Phase-0 witness for Spec 173: decompose the FITL ARVN 15-seed
// tournament tier by seed and microturn class.
//
// This is a measurement script, not a test. It reads built engine artifacts
// from packages/engine/dist and writes dated Markdown + CSV reports.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  createStaticRebuildCounterAccess,
  totalStaticRebuildCount,
} from './profile-fitl-preview-drive-metrics.mjs';
import {
  renderCsv,
  renderMarkdown,
} from './profile-fitl-arvn-15-seed-report-rendering.mjs';
import {
  addSerializationStats,
  addTimingBuckets,
  deltaTimingBuckets,
  deltaSerializationStats,
  serializationDelta,
  serializationRows,
  timingDelta,
  timingDeltaMs,
  timingRows,
} from './profile-fitl-arvn-15-seed-timing.mjs';
import { classifyMicroturn } from './profile-fitl-arvn-15-seed-classify.mjs';
import {
  flagBoolean,
  flagPositiveInt,
  flagValue,
  formatSeedRange,
  parsePositiveInt,
  parseSeedRange,
} from './profile-fitl-arvn-15-seed-cli.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = findRepoRoot(PACKAGE_ROOT);
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');
const GAME_SPEC_ENTRYPOINT = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const SLOW_TIER_SEEDS = new Set([1005, 1011, 1008, 1013, 1009]);
const FAST_TIER_SEEDS = new Set([1000, 1006, 1007, 1010, 1014]);

const args = process.argv.slice(2);
const config = {
  seeds: parseSeedRange(flagValue(args, 'seeds', '1000..1014')),
  timeoutMs: flagPositiveInt(args, 'timeout-ms', 400000),
  maxTurns: flagPositiveInt(args, 'max-turns', 200),
  date: flagValue(args, 'date', new Date().toISOString().slice(0, 10)),
  outputDir: resolve(REPO_ROOT, flagValue(args, 'output-dir', 'reports')),
  topN: flagPositiveInt(args, 'top-n', 10),
  childSeed: flagValue(args, 'child-seed', undefined),
  childOutput: flagValue(args, 'child-output', undefined),
  child: flagBoolean(args, 'child'),
  profileBuckets: flagBoolean(args, 'profile-buckets'),
  noWasm: flagBoolean(args, 'no-wasm'),
  wasmTimingProfile: process.env.POLICY_WASM_TIMING_PROFILE === '1',
};

if (config.child) {
  if (config.childSeed === undefined) {
    fail('--child requires --child-seed');
  }
  const seed = parsePositiveInt(config.childSeed, 'child-seed');
  const result = await runSeedInProcess(seed, config.maxTurns);
  if (config.childOutput !== undefined) {
    writeFileSync(config.childOutput, JSON.stringify(result), 'utf8');
    process.stdout.write(`${JSON.stringify({ outputPath: config.childOutput, summary: result.summary })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} else {
  const result = await runParent();
  const failed = result.perSeed.filter((row) => row.status !== 'OK');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function runParent() {
  ensureDistExists();
  mkdirSync(config.outputDir, { recursive: true });

  const perSeed = [];
  const decisions = [];
  for (const seed of config.seeds) {
    process.stderr.write(`seed ${seed}: START\n`);
    const seedResult = await runSeedChild(seed);
    perSeed.push(seedResult.summary);
    if (seedResult.summary.status === 'OK') {
      decisions.push(...seedResult.decisions);
    }
    process.stderr.write(formatSeedProgress(seedResult.summary));
  }

  const rollup = buildRollup(perSeed, decisions);
  const baseName = `fitl-arvn-15-seed-decomposition-${config.date}${config.noWasm && !config.date.includes('no-wasm') ? '-no-wasm' : ''}`;
  const csvPath = join(config.outputDir, `${baseName}.csv`);
  const mdPath = join(config.outputDir, `${baseName}.md`);
  writeFileSync(csvPath, renderCsv(decisions), 'utf8');
  writeFileSync(mdPath, renderMarkdown(rollup, {
    csvPath,
    profileBuckets: config.profileBuckets,
    relativeToRepo,
  }), 'utf8');
  process.stdout.write(`rollup written to ${relativeToRepo(mdPath)}\n`);
  process.stdout.write(`csv written to ${relativeToRepo(csvPath)}\n`);
  return rollup;
}

function runSeedChild(seed) {
  return new Promise((resolveSeed) => {
    const startedAt = performance.now();
    const outputPath = childOutputPath(seed);
    const childArgs = [
      SCRIPT_PATH,
      '--child',
      '--child-seed',
      String(seed),
      '--max-turns',
      String(config.maxTurns),
      '--timeout-ms',
      String(config.timeoutMs),
      '--child-output',
      outputPath,
    ];
    if (config.profileBuckets) {
      childArgs.push('--profile-buckets');
    }
    if (config.noWasm) {
      childArgs.push('--no-wasm');
    }
    const child = spawn(process.execPath, childArgs, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      resolveSeed({
        summary: {
          seed,
          status: 'TIMEOUT',
          elapsedMs: round2(performance.now() - startedAt),
          stopReason: 'timeout',
          decisions: 0,
          maxTurns: config.maxTurns,
          error: `exceeded timeout-ms=${config.timeoutMs}`,
        },
        decisions: [],
      });
    }, config.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolveSeed({
        summary: {
          seed,
          status: 'ERROR',
          elapsedMs: round2(performance.now() - startedAt),
          stopReason: 'spawn-error',
          decisions: 0,
          maxTurns: config.maxTurns,
          error: error.message,
        },
        decisions: [],
      });
    });
    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        resolveSeed({
          summary: {
            seed,
            status: 'ERROR',
            elapsedMs: round2(performance.now() - startedAt),
            stopReason: signal === null ? `exit-${code}` : `signal-${signal}`,
            decisions: 0,
            maxTurns: config.maxTurns,
            error: stderr.trim() || stdout.trim() || `child exited ${code}`,
          },
          decisions: [],
        });
        return;
      }
      try {
        const lastLine = stdout.trim().split('\n').at(-1) ?? '';
        const parsed = lastLine === '' && existsSync(outputPath)
          ? { outputPath, summary: null }
          : JSON.parse(lastLine);
        if (parsed.outputPath !== undefined) {
          const payload = JSON.parse(readFileSync(parsed.outputPath, 'utf8'));
          unlinkSync(parsed.outputPath);
          resolveSeed(payload);
        } else {
          resolveSeed(parsed);
        }
      } catch (error) {
        resolveSeed({
          summary: {
            seed,
            status: 'ERROR',
            elapsedMs: round2(performance.now() - startedAt),
            stopReason: 'parse-error',
            decisions: 0,
            maxTurns: config.maxTurns,
            error: `could not parse child JSON: ${error.message}; stderr=${stderr.trim()}`,
          },
          decisions: [],
        });
      }
    });
  });
}

async function runSeedInProcess(seed, maxTurns) {
  ensureDistExists();
  const [
    { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle },
    { assertValidatedGameDef, createGameDefRuntime },
    { PolicyAgent },
    { runGame },
    { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync },
    { __internal_for_tests: tokenStateIndexInternals },
    { zobristInternals },
    { __internal_for_tests: policyWasmRuntimeInternals },
    { policyWasmProductionPreviewDriveInternals },
    { __policyEncodedStateCache_internal_for_tests: policyEncodedStateCacheInternals },
    { resetHotPathProfilerCounters, setHotPathProfilingEnabled, snapshotHotPathProfilerCounters },
  ] = await Promise.all([
    import(join(DIST_ROOT, 'src', 'cnl', 'index.js')),
    import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
    import(join(DIST_ROOT, 'src', 'agents', 'index.js')),
    import(join(DIST_ROOT, 'src', 'sim', 'index.js')),
    import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-runtime-node-loader.js')),
    import(join(DIST_ROOT, 'src', 'kernel', 'token-state-index.js')),
    import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
    import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-runtime.js')),
    import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-production-preview-drive.js')),
    import(join(DIST_ROOT, 'src', 'agents', 'policy-encoded-state-cache.js')),
    import(join(DIST_ROOT, 'src', 'kernel', 'perf-profiler.js')),
  ]);
  const staticRebuildCounters = await createStaticRebuildCounterAccess(DIST_ROOT);

  if (!config.noWasm) {
    initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });
  }
  const def = assertValidatedGameDef(
    runGameSpecStagesFromBundle(
      loadGameSpecBundleFromEntrypoint(GAME_SPEC_ENTRYPOINT),
    ).compilation.result.gameDef,
  );
  const runtime = createGameDefRuntime(def);
  resetCounters({
    staticRebuildCounters,
    tokenStateIndexInternals,
    zobristInternals,
    policyWasmRuntimeInternals,
    policyWasmProductionPreviewDriveInternals,
    policyEncodedStateCacheInternals,
    resetHotPathProfilerCounters,
    setHotPathProfilingEnabled,
  });

  const counterReader = () => readCounters({
    staticRebuildCounters,
    tokenStateIndexInternals,
    zobristInternals,
    policyWasmRuntimeInternals,
    policyWasmProductionPreviewDriveInternals,
    policyEncodedStateCacheInternals,
  });
  const telemetry = [];
  const agents = buildTimedAgents(def, PolicyAgent, counterReader, telemetry, seed, {
    resetHotPathProfilerCounters,
    snapshotHotPathProfilerCounters,
  });
  const startedAt = performance.now();
  let trace;
  let status = 'OK';
  let error = null;
  try {
    trace = runGame(def, seed, agents, maxTurns, 4, {
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
    }, runtime);
  } catch (caught) {
    status = 'ERROR';
    error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
  }
  const elapsedMs = round2(performance.now() - startedAt);
  const summary = {
    seed,
    status,
    elapsedMs,
    stopReason: trace?.stopReason ?? (status === 'OK' ? 'unknown' : 'error'),
    decisions: telemetry.length,
    maxTurns,
    error,
  };
  return { summary, decisions: telemetry };
}

function buildTimedAgents(def, PolicyAgent, readCounters, telemetry, seed, hotPathProfiler) {
  const seatProfiles = (def.seats ?? []).map((seat) => {
    const id = String(seat.id).toLowerCase();
    return id === 'arvn' ? 'arvn-evolved' : `${id}-baseline`;
  });
  return seatProfiles.map((profileId, playerIndex) => {
    const inner = new PolicyAgent({ profileId, traceLevel: 'summary' });
    return {
      chooseDecision(input) {
        if (config.profileBuckets) {
          hotPathProfiler.resetHotPathProfilerCounters();
        }
        const before = readCounters();
        const startedAt = performance.now();
        const result = inner.chooseDecision(input);
        const elapsedMs = performance.now() - startedAt;
        const after = readCounters();
        const hotPathBuckets = config.profileBuckets
          ? snapshotDecisionHotPathBuckets(hotPathProfiler.snapshotHotPathProfilerCounters)
          : [];
        const decisionIndex = telemetry.length;
        const selectedDecision = result.decision;
        const previewUsage = result.agentDecision?.previewUsage;
        telemetry.push({
          seed,
          decisionIndex,
          playerIndex,
          seatId: String(input.microturn.seatId),
          profileId,
          turnCount: input.state.turnCount,
          turnId: Number(input.microturn.turnId),
          decisionKind: selectedDecision.kind,
          microturnClass: classifyMicroturn(selectedDecision, input.def),
          elapsedMs: round4(elapsedMs),
          previewBranch: previewUsage?.evaluatedCandidateCount > 0
            ? previewUsage.coverage.strategy
            : 'none',
          previewCapClass: previewUsage?.coverage.capClass ?? null,
          candidateCount: input.microturn.legalActions.length,
          selectedStableMoveKey: result.agentDecision?.selectedStableMoveKey ?? null,
          encodedStateBuildCount: delta(after, before, 'buildEncodedStateCount'),
          encodedStateCacheObjectHitCount: delta(after, before, 'policyEncodedStateObjectHitCount'),
          encodedStateCacheHashHitCount: delta(after, before, 'policyEncodedStateHashHitCount'),
          encodedStateCacheMissCount: delta(after, before, 'policyEncodedStateMissCount'),
          bytecodeCacheCompileCount: delta(after, before, 'wasmScoreRowBytecodeCompileCount'),
          cacheHits: config.wasmTimingProfile ? delta(after, before, 'wasmScoreRowBytecodeCacheHitCount') : '',
          cacheMisses: config.wasmTimingProfile ? delta(after, before, 'wasmScoreRowBytecodeCacheMissCount') : '',
          cacheCompileTimeMs: config.wasmTimingProfile
            ? round4(delta(after, before, 'wasmScoreRowBytecodeCompileTimeMs'))
            : '',
          wasmScoreRowRouteCount: delta(after, before, 'wasmScoreRowRouteCount'),
          wasmScoreRowUnsupportedCount: delta(after, before, 'wasmScoreRowUnsupportedCount'),
          wasmPreviewCandidateFeatureRowRouteCount: delta(after, before, 'wasmPreviewCandidateFeatureRowRouteCount'),
          wasmPreviewCandidateFeatureRowUnsupportedCount: delta(after, before, 'wasmPreviewCandidateFeatureRowUnsupportedCount'),
          wasmPreviewCandidateFeatureRowOracleFallbackCount: delta(after, before, 'wasmPreviewCandidateFeatureRowOracleFallbackCount'),
          wasmProductionPreviewDriveRouteCount: delta(after, before, 'wasmProductionPreviewDriveRouteCount'),
          wasmProductionPreviewDriveUnsupportedCount: delta(after, before, 'wasmProductionPreviewDriveUnsupportedCount'),
          wasmProductionPreviewDriveUnsupportedReasons: deltaReasonCounts(
            after.wasmProductionPreviewDriveUnsupportedReasonCounts,
            before.wasmProductionPreviewDriveUnsupportedReasonCounts,
          ),
          wasmProductionPreviewDriveBatchCount: delta(after, before, 'wasmProductionPreviewDriveBatchCount'),
          marshalingMs: timingDeltaMs(after.wasmTimingBuckets, before.wasmTimingBuckets, 'marshalingNs'),
          executionMs: timingDeltaMs(after.wasmTimingBuckets, before.wasmTimingBuckets, 'executionNs'),
          deserializationMs: timingDeltaMs(after.wasmTimingBuckets, before.wasmTimingBuckets, 'deserializationNs'),
          wasmCallCount: timingDelta(after.wasmTimingBuckets, before.wasmTimingBuckets, 'callCount'),
          wasmTimingBuckets: deltaTimingBuckets(after.wasmTimingBuckets, before.wasmTimingBuckets),
          bytesSerialized: serializationDelta(after.wasmSerializationStats, before.wasmSerializationStats, 'totalBytes'),
          serializationCallCount: serializationDelta(after.wasmSerializationStats, before.wasmSerializationStats, 'callCount'),
          wasmSerializationStats: deltaSerializationStats(after.wasmSerializationStats, before.wasmSerializationStats),
          cacheWriteMs: serializationDelta(after.bytecodeInputCacheWriteStats, before.bytecodeInputCacheWriteStats, 'totalWriteMs'),
          cacheWriteBytes: serializationDelta(after.bytecodeInputCacheWriteStats, before.bytecodeInputCacheWriteStats, 'totalWriteBytes'),
          cacheWriteCount: serializationDelta(after.bytecodeInputCacheWriteStats, before.bytecodeInputCacheWriteStats, 'writeCount'),
          tokenStateIndexBuildCount: delta(after, before, 'tokenStateIndexBuildCount'),
          persistentTokenStateIndexCacheHitCount: delta(after, before, 'persistentTokenStateIndexCacheHitCount'),
          persistentTokenStateIndexCacheMissCount: delta(after, before, 'persistentTokenStateIndexCacheMissCount'),
          persistentTokenStateIndexCacheWriteCount: delta(after, before, 'persistentTokenStateIndexCacheWriteCount'),
          zobristKeyCacheHitCount: delta(after, before, 'zobristKeyCacheHitCount'),
          zobristKeyCacheMissCount: delta(after, before, 'zobristKeyCacheMissCount'),
          staticRebuildCount: deltaStatic(after, before),
          hotPathBuckets,
        });
        return result;
      },
    };
  });
}

function resetCounters(internals) {
  internals.setHotPathProfilingEnabled(config.profileBuckets);
  internals.resetHotPathProfilerCounters();
  internals.staticRebuildCounters.reset();
  internals.tokenStateIndexInternals.resetBuildTokenStateIndexCount();
  internals.zobristInternals.resetZobristKeyCounters();
  internals.policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  internals.policyWasmRuntimeInternals.resetPolicyWasmTimingBuckets();
  internals.policyWasmRuntimeInternals.resetPolicyWasmSerializationStats();
  internals.policyWasmProductionPreviewDriveInternals.resetProductionPreviewDriveBatchCount();
  internals.policyEncodedStateCacheInternals.resetCounts();
}

function readCounters(internals) {
  return {
    tokenStateIndexBuildCount: internals.tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    persistentTokenStateIndexCacheHitCount:
      internals.tokenStateIndexInternals.getPersistentTokenStateIndexCacheHitCount(),
    persistentTokenStateIndexCacheMissCount:
      internals.tokenStateIndexInternals.getPersistentTokenStateIndexCacheMissCount(),
    persistentTokenStateIndexCacheWriteCount:
      internals.tokenStateIndexInternals.getPersistentTokenStateIndexCacheWriteCount(),
    zobristKeyCacheHitCount: internals.zobristInternals.getZobristKeyCacheHitCount(),
    zobristKeyCacheMissCount: internals.zobristInternals.getZobristKeyCacheMissCount(),
    wasmScoreRowRouteCount: internals.policyWasmRuntimeInternals.getProductionScoreRowRouteCount(),
    wasmScoreRowUnsupportedCount: internals.policyWasmRuntimeInternals.getProductionScoreRowUnsupportedCount(),
    wasmScoreRowBytecodeCompileCount:
      internals.policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(),
    wasmScoreRowBytecodeCacheHitCount:
      internals.policyWasmRuntimeInternals.getProductionScoreRowBytecodeCacheHitCount(),
    wasmScoreRowBytecodeCacheMissCount:
      internals.policyWasmRuntimeInternals.getProductionScoreRowBytecodeCacheMissCount(),
    wasmScoreRowBytecodeCompileTimeMs:
      internals.policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileTimeMs(),
    wasmPreviewCandidateFeatureRowRouteCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(),
    wasmPreviewCandidateFeatureRowUnsupportedCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount(),
    wasmPreviewCandidateFeatureRowOracleFallbackCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowOracleFallbackCount(),
    wasmProductionPreviewDriveRouteCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewDriveRouteCount(),
    wasmProductionPreviewDriveUnsupportedCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewDriveUnsupportedCount(),
    wasmProductionPreviewDriveUnsupportedReasonCounts:
      internals.policyWasmRuntimeInternals.getProductionPreviewDriveUnsupportedReasonCounts(),
    wasmProductionPreviewDriveBatchCount:
      internals.policyWasmProductionPreviewDriveInternals.getProductionPreviewDriveBatchCount(),
    wasmTimingBuckets:
      internals.policyWasmRuntimeInternals.snapshotPolicyWasmTimingBuckets(),
    wasmSerializationStats:
      internals.policyWasmRuntimeInternals.snapshotPolicyWasmSerializationStats(),
    bytecodeInputCacheWriteStats:
      internals.policyWasmRuntimeInternals.snapshotPolicyWasmBytecodeInputCacheWriteStats(),
    policyEncodedStateObjectHitCount:
      internals.policyEncodedStateCacheInternals.getObjectHitCount(),
    policyEncodedStateHashHitCount:
      internals.policyEncodedStateCacheInternals.getHashHitCount(),
    policyEncodedStateMissCount:
      internals.policyEncodedStateCacheInternals.getMissCount(),
    ...internals.staticRebuildCounters.snapshot(),
  };
}

function buildRollup(perSeed, decisions) {
  const perClass = aggregateRows(decisions, (row) => row.microturnClass);
  const perAxis = aggregateRows(decisions, (row) => `${row.microturnClass}|${row.previewBranch}`);
  const slowRows = decisions.filter((row) => SLOW_TIER_SEEDS.has(row.seed));
  const fastRows = decisions.filter((row) => FAST_TIER_SEEDS.has(row.seed));
  const slowClass = aggregateRows(slowRows, (row) => row.microturnClass);
  const fastClass = aggregateRows(fastRows, (row) => row.microturnClass);
  const deltas = [];
  for (const [microturnClass, slow] of slowClass.byKey) {
    const fast = fastClass.byKey.get(microturnClass);
    if (fast === undefined || fast.meanMs <= 0) {
      continue;
    }
    deltas.push({
      microturnClass,
      slowDecisions: slow.count,
      fastDecisions: fast.count,
      slowMeanMs: slow.meanMs,
      fastMeanMs: fast.meanMs,
      ratio: round4(slow.meanMs / fast.meanMs),
      slowTotalMs: slow.totalMs,
      fastTotalMs: fast.totalMs,
    });
  }
  deltas.sort((left, right) =>
    right.ratio - left.ratio
    || right.slowTotalMs - left.slowTotalMs
    || left.microturnClass.localeCompare(right.microturnClass),
  );

  const slowAxes = aggregateRows(slowRows, (row) => `${row.microturnClass}|${row.previewBranch}`)
    .rows
    .slice()
    .sort((left, right) => right.totalMs - left.totalMs || left.key.localeCompare(right.key))
    .slice(0, config.topN)
    .map((row) => {
      const [microturnClass, previewBranch] = row.key.split('|');
      return { ...row, microturnClass, previewBranch };
    });

  return {
    date: config.date,
    command: `${config.wasmTimingProfile ? 'POLICY_WASM_TIMING_PROFILE=1 ' : ''}node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds ${formatSeedRange(config.seeds)} --timeout-ms ${config.timeoutMs} --date ${config.date}${config.profileBuckets ? ' --profile-buckets' : ''}${config.noWasm ? ' --no-wasm' : ''}`,
    noWasm: config.noWasm,
    wasmTimingProfile: config.wasmTimingProfile,
    maxTurns: config.maxTurns,
    timeoutMs: config.timeoutMs,
    seedCount: config.seeds.length,
    perSeed,
    perDecisionClass: perClass.rows,
    perAxis: perAxis.rows,
    topNHotAxes: slowAxes,
    fastSlowDeltas: deltas,
    decisions,
    acceptance: {
      allSeedsOk: perSeed.every((row) => row.status === 'OK'),
      hotAxisOver3x: deltas.some((row) => row.ratio > 3),
      reportRowCount: decisions.length,
    },
  };
}

function aggregateRows(rows, keyFn) {
  const byKey = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = byKey.get(key) ?? {
      key,
      count: 0,
      totalMs: 0,
      values: [],
      candidateCountTotal: 0,
      encodedStateBuildCount: 0,
      encodedStateCacheObjectHitCount: 0,
      encodedStateCacheHashHitCount: 0,
      encodedStateCacheMissCount: 0,
      bytecodeCacheCompileCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheCompileTimeMs: 0,
      wasmProductionPreviewDriveRouteCount: 0,
      wasmProductionPreviewDriveUnsupportedCount: 0,
      wasmPreviewCandidateFeatureRowOracleFallbackCount: 0,
      wasmProductionPreviewDriveUnsupportedReasons: new Map(),
      wasmProductionPreviewDriveBatchCount: 0,
      marshalingMs: 0,
      executionMs: 0,
      deserializationMs: 0,
      wasmCallCount: 0,
      wasmTimingBuckets: new Map(),
      bytesSerialized: 0,
      serializationCallCount: 0,
      wasmSerializationStats: new Map(),
      cacheWriteMs: 0,
      cacheWriteBytes: 0,
      cacheWriteCount: 0,
      tokenStateIndexBuildCount: 0,
      staticRebuildCount: 0,
      hotPathBuckets: new Map(),
    };
    bucket.count += 1;
    bucket.totalMs += row.elapsedMs;
    bucket.values.push(row.elapsedMs);
    bucket.candidateCountTotal += row.candidateCount;
    bucket.encodedStateBuildCount += row.encodedStateBuildCount;
    bucket.encodedStateCacheObjectHitCount += row.encodedStateCacheObjectHitCount;
    bucket.encodedStateCacheHashHitCount += row.encodedStateCacheHashHitCount;
    bucket.encodedStateCacheMissCount += row.encodedStateCacheMissCount;
    bucket.bytecodeCacheCompileCount += row.bytecodeCacheCompileCount;
    bucket.cacheHits += Number(row.cacheHits || 0);
    bucket.cacheMisses += Number(row.cacheMisses || 0);
    bucket.cacheCompileTimeMs += Number(row.cacheCompileTimeMs || 0);
    bucket.wasmProductionPreviewDriveRouteCount += row.wasmProductionPreviewDriveRouteCount;
    bucket.wasmProductionPreviewDriveUnsupportedCount += row.wasmProductionPreviewDriveUnsupportedCount;
    bucket.wasmPreviewCandidateFeatureRowOracleFallbackCount += row.wasmPreviewCandidateFeatureRowOracleFallbackCount;
    addReasonCounts(bucket.wasmProductionPreviewDriveUnsupportedReasons, row.wasmProductionPreviewDriveUnsupportedReasons);
    bucket.wasmProductionPreviewDriveBatchCount += row.wasmProductionPreviewDriveBatchCount;
    bucket.marshalingMs += row.marshalingMs;
    bucket.executionMs += row.executionMs;
    bucket.deserializationMs += row.deserializationMs;
    bucket.wasmCallCount += row.wasmCallCount;
    addTimingBuckets(bucket.wasmTimingBuckets, row.wasmTimingBuckets);
    bucket.bytesSerialized += row.bytesSerialized;
    bucket.serializationCallCount += row.serializationCallCount;
    addSerializationStats(bucket.wasmSerializationStats, row.wasmSerializationStats);
    bucket.cacheWriteMs += row.cacheWriteMs;
    bucket.cacheWriteBytes += row.cacheWriteBytes;
    bucket.cacheWriteCount += row.cacheWriteCount;
    bucket.tokenStateIndexBuildCount += row.tokenStateIndexBuildCount;
    bucket.staticRebuildCount += row.staticRebuildCount;
    for (const hotPathBucket of row.hotPathBuckets ?? []) {
      const current = bucket.hotPathBuckets.get(hotPathBucket.key) ?? { count: 0, totalMs: 0 };
      bucket.hotPathBuckets.set(hotPathBucket.key, {
        count: current.count + hotPathBucket.count,
        totalMs: current.totalMs + hotPathBucket.totalMs,
      });
    }
    byKey.set(key, bucket);
  }
  const rowsOut = [...byKey.values()].map((bucket) => {
    const values = bucket.values.slice().sort((left, right) => left - right);
    return {
      key: bucket.key,
      count: bucket.count,
      totalMs: round2(bucket.totalMs),
      meanMs: round4(bucket.totalMs / bucket.count),
      p95Ms: round4(percentile(values, 0.95)),
      maxMs: round4(values.at(-1) ?? 0),
      meanCandidateCount: round4(bucket.candidateCountTotal / bucket.count),
      encodedStateBuildCount: bucket.encodedStateBuildCount,
      encodedStateCacheObjectHitCount: bucket.encodedStateCacheObjectHitCount,
      encodedStateCacheHashHitCount: bucket.encodedStateCacheHashHitCount,
      encodedStateCacheMissCount: bucket.encodedStateCacheMissCount,
      bytecodeCacheCompileCount: bucket.bytecodeCacheCompileCount,
      cacheHits: bucket.cacheHits,
      cacheMisses: bucket.cacheMisses,
      cacheCompileTimeMs: round4(bucket.cacheCompileTimeMs),
      wasmProductionPreviewDriveRouteCount: bucket.wasmProductionPreviewDriveRouteCount,
      wasmProductionPreviewDriveUnsupportedCount: bucket.wasmProductionPreviewDriveUnsupportedCount,
      wasmPreviewCandidateFeatureRowOracleFallbackCount: bucket.wasmPreviewCandidateFeatureRowOracleFallbackCount,
      wasmProductionPreviewDriveUnsupportedReasons: reasonRows(bucket.wasmProductionPreviewDriveUnsupportedReasons),
      wasmProductionPreviewDriveBatchCount: bucket.wasmProductionPreviewDriveBatchCount,
      marshalingMs: round4(bucket.marshalingMs),
      executionMs: round4(bucket.executionMs),
      deserializationMs: round4(bucket.deserializationMs),
      wasmCallCount: bucket.wasmCallCount,
      wasmTimingBuckets: timingRows(bucket.wasmTimingBuckets),
      bytesSerialized: bucket.bytesSerialized,
      serializationCallCount: bucket.serializationCallCount,
      wasmSerializationStats: serializationRows(bucket.wasmSerializationStats),
      cacheWriteMs: round4(bucket.cacheWriteMs),
      cacheWriteBytes: bucket.cacheWriteBytes,
      cacheWriteCount: bucket.cacheWriteCount,
      tokenStateIndexBuildCount: bucket.tokenStateIndexBuildCount,
      staticRebuildCount: bucket.staticRebuildCount,
      hotPathBuckets: [...bucket.hotPathBuckets.entries()]
        .map(([key, hotPathBucket]) => ({
          key,
          count: hotPathBucket.count,
          totalMs: round2(hotPathBucket.totalMs),
        }))
        .sort((left, right) => right.totalMs - left.totalMs || left.key.localeCompare(right.key))
        .slice(0, 12),
    };
  }).sort((left, right) => right.totalMs - left.totalMs || left.key.localeCompare(right.key));
  return { byKey: new Map(rowsOut.map((row) => [row.key, row])), rows: rowsOut };
}

function deltaReasonCounts(afterRows, beforeRows) {
  const beforeByKey = new Map((beforeRows ?? []).map((row) => [reasonKey(row), row.count]));
  return (afterRows ?? [])
    .map((row) => ({
      unsupportedDriveClass: row.unsupportedDriveClass,
      ...(row.unsupportedOwner === undefined ? {} : { unsupportedOwner: row.unsupportedOwner }),
      reason: row.reason,
      ...projectedStateReasonFields(row),
      count: row.count - (beforeByKey.get(reasonKey(row)) ?? 0),
    }))
    .filter((row) => row.count > 0)
    .sort(compareReasonRows);
}

function addReasonCounts(target, rows) {
  for (const row of rows ?? []) {
    const key = reasonKey(row);
    const current = target.get(key);
    target.set(key, {
      unsupportedDriveClass: row.unsupportedDriveClass,
      ...(row.unsupportedOwner === undefined ? {} : { unsupportedOwner: row.unsupportedOwner }),
      reason: row.reason,
      ...projectedStateReasonFields(row),
      count: (current?.count ?? 0) + row.count,
    });
  }
}

function reasonRows(rowsByKey) {
  return [...rowsByKey.values()].sort(compareReasonRows);
}

function reasonKey(row) {
  return `${row.unsupportedDriveClass}\u0000${row.unsupportedOwner ?? ''}\u0000${row.reason}`
    + `\u0000${row.projectedStateBoundaryKind ?? ''}\u0000${row.projectedStateClassification ?? ''}`;
}

function compareReasonRows(left, right) {
  return right.count - left.count
    || compareCodepoint(left.unsupportedDriveClass, right.unsupportedDriveClass)
    || compareCodepoint(left.unsupportedOwner ?? '', right.unsupportedOwner ?? '')
    || compareCodepoint(left.reason, right.reason)
    || compareCodepoint(left.projectedStateBoundaryKind ?? '', right.projectedStateBoundaryKind ?? '')
    || compareCodepoint(left.projectedStateClassification ?? '', right.projectedStateClassification ?? '');
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectedStateReasonFields(row) {
  const fields = {};
  if (row.projectedStateBoundaryKind !== undefined) {
    fields.projectedStateBoundaryKind = row.projectedStateBoundaryKind;
  }
  if (row.projectedStateClassification !== undefined) {
    fields.projectedStateClassification = row.projectedStateClassification;
  }
  return fields;
}

function snapshotDecisionHotPathBuckets(snapshotHotPathProfilerCounters) {
  return snapshotHotPathProfilerCounters()
    .filter((bucket) => bucket.count > 0 || bucket.totalMs > 0)
    .map((bucket) => ({
      key: bucket.key,
      count: bucket.count,
      totalMs: round4(bucket.totalMs),
    }))
    .sort((left, right) => right.totalMs - left.totalMs || left.key.localeCompare(right.key));
}

function formatSeedProgress(summary) {
  if (summary.status === 'OK') {
    return `seed ${summary.seed}: DONE ${summary.elapsedMs}ms stop=${summary.stopReason} decisions=${summary.decisions}\n`;
  }
  return `seed ${summary.seed}: ${summary.status} ${summary.elapsedMs}ms error=${summary.error}\n`;
}

function childOutputPath(seed) {
  return join('/tmp', `ludoforge-173-decomposition-${process.pid}-${seed}.json`);
}

function findRepoRoot(start) {
  let current = start;
  for (let index = 0; index < 10; index += 1) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = dirname(current);
  }
  return process.cwd();
}

function ensureDistExists() {
  if (!existsSync(join(DIST_ROOT, 'src'))) {
    fail('packages/engine/dist is missing; run `pnpm -F @ludoforge/engine build` first');
  }
}

function delta(after, before, key) {
  return after[key] - before[key];
}

function deltaStatic(after, before) {
  return totalStaticRebuildCount(after) - totalStaticRebuildCount(before);
}

function percentile(sortedAsc, fraction) {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const rank = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(fraction * sortedAsc.length) - 1));
  return sortedAsc[rank];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function relativeToRepo(path) {
  return path.startsWith(`${REPO_ROOT}/`) ? path.slice(REPO_ROOT.length + 1) : path;
}

function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}
