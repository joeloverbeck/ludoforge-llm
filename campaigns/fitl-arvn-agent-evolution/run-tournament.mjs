#!/usr/bin/env node
/**
 * FITL ARVN agent evolution tournament runner.
 *
 * Compiles the production FITL spec, runs N games with 1 evolved ARVN PolicyAgent
 * vs 3 baseline faction PolicyAgents, and reports composite score as JSON.
 *
 * Usage:
 *   node run-tournament.mjs [--seeds N] [--players N] [--evolved-seat SEAT]
 *                           [--max-turns N] [--trace-default none|last|all]
 *                           [--trace-seed N]
 *                           [--evolved-profile PROFILE]
 *                           [--profile-completion PROFILE=greedy|agentGuided]
 *
 * Output (stdout, last line): JSON with { compositeScore, avgMargin, winRate, ... }
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadOrCompileGameDef } from './gamedef-cache.mjs';
import {
  reduceSeedResults,
  runSeedsSerial,
  runSeedsWithWorkerPool,
  stringifyForJson,
} from './run-seed.mjs';

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

// ---------------------------------------------------------------------------
// Engine imports (from compiled dist)
// ---------------------------------------------------------------------------
const {
  loadGameSpecBundleFromEntrypoint,
  loadGameSpecBundleSourcesFromEntrypoint,
  runGameSpecStagesFromBundle,
} =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const {
  assertValidatedGameDef,
  createGameDefRuntime,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : defaultValue;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const SEED_COUNT = Number(getArg('seeds', '3'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const EVOLVED_SEAT = getArg('evolved-seat', 'arvn');
const EVOLVED_PROFILE = getArg('evolved-profile', `${EVOLVED_SEAT.toLowerCase()}-evolved`);
const MAX_TURNS = Number(getArg('max-turns', '500'));
const CONCURRENCY = Number(getArg('concurrency', '1'));
const TRACE_DEFAULT_ARG = getArg('trace-default', null);
const TRACE_ALL_ARG = getArg('trace-all', null);
const TRACE_SEED = getArg('trace-seed', null);
const PROFILE_COMPLETION_OVERRIDE = getArg('profile-completion', '');
const DISABLE_WASM = hasFlag('no-wasm');
const TRACE_DIR = join(HERE, 'traces');

if (!Number.isSafeInteger(CONCURRENCY) || CONCURRENCY < 1) {
  process.stderr.write(`ERROR: --concurrency must be a positive integer, got "${CONCURRENCY}"\n`);
  process.exit(1);
}

function resolveTraceMode() {
  if (TRACE_DEFAULT_ARG !== null) {
    return TRACE_DEFAULT_ARG;
  }
  if (TRACE_ALL_ARG !== null) {
    if (TRACE_ALL_ARG !== 'true' && TRACE_ALL_ARG !== 'false') {
      process.stderr.write(
        `ERROR: --trace-all must be true or false, got "${TRACE_ALL_ARG}"\n`,
      );
      process.exit(1);
    }
    return TRACE_ALL_ARG === 'true' ? 'all' : 'last';
  }
  return SEED_COUNT > 1 ? 'last' : 'none';
}

const TRACE_MODE = resolveTraceMode();
if (!['none', 'last', 'all'].includes(TRACE_MODE)) {
  process.stderr.write(
    `ERROR: --trace-default must be one of none|last|all, got "${TRACE_MODE}"\n`,
  );
  process.exit(1);
}

const traceSeedLabel = TRACE_SEED !== null ? ` (trace seed ${TRACE_SEED})` : '';
process.stderr.write(`Trace mode: ${TRACE_MODE}${traceSeedLabel}\n`);
rmSync(TRACE_DIR, { recursive: true, force: true });
if (TRACE_MODE === 'all') {
  mkdirSync(TRACE_DIR, { recursive: true });
}

let wasmEnabled = false;
if (DISABLE_WASM) {
  process.stderr.write('WASM policy runtime: disabled (--no-wasm)\n');
} else {
  const wasmPath = defaultPolicyWasmPath();
  try {
    initializePolicyWasmRuntimeSync({ wasmPath });
    wasmEnabled = true;
    process.stderr.write('WASM policy runtime: enabled\n');
  } catch (error) {
    process.stderr.write(`ERROR: failed to initialize WASM policy runtime at ${wasmPath}\n`);
    process.stderr.write(`  ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function parseProfileCompletionOverride(raw) {
  if (raw === '') {
    return null;
  }
  const [profileId, completion, ...extra] = raw.split('=');
  if (extra.length > 0 || !profileId || !completion) {
    process.stderr.write(`ERROR: --profile-completion must use PROFILE=greedy|agentGuided, got "${raw}"\n`);
    process.exit(1);
  }
  if (completion !== 'greedy' && completion !== 'agentGuided') {
    process.stderr.write(`ERROR: preview completion override must be greedy or agentGuided, got "${completion}"\n`);
    process.exit(1);
  }
  return { profileId, completion };
}

const profileCompletionOverride = parseProfileCompletionOverride(PROFILE_COMPLETION_OVERRIDE);

function applyProfileCompletionOverride(gameDef, override) {
  if (override === null) {
    return gameDef;
  }
  const catalog = gameDef.agents;
  const profile = catalog?.profiles?.[override.profileId];
  if (catalog === undefined || profile === undefined) {
    process.stderr.write(`ERROR: profile "${override.profileId}" not found for --profile-completion\n`);
    process.exit(1);
  }
  return {
    ...gameDef,
    agents: {
      ...catalog,
      profiles: {
        ...catalog.profiles,
        [override.profileId]: {
          ...profile,
          preview: {
            ...profile.preview,
            completion: override.completion,
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Seat-to-player-index mapping (resolved after compilation)
// ---------------------------------------------------------------------------
function findSeatPlayerIndex(def, seatId) {
  const seatDefs = def.seats ?? [];
  for (let i = 0; i < seatDefs.length; i++) {
    if (seatDefs[i].id.toLowerCase() === seatId.toLowerCase()) {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Step 1: Compile the FITL spec
// ---------------------------------------------------------------------------
const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');

if (!existsSync(entrypoint)) {
  process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`);
  process.exit(1);
}

process.stderr.write('Loading FITL GameDef...\n');
const { def: cachedGameDef, cacheHit: gamedefCacheHit } = loadOrCompileGameDef({
  entrypoint,
  repoRoot: REPO_ROOT,
  cacheDir: join(HERE, '.gamedef-cache'),
  loadSources: loadGameSpecBundleSourcesFromEntrypoint,
  compileFn: () => {
    process.stderr.write('Compiling FITL spec...\n');
    const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
    const staged = runGameSpecStagesFromBundle(bundle);

    if (staged.validation.blocked) {
      process.stderr.write('ERROR: Validation blocked\n');
      for (const d of staged.validation.diagnostics ?? []) {
        process.stderr.write(`  ${d.severity}: ${d.message}\n`);
      }
      process.exit(1);
    }

    if (staged.compilation.blocked) {
      process.stderr.write('ERROR: Compilation blocked\n');
      for (const d of staged.compilation.diagnostics ?? []) {
        process.stderr.write(`  ${d.severity}: ${d.message}\n`);
      }
      process.exit(1);
    }

    const compiled = staged.compilation.result;
    if (!compiled || !compiled.gameDef) {
      process.stderr.write('ERROR: Compilation produced no gameDef\n');
      process.exit(1);
    }

    return compiled.gameDef;
  },
});
process.stderr.write(`GameDef cache: ${gamedefCacheHit ? 'hit' : 'miss'}\n`);

const def = assertValidatedGameDef(applyProfileCompletionOverride(cachedGameDef, profileCompletionOverride));
const runtime = createGameDefRuntime(def);

// Resolve evolved seat index
const evolvedPlayerIndex = findSeatPlayerIndex(def, EVOLVED_SEAT);
if (evolvedPlayerIndex < 0) {
  process.stderr.write(`ERROR: Seat "${EVOLVED_SEAT}" not found in game def\n`);
  process.exit(1);
}

process.stderr.write(`Evolved seat: ${EVOLVED_SEAT} (player index ${evolvedPlayerIndex})\n`);

// Build seat-to-profile mapping: evolved seat uses arvn-evolved, others use their baselines
const seatProfiles = (def.seats ?? []).map((seat) => {
  if (seat.id.toLowerCase() === EVOLVED_SEAT.toLowerCase()) {
    return EVOLVED_PROFILE;
  }
  // Use the faction's baseline profile
  const seatId = seat.id.toLowerCase();
  return `${seatId}-baseline`;
});

process.stderr.write(`Seat profiles: ${seatProfiles.join(', ')}\n`);
if (profileCompletionOverride !== null) {
  process.stderr.write(
    `Preview completion override: ${profileCompletionOverride.profileId}=${profileCompletionOverride.completion}\n`,
  );
}

// ---------------------------------------------------------------------------
// Step 2: Run tournament simulations
// ---------------------------------------------------------------------------
const seeds = Array.from({ length: SEED_COUNT }, (_unused, index) => 1000 + index);
const resolvedConcurrency = Math.min(CONCURRENCY, Math.max(1, SEED_COUNT));
process.stderr.write(`Seed concurrency: ${resolvedConcurrency}\n`);

const seedRunnerOptions = {
  def,
  runtime,
  seeds,
  seatProfiles,
  evolvedPlayerIndex,
  maxTurns: MAX_TURNS,
  playerCount: PLAYER_COUNT,
  traceMode: TRACE_MODE,
  traceSeed: TRACE_SEED,
  evolvedSeat: EVOLVED_SEAT,
};

const seedResults = resolvedConcurrency === 1
  ? runSeedsSerial(seedRunnerOptions)
  : await runSeedsWithWorkerPool({
      ...seedRunnerOptions,
      concurrency: resolvedConcurrency,
      disableWasm: DISABLE_WASM,
    });

// ---------------------------------------------------------------------------
// Step 3: Compute and output results
// ---------------------------------------------------------------------------
const aggregate = reduceSeedResults(seedResults);

for (const seedResult of aggregate.seedResults) {
  if (seedResult.error !== null) {
    process.stderr.write(`Seed ${seedResult.seed} error: ${seedResult.error.split('\n')[0]}\n`);
    continue;
  }
  const marginStr = Object.entries(seedResult.allSeatMargins).map(([s, m]) => `${s}=${m}`).join(', ');
  process.stderr.write(
    `  seed ${seedResult.seed}: ${seedResult.decisionCount} decisions, margins=[${marginStr}], ` +
    `won=${seedResult.evolvedWon}, stop=${seedResult.stopReason}\n`,
  );
  if (seedResult.traceSummary !== null) {
    if (TRACE_MODE === 'all') {
      writeFileSync(join(TRACE_DIR, `trace-${seedResult.seed}.json`), stringifyForJson(seedResult.traceSummary));
    } else {
      writeFileSync(join(HERE, 'last-trace.json'), stringifyForJson(seedResult.traceSummary));
    }
  }
}

const result = {
  compositeScore: aggregate.compositeScore,
  avgMargin: aggregate.avgMargin,
  winRate: aggregate.winRate,
  wins: aggregate.wins,
  completed: aggregate.completed,
  truncated: aggregate.truncated,
  errors: aggregate.errors,
  seeds: SEED_COUNT,
  playerCount: PLAYER_COUNT,
  evolvedSeat: EVOLVED_SEAT,
  evolvedProfile: EVOLVED_PROFILE,
  maxTurns: MAX_TURNS,
  concurrency: resolvedConcurrency,
  profileCompletionOverride: profileCompletionOverride ?? null,
  wasmEnabled,
  gamedefCacheHit,
  decisionBreakdown: aggregate.decisionBreakdown,
};

// Output JSON as the last line of stdout (harness parses this)
process.stdout.write(JSON.stringify(result) + '\n');

// Fail if too many errors
if (aggregate.errors > SEED_COUNT * 0.3) {
  process.stderr.write(`Too many errors: ${aggregate.errors}/${SEED_COUNT} (>30%)\n`);
  process.exit(1);
}

process.exit(0);
