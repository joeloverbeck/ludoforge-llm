#!/usr/bin/env node
/**
 * Fire in the Lake benchmark runner for the fitl-perf-optimization campaign.
 *
 * Compiles the FITL game spec and runs N games with a PolicyAgent,
 * collecting per-function profiling data. The final stdout line is JSON
 * so the campaign harness can parse the primary metric.
 *
 * Usage:
 *   node run-benchmark.mjs [--seeds N] [--players N] [--max-turns N]
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) return cursor;
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

const {
  createGameDefRuntime,
  createPerfProfiler,
  assertValidatedGameDef,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

// CLI argument parsing
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : defaultValue;
}

const SEED_COUNT = Number(getArg('seeds', '3'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const MAX_TURNS = Number(getArg('max-turns', '200'));

// Step 1: Compile the FITL spec (timed)
const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');

if (!existsSync(entrypoint)) {
  process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`);
  process.exit(1);
}

const compileStart = performance.now();

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

const def = assertValidatedGameDef(compiled.gameDef);
const compilationMs = performance.now() - compileStart;

const round = (ms) => Math.round(ms * 100) / 100;

const fingerprintStateHashes = (stateHashes) => {
  let fingerprint = 0n;
  for (const hash of stateHashes) {
    if (typeof hash === 'bigint') {
      fingerprint ^= hash;
      continue;
    }
    if (typeof hash === 'string') {
      fingerprint ^= BigInt(`0x${hash.replace(/^0x/i, '')}`);
      continue;
    }
    if (typeof hash === 'number') {
      fingerprint ^= BigInt(hash);
    }
  }
  return fingerprint.toString(16);
};

// Step 2: Create runtime and profiler
const runtime = createGameDefRuntime(def);
const profiler = createPerfProfiler();

// Step 3: Run benchmark loop
const stateHashes = [];
let gamesCompleted = 0;
let errors = 0;
let totalMoves = 0;

const simulationStart = performance.now();
for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;
  try {
    const agents = Array.from(
      { length: PLAYER_COUNT },
      () => new PolicyAgent({ profileId: 'baseline' }),
    );
    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { profiler, skipDeltas: true }, runtime);
    totalMoves += trace.moves.length;
    stateHashes.push(trace.finalState.stateHash);
    gamesCompleted++;
    process.stderr.write(`  seed ${seed}: ${trace.moves.length} moves\n`);
  } catch (err) {
    process.stderr.write(`  seed ${seed} error: ${err.message}\n`);
    errors++;
  }
}
const simulationMs = performance.now() - simulationStart;

if (errors > SEED_COUNT * 0.1) {
  process.stderr.write(`Too many errors: ${errors}/${SEED_COUNT} (>10%)\n`);
  process.exit(1);
}

// Step 4: Output results
const combinedMs = compilationMs + simulationMs;

process.stdout.write('\n=== FITL COMPILED BENCHMARK ===\n');
process.stdout.write(`Compilation: ${round(compilationMs)}ms\n`);
process.stdout.write(`Simulation (${gamesCompleted} games): ${round(simulationMs)}ms\n`);
process.stdout.write(`Combined: ${round(combinedMs)}ms\n`);
process.stdout.write(`Total moves: ${totalMoves}\n`);
process.stdout.write(`Deterministic fingerprint: ${fingerprintStateHashes(stateHashes)}\n`);

const result = {
  combined_duration_ms: round(combinedMs),
  compilation_ms: round(compilationMs),
  per_function: {
    terminalResult_ms: round(profiler.data.simTerminalResult.totalMs),
    legalMoves_ms: round(profiler.data.simLegalMoves.totalMs),
    applyMove_ms: round(profiler.data.simApplyMove.totalMs),
    agentChooseMove_ms: round(profiler.data.simAgentChooseMove.totalMs),
    computeDeltas_ms: round(profiler.data.simComputeDeltas.totalMs),
  },
  games_completed: gamesCompleted,
  errors,
  total_moves: totalMoves,
  state_hash: fingerprintStateHashes(stateHashes),
};

process.stdout.write(`${JSON.stringify(result)}\n`);
