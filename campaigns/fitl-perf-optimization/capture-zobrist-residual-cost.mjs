#!/usr/bin/env node
/**
 * Capture Spec 194 Zobrist residual-cost counters for FITL workload shapes.
 *
 * The script is intentionally observation-only: it enables the existing
 * hot-path profiler side channel, runs each workload once profiled and once
 * unprofiled, and writes a markdown report under reports/perf-baseline/.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();
const ENGINE_ROOT = join(REPO_ROOT, 'packages', 'engine');
const REPORT_ROOT = join(REPO_ROOT, 'reports', 'perf-baseline');

const WORKLOADS = [
  {
    key: 'parity-drive',
    seed: 42,
    maxTurns: 10,
    profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
    options: { kernel: { verifyIncrementalHash: true }, skipDeltas: true, traceRetention: 'finalStateOnly' },
  },
  {
    key: 'bounded-termination-1002',
    seed: 1002,
    maxTurns: 200,
    profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
    options: { skipDeltas: true, traceRetention: 'finalStateOnly' },
  },
  {
    key: 'diagnose-parity-runGame-1001',
    seed: 1001,
    maxTurns: 50,
    profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
    options: { traceRetention: 'full', snapshotDepth: 'standard' },
  },
  {
    key: 'policy-preview-parity-arvn-1008',
    seed: 1008,
    maxTurns: 1,
    profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
    options: { skipDeltas: true, traceRetention: 'finalStateOnly' },
  },
  {
    key: 'arvn-tournament-parallel',
    seed: 1000,
    maxTurns: 1,
    profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
    options: { skipDeltas: true, traceRetention: 'finalStateOnly' },
  },
];

const HOT_KEYS = {
  weakHit: 'zobrist:decisionStackFrameWeakCacheHit',
  encode: 'zobrist:encodeDecisionStackFrame',
  localHit: 'zobrist:decisionStackFrameRunLocalCacheHit',
  localMiss: 'zobrist:decisionStackFrameRunLocalCacheMiss',
  encodedChars: 'zobrist:decisionStackFrameEncodedChars',
  digest: 'zobrist:digestDecisionStackFrame',
};

const PLAYER_COUNT = 4;
const DATE = new Date().toISOString().slice(0, 10);

const [
  kernel,
  agentsModule,
  simModule,
  cnlModule,
] = await Promise.all([
  import(join(ENGINE_ROOT, 'dist/src/kernel/index.js')),
  import(join(ENGINE_ROOT, 'dist/src/agents/index.js')),
  import(join(ENGINE_ROOT, 'dist/src/sim/index.js')),
  import(join(ENGINE_ROOT, 'dist/src/cnl/index.js')),
]);

const {
  assertValidatedGameDef,
  createGameDefRuntime,
  resetHotPathProfilerCounters,
  setHotPathProfilingEnabled,
  snapshotHotPathProfilerCounters,
} = kernel;
const { PolicyAgent } = agentsModule;
const { runGame } = simModule;
const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } = cnlModule;

const args = new Set(process.argv.slice(2));
const smoke = args.has('--smoke');
const workloadFilter = readFlagValue('--workload');
const workloads = workloadFilter === null
  ? WORKLOADS
  : WORKLOADS.filter((workload) => workload.key === workloadFilter);

if (workloads.length === 0) {
  throw new Error(`Unknown --workload ${workloadFilter}`);
}

mkdirSync(REPORT_ROOT, { recursive: true });
const def = compileFitlGameDef();
const headSha = currentHeadSha();
const results = [];

for (const workload of workloads) {
  const effectiveWorkload = smoke ? { ...workload, maxTurns: Math.min(workload.maxTurns, 1) } : workload;
  process.stderr.write(`[zobrist-residual] ${effectiveWorkload.key}: profiled run\n`);
  const profiled = runProfiledWorkload(def, effectiveWorkload, true);
  process.stderr.write(`[zobrist-residual] ${effectiveWorkload.key}: unprofiled run\n`);
  const unprofiled = runProfiledWorkload(def, effectiveWorkload, false);
  results.push(summarizeWorkload(effectiveWorkload, profiled, unprofiled));
}

const aggregate = summarizeAggregate(results);
const reportPath = join(REPORT_ROOT, `zobrist-residual-cost-${DATE}${smoke ? '-smoke' : ''}.md`);
writeFileSync(reportPath, renderReport({ headSha, smoke, results, aggregate, reportPath }), 'utf8');

process.stdout.write(`${JSON.stringify({
  kind: 'zobrist-residual-cost-profile',
  headSha,
  smoke,
  reportPath,
  workloads: results,
  aggregate,
}, null, 2)}\n`);

function readFlagValue(name) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function compileFitlGameDef() {
  const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
  const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
  const staged = runGameSpecStagesFromBundle(bundle);
  if (staged.validation.blocked || staged.compilation.blocked || !staged.compilation.result?.gameDef) {
    const diagnostics = [
      ...(staged.validation.diagnostics ?? []),
      ...(staged.compilation.diagnostics ?? []),
    ].map((diagnostic) => `${diagnostic.severity}: ${diagnostic.message}`).join('\n');
    throw new Error(`FITL compile failed\n${diagnostics}`);
  }
  return assertValidatedGameDef(staged.compilation.result.gameDef);
}

function runProfiledWorkload(def, workload, profileHotPath) {
  resetHotPathProfilerCounters();
  const previousEnv = process.env.ENGINE_HOT_PATH_PROFILE;
  if (profileHotPath) {
    process.env.ENGINE_HOT_PATH_PROFILE = '1';
  } else {
    delete process.env.ENGINE_HOT_PATH_PROFILE;
  }
  setHotPathProfilingEnabled(profileHotPath);
  const runtime = createGameDefRuntime(def);
  const agents = workload.profiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
  const start = performance.now();
  try {
    const trace = runGame(
      def,
      workload.seed,
      agents,
      workload.maxTurns,
      PLAYER_COUNT,
      workload.options,
      runtime,
    );
    const wallClockMs = performance.now() - start;
    return {
      wallClockMs,
      finalStateHash: String(trace.finalState.stateHash),
      stopReason: trace.stopReason,
      decisions: trace.decisions.length,
      counters: profileHotPath ? snapshotHotPathProfilerCounters() : [],
    };
  } finally {
    setHotPathProfilingEnabled(false);
    resetHotPathProfilerCounters();
    if (previousEnv === undefined) {
      delete process.env.ENGINE_HOT_PATH_PROFILE;
    } else {
      process.env.ENGINE_HOT_PATH_PROFILE = previousEnv;
    }
  }
}

function summarizeWorkload(workload, profiled, unprofiled) {
  const buckets = new Map(profiled.counters.map((bucket) => [bucket.key, bucket]));
  const weakHits = countOf(buckets, HOT_KEYS.weakHit);
  const localHits = countOf(buckets, HOT_KEYS.localHit);
  const localMisses = countOf(buckets, HOT_KEYS.localMiss);
  const encodeBucket = bucketOf(buckets, HOT_KEYS.encode);
  const digestBucket = bucketOf(buckets, HOT_KEYS.digest);
  const encodedChars = countOf(buckets, HOT_KEYS.encodedChars);
  const encodeCalls = localHits + localMisses;
  const totalCalls = weakHits + encodeCalls;
  if (totalCalls === 0 || encodeCalls === 0 || digestBucket.count === 0) {
    throw new Error(`${workload.key}: expected non-zero Zobrist hot-path counters`);
  }

  return {
    workload: workload.key,
    seed: workload.seed,
    maxTurns: workload.maxTurns,
    profiledWallClockMs: round3(profiled.wallClockMs),
    unprofiledWallClockMs: round3(unprofiled.wallClockMs),
    overheadRatio: round4(profiled.wallClockMs / unprofiled.wallClockMs),
    finalStateHash: profiled.finalStateHash,
    unprofiledFinalStateHash: unprofiled.finalStateHash,
    stopReason: profiled.stopReason,
    decisions: profiled.decisions,
    weakHits,
    localHits,
    localMisses,
    totalCalls,
    encodeCalls,
    digestCalls: digestBucket.count,
    encodedChars,
    identityHitRate: round4(weakHits / totalCalls),
    contentHitRate: round4(localHits / encodeCalls),
    encodeCallRate: round4(encodeCalls / totalCalls),
    meanEncodeMs: round6(encodeBucket.totalMs / encodeBucket.count),
    meanDigestMs: round6(digestBucket.totalMs / digestBucket.count),
    meanEncodedCharsPerMiss: round2(encodedChars / Math.max(localMisses, 1)),
    encodeTotalMs: round3(encodeBucket.totalMs),
    digestTotalMs: round3(digestBucket.totalMs),
  };
}

function bucketOf(buckets, key) {
  return buckets.get(key) ?? { key, count: 0, totalMs: 0 };
}

function countOf(buckets, key) {
  return bucketOf(buckets, key).count;
}

function summarizeAggregate(results) {
  const totalCalls = sum(results, 'totalCalls');
  const encodeCalls = sum(results, 'encodeCalls');
  const localHits = sum(results, 'localHits');
  const localMisses = sum(results, 'localMisses');
  const weakHits = sum(results, 'weakHits');
  const digestCalls = sum(results, 'digestCalls');
  const encodedChars = sum(results, 'encodedChars');
  const encodeTotalMs = sum(results, 'encodeTotalMs');
  const digestTotalMs = sum(results, 'digestTotalMs');
  const identityHitRate = weakHits / totalCalls;
  const contentHitRate = localHits / encodeCalls;
  const encodeCallRate = encodeCalls / totalCalls;
  const meanEncodeMs = encodeTotalMs / encodeCalls;
  const meanDigestMs = digestTotalMs / digestCalls;
  const meanEncodedCharsPerMiss = encodedChars / Math.max(localMisses, 1);
  const h1Accepted = identityHitRate < 0.25;
  const h2Accepted = encodeCallRate > 0.75;
  const h3Accepted = encodeTotalMs > digestTotalMs;
  return {
    identityHitRate: round4(identityHitRate),
    contentHitRate: round4(contentHitRate),
    encodeCallRate: round4(encodeCallRate),
    meanEncodeMs: round6(meanEncodeMs),
    meanDigestMs: round6(meanDigestMs),
    meanEncodedCharsPerMiss: round2(meanEncodedCharsPerMiss),
    encodeTotalMs: round3(encodeTotalMs),
    digestTotalMs: round3(digestTotalMs),
    verdicts: {
      H1: h1Accepted ? 'accepted' : 'refined',
      H2: h2Accepted ? 'accepted' : 'refined',
      H3: h3Accepted ? 'accepted' : 'refined',
    },
    selectedLever: selectLever({ h1Accepted, h3Accepted, meanEncodedCharsPerMiss, identityHitRate }),
  };
}

function selectLever({ h1Accepted, h3Accepted, meanEncodedCharsPerMiss, identityHitRate }) {
  if (h1Accepted && h3Accepted) {
    return '2A - Binary-canonical encoding';
  }
  if (meanEncodedCharsPerMiss > 2048) {
    return '2B - Encoded-surface reduction';
  }
  if (identityHitRate < 0.25) {
    return '2C - Structural-identity cache';
  }
  return '2D - Cost-is-floor';
}

function renderReport({ headSha, smoke, results, aggregate }) {
  const headingSuffix = smoke ? ' (smoke)' : '';
  return `# Zobrist Residual-Cost Profile${headingSuffix}

**Date**: ${DATE}
**Head**: ${headSha}
**Command**: \`node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs${smoke ? ' --smoke' : ''}\`
**Boundary**: Observation-only; no engine source or test files changed. Existing hot-path buckets expose \`count\` and \`totalMs\`, so this report uses mean per-call timing rather than medians.

## Per-Workload Zobrist Counters

| Workload | Identity hit rate | Content hit rate | Encode-call rate | Mean encode ms/call | Mean digest ms/call | Mean encoded chars/miss | Encode total ms | Digest total ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${results.map((row) => `| \`${row.workload}\` | ${pct(row.identityHitRate)} | ${pct(row.contentHitRate)} | ${pct(row.encodeCallRate)} | ${row.meanEncodeMs} | ${row.meanDigestMs} | ${row.meanEncodedCharsPerMiss} | ${row.encodeTotalMs} | ${row.digestTotalMs} |`).join('\n')}

## Profiled vs Unprofiled Wall Clock

| Workload | Profiled wall-clock s | Unprofiled wall-clock s | Overhead ratio | Final state hash |
|---|---:|---:|---:|---|
${results.map((row) => `| \`${row.workload}\` | ${seconds(row.profiledWallClockMs)} | ${seconds(row.unprofiledWallClockMs)} | ${row.overheadRatio}x | \`${row.finalStateHash}\` |`).join('\n')}

## Hypothesis Verdicts

- **H1 (${aggregate.verdicts.H1})**: aggregate identity-cache hit rate was ${pct(aggregate.identityHitRate)}. The report treats the low-hit hypothesis as accepted below 25%; higher values refine the hypothesis rather than proving object identity churn is the only driver.
- **H2 (${aggregate.verdicts.H2})**: aggregate encode-call rate was ${pct(aggregate.encodeCallRate)} and content-cache hit rate after identity miss was ${pct(aggregate.contentHitRate)}. Content hits still require the encode pass because the encoded JSON string is the cache key.
- **H3 (${aggregate.verdicts.H3})**: aggregate encode total was ${aggregate.encodeTotalMs} ms versus FNV-1a digest total ${aggregate.digestTotalMs} ms, with mean encode ${aggregate.meanEncodeMs} ms/call and mean digest ${aggregate.meanDigestMs} ms/call.

## Phase 2 Lever Selection

**Selected lever**: ${aggregate.selectedLever}

Evidence trail: the decision matrix is applied to the aggregate Phase 1 measurements. Identity-cache hit rate is ${pct(aggregate.identityHitRate)}, encode-call rate is ${pct(aggregate.encodeCallRate)}, mean encoded chars per miss is ${aggregate.meanEncodedCharsPerMiss}, and encode-vs-digest totals are ${aggregate.encodeTotalMs} ms vs ${aggregate.digestTotalMs} ms.

## Raw Counter Summary

| Workload | Weak hits | Content hits | Content misses | Total calls | Encode calls | Digest calls |
|---|---:|---:|---:|---:|---:|---:|
${results.map((row) => `| \`${row.workload}\` | ${row.weakHits} | ${row.localHits} | ${row.localMisses} | ${row.totalCalls} | ${row.encodeCalls} | ${row.digestCalls} |`).join('\n')}
`;
}

function currentHeadSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : '';
    if (stdout.length > 0) {
      return stdout;
    }
    return 'unknown';
  }
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function seconds(ms) {
  return (ms / 1000).toFixed(3);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}
