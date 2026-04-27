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
  retainDecisions: flagBoolean('retainDecisions'),
  warmup: flagBoolean('warmup'),
  label: flagValue('label', 'run'),
};

const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'];

const [
  { PolicyAgent },
  { assertValidatedGameDef, createGameDefRuntime },
  { runGame },
  { getFitlProductionFixture },
  { __internal_for_tests: tokenStateIndexInternals },
] = await Promise.all([
  import(join(DIST_ROOT, 'src', 'agents', 'index.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
  import(join(DIST_ROOT, 'src', 'sim', 'index.js')),
  import(join(DIST_ROOT, 'test', 'helpers', 'production-spec-helpers.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'token-state-index.js')),
]);

const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
const runtime = createGameDefRuntime(def);

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
  const agents = buildAgents();
  const startedAt = performance.now();
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
    },
    runtime,
  );
  const elapsedMs = performance.now() - startedAt;
  const turnsCount = trace.turnsCount ?? 0;
  const decisions = trace.decisions?.length ?? 0;
  const stopReason = trace.stopReason ?? 'unknown';
  return {
    elapsedMs,
    turnsCount,
    decisions,
    stopReason,
    tokenStateIndexBuildCount: tokenStateIndexInternals.getBuildTokenStateIndexCount(),
    draftTokenStateIndexDeltaCount: tokenStateIndexInternals.getDraftTokenStateIndexDeltaCount(),
    draftTokenStateIndexAttachCount: tokenStateIndexInternals.getDraftTokenStateIndexAttachCount(),
  };
};

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
  },
};

process.stderr.write(
  `[profile-fitl-preview-drive] label=${summary.label} elapsedMs=${summary.result.elapsedMs} ` +
  `turnsCount=${summary.result.turnsCount} decisions=${summary.result.decisions} ` +
  `stopReason=${summary.result.stopReason} msPerTurn=${summary.result.msPerTurn} ` +
  `verifyIncrementalHash=${summary.config.verifyIncrementalHash} ` +
  `tokenStateIndexBuildCount=${summary.result.tokenStateIndexBuildCount} ` +
  `draftTokenStateIndexDeltaCount=${summary.result.draftTokenStateIndexDeltaCount}\n`,
);

console.log(JSON.stringify(summary));

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
