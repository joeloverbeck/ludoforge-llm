import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageJson, findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

type EnginePackageJson = {
  readonly scripts?: Readonly<Record<string, string>>;
};

describe('engine test lane taxonomy policy', () => {
  it('keeps engine package scripts aligned to explicit integration and e2e test lanes', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = findEnginePackageJson(thisDir);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as EnginePackageJson;

    assert.equal(packageJson.scripts?.test, 'pnpm run schema:artifacts:check && node scripts/run-tests.mjs --lane default');
    assert.equal(packageJson.scripts?.['test:e2e'], 'node scripts/run-tests.mjs --lane e2e');
    assert.equal(packageJson.scripts?.['test:e2e:slow'], 'RUN_SLOW_E2E=1 node scripts/run-tests.mjs --lane e2e:slow');
    assert.equal(packageJson.scripts?.['test:e2e:mcts'], 'RUN_MCTS_E2E=1 node scripts/run-tests.mjs --lane e2e:mcts');
    assert.equal(packageJson.scripts?.['test:e2e:all'], 'RUN_SLOW_E2E=1 node scripts/run-tests.mjs --lane e2e');
    assert.equal(packageJson.scripts?.['test:integration'], 'node scripts/run-tests.mjs --lane integration');
    assert.equal(packageJson.scripts?.['test:integration:core'], 'node scripts/run-tests.mjs --lane integration:core');
    assert.equal(
      packageJson.scripts?.['test:integration:game-packages'],
      'node scripts/run-tests.mjs --lane integration:game-packages',
    );
  });

  it('classifies game-package integration tests explicitly and keeps smoke/core coverage disjoint from the dedicated lane', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly ALL_INTEGRATION_TESTS: readonly string[];
      readonly GAME_PACKAGE_EXACT_TESTS: readonly string[];
      readonly GAME_PACKAGE_SMOKE_TESTS: readonly string[];
      readonly GAME_PACKAGE_TEST_PREFIXES: readonly string[];
      readonly isGamePackageIntegrationTest: (sourcePath: string) => boolean;
      readonly listIntegrationTestsForLane: (lane: string) => readonly string[];
    };

    const integrationRoot = resolve(repoRoot, 'packages/engine/test/integration');
    const smokeTests = manifest.GAME_PACKAGE_SMOKE_TESTS.map((name) => `test/integration/${name}`);
    const exactTests = manifest.GAME_PACKAGE_EXACT_TESTS.map((name) => `test/integration/${name}`);
    const coreLane = manifest.listIntegrationTestsForLane('integration:core');
    const gamePackagesLane = manifest.listIntegrationTestsForLane('integration:game-packages');
    const allLane = manifest.listIntegrationTestsForLane('integration');

    assert.equal(manifest.GAME_PACKAGE_TEST_PREFIXES.length > 0, true);
    assert.equal(smokeTests.length > 0, true);
    assert.equal(gamePackagesLane.length > 0, true);
    assert.deepEqual(new Set(allLane), new Set(manifest.ALL_INTEGRATION_TESTS));

    for (const sourcePath of allLane) {
      assert.equal(existsSync(resolve(repoRoot, 'packages/engine', sourcePath)), true, `${sourcePath} must exist`);
    }

    for (const sourcePath of [...smokeTests, ...exactTests]) {
      assert.equal(manifest.isGamePackageIntegrationTest(sourcePath), true, `${sourcePath} must classify as game-package scoped`);
    }

    for (const sourcePath of smokeTests) {
      assert.equal(coreLane.includes(sourcePath), true, `${sourcePath} must stay in the core/default lane as smoke coverage`);
      assert.equal(gamePackagesLane.includes(sourcePath), false, `${sourcePath} must not also run in the dedicated game-package lane`);
    }

    for (const sourcePath of gamePackagesLane) {
      assert.equal(manifest.isGamePackageIntegrationTest(sourcePath), true, `${sourcePath} must classify as game-package scoped`);
      assert.equal(coreLane.includes(sourcePath), false, `${sourcePath} must not leak back into the core/default lane`);
      assert.equal(existsSync(resolve(repoRoot, 'packages/engine', sourcePath)), true);
    }

    const expectedUnion = new Set([...coreLane.filter((sourcePath) => manifest.isGamePackageIntegrationTest(sourcePath)), ...gamePackagesLane]);
    const classifiedGamePackageTests = manifest.ALL_INTEGRATION_TESTS.filter((sourcePath) =>
      manifest.isGamePackageIntegrationTest(sourcePath),
    );

    assert.deepEqual(new Set(classifiedGamePackageTests), expectedUnion);
    assert.equal(existsSync(integrationRoot), true);
  });

  it('classifies e2e lanes explicitly and keeps non-MCTS, slow, and MCTS coverage aligned', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly ALL_E2E_TESTS: readonly string[];
      readonly E2E_SLOW_EXACT_TESTS: readonly string[];
      readonly isMctsE2eTest: (sourcePath: string) => boolean;
      readonly isSlowE2eTest: (sourcePath: string) => boolean;
      readonly listE2eTestsForLane: (lane: string) => readonly string[];
    };

    const e2eRoot = resolve(repoRoot, 'packages/engine/test/e2e');
    const nonMctsLane = manifest.listE2eTestsForLane('e2e');
    const slowLane = manifest.listE2eTestsForLane('e2e:slow');
    const mctsLane = manifest.listE2eTestsForLane('e2e:mcts');
    const allLane = manifest.listE2eTestsForLane('e2e:all');
    const expectedSlowTests = manifest.E2E_SLOW_EXACT_TESTS.map((name) => `test/e2e/${name}`);

    assert.equal(manifest.ALL_E2E_TESTS.length > 0, true);
    assert.equal(slowLane.length > 0, true);
    assert.equal(mctsLane.length > 0, true);
    assert.deepEqual(new Set(allLane), new Set(manifest.ALL_E2E_TESTS));

    for (const sourcePath of allLane) {
      assert.equal(existsSync(resolve(repoRoot, 'packages/engine', sourcePath)), true, `${sourcePath} must exist`);
    }

    for (const sourcePath of expectedSlowTests) {
      assert.equal(manifest.isSlowE2eTest(sourcePath), true, `${sourcePath} must classify as slow e2e`);
      assert.equal(nonMctsLane.includes(sourcePath), true, `${sourcePath} must stay in the non-MCTS e2e lane`);
      assert.equal(mctsLane.includes(sourcePath), false, `${sourcePath} must not leak into the MCTS lane`);
    }

    for (const sourcePath of mctsLane) {
      assert.equal(manifest.isMctsE2eTest(sourcePath), true, `${sourcePath} must classify as MCTS-scoped`);
      assert.equal(nonMctsLane.includes(sourcePath), false, `${sourcePath} must not leak into the non-MCTS lane`);
      assert.equal(slowLane.includes(sourcePath), false, `${sourcePath} must not leak into the slow non-MCTS lane`);
    }

    assert.deepEqual(new Set(slowLane), new Set(expectedSlowTests));

    const expectedUnion = new Set([...nonMctsLane, ...mctsLane]);
    assert.deepEqual(new Set(allLane), expectedUnion);
    assert.equal(existsSync(e2eRoot), true);
  });
});
