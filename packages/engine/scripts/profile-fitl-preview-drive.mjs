#!/usr/bin/env node
// Scoped repro harness for the FITL policy-preview drive perf regression
// tracked by tickets/POLPREVDRIVE-001.md.
//
// Runs `runGame` against the FITL production fixture under
// `verifyIncrementalHash: true`, with one or more named PolicyAgent profiles,
// at a configurable seed/turn budget, and prints a per-region timing summary
// suitable for comparing PR vs main.
//
// Designed to fit WSL2 budgets (default: 1 seed × 50 turns × 1 baseline
// profile, < 60 s, < 500 MB RAM) so it can be wrapped under `node --cpu-prof`
// without hanging the host.
//
// This is NOT a test. It does not assert. It exits 0 on success.
//
// Examples:
//   node packages/engine/scripts/profile-fitl-preview-drive.mjs
//   node packages/engine/scripts/profile-fitl-preview-drive.mjs --maxTurns 30
//   node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll
//   node packages/engine/scripts/profile-fitl-preview-drive.mjs --noVerifyIncrementalHash
//   node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --perCard --profileBuckets
//   node --cpu-prof --cpu-prof-dir=/tmp/cpu-profile \
//     packages/engine/scripts/profile-fitl-preview-drive.mjs --label pr

import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');

const args = process.argv.slice(2);

const flagBoolean = (name) => args.includes(`--${name}`);
const flagValue = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) {
    return fallback;
  }
  return args[idx + 1];
};
const flagPositiveInt = (name, fallback) => {
  const raw = flagValue(name, undefined);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    process.stderr.write(`ERROR: --${name} must be a positive integer; got "${raw}".\n`);
    process.exit(1);
  }
  return value;
};

const config = {
  seed: flagPositiveInt('seed', 42),
  maxTurns: flagPositiveInt('maxTurns', 50),
  playerCount: flagPositiveInt('playerCount', 4),
  profileId: flagValue('profileId', 'us-baseline'),
  profilesAll: flagBoolean('profilesAll'),
  verifyIncrementalHash: !flagBoolean('noVerifyIncrementalHash'),
  perCard: flagBoolean('perCard'),
  profileBuckets: flagBoolean('profileBuckets'),
  retainDecisions: flagBoolean('retainDecisions'),
  warmup: flagBoolean('warmup'),
  label: flagValue('label', 'run'),
};

const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'];

const [
  { PolicyAgent, initializePolicyWasmRuntimeSync },
  { assertValidatedGameDef, createGameDefRuntime, createPerfProfiler },
  { runGame },
  { getFitlProductionFixture },
  { __internal_for_tests: tokenStateIndexInternals },
  { __internal_for_tests: policyPreviewInternals },
  { __internal_for_tests: policyWasmRuntimeInternals },
] = await Promise.all([
  import(join(DIST_ROOT, 'src', 'agents', 'index.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
  import(join(DIST_ROOT, 'src', 'sim', 'index.js')),
  import(join(DIST_ROOT, 'test', 'helpers', 'production-spec-helpers.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'token-state-index.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-preview.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-runtime.js')),
]);

initializePolicyWasmRuntimeSync();

const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
const runtime = createGameDefRuntime(def);

// FITL seat order matches FITL_BASELINE_PROFILES so we can pin each running
// profile to its seat under --profilesAll (the per-agent override changes the
// running profile away from `def.agents.bindingsBySeat`'s catalog default).
const FITL_SEAT_ORDER = ['us', 'arvn', 'nva', 'vc'];
const buildSeatToProfileId = () => {
  const map = new Map();
  if (config.profilesAll) {
    FITL_SEAT_ORDER.forEach((seatId, index) => {
      map.set(seatId, FITL_BASELINE_PROFILES[index]);
    });
  } else {
    for (const seatId of FITL_SEAT_ORDER) {
      map.set(seatId, config.profileId);
    }
  }
  // Backfill any unseen seats with the catalog default so non-FITL games still resolve.
  const bindings = def.agents?.bindingsBySeat ?? {};
  for (const [seatId, profileId] of Object.entries(bindings)) {
    if (!map.has(seatId)) {
      map.set(seatId, profileId);
    }
  }
  return map;
};
const seatToProfileId = buildSeatToProfileId();

// (profileId, exitKind) -> Map<depth, count>
const driveExitHistogram = new Map();
let driveExitTotal = 0;
const recordDriveExit = (info) => {
  driveExitTotal += 1;
  const profileId = seatToProfileId.get(info.seatId) ?? `seat:${info.seatId}`;
  const bucketKey = `${profileId}|${info.kind}`;
  let depthMap = driveExitHistogram.get(bucketKey);
  if (depthMap === undefined) {
    depthMap = new Map();
    driveExitHistogram.set(bucketKey, depthMap);
  }
  depthMap.set(info.depth, (depthMap.get(info.depth) ?? 0) + 1);
};

const buildAgents = () => {
  if (config.profilesAll) {
    return FITL_BASELINE_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
  }
  // Single-profile mode still needs `playerCount` agents — fill the remaining
  // seats with the same profile so legality doesn't change vs production.
  return Array.from({ length: config.playerCount }, () =>
    new PolicyAgent({ profileId: config.profileId, traceLevel: 'summary' }),
  );
};

const runOnce = () => {
  tokenStateIndexInternals.resetBuildTokenStateIndexCount();
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  driveExitHistogram.clear();
  driveExitTotal = 0;
  policyPreviewInternals.setDriveExitSink(recordDriveExit);
  const agents = buildAgents();
  const profiler = config.profileBuckets ? createPerfProfiler() : undefined;
  const startedAt = performance.now();
  const perCardRecorder = config.perCard
    ? createPerCardRecorder(startedAt)
    : undefined;
  const trace = runGame(
    def,
    config.seed,
    agents,
    config.maxTurns,
    config.playerCount,
    {
      kernel: config.verifyIncrementalHash ? { verifyIncrementalHash: true } : undefined,
      skipDeltas: true,
      traceRetention: config.retainDecisions ? 'full' : 'finalStateOnly',
      ...(profiler === undefined ? {} : { profiler }),
      ...(perCardRecorder === undefined ? {} : { decisionHook: perCardRecorder.observe }),
    },
    runtime,
  );
  const elapsedMs = performance.now() - startedAt;
  const perCardRows = perCardRecorder?.finish(elapsedMs) ?? [];
  const turnsCount = trace.turnsCount ?? 0;
  const decisions = trace.decisions?.length ?? 0;
  const stopReason = trace.stopReason ?? 'unknown';
  const driveExitSnapshot = snapshotDriveExitHistogram();
  policyPreviewInternals.setDriveExitSink(undefined);
  return {
    elapsedMs,
    turnsCount,
    decisions,
    stopReason,
    tokenStateIndexBuildCount: tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    draftTokenStateIndexDeltaCount: tokenStateIndexInternals.getDraftTokenStateIndexDeltaCount(),
    draftTokenStateIndexAttachCount: tokenStateIndexInternals.getDraftTokenStateIndexAttachCount(),
    draftTokenStateIndexSnapshotCount: tokenStateIndexInternals.getDraftTokenStateIndexSnapshotCount(),
    draftTokenStateIndexCowCopyCount: tokenStateIndexInternals.getDraftTokenStateIndexCowCopyCount(),
    wasmScoreRowRouteCount: policyWasmRuntimeInternals.getProductionScoreRowRouteCount(),
    wasmScoreRowUnsupportedCount: policyWasmRuntimeInternals.getProductionScoreRowUnsupportedCount(),
    driveExitTotal: driveExitSnapshot.total,
    driveExitBuckets: driveExitSnapshot.buckets,
    driveExitDepthQuantiles: driveExitSnapshot.depthQuantilesByProfile,
    perCardRows,
    profileBuckets: profiler === undefined ? [] : snapshotProfilerBuckets(profiler),
  };
};

function readCounterSnapshot() {
  return {
    tokenStateIndexBuildCount: tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    draftTokenStateIndexDeltaCount: tokenStateIndexInternals.getDraftTokenStateIndexDeltaCount(),
    draftTokenStateIndexAttachCount: tokenStateIndexInternals.getDraftTokenStateIndexAttachCount(),
    draftTokenStateIndexSnapshotCount: tokenStateIndexInternals.getDraftTokenStateIndexSnapshotCount(),
    draftTokenStateIndexCowCopyCount: tokenStateIndexInternals.getDraftTokenStateIndexCowCopyCount(),
    driveExitTotal,
  };
}

function createPerCardRecorder(startedAt) {
  const rows = [];
  let currentTurnCount = 0;
  let currentStartedAtMs = 0;
  let currentCounters = readCounterSnapshot();
  let decisionCount = 0;

  const closeCurrent = (endedAtMs, reason) => {
    const counters = readCounterSnapshot();
    const elapsedMs = endedAtMs - currentStartedAtMs;
    rows.push({
      turnCount: currentTurnCount,
      elapsedMs: round2(elapsedMs),
      decisions: decisionCount,
      closeReason: reason,
      msPerDecision: decisionCount > 0 ? round4(elapsedMs / decisionCount) : null,
      tokenStateIndexBuildCount: counters.tokenStateIndexBuildCount - currentCounters.tokenStateIndexBuildCount,
      draftTokenStateIndexDeltaCount:
        counters.draftTokenStateIndexDeltaCount - currentCounters.draftTokenStateIndexDeltaCount,
      draftTokenStateIndexAttachCount:
        counters.draftTokenStateIndexAttachCount - currentCounters.draftTokenStateIndexAttachCount,
      draftTokenStateIndexSnapshotCount:
        counters.draftTokenStateIndexSnapshotCount - currentCounters.draftTokenStateIndexSnapshotCount,
      draftTokenStateIndexCowCopyCount:
        counters.draftTokenStateIndexCowCopyCount - currentCounters.draftTokenStateIndexCowCopyCount,
      driveExitTotal: counters.driveExitTotal - currentCounters.driveExitTotal,
    });
    decisionCount = 0;
  };

  const openCurrent = (turnCount, startedAtMs) => {
    currentTurnCount = turnCount;
    currentStartedAtMs = startedAtMs;
    currentCounters = readCounterSnapshot();
    decisionCount = 0;
  };

  return {
    observe: (ctx) => {
      if (ctx.kind !== 'decision') {
        return;
      }
      const nowMs = performance.now() - startedAt;
      decisionCount += 1;
      if (ctx.turnCount > currentTurnCount) {
        closeCurrent(nowMs, 'turnCountAdvanced');
        openCurrent(ctx.turnCount, nowMs);
      }
    },
    finish: (elapsedMs) => {
      closeCurrent(elapsedMs, 'runFinished');
      return rows.filter((row) => row.decisions > 0 || row.driveExitTotal > 0 || row.tokenStateIndexBuildCount > 0);
    },
  };
}

function snapshotProfilerBuckets(profiler) {
  const rows = [];
  for (const [key, bucket] of Object.entries(profiler.data)) {
    if (bucket.count > 0 || bucket.totalMs > 0) {
      rows.push({ key, count: bucket.count, totalMs: round2(bucket.totalMs) });
    }
  }
  for (const [key, bucket] of profiler.dynamic) {
    if (bucket.count > 0 || bucket.totalMs > 0) {
      rows.push({ key, count: bucket.count, totalMs: round2(bucket.totalMs) });
    }
  }
  rows.sort((left, right) => right.totalMs - left.totalMs || left.key.localeCompare(right.key));
  return rows;
}

function snapshotDriveExitHistogram() {
  const buckets = [];
  // depthsByProfile[profileId] = number[] of completed-exit depths
  const completedDepthsByProfile = new Map();
  for (const [bucketKey, depthMap] of driveExitHistogram) {
    const [profileId, kind] = bucketKey.split('|');
    const depths = [...depthMap.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([depth, count]) => ({ depth, count }));
    const totalForBucket = depths.reduce((sum, entry) => sum + entry.count, 0);
    buckets.push({ profileId, kind, total: totalForBucket, depths });
    if (kind === 'completed') {
      let depthsForProfile = completedDepthsByProfile.get(profileId);
      if (depthsForProfile === undefined) {
        depthsForProfile = [];
        completedDepthsByProfile.set(profileId, depthsForProfile);
      }
      for (const { depth, count } of depths) {
        for (let index = 0; index < count; index += 1) {
          depthsForProfile.push(depth);
        }
      }
    }
  }
  buckets.sort((left, right) =>
    left.profileId === right.profileId
      ? left.kind.localeCompare(right.kind)
      : left.profileId.localeCompare(right.profileId),
  );
  const depthQuantilesByProfile = {};
  for (const [profileId, depths] of completedDepthsByProfile) {
    depths.sort((left, right) => left - right);
    depthQuantilesByProfile[profileId] = {
      n: depths.length,
      min: depths[0] ?? null,
      p50: percentile(depths, 0.5),
      p75: percentile(depths, 0.75),
      p90: percentile(depths, 0.9),
      p95: percentile(depths, 0.95),
      max: depths.length > 0 ? depths[depths.length - 1] : null,
    };
  }
  return { total: driveExitTotal, buckets, depthQuantilesByProfile };
}

function percentile(sortedAsc, fraction) {
  if (sortedAsc.length === 0) {
    return null;
  }
  const rank = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(fraction * sortedAsc.length) - 1));
  return sortedAsc[rank];
}

if (config.warmup) {
  // Trigger module/closure JIT and warm caches without polluting timed run.
  // Smaller workload to keep total budget modest.
  const prevTurns = config.maxTurns;
  config.maxTurns = Math.min(prevTurns, 5);
  runOnce();
  config.maxTurns = prevTurns;
}

const result = runOnce();

const summary = {
  label: config.label,
  config: {
    seed: config.seed,
    maxTurns: config.maxTurns,
    playerCount: config.playerCount,
    profileId: config.profilesAll ? FITL_BASELINE_PROFILES : config.profileId,
    verifyIncrementalHash: config.verifyIncrementalHash,
    perCard: config.perCard,
    profileBuckets: config.profileBuckets,
    warmup: config.warmup,
  },
  result: {
    elapsedMs: round2(result.elapsedMs),
    turnsCount: result.turnsCount,
    decisions: result.decisions,
    stopReason: result.stopReason,
    msPerTurn: result.turnsCount > 0 ? round4(result.elapsedMs / result.turnsCount) : null,
    msPerDecision: result.decisions > 0 ? round4(result.elapsedMs / result.decisions) : null,
    tokenStateIndexBuildCount: result.tokenStateIndexBuildCount,
    draftTokenStateIndexDeltaCount: result.draftTokenStateIndexDeltaCount,
    draftTokenStateIndexAttachCount: result.draftTokenStateIndexAttachCount,
    draftTokenStateIndexSnapshotCount: result.draftTokenStateIndexSnapshotCount,
    draftTokenStateIndexCowCopyCount: result.draftTokenStateIndexCowCopyCount,
    wasmScoreRowRouteCount: result.wasmScoreRowRouteCount,
    wasmScoreRowUnsupportedCount: result.wasmScoreRowUnsupportedCount,
    driveExitTotal: result.driveExitTotal,
    driveExitBuckets: result.driveExitBuckets,
    driveExitDepthQuantiles: result.driveExitDepthQuantiles,
    perCardRows: result.perCardRows,
    profileBuckets: result.profileBuckets,
  },
};

process.stderr.write(
  `[profile-fitl-preview-drive] label=${summary.label} elapsedMs=${summary.result.elapsedMs} ` +
  `turnsCount=${summary.result.turnsCount} decisions=${summary.result.decisions} ` +
  `stopReason=${summary.result.stopReason} msPerTurn=${summary.result.msPerTurn} ` +
  `verifyIncrementalHash=${summary.config.verifyIncrementalHash} ` +
  `tokenStateIndexBuildCount=${summary.result.tokenStateIndexBuildCount} ` +
  `draftTokenStateIndexDeltaCount=${summary.result.draftTokenStateIndexDeltaCount} ` +
  `draftTokenStateIndexSnapshotCount=${summary.result.draftTokenStateIndexSnapshotCount} ` +
  `draftTokenStateIndexCowCopyCount=${summary.result.draftTokenStateIndexCowCopyCount} ` +
  `wasmScoreRowRouteCount=${summary.result.wasmScoreRowRouteCount} ` +
  `wasmScoreRowUnsupportedCount=${summary.result.wasmScoreRowUnsupportedCount} ` +
  `driveExitTotal=${summary.result.driveExitTotal}\n`,
);
for (const [profileId, quantiles] of Object.entries(summary.result.driveExitDepthQuantiles ?? {})) {
  process.stderr.write(
    `[profile-fitl-preview-drive] depth-quantiles profile=${profileId} ` +
    `n=${quantiles.n} min=${quantiles.min} p50=${quantiles.p50} p75=${quantiles.p75} ` +
    `p90=${quantiles.p90} p95=${quantiles.p95} max=${quantiles.max}\n`,
  );
}
for (const row of summary.result.perCardRows ?? []) {
  process.stderr.write(
    `[profile-fitl-preview-drive] per-card turnCount=${row.turnCount} elapsedMs=${row.elapsedMs} ` +
    `decisions=${row.decisions} driveExitTotal=${row.driveExitTotal} ` +
    `tokenStateIndexBuildCount=${row.tokenStateIndexBuildCount} ` +
    `draftTokenStateIndexAttachCount=${row.draftTokenStateIndexAttachCount} ` +
    `draftTokenStateIndexSnapshotCount=${row.draftTokenStateIndexSnapshotCount} ` +
    `draftTokenStateIndexCowCopyCount=${row.draftTokenStateIndexCowCopyCount} ` +
    `closeReason=${row.closeReason}\n`,
  );
}
for (const row of (summary.result.profileBuckets ?? []).slice(0, 12)) {
  process.stderr.write(
    `[profile-fitl-preview-drive] profile-bucket key=${row.key} count=${row.count} totalMs=${row.totalMs}\n`,
  );
}

console.log(JSON.stringify(summary));

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
