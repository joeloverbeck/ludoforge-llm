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
import {
  createPerCardRecorder,
  createStaticRebuildCounterAccess,
  totalStaticRebuildCount,
} from './profile-fitl-preview-drive-metrics.mjs';

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
  caseName: flagValue('case', 'default'),
  seed: flagPositiveInt('seed', 42),
  maxTurns: flagPositiveInt('maxTurns', 50),
  playerCount: flagPositiveInt('playerCount', 4),
  profileId: flagValue('profileId', 'us-baseline'),
  profilesAll: flagBoolean('profilesAll'),
  verifyIncrementalHash: !flagBoolean('noVerifyIncrementalHash'),
  perCard: flagBoolean('perCard'),
  profileBuckets: flagBoolean('profileBuckets'),
  previewDriveInventory: flagBoolean('previewDriveInventory'),
  retainDecisions: flagBoolean('retainDecisions'),
  warmup: flagBoolean('warmup'),
  label: flagValue('label', 'run'),
};

if (config.caseName === 'arvn-cubes-deep') {
  config.seed = flagPositiveInt('seed', 1013);
  config.maxTurns = flagPositiveInt('maxTurns', 200);
  config.profileId = flagValue('profileId', 'arvn-evolved');
} else if (config.caseName !== 'default') {
  process.stderr.write(`ERROR: unknown --case "${config.caseName}".\n`);
  process.exit(1);
}

const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'];

const [
  { PolicyAgent, evaluateProductionPreviewDriveBatchWithWasm, getPolicyEncodedStateLayout, precompilePolicyWasmScoreRows },
  {
    assertValidatedGameDef,
    createGameDefRuntime,
    createPerfProfiler,
    initialState,
    resetHotPathProfilerCounters,
    setHotPathProfilingEnabled,
    snapshotHotPathProfilerCounters,
    zobristInternals,
  },
  { runGame },
  { getFitlBootstrapGameDefFixture, getFitlProductionGameDefFixture },
  { __internal_for_tests: tokenStateIndexInternals },
  { __internal_for_tests: policyPreviewInternals },
  { __internal_for_tests: policyWasmRuntimeInternals },
  { initializePolicyWasmRuntimeSync },
  { definePolicyWasmProductionPreviewStateSlots, policyWasmProductionPreviewDriveInternals },
] = await Promise.all([
  import(join(DIST_ROOT, 'src', 'agents', 'index.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
  import(join(DIST_ROOT, 'src', 'sim', 'index.js')),
  import(join(DIST_ROOT, 'test', 'helpers', 'production-spec-helpers.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'token-state-index.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-preview.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-runtime.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-runtime-node-loader.js')),
  import(join(DIST_ROOT, 'src', 'agents', 'policy-wasm-production-preview-drive.js')),
]);

const policyWasmRuntime = initializePolicyWasmRuntimeSync();
const staticRebuildCounters = await createStaticRebuildCounterAccess(DIST_ROOT);
setHotPathProfilingEnabled(config.profileBuckets);

const def = assertValidatedGameDef(
  (config.caseName === 'arvn-cubes-deep'
    ? getFitlProductionGameDefFixture()
    : getFitlBootstrapGameDefFixture()).gameDef,
);
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
const preparedScoreRowLayout = getPolicyEncodedStateLayout(def);
for (const profileId of new Set(seatToProfileId.values())) {
  precompilePolicyWasmScoreRows(def, preparedScoreRowLayout, def.agents, profileId);
}

// (profileId, exitKind) -> Map<depth, count>
const driveExitHistogram = new Map();
let driveExitTotal = 0;
let driveResultCaptures = [];
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
const recordDriveResult = (capture) => {
  driveResultCaptures.push(capture);
};

const buildAgents = () => {
  if (config.profilesAll) {
    return FITL_BASELINE_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'none' }));
  }
  // Single-profile mode still needs `playerCount` agents — fill the remaining
  // seats with the same profile so legality doesn't change vs production.
  return Array.from({ length: config.playerCount }, () =>
    new PolicyAgent({ profileId: config.profileId, traceLevel: 'none' }),
  );
};

const runOnce = () => {
  staticRebuildCounters.reset();
  tokenStateIndexInternals.resetBuildTokenStateIndexCount();
  resetHotPathProfilerCounters();
  zobristInternals.resetZobristKeyCounters();
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  policyWasmProductionPreviewDriveInternals.resetProductionPreviewDriveBatchCount();
  driveExitHistogram.clear();
  driveExitTotal = 0;
  driveResultCaptures = [];
  policyPreviewInternals.setDriveExitSink(recordDriveExit);
  if (config.previewDriveInventory) {
    policyPreviewInternals.setDriveResultSink(recordDriveResult);
  }
  const agents = buildAgents();
  const profiler = config.profileBuckets ? createPerfProfiler() : undefined;
  const startedAt = performance.now();
  const perCardRecorder = config.perCard
    ? createPerCardRecorder(startedAt, readCounterSnapshot, round2, round4)
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
  policyPreviewInternals.setDriveResultSink(undefined);
  return {
    elapsedMs,
    turnsCount,
    decisions,
    stopReason,
    tokenStateIndexBuildCount: tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    zobristKeyCacheHitCount: zobristInternals.getZobristKeyCacheHitCount(),
    zobristKeyCacheMissCount: zobristInternals.getZobristKeyCacheMissCount(),
    zobristKeyUncachedCount: zobristInternals.getZobristKeyUncachedCount(),
    draftTokenStateIndexDeltaCount: tokenStateIndexInternals.getDraftTokenStateIndexDeltaCount(),
    draftTokenStateIndexAttachCount: tokenStateIndexInternals.getDraftTokenStateIndexAttachCount(),
    draftTokenStateIndexSnapshotCount: tokenStateIndexInternals.getDraftTokenStateIndexSnapshotCount(),
    draftTokenStateIndexCowCopyCount: tokenStateIndexInternals.getDraftTokenStateIndexCowCopyCount(),
    persistentTokenStateIndexCacheHitCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheHitCount(),
    persistentTokenStateIndexCacheMissCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheMissCount(),
    persistentTokenStateIndexCacheWriteCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheWriteCount(),
    ...staticRebuildCounters.snapshot(),
    wasmScoreRowRouteCount: policyWasmRuntimeInternals.getProductionScoreRowRouteCount(),
    wasmScoreRowUnsupportedCount: policyWasmRuntimeInternals.getProductionScoreRowUnsupportedCount(),
    wasmScoreRowBytecodeCompileCount: policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(),
    wasmPreviewCandidateFeatureRowRouteCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(),
    wasmPreviewCandidateFeatureRowUnsupportedCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount(),
    wasmProductionPreviewDriveBatchCount: policyWasmProductionPreviewDriveInternals.getProductionPreviewDriveBatchCount(),
    driveExitTotal: driveExitSnapshot.total,
    driveExitBuckets: driveExitSnapshot.buckets,
    driveExitDepthQuantiles: driveExitSnapshot.depthQuantilesByProfile,
    previewDriveInventory: config.previewDriveInventory
      ? snapshotPreviewDriveInventory(driveResultCaptures)
      : [],
    perCardRows,
    profileBuckets: profiler === undefined ? [] : snapshotProfilerBuckets(profiler),
  };
};

function readCounterSnapshot() {
  return {
    tokenStateIndexBuildCount: tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    zobristKeyCacheHitCount: zobristInternals.getZobristKeyCacheHitCount(),
    zobristKeyCacheMissCount: zobristInternals.getZobristKeyCacheMissCount(),
    zobristKeyUncachedCount: zobristInternals.getZobristKeyUncachedCount(),
    draftTokenStateIndexDeltaCount: tokenStateIndexInternals.getDraftTokenStateIndexDeltaCount(),
    draftTokenStateIndexAttachCount: tokenStateIndexInternals.getDraftTokenStateIndexAttachCount(),
    draftTokenStateIndexSnapshotCount: tokenStateIndexInternals.getDraftTokenStateIndexSnapshotCount(),
    draftTokenStateIndexCowCopyCount: tokenStateIndexInternals.getDraftTokenStateIndexCowCopyCount(),
    persistentTokenStateIndexCacheHitCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheHitCount(),
    persistentTokenStateIndexCacheMissCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheMissCount(),
    persistentTokenStateIndexCacheWriteCount: tokenStateIndexInternals.getPersistentTokenStateIndexCacheWriteCount(),
    ...staticRebuildCounters.snapshot(),
    wasmScoreRowBytecodeCompileCount: policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(),
    wasmPreviewCandidateFeatureRowRouteCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(),
    wasmPreviewCandidateFeatureRowUnsupportedCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount(),
    wasmProductionPreviewDriveBatchCount: policyWasmProductionPreviewDriveInternals.getProductionPreviewDriveBatchCount(),
    driveExitTotal,
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
  for (const bucket of snapshotHotPathProfilerCounters()) {
    if (bucket.count > 0 || bucket.totalMs > 0) {
      rows.push({ key: bucket.key, count: bucket.count, totalMs: round2(bucket.totalMs) });
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

function snapshotPreviewDriveInventory(captures) {
  const actionClasses = new Map();
  for (const capture of captures) {
    const profileId = seatToProfileId.get(capture.seatId) ?? `seat:${capture.seatId}`;
    const key = `${profileId}|${capture.actionId}|${capture.resultKind}|${capture.resultReason ?? 'none'}`;
    const existing = actionClasses.get(key) ?? {
      profileId,
      actionId: capture.actionId,
      resultKind: capture.resultKind,
      resultReason: capture.resultReason ?? null,
      count: 0,
      minDepth: null,
      maxDepth: null,
    };
    existing.count += 1;
    if (capture.resultDepth !== undefined) {
      existing.minDepth = existing.minDepth === null ? capture.resultDepth : Math.min(existing.minDepth, capture.resultDepth);
      existing.maxDepth = existing.maxDepth === null ? capture.resultDepth : Math.max(existing.maxDepth, capture.resultDepth);
    }
    actionClasses.set(key, existing);
  }

  const summaryRows = [...actionClasses.values()].sort((left, right) =>
    right.count - left.count
    || left.profileId.localeCompare(right.profileId)
    || left.actionId.localeCompare(right.actionId)
    || left.resultKind.localeCompare(right.resultKind),
  );
  const abiSupport = evaluatePreviewDriveInventoryAbiSupport(captures);
  const productionSupport = evaluateProductionPreviewDriveSubstrateSupport(captures);
  return [
    {
      surface: 'productionApplicationPublication',
      runtimeClass: 'live action-pipeline encoded production preview-drive substrate',
      supportedByEncodedPreviewDriveAbi: productionSupport.supported,
      previewStateSubstrateSupported: productionSupport.supported,
      productionPreviewDriveSubstrateSupported: productionSupport.supported,
      ...(productionSupport.failClosedClass === undefined ? {} : {
        failClosedClass: productionSupport.failClosedClass,
      }),
      successorOwner: productionSupport.successorOwner,
      rows: productionSupport.rows,
    },
    {
      surface: 'initialMoveApplication',
      runtimeClass: 'live encoded per-candidate initial application deltas',
      supportedByEncodedPreviewDriveAbi: abiSupport.initialMoveApplication.supported,
      previewStateSubstrateSupported: abiSupport.initialMoveApplication.previewStateSubstrateSupported,
      ...(abiSupport.initialMoveApplication.failClosedClass === undefined ? {} : {
        failClosedClass: abiSupport.initialMoveApplication.failClosedClass,
      }),
      successorOwner: abiSupport.initialMoveApplication.successorOwner,
      count: captures.length,
    },
    {
      surface: 'decisionStackPublication',
      runtimeClass: 'live encoded same-seam completion outcome replay',
      supportedByEncodedPreviewDriveAbi: abiSupport.decisionStackPublication.supported,
      previewStateSubstrateSupported: abiSupport.decisionStackPublication.previewStateSubstrateSupported,
      ...(abiSupport.decisionStackPublication.failClosedClass === undefined ? {} : {
        failClosedClass: abiSupport.decisionStackPublication.failClosedClass,
      }),
      successorOwner: abiSupport.decisionStackPublication.successorOwner,
      count: captures.length,
    },
    {
      surface: 'completionExits',
      runtimeClass: 'current same-seam preview-drive exit distribution',
      supportedByEncodedPreviewDriveAbi: abiSupport.completionExits.supported,
      previewStateSubstrateSupported: abiSupport.completionExits.previewStateSubstrateSupported,
      ...(abiSupport.completionExits.failClosedClass === undefined ? {} : {
        failClosedClass: abiSupport.completionExits.failClosedClass,
      }),
      successorOwner: abiSupport.completionExits.successorOwner,
      rows: summaryRows,
    },
  ];
}

function evaluateProductionPreviewDriveSubstrateSupport(captures) {
  const supportedOwner = 'tickets/150FITLWASM-010.md';
  const residualOwner = 'tickets/150FITLWASM-014.md';
  if (captures.length === 0) {
    return { supported: true, successorOwner: supportedOwner, rows: [] };
  }

  const rootState = initialState(def, config.seed, config.playerCount).state;
  const previewStateSlots = productionPreviewStateSlots();
  const rowsByKey = new Map();
  for (const capture of captures) {
    const profileId = seatToProfileId.get(capture.seatId) ?? `seat:${capture.seatId}`;
    const params = JSON.parse(capture.paramsJSON);
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: policyWasmRuntime,
      def,
      state: rootState,
      profileId,
      originSeatId: capture.seatId,
      originTurnId: 0,
      depthCap: Math.max(1, capture.resultDepth ?? 1),
      previewStateSlots,
      candidates: [{
        move: { actionId: capture.actionId, params },
        stableMoveKey: capture.stableMoveKey,
        actionId: capture.actionId,
      }],
    });
    const rowKey = result.kind === 'supported'
      ? `${profileId}|${capture.actionId}|supported|none`
      : `${profileId}|${capture.actionId}|${result.unsupportedDriveClass}|${result.unsupportedOwner ?? 'unknown'}`;
    const row = rowsByKey.get(rowKey) ?? {
      profileId,
      actionId: capture.actionId,
      supported: result.kind === 'supported',
      unsupportedDriveClass: result.kind === 'supported' ? null : result.unsupportedDriveClass,
      unsupportedOwner: result.kind === 'supported' ? null : result.unsupportedOwner ?? null,
      reason: result.kind === 'supported' ? null : result.reason,
      count: 0,
    };
    row.count += 1;
    rowsByKey.set(rowKey, row);
  }
  const rows = [...rowsByKey.values()].sort((left, right) =>
    Number(left.supported) - Number(right.supported)
    || right.count - left.count
    || left.profileId.localeCompare(right.profileId)
    || left.actionId.localeCompare(right.actionId),
  );
  const firstUnsupported = rows.find((row) => !row.supported);
  return firstUnsupported === undefined
    ? { supported: true, successorOwner: supportedOwner, rows }
    : {
        supported: false,
        failClosedClass: firstUnsupported.unsupportedDriveClass ?? 'unknown',
        successorOwner: residualOwner,
        rows,
      };
}

function productionPreviewStateSlots() {
  const slots = def.globalVars.map((variable) => `global.${variable.name}`);
  return definePolicyWasmProductionPreviewStateSlots(slots.length === 0 ? ['global.__none'] : slots);
}

function evaluatePreviewDriveInventoryAbiSupport(captures) {
  const supportedOwner = 'tickets/150FITLWASM-010.md';
  const residualOwner = 'tickets/150FITLWASM-013.md';
  if (captures.length === 0) {
    return {
      initialMoveApplication: { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner },
      decisionStackPublication: { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner },
      completionExits: { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner },
    };
  }

  const previewStateSlots = [definePolicyWasmProductionPreviewStateSlots(['preview.drive.value'])[0]];
  const initialResult = policyWasmRuntime.evaluatePreviewDriveBatch({
    profileId: 'fitl-preview-drive-inventory-initial-application',
    originSeatId: captures[0].seatId,
    originTurnId: 0,
    depthCap: 8,
    previewStateSlots,
    candidates: captures.map((capture) => ({
      actionId: capture.actionId,
      stableMoveKey: capture.stableMoveKey,
      initialValue: 0,
      initialPreviewStateValues: [0],
    })),
    steps: [{ kind: 'applyCandidateDeltas', candidateDeltas: captures.map(() => 0) }],
  });
  const initialSupported = initialResult.kind === 'supported'
    && initialResult.rows.length === captures.length
    && initialResult.rows.every((row) =>
      row.outcome === 'completed'
      && row.depth === 1
      && row.previewStateValues?.['preview.drive.value'] === row.value,
    );

  const unsupportedCompletion = captures.find((capture) =>
    capture.resultDepth === undefined
    || (capture.resultKind !== 'completed' && capture.resultKind !== 'depthCap' && capture.resultKind !== 'stochastic'),
  );
  const completionSupported = unsupportedCompletion === undefined
    && captures.every((capture) => validateCompletionCapture(capture));

  return {
    initialMoveApplication: initialSupported
      ? { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner }
      : { supported: false, previewStateSubstrateSupported: false, failClosedClass: 'unsupported-effect', successorOwner: residualOwner },
    decisionStackPublication: completionSupported
      ? { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner }
      : { supported: false, previewStateSubstrateSupported: false, failClosedClass: 'unsupported-effect', successorOwner: residualOwner },
    completionExits: completionSupported
      ? { supported: true, previewStateSubstrateSupported: true, successorOwner: supportedOwner }
      : { supported: false, previewStateSubstrateSupported: false, failClosedClass: 'unsupported-effect', successorOwner: residualOwner },
  };
}

function validateCompletionCapture(capture) {
  const depth = capture.resultDepth ?? 0;
  if (depth <= 0) {
    return false;
  }
  const steps = [{ kind: 'applyCandidateDeltas', candidateDeltas: [0] }];
  if (capture.resultKind === 'stochastic') {
    if (depth <= 1) {
      return false;
    }
    for (let index = 1; index < depth - 1; index += 1) {
      steps.push({ kind: 'addGlobal', delta: 0 });
    }
    steps.push({ kind: 'stochastic' });
  } else {
    for (let index = 1; index < depth; index += 1) {
      steps.push({ kind: 'addGlobal', delta: 0 });
    }
  }
  const result = policyWasmRuntime.evaluatePreviewDriveBatch({
    profileId: 'fitl-preview-drive-inventory-completion',
    originSeatId: capture.seatId,
    originTurnId: 0,
    depthCap: capture.resultKind === 'depthCap' ? depth : depth + 1,
    previewStateSlots: [definePolicyWasmProductionPreviewStateSlots(['preview.drive.value'])[0]],
    candidates: [{
      actionId: capture.actionId,
      stableMoveKey: capture.stableMoveKey,
      initialValue: 0,
      initialPreviewStateValues: [0],
    }],
    steps,
  });
  return result.kind === 'supported'
    && result.rows.length === 1
    && result.rows[0].outcome === toWasmPreviewDriveOutcome(capture.resultKind)
    && result.rows[0].depth === depth
    && result.rows[0].previewStateValues?.['preview.drive.value'] === result.rows[0].value;
}

function toWasmPreviewDriveOutcome(resultKind) {
  if (resultKind === 'depthCap') {
    return 'depthCap';
  }
  if (resultKind === 'stochastic') {
    return 'stochastic';
  }
  if (resultKind === 'completed') {
    return 'completed';
  }
  return 'failed';
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
    case: config.caseName,
    seed: config.seed,
    maxTurns: config.maxTurns,
    playerCount: config.playerCount,
    profileId: config.profilesAll ? FITL_BASELINE_PROFILES : config.profileId,
    verifyIncrementalHash: config.verifyIncrementalHash,
    perCard: config.perCard,
    profileBuckets: config.profileBuckets,
    previewDriveInventory: config.previewDriveInventory,
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
    zobristKeyCacheHitCount: result.zobristKeyCacheHitCount,
    zobristKeyCacheMissCount: result.zobristKeyCacheMissCount,
    zobristKeyUncachedCount: result.zobristKeyUncachedCount,
    draftTokenStateIndexDeltaCount: result.draftTokenStateIndexDeltaCount,
    draftTokenStateIndexAttachCount: result.draftTokenStateIndexAttachCount,
    draftTokenStateIndexSnapshotCount: result.draftTokenStateIndexSnapshotCount,
    draftTokenStateIndexCowCopyCount: result.draftTokenStateIndexCowCopyCount,
    persistentTokenStateIndexCacheHitCount: result.persistentTokenStateIndexCacheHitCount,
    persistentTokenStateIndexCacheMissCount: result.persistentTokenStateIndexCacheMissCount,
    persistentTokenStateIndexCacheWriteCount: result.persistentTokenStateIndexCacheWriteCount,
    buildEncodedStateLayoutCount: result.buildEncodedStateLayoutCount,
    buildFeatureTableCount: result.buildFeatureTableCount,
    buildExpressionFeatureTableCount: result.buildExpressionFeatureTableCount,
    buildEncodedStateCount: result.buildEncodedStateCount,
    staticRebuildCount: totalStaticRebuildCount(result),
    wasmScoreRowRouteCount: result.wasmScoreRowRouteCount,
    wasmScoreRowUnsupportedCount: result.wasmScoreRowUnsupportedCount,
    wasmScoreRowBytecodeCompileCount: result.wasmScoreRowBytecodeCompileCount,
    wasmPreviewCandidateFeatureRowRouteCount: result.wasmPreviewCandidateFeatureRowRouteCount,
    wasmPreviewCandidateFeatureRowUnsupportedCount: result.wasmPreviewCandidateFeatureRowUnsupportedCount,
    wasmProductionPreviewDriveBatchCount: result.wasmProductionPreviewDriveBatchCount,
    driveExitTotal: result.driveExitTotal,
    driveExitBuckets: result.driveExitBuckets,
    driveExitDepthQuantiles: result.driveExitDepthQuantiles,
    perCardRows: result.perCardRows,
    profileBuckets: result.profileBuckets,
    previewDriveInventory: result.previewDriveInventory,
  },
};

process.stderr.write(
  `[profile-fitl-preview-drive] label=${summary.label} elapsedMs=${summary.result.elapsedMs} ` +
  `turnsCount=${summary.result.turnsCount} decisions=${summary.result.decisions} ` +
  `stopReason=${summary.result.stopReason} msPerTurn=${summary.result.msPerTurn} ` +
  `verifyIncrementalHash=${summary.config.verifyIncrementalHash} ` +
  `tokenStateIndexBuildCount=${summary.result.tokenStateIndexBuildCount} ` +
  `zobristKeyCacheHitCount=${summary.result.zobristKeyCacheHitCount} ` +
  `zobristKeyCacheMissCount=${summary.result.zobristKeyCacheMissCount} ` +
  `zobristKeyUncachedCount=${summary.result.zobristKeyUncachedCount} ` +
  `draftTokenStateIndexDeltaCount=${summary.result.draftTokenStateIndexDeltaCount} ` +
  `draftTokenStateIndexSnapshotCount=${summary.result.draftTokenStateIndexSnapshotCount} ` +
  `draftTokenStateIndexCowCopyCount=${summary.result.draftTokenStateIndexCowCopyCount} ` +
  `persistentTokenStateIndexCacheHitCount=${summary.result.persistentTokenStateIndexCacheHitCount} ` +
  `persistentTokenStateIndexCacheMissCount=${summary.result.persistentTokenStateIndexCacheMissCount} ` +
  `persistentTokenStateIndexCacheWriteCount=${summary.result.persistentTokenStateIndexCacheWriteCount} ` +
  `buildEncodedStateLayoutCount=${summary.result.buildEncodedStateLayoutCount} ` +
  `buildFeatureTableCount=${summary.result.buildFeatureTableCount} ` +
  `buildExpressionFeatureTableCount=${summary.result.buildExpressionFeatureTableCount} ` +
  `buildEncodedStateCount=${summary.result.buildEncodedStateCount} ` +
  `staticRebuildCount=${summary.result.staticRebuildCount} ` +
  `wasmScoreRowRouteCount=${summary.result.wasmScoreRowRouteCount} ` +
  `wasmScoreRowUnsupportedCount=${summary.result.wasmScoreRowUnsupportedCount} ` +
  `wasmScoreRowBytecodeCompileCount=${summary.result.wasmScoreRowBytecodeCompileCount} ` +
  `wasmPreviewCandidateFeatureRowRouteCount=${summary.result.wasmPreviewCandidateFeatureRowRouteCount} ` +
  `wasmPreviewCandidateFeatureRowUnsupportedCount=${summary.result.wasmPreviewCandidateFeatureRowUnsupportedCount} ` +
  `wasmProductionPreviewDriveBatchCount=${summary.result.wasmProductionPreviewDriveBatchCount} ` +
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
    `zobristKeyCacheHitCount=${row.zobristKeyCacheHitCount} ` +
    `zobristKeyCacheMissCount=${row.zobristKeyCacheMissCount} ` +
    `zobristKeyUncachedCount=${row.zobristKeyUncachedCount} ` +
    `draftTokenStateIndexAttachCount=${row.draftTokenStateIndexAttachCount} ` +
    `draftTokenStateIndexSnapshotCount=${row.draftTokenStateIndexSnapshotCount} ` +
    `draftTokenStateIndexCowCopyCount=${row.draftTokenStateIndexCowCopyCount} ` +
    `persistentTokenStateIndexCacheHitCount=${row.persistentTokenStateIndexCacheHitCount} ` +
    `persistentTokenStateIndexCacheMissCount=${row.persistentTokenStateIndexCacheMissCount} ` +
    `persistentTokenStateIndexCacheWriteCount=${row.persistentTokenStateIndexCacheWriteCount} ` +
    `buildEncodedStateLayoutCount=${row.buildEncodedStateLayoutCount} ` +
    `buildFeatureTableCount=${row.buildFeatureTableCount} ` +
    `buildExpressionFeatureTableCount=${row.buildExpressionFeatureTableCount} ` +
    `buildEncodedStateCount=${row.buildEncodedStateCount} ` +
    `staticRebuildCount=${row.staticRebuildCount} ` +
    `wasmScoreRowBytecodeCompileCount=${row.wasmScoreRowBytecodeCompileCount} ` +
    `wasmPreviewCandidateFeatureRowRouteCount=${row.wasmPreviewCandidateFeatureRowRouteCount} ` +
    `wasmPreviewCandidateFeatureRowUnsupportedCount=${row.wasmPreviewCandidateFeatureRowUnsupportedCount} ` +
    `wasmProductionPreviewDriveBatchCount=${row.wasmProductionPreviewDriveBatchCount} ` +
    `closeReason=${row.closeReason}\n`,
  );
}
for (const row of (summary.result.profileBuckets ?? []).slice(0, 12)) {
  process.stderr.write(
    `[profile-fitl-preview-drive] profile-bucket key=${row.key} count=${row.count} totalMs=${row.totalMs}\n`,
  );
}
for (const row of summary.result.previewDriveInventory ?? []) {
  process.stderr.write(
    `[profile-fitl-preview-drive] preview-drive-inventory surface=${row.surface} ` +
    `supportedByEncodedPreviewDriveAbi=${row.supportedByEncodedPreviewDriveAbi} ` +
    `previewStateSubstrateSupported=${row.previewStateSubstrateSupported} ` +
    (row.failClosedClass === undefined ? '' : `failClosedClass=${row.failClosedClass} `) +
    `successorOwner=${row.successorOwner} count=${row.count ?? row.rows?.length ?? 0}\n`,
  );
}

console.log(JSON.stringify(summary));

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
