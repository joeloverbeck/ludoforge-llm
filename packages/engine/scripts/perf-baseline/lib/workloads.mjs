import { join } from 'node:path';

import { ENGINE_ROOT } from './paths.mjs';
import { PERF_BASELINE_DIR } from './paths.mjs';

export const WORKLOADS = new Map([
  ['parity-drive', {
    key: 'parity-drive',
    sourceTest: 'test/perf/agents/fitl-parity-drive.perf.test.ts',
    compiledTest: 'dist/test/perf/agents/fitl-parity-drive.perf.test.js',
  }],
  ['arvn-tournament-parallel', {
    key: 'arvn-tournament-parallel',
    sourceTest: 'test/integration/arvn-tournament-parallel-determinism.test.ts',
    compiledTest: 'dist/test/integration/arvn-tournament-parallel-determinism.test.js',
  }],
  ['arvn-tournament-wasm-equivalence', {
    key: 'arvn-tournament-wasm-equivalence',
    sourceTest: 'test/integration/arvn-tournament-wasm-equivalence.test.ts',
    compiledTest: 'dist/test/integration/arvn-tournament-wasm-equivalence.test.js',
  }],
  ['policy-preview-parity-arvn-1008', {
    key: 'policy-preview-parity-arvn-1008',
    sourceTest: 'test/architecture/policy-preview-inner-outcome-parity.test.ts',
    compiledTest: 'dist/test/architecture/policy-preview-inner-outcome-parity.test.js',
  }],
  ['bounded-termination-1002', {
    key: 'bounded-termination-1002',
    sourceTest: 'test/integration/spec-140-bounded-termination.test.ts',
    compiledTest: 'dist/test/integration/spec-140-bounded-termination.test.js',
  }],
  ['diagnose-parity-runGame-1001', {
    key: 'diagnose-parity-runGame-1001',
    sourceTest: 'test/integration/diagnose-parity-runGame.test.ts',
    compiledTest: 'dist/test/integration/diagnose-parity-runGame.test.js',
  }],
]);

export function workloadKeys() {
  return [...WORKLOADS.keys()];
}

export function resolveWorkload(key) {
  const workload = WORKLOADS.get(key);
  if (workload === undefined) {
    throw new Error(`Unknown workload "${key}". Expected one of: ${workloadKeys().join(', ')}`);
  }
  return workload;
}

export function workloadTestPath(workload) {
  return join(ENGINE_ROOT, workload.compiledTest);
}

export function workloadNodeTestArgs(workload, options = {}) {
  const smoke = options.smoke === true;
  if (smoke) {
    return [
      join(PERF_BASELINE_DIR, 'smoke-workload.mjs'),
      workload.key,
    ];
  }
  return ['--test', workloadTestPath(workload)];
}
