#!/usr/bin/env node
/**
 * Deep profiling benchmark — uses the production simulator (runGame) with
 * PerfProfiler enabled. Outputs hierarchical sub-function timing breakdown.
 *
 * Usage: node run-profile.mjs [--seeds N] [--players N] [--max-turns N]
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

const { assertValidatedGameDef, createPerfProfiler } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : defaultValue;
}

const SEED_COUNT = Number(getArg('seeds', '50'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const MAX_TURNS = Number(getArg('max-turns', '10000'));

// Compile
const entrypoint = join(REPO_ROOT, 'data', 'games', 'texas-holdem.game-spec.md');
if (!existsSync(entrypoint)) { process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`); process.exit(1); }

const compileStart = performance.now();
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) { process.stderr.write('ERROR: Compilation failed\n'); process.exit(1); }
const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const compilationMs = performance.now() - compileStart;

// Run with profiler
const profiler = createPerfProfiler();
const execOptions = { profiler };
let totalMoves = 0;

const simStart = performance.now();
for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;
  const agents = Array.from({ length: PLAYER_COUNT }, () => new PolicyAgent({ profileId: 'baseline' }));
  const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, execOptions);
  totalMoves += trace.moves.length;
}
const simMs = performance.now() - simStart;

// Output
const round = (ms) => Math.round(ms * 100) / 100;
const totalMs = compilationMs + simMs;

process.stdout.write(`\n=== TOTAL: ${round(totalMs)}ms (compilation: ${round(compilationMs)}ms, simulation: ${round(simMs)}ms, ${totalMoves} moves) ===\n`);

// Simulator game-loop buckets
process.stdout.write(`\n=== SIMULATOR GAME-LOOP BREAKDOWN ===\n`);
const simBuckets = ['simTerminalResult', 'simLegalMoves', 'simAgentChooseMove', 'simApplyMove', 'simComputeDeltas'];
for (const key of simBuckets) {
  const b = profiler.data[key];
  if (b.count === 0) continue;
  const pct = simMs > 0 ? (b.totalMs / simMs * 100).toFixed(1) : '?';
  process.stdout.write(`  ${key}: ${round(b.totalMs)}ms (${b.count} calls, avg ${round(b.totalMs / b.count)}ms, ${pct}% of sim)\n`);
}

// applyMove sub-function buckets
process.stdout.write(`\n=== APPLY_MOVE SUB-FUNCTION BREAKDOWN ===\n`);
const applyMs = profiler.data.simApplyMove.totalMs;
const applyBuckets = [
  'executeMoveAction', 'advanceToDecisionPoint', 'computeFullHash',
  'validateMove', 'resolvePreflight', 'actionEffects', 'dispatchTriggers',
  'applyTurnFlowEligibility', 'applyBoundaryExpiry', 'applyDeferredEventEffects',
  'validateFreeOperationOutcomePolicy',
];
for (const key of applyBuckets) {
  const b = profiler.data[key];
  if (b.count === 0) continue;
  const pct = applyMs > 0 ? (b.totalMs / applyMs * 100).toFixed(1) : '?';
  process.stdout.write(`  ${key}: ${round(b.totalMs)}ms (${b.count} calls, avg ${round(b.totalMs / b.count)}ms, ${pct}% of applyMove)\n`);
}

// Dynamic buckets (per-effect-type, lifecycle sub-phases)
if (profiler.dynamic.size > 0) {
  process.stdout.write(`\n=== EFFECT-TYPE & LIFECYCLE BREAKDOWN ===\n`);
  const dynEntries = [...profiler.dynamic.entries()]
    .map(([key, bucket]) => ({ key, ...bucket }))
    .sort((a, b) => b.totalMs - a.totalMs);

  for (const { key, totalMs, count } of dynEntries) {
    if (count === 0) continue;
    process.stdout.write(`  ${key}: ${round(totalMs)}ms (${count} calls, avg ${round(totalMs / count)}ms)\n`);
  }
}
