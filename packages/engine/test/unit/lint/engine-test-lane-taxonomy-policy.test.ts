// @test-class: architectural-invariant
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
    assert.equal(packageJson.scripts?.['test:e2e:all'], 'RUN_SLOW_E2E=1 node scripts/run-tests.mjs --lane e2e:all');
    assert.equal(packageJson.scripts?.['test:integration'], 'node scripts/run-tests.mjs --lane integration');
    assert.equal(packageJson.scripts?.['test:integration:core'], 'node scripts/run-tests.mjs --lane integration:core');
    assert.equal(
      packageJson.scripts?.['test:integration:game-packages'],
      'node scripts/run-tests.mjs --lane integration:game-packages',
    );
    assert.equal(
      packageJson.scripts?.['test:integration:fitl-events'],
      'node scripts/run-tests.mjs --lane integration:fitl-events',
    );
    assert.equal(
      packageJson.scripts?.['test:integration:fitl-rules'],
      'node scripts/run-tests.mjs --lane integration:fitl-rules',
    );
    assert.equal(
      packageJson.scripts?.['test:integration:texas-cross-game'],
      'node scripts/run-tests.mjs --lane integration:texas-cross-game',
    );
    assert.equal(packageJson.scripts?.['test:policy-profile-quality'], 'node scripts/run-tests.mjs --lane policy-profile-quality');
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

  it('sub-lanes fitl-events + fitl-rules + texas-cross-game partition the game-packages lane', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly listIntegrationTestsForLane: (lane: string) => readonly string[];
    };

    const gamePackagesLane = manifest.listIntegrationTestsForLane('integration:game-packages');
    const fitlEventsLane = manifest.listIntegrationTestsForLane('integration:fitl-events');
    const fitlRulesLane = manifest.listIntegrationTestsForLane('integration:fitl-rules');
    const texasCrossGameLane = manifest.listIntegrationTestsForLane('integration:texas-cross-game');

    assert.equal(fitlEventsLane.length > 0, true, 'fitl-events lane must not be empty');
    assert.equal(fitlRulesLane.length > 0, true, 'fitl-rules lane must not be empty');
    assert.equal(texasCrossGameLane.length > 0, true, 'texas-cross-game lane must not be empty');

    const union = new Set([...fitlEventsLane, ...fitlRulesLane, ...texasCrossGameLane]);
    assert.deepEqual(union, new Set(gamePackagesLane), 'sub-lanes must be an exact partition of game-packages');

    const totalCount = fitlEventsLane.length + fitlRulesLane.length + texasCrossGameLane.length;
    assert.equal(totalCount, gamePackagesLane.length, 'sub-lanes must not overlap');
  });

  it('zobrist incremental parity and bounded property proof files live in determinism lane, not default', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly ALL_DETERMINISM_TESTS: readonly string[];
      readonly listIntegrationTestsForLane: (lane: string) => readonly string[];
    };

    const slowZobristTests = [
      'test/determinism/zobrist-incremental-parity.test.ts',
      'test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.ts',
      'test/determinism/zobrist-incremental-property-fitl-short-diverse.test.ts',
      'test/determinism/zobrist-incremental-property-texas.test.ts',
    ];

    // They must exist in the determinism lane
    for (const testPath of slowZobristTests) {
      assert.equal(
        manifest.ALL_DETERMINISM_TESTS.includes(testPath),
        true,
        `${testPath} must be in ALL_DETERMINISM_TESTS`,
      );
      assert.equal(
        existsSync(resolve(repoRoot, 'packages/engine', testPath)),
        true,
        `${testPath} must exist on disk`,
      );
    }

    // They must NOT be in any integration lane (default includes integration:core)
    const coreLane = manifest.listIntegrationTestsForLane('integration:core');
    const allIntegrationLane = manifest.listIntegrationTestsForLane('integration');
    for (const testPath of slowZobristTests) {
      assert.equal(coreLane.includes(testPath), false, `${testPath} must not be in integration:core`);
      assert.equal(allIntegrationLane.includes(testPath), false, `${testPath} must not be in integration`);
    }

    // They must NOT match the unit glob (dist/test/unit/**/*.test.js) since they're in test/determinism/
    for (const testPath of slowZobristTests) {
      assert.equal(testPath.startsWith('test/unit/'), false, `${testPath} must not be under test/unit/`);
    }
  });

  it('keeps policy-profile-quality tests isolated from determinism, integration, and the default blocking lane', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const runTestsPath = resolve(repoRoot, 'packages/engine/scripts/run-tests.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly ALL_DETERMINISM_TESTS: readonly string[];
      readonly ALL_INTEGRATION_TESTS: readonly string[];
      readonly ALL_POLICY_PROFILE_QUALITY_TESTS: readonly string[];
      readonly toDistTestPath: (sourcePath: string) => string;
    };
    const runTests = (await import(pathToFileURL(runTestsPath).href)) as {
      readonly buildExecutionPlan: (argv: readonly string[], env?: NodeJS.ProcessEnv) => {
        readonly patterns: readonly string[];
      };
    };

    assert.equal(manifest.ALL_POLICY_PROFILE_QUALITY_TESTS.length >= 2, true);
    const policyProfileQualitySource = new Set(manifest.ALL_POLICY_PROFILE_QUALITY_TESTS);

    for (const testPath of manifest.ALL_POLICY_PROFILE_QUALITY_TESTS) {
      assert.equal(testPath.startsWith('test/policy-profile-quality/'), true, `${testPath} must stay in the policy-profile-quality directory`);
      assert.equal(existsSync(resolve(repoRoot, 'packages/engine', testPath)), true, `${testPath} must exist on disk`);
    }

    assert.equal(
      manifest.ALL_DETERMINISM_TESTS.some((testPath) => policyProfileQualitySource.has(testPath)),
      false,
      'policy-profile-quality tests must not leak into determinism manifests',
    );
    assert.equal(
      manifest.ALL_INTEGRATION_TESTS.some((testPath) => policyProfileQualitySource.has(testPath)),
      false,
      'policy-profile-quality tests must not leak into integration manifests',
    );

    const policyLanePlan = runTests.buildExecutionPlan(['--lane', 'policy-profile-quality'], {});
    const defaultLanePlan = runTests.buildExecutionPlan(['--lane', 'default'], {});

    for (const testPath of manifest.ALL_POLICY_PROFILE_QUALITY_TESTS) {
      const distPath = manifest.toDistTestPath(testPath);
      assert.equal(policyLanePlan.patterns.includes(distPath), true, `${distPath} must be in the explicit lane`);
      assert.equal(defaultLanePlan.patterns.includes(distPath), false, `${distPath} must stay out of the default blocking lane`);
    }
  });

  it('classifies e2e lanes explicitly and keeps fast, slow, and aggregate coverage aligned', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const manifestPath = resolve(repoRoot, 'packages/engine/scripts/test-lane-manifest.mjs');
    const manifest = (await import(pathToFileURL(manifestPath).href)) as {
      readonly ALL_E2E_TESTS: readonly string[];
      readonly E2E_SLOW_EXACT_TESTS: readonly string[];
      readonly isSlowE2eTest: (sourcePath: string) => boolean;
      readonly listE2eTestsForLane: (lane: string) => readonly string[];
    };

    const e2eRoot = resolve(repoRoot, 'packages/engine/test/e2e');
    const fastLane = manifest.listE2eTestsForLane('e2e');
    const slowLane = manifest.listE2eTestsForLane('e2e:slow');
    const allLane = manifest.listE2eTestsForLane('e2e:all');
    const expectedSlowTests = manifest.E2E_SLOW_EXACT_TESTS.map((name) => `test/e2e/${name}`);

    assert.equal(manifest.ALL_E2E_TESTS.length > 0, true);
    assert.equal(slowLane.length > 0, true);
    assert.deepEqual(new Set(allLane), new Set(manifest.ALL_E2E_TESTS));

    for (const sourcePath of allLane) {
      assert.equal(existsSync(resolve(repoRoot, 'packages/engine', sourcePath)), true, `${sourcePath} must exist`);
    }

    for (const sourcePath of expectedSlowTests) {
      assert.equal(manifest.isSlowE2eTest(sourcePath), true, `${sourcePath} must classify as slow e2e`);
      assert.equal(fastLane.includes(sourcePath), false, `${sourcePath} must not leak into the fast e2e lane`);
      assert.equal(allLane.includes(sourcePath), true, `${sourcePath} must stay in the aggregate e2e lane`);
    }

    for (const sourcePath of fastLane) {
      assert.equal(manifest.isSlowE2eTest(sourcePath), false, `${sourcePath} must not classify as slow e2e`);
      assert.equal(slowLane.includes(sourcePath), false, `${sourcePath} must not leak into the slow lane`);
    }

    assert.deepEqual(new Set(slowLane), new Set(expectedSlowTests));

    const expectedUnion = new Set([...fastLane, ...slowLane]);
    assert.deepEqual(new Set(allLane), expectedUnion);
    assert.equal(existsSync(e2eRoot), true);
  });
});
