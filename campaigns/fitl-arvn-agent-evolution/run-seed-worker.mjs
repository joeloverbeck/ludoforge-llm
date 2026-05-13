import { parentPort, workerData } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSeed } from './run-seed.mjs';

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
const { assertValidatedGameDef, createGameDefRuntime } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));

if (parentPort === null) {
  throw new Error('run-seed-worker.mjs must run inside a worker thread.');
}

let def;
let runtime;

try {
  if (!workerData.disableWasm) {
    initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });
  }
  def = assertValidatedGameDef(workerData.def);
  runtime = createGameDefRuntime(def);
  parentPort.postMessage({ type: 'ready' });
} catch (error) {
  parentPort.postMessage({
    type: 'fatal',
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
  });
  process.exit(1);
}

parentPort.on('message', (message) => {
  if (message?.type === 'shutdown') {
    process.exit(0);
  }
  if (message?.type !== 'run') {
    return;
  }

  const result = runSeed({
    def,
    runtime,
    seed: message.seed,
    seatProfiles: workerData.seatProfiles,
    evolvedPlayerIndex: workerData.evolvedPlayerIndex,
    maxTurns: workerData.maxTurns,
    playerCount: workerData.playerCount,
    traceMode: workerData.traceMode,
    traceSeed: workerData.traceSeed,
    evolvedSeat: workerData.evolvedSeat,
  });
  parentPort.postMessage({ type: 'result', result });
});
