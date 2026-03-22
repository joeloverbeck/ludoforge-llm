#!/usr/bin/env node
/**
 * Texas Hold'em benchmark runner for the perf-optimization campaign.
 *
 * Compares two modes over the same corpus:
 * - compiled lifecycle runtime (current architecture)
 * - interpreter-only lifecycle runtime (compiled cache removed)
 *
 * The final stdout line remains JSON so the existing campaign harness can
 * continue parsing the primary metric from the compiled mode. Human-readable
 * comparison output is printed before that final line.
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

const SEED_COUNT = Number(getArg('seeds', '50'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const MAX_TURNS = Number(getArg('max-turns', '10000'));

// Step 1: Compile the Texas Hold'em spec (timed)
const entrypoint = join(REPO_ROOT, 'data', 'games', 'texas-holdem.game-spec.md');

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

const toInterpreterOnlyRuntime = (runtime) => ({
  ...runtime,
  compiledLifecycleEffects: new Map(),
});

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

const collectModeSummary = (modeName, runtime) => {
  const profiler = createPerfProfiler();
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
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { profiler }, runtime);
      totalMoves += trace.moves.length;
      stateHashes.push(trace.finalState.stateHash);
      gamesCompleted++;
    } catch (err) {
      process.stderr.write(`[${modeName}] seed ${seed} error: ${err.message}\n`);
      errors++;
    }
  }
  const simulationMs = performance.now() - simulationStart;

  return {
    simulationMs,
    gamesCompleted,
    errors,
    totalMoves,
    stateHash: fingerprintStateHashes(stateHashes),
    profiler,
  };
};

const compiledRuntime = createGameDefRuntime(def);
const compiledMode = collectModeSummary('compiled', compiledRuntime);
const interpretedMode = collectModeSummary('interpreted', toInterpreterOnlyRuntime(compiledRuntime));

if (compiledMode.errors > SEED_COUNT * 0.1) {
  process.stderr.write(`Too many compiled-mode errors: ${compiledMode.errors}/${SEED_COUNT} (>10%)\n`);
  process.exit(1);
}

if (interpretedMode.errors > SEED_COUNT * 0.1) {
  process.stderr.write(`Too many interpreter-mode errors: ${interpretedMode.errors}/${SEED_COUNT} (>10%)\n`);
  process.exit(1);
}

if (compiledMode.stateHash !== interpretedMode.stateHash) {
  process.stderr.write(
    `Compiled/interpreter determinism mismatch: compiled=${compiledMode.stateHash} interpreted=${interpretedMode.stateHash}\n`,
  );
  process.exit(1);
}

const compiledCombinedMs = compilationMs + compiledMode.simulationMs;
const improvementPct = interpretedMode.simulationMs === 0
  ? 0
  : ((interpretedMode.simulationMs - compiledMode.simulationMs) / interpretedMode.simulationMs) * 100;

process.stdout.write('\n=== TEXAS COMPILED LIFECYCLE BENCHMARK ===\n');
process.stdout.write(`Compilation: ${round(compilationMs)}ms\n`);
process.stdout.write(`Compiled simulation: ${round(compiledMode.simulationMs)}ms\n`);
process.stdout.write(`Interpreter simulation: ${round(interpretedMode.simulationMs)}ms\n`);
process.stdout.write(`Delta vs interpreter: ${improvementPct >= 0 ? '-' : '+'}${round(Math.abs(improvementPct))}%\n`);
process.stdout.write(`Deterministic fingerprint: ${compiledMode.stateHash}\n`);
process.stdout.write('\n=== LIFECYCLE BUCKETS ===\n');
process.stdout.write(
  `Compiled lifecycle bucket: ${round(compiledMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.totalMs ?? 0)}ms `
    + `(${compiledMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.count ?? 0} calls)\n`,
);
process.stdout.write(
  `Compiled interpreter bucket: ${round(compiledMode.profiler.dynamic.get('lifecycle:applyEffects')?.totalMs ?? 0)}ms `
    + `(${compiledMode.profiler.dynamic.get('lifecycle:applyEffects')?.count ?? 0} calls)\n`,
);
process.stdout.write(
  `Interpreter lifecycle bucket: ${round(interpretedMode.profiler.dynamic.get('lifecycle:applyEffects')?.totalMs ?? 0)}ms `
    + `(${interpretedMode.profiler.dynamic.get('lifecycle:applyEffects')?.count ?? 0} calls)\n`,
);
process.stdout.write(
  `Interpreter compiled bucket: ${round(interpretedMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.totalMs ?? 0)}ms `
    + `(${interpretedMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.count ?? 0} calls)\n`,
);

const result = {
  combined_duration_ms: round(compiledCombinedMs),
  compilation_ms: round(compilationMs),
  per_function: {
    terminalResult_ms: round(compiledMode.profiler.data.simTerminalResult.totalMs),
    legalMoves_ms: round(compiledMode.profiler.data.simLegalMoves.totalMs),
    applyMove_ms: round(compiledMode.profiler.data.simApplyMove.totalMs),
    agentChooseMove_ms: round(compiledMode.profiler.data.simAgentChooseMove.totalMs),
    computeDeltas_ms: round(compiledMode.profiler.data.simComputeDeltas.totalMs),
  },
  games_completed: compiledMode.gamesCompleted,
  errors: compiledMode.errors,
  total_moves: compiledMode.totalMoves,
  state_hash: compiledMode.stateHash,
  comparison: {
    compiled: {
      simulation_ms: round(compiledMode.simulationMs),
      lifecycle_apply_effects_compiled_ms: round(
        compiledMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.totalMs ?? 0,
      ),
      lifecycle_apply_effects_compiled_count: compiledMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.count ?? 0,
      lifecycle_apply_effects_interpreter_ms: round(
        compiledMode.profiler.dynamic.get('lifecycle:applyEffects')?.totalMs ?? 0,
      ),
      lifecycle_apply_effects_interpreter_count: compiledMode.profiler.dynamic.get('lifecycle:applyEffects')?.count ?? 0,
    },
    interpreted: {
      simulation_ms: round(interpretedMode.simulationMs),
      lifecycle_apply_effects_ms: round(
        interpretedMode.profiler.dynamic.get('lifecycle:applyEffects')?.totalMs ?? 0,
      ),
      lifecycle_apply_effects_count: interpretedMode.profiler.dynamic.get('lifecycle:applyEffects')?.count ?? 0,
      lifecycle_apply_effects_compiled_ms: round(
        interpretedMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.totalMs ?? 0,
      ),
      lifecycle_apply_effects_compiled_count: interpretedMode.profiler.dynamic.get('lifecycle:applyEffects:compiled')?.count ?? 0,
    },
    improvement_pct_vs_interpreter: round(improvementPct),
    deterministic_parity: compiledMode.stateHash === interpretedMode.stateHash,
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);
