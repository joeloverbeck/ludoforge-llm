#!/usr/bin/env node

import { join } from 'node:path';

import { ENGINE_ROOT } from './lib/paths.mjs';
import { resolveWorkload } from './lib/workloads.mjs';

const workloadKey = process.argv[2];
if (workloadKey === undefined) {
  process.stderr.write('usage: smoke-workload.mjs <workload-key>\n');
  process.exit(1);
}

const workload = resolveWorkload(workloadKey);
const seedsByWorkload = {
  'parity-drive': 42,
  'arvn-tournament-parallel': 1000,
  'arvn-tournament-wasm-equivalence': 1000,
  'policy-preview-parity-arvn-1008': 1008,
  'bounded-termination-1002': 1002,
  'diagnose-parity-runGame-1001': 1001,
};

const [
  { assertValidatedGameDef, createGameDefRuntime },
  { runGame },
  { getFitlProductionFixture },
  { createSeededChoiceAgents },
] = await Promise.all([
  import(join(ENGINE_ROOT, 'dist/src/kernel/index.js')),
  import(join(ENGINE_ROOT, 'dist/src/sim/index.js')),
  import(join(ENGINE_ROOT, 'dist/test/helpers/production-spec-helpers.js')),
  import(join(ENGINE_ROOT, 'dist/test/helpers/test-agents.js')),
]);

const playerCount = 4;
const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
const runtime = createGameDefRuntime(def);
const trace = runGame(
  def,
  seedsByWorkload[workload.key],
  createSeededChoiceAgents(playerCount),
  1,
  playerCount,
  {
    skipDeltas: true,
    traceRetention: 'finalStateOnly',
  },
  runtime,
);

process.stdout.write(`${JSON.stringify({
  workload: workload.key,
  seed: seedsByWorkload[workload.key],
  finalStateHash: String(trace.finalState.stateHash),
})}\n`);
