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
  seeds: parseSeedRange(flagValue('seeds', '1000..1014')),
  timeoutMs: flagPositiveInt('timeout-ms', 400000),
  maxTurns: flagPositiveInt('max-turns', 200),
  date: flagValue('date', new Date().toISOString().slice(0, 10)),
  outputDir: resolve(REPO_ROOT, flagValue('output-dir', 'reports')),
  topN: flagPositiveInt('top-n', 10),
  childSeed: flagValue('child-seed', undefined),
  childOutput: flagValue('child-output', undefined),
  child: flagBoolean('child'),
  profileBuckets: flagBoolean('profile-buckets'),
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
  const baseName = `fitl-arvn-15-seed-decomposition-${config.date}`;
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

  initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });
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
          wasmScoreRowRouteCount: delta(after, before, 'wasmScoreRowRouteCount'),
          wasmScoreRowUnsupportedCount: delta(after, before, 'wasmScoreRowUnsupportedCount'),
          wasmPreviewCandidateFeatureRowRouteCount: delta(after, before, 'wasmPreviewCandidateFeatureRowRouteCount'),
          wasmPreviewCandidateFeatureRowUnsupportedCount: delta(after, before, 'wasmPreviewCandidateFeatureRowUnsupportedCount'),
          wasmProductionPreviewDriveRouteCount: delta(after, before, 'wasmProductionPreviewDriveRouteCount'),
          wasmProductionPreviewDriveUnsupportedCount: delta(after, before, 'wasmProductionPreviewDriveUnsupportedCount'),
          wasmProductionPreviewDriveBatchCount: delta(after, before, 'wasmProductionPreviewDriveBatchCount'),
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
    wasmPreviewCandidateFeatureRowRouteCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(),
    wasmPreviewCandidateFeatureRowUnsupportedCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount(),
    wasmProductionPreviewDriveRouteCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewDriveRouteCount(),
    wasmProductionPreviewDriveUnsupportedCount:
      internals.policyWasmRuntimeInternals.getProductionPreviewDriveUnsupportedCount(),
    wasmProductionPreviewDriveBatchCount:
      internals.policyWasmProductionPreviewDriveInternals.getProductionPreviewDriveBatchCount(),
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
    command: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds ${formatSeedRange(config.seeds)} --timeout-ms ${config.timeoutMs} --date ${config.date}${config.profileBuckets ? ' --profile-buckets' : ''}`,
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
      wasmProductionPreviewDriveRouteCount: 0,
      wasmProductionPreviewDriveUnsupportedCount: 0,
      wasmProductionPreviewDriveBatchCount: 0,
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
    bucket.wasmProductionPreviewDriveRouteCount += row.wasmProductionPreviewDriveRouteCount;
    bucket.wasmProductionPreviewDriveUnsupportedCount += row.wasmProductionPreviewDriveUnsupportedCount;
    bucket.wasmProductionPreviewDriveBatchCount += row.wasmProductionPreviewDriveBatchCount;
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
      wasmProductionPreviewDriveRouteCount: bucket.wasmProductionPreviewDriveRouteCount,
      wasmProductionPreviewDriveUnsupportedCount: bucket.wasmProductionPreviewDriveUnsupportedCount,
      wasmProductionPreviewDriveBatchCount: bucket.wasmProductionPreviewDriveBatchCount,
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

function classifyMicroturn(decision, def) {
  if (decision.kind === 'actionSelection') {
    return String(decision.actionId);
  }
  const decisionKey = String(decision.decisionKey ?? '');
  const pipelineIndex = Number(decisionKey.match(/doc\.actionPipelines\.(\d+)/)?.[1]);
  const actionIndex = Number(decisionKey.match(/doc\.actions\.(\d+)/)?.[1]);
  const base = Number.isSafeInteger(pipelineIndex)
    ? String(def.actionPipelines?.[pipelineIndex]?.actionId ?? decision.kind)
    : Number.isSafeInteger(actionIndex)
      ? String(def.actions?.[actionIndex]?.id ?? decision.kind)
      : decisionKey.includes('doc.eventDecks.')
        ? 'event-decision'
        : decision.kind;
  if (decision.kind === 'chooseNStep') {
    return `${base}:chooseNStep:${decision.command}`;
  }
  if (decision.kind === 'chooseOne') {
    return `${base}:chooseOne`;
  }
  if (decision.kind === 'stochasticResolve') {
    return `${base}:stochasticResolve`;
  }
  if (decision.kind === 'outcomeGrantResolve') {
    return `outcomeGrantResolve:${decision.grantId}`;
  }
  if (decision.kind === 'turnRetirement') {
    return 'turnRetirement';
  }
  return decision.kind;
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

function parseSeedRange(raw) {
  if (raw.includes('..')) {
    const [left, right] = raw.split('..').map((part) => parsePositiveInt(part, 'seeds'));
    if (right < left) {
      fail(`--seeds range must be ascending; got ${raw}`);
    }
    return Array.from({ length: right - left + 1 }, (_unused, index) => left + index);
  }
  return raw.split(',').filter(Boolean).map((part) => parsePositiveInt(part.trim(), 'seeds'));
}

function formatSeedRange(seeds) {
  if (seeds.length > 1 && seeds.every((seed, index) => index === 0 || seed === seeds[index - 1] + 1)) {
    return `${seeds[0]}..${seeds.at(-1)}`;
  }
  return seeds.join(',');
}

function flagBoolean(name) {
  return args.includes(`--${name}`);
}

function flagValue(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1];
}

function flagPositiveInt(name, fallback) {
  const raw = flagValue(name, undefined);
  return raw === undefined ? fallback : parsePositiveInt(raw, name);
}

function parsePositiveInt(raw, name) {
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`--${name} must be a positive integer; got "${raw}"`);
  }
  return value;
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
