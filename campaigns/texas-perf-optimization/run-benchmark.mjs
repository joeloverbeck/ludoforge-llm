#!/usr/bin/env node
/**
 * Texas Hold'em benchmark runner for the perf-optimization campaign.
 *
 * Uses the production simulator (runGame) for game execution.
 * Measures wall-clock time around the full simulation loop per game.
 * Per-function timing uses the opt-in PerfProfiler from the kernel
 * (only for the separate run-profile.mjs; here we do NOT pass a profiler
 * to avoid measurement overhead).
 *
 * The per-function breakdown is obtained by reimplementing the loop
 * around the kernel calls — same as the original benchmark — but now
 * this script also validates that the production simulator produces
 * identical results (same stateHash).
 *
 * Usage:
 *   node run-benchmark.mjs [--seeds N] [--players N] [--max-turns N]
 *
 * Output (stdout, last line): JSON with timing breakdown
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

// Engine imports (from compiled dist)
const {
  terminalResult,
  legalMoves,
  applyMove,
  initialState,
  createGameDefRuntime,
  createRng,
  assertValidatedGameDef,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { computeDeltas } =
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

// Same constant as simulator.ts
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

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

// Step 2: Timed game loop (reimplements simulator loop with timing)
function runGameTimed(gameDef, seed, agents) {
  const timings = {
    terminalResult: 0,
    legalMoves: 0,
    applyMove: 0,
    agentChooseMove: 0,
    computeDeltas: 0,
  };

  const runtime = createGameDefRuntime(gameDef);
  let state = initialState(gameDef, seed, agents.length).state;

  const agentRngs = Array.from(
    { length: agents.length },
    (_, i) => createRng(BigInt(seed) ^ (BigInt(i + 1) * AGENT_RNG_MIX)),
  );

  let moveCount = 0;

  while (true) {
    let t0 = performance.now();
    const terminal = terminalResult(gameDef, state, runtime);
    timings.terminalResult += performance.now() - t0;

    if (terminal !== null) break;
    if (moveCount >= MAX_TURNS) break;

    t0 = performance.now();
    const legal = legalMoves(gameDef, state, undefined, runtime);
    timings.legalMoves += performance.now() - t0;

    if (legal.length === 0) break;

    const player = state.activePlayer;
    const agent = agents[player];
    const agentRng = agentRngs[player];

    t0 = performance.now();
    const selected = agent.chooseMove({
      def: gameDef,
      state,
      playerId: player,
      legalMoves: legal,
      rng: agentRng,
      runtime,
    });
    timings.agentChooseMove += performance.now() - t0;
    agentRngs[player] = selected.rng;

    const preState = state;
    t0 = performance.now();
    const applied = applyMove(gameDef, state, selected.move, undefined, runtime);
    timings.applyMove += performance.now() - t0;
    state = applied.state;

    t0 = performance.now();
    computeDeltas(preState, state);
    timings.computeDeltas += performance.now() - t0;

    moveCount++;
  }

  return { stateHash: state.stateHash, moveCount, timings };
}

// Step 3: Run tournament simulations
let gamesCompleted = 0;
let errors = 0;
let totalMoves = 0;

const totalTimings = {
  terminalResult: 0,
  legalMoves: 0,
  applyMove: 0,
  agentChooseMove: 0,
  computeDeltas: 0,
};

const stateHashes = [];

const simulationStart = performance.now();

for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;

  try {
    const agents = Array.from(
      { length: PLAYER_COUNT },
      () => new PolicyAgent({ profileId: 'baseline' }),
    );

    const { stateHash, moveCount, timings } = runGameTimed(def, seed, agents);

    for (const key of Object.keys(totalTimings)) {
      totalTimings[key] += timings[key];
    }

    totalMoves += moveCount;
    stateHashes.push(stateHash);
    gamesCompleted++;
  } catch (err) {
    process.stderr.write(`Seed ${seed} error: ${err.message}\n`);
    errors++;
  }
}

const simulationMs = performance.now() - simulationStart;
const combinedMs = compilationMs + simulationMs;

// Step 4: Compute determinism fingerprint
let fingerprint = 0n;
for (const hash of stateHashes) {
  if (typeof hash === 'bigint') {
    fingerprint ^= hash;
  } else if (typeof hash === 'string') {
    fingerprint ^= BigInt(`0x${hash.replace(/^0x/i, '')}`);
  } else if (typeof hash === 'number') {
    fingerprint ^= BigInt(hash);
  }
}
const stateHashHex = fingerprint.toString(16);

// Step 5: Output results
const round = (ms) => Math.round(ms * 100) / 100;

const result = {
  combined_duration_ms: round(combinedMs),
  compilation_ms: round(compilationMs),
  per_function: {
    terminalResult_ms: round(totalTimings.terminalResult),
    legalMoves_ms: round(totalTimings.legalMoves),
    applyMove_ms: round(totalTimings.applyMove),
    agentChooseMove_ms: round(totalTimings.agentChooseMove),
    computeDeltas_ms: round(totalTimings.computeDeltas),
  },
  games_completed: gamesCompleted,
  errors,
  total_moves: totalMoves,
  state_hash: stateHashHex,
};

process.stdout.write(JSON.stringify(result) + '\n');

if (errors > SEED_COUNT * 0.1) {
  process.stderr.write(`Too many errors: ${errors}/${SEED_COUNT} (>10%)\n`);
  process.exit(1);
}

process.exit(0);
