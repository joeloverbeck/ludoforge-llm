#!/usr/bin/env node
/**
 * Characterize the exp-007 performance pathology: with `preferArvnCubesTrainChoice`
 * active (ARVN Train picks `arvn-cubes` → places up to 6 cubes instead of 1-2
 * rangers), the 15-seed tournament ran 59+ min with 0 seeds completing. Seed 1000
 * alone completes in ~18s. This probe runs each seed serially, in-process, printing
 * a wall-clock time per seed, so a hanging seed is identifiable (its "start" line
 * prints with no matching "done"). Run under an external `timeout`.
 *
 * Usage: timeout 1800 node diagnose-trainchoice-perf.mjs [--seeds N] [--max-turns N]
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const SEED_COUNT = Number(getArg('seeds', '15'));
const MAX_TURNS = Number(getArg('max-turns', '200'));
// --only "1013,1004" restricts to specific seeds (default: 1000..1000+SEED_COUNT-1)
const ONLY = getArg('only', '');
const SEEDS = ONLY
  ? ONLY.split(',').map((x) => Number(x.trim()))
  : Array.from({ length: SEED_COUNT }, (_unused, i) => 1000 + i);

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const { assertValidatedGameDef, createGameDefRuntime, forkGameDefRuntimeForRun } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } = await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGame } = await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));
initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });

const def = assertValidatedGameDef(
  runGameSpecStagesFromBundle(
    loadGameSpecBundleFromEntrypoint(join(REPO_ROOT, 'data/games/fire-in-the-lake.game-spec.md')),
  ).compilation.result.gameDef,
);
const runtime = createGameDefRuntime(def);
const seats = def.seats ?? [];
const seatProfiles = seats.map((s) => {
  const id = s.id.toLowerCase();
  return id === 'arvn' ? 'arvn-baseline' : `${id}-baseline`;
});

for (const seed of SEEDS) {
  process.stdout.write(`seed ${seed}: START\n`);
  const t0 = Date.now();
  const agents = seatProfiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
  let stop = 'unknown';
  let decisions = 0;
  try {
    const trace = runGame(def, seed, agents, MAX_TURNS, 4, undefined, forkGameDefRuntimeForRun(runtime));
    stop = trace.stopReason;
    decisions = (trace.decisions ?? []).length;
  } catch (e) {
    stop = `ERROR:${e.message}`;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`seed ${seed}: DONE in ${secs}s  stop=${stop} decisions=${decisions}\n`);
}
process.stdout.write('all seeds complete\n');
