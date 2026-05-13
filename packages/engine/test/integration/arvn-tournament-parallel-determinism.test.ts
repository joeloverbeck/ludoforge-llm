// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

import { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type SeedResult = {
  readonly seed: number;
  readonly error: string | null;
};

type TournamentSeedModule = {
  readonly reduceSeedResults: (results: readonly SeedResult[]) => unknown;
  readonly runSeedsSerial: (options: Record<string, unknown>) => readonly SeedResult[];
  readonly runSeedsWithWorkerPool: (options: Record<string, unknown>) => Promise<readonly SeedResult[]>;
};

function resolveRepoRoot(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
}

function normalizeAggregate(aggregate: unknown): unknown {
  const copy = { ...(aggregate as Record<string, unknown>) };
  delete copy.seedResults;
  return copy;
}

describe('ARVN tournament worker-pool determinism', () => {
  it('keeps per-seed results and aggregate metrics identical across serial and worker execution', { timeout: 180_000 }, async () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }

    initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });

    const repoRoot = resolveRepoRoot();
    const seedModulePath = join(repoRoot, 'campaigns', 'fitl-arvn-agent-evolution', 'run-seed.mjs');
    const seedModule = await import(pathToFileURL(seedModulePath).href) as TournamentSeedModule;
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const seatProfiles = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'];
    const seedOptions = {
      def,
      runtime,
      seeds: [1000, 1001],
      seatProfiles,
      evolvedPlayerIndex: 1,
      maxTurns: 1,
      playerCount: 4,
      traceMode: 'all',
      traceSeed: null,
      evolvedSeat: 'arvn',
    };

    const serialResults = seedModule.runSeedsSerial(seedOptions);
    const workerResults = await seedModule.runSeedsWithWorkerPool({
      ...seedOptions,
      concurrency: 2,
      disableWasm: false,
    });

    assert.deepEqual(workerResults, serialResults);
    assert.deepEqual(
      normalizeAggregate(seedModule.reduceSeedResults(workerResults)),
      normalizeAggregate(seedModule.reduceSeedResults(serialResults)),
    );
    for (const result of workerResults) {
      assert.equal(result.error, null, `seed ${result.seed} must not error`);
    }
  });
});
