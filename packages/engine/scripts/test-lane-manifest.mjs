import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(SCRIPT_DIR, '..');
const ARCHITECTURE_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'architecture');
const INTEGRATION_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'integration');
const E2E_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'e2e');
const DETERMINISM_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'determinism');
const POLICY_PROFILE_QUALITY_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'policy-profile-quality');

export const GAME_PACKAGE_TEST_PREFIXES = ['fitl-', 'texas-'];

export const GAME_PACKAGE_EXACT_TESTS = [
  'gamedef-cache-equivalence.test.ts',
  'tooltip-cross-game-properties.test.ts',
  'tooltip-pipeline-integration.test.ts',
];

export const GAME_PACKAGE_SMOKE_TESTS = [
  'compiler-structured-results-production.test.ts',
  'cross-validate-production.test.ts',
  'fitl-production-data-compilation.test.ts',
  'fitl-production-data-scaffold.test.ts',
  'parse-validate-full-spec.test.ts',
  'production-spec-strict-binding-regression.test.ts',
  'texas-holdem-spec-structure.test.ts',
];

export const E2E_SLOW_EXACT_TESTS = [
  'texas-holdem-card-lifecycle.test.ts',
  'texas-holdem-tournament.test.ts',
];

// Heavy parametric architectural witnesses. Each iterates a seed corpus and
// runs full bounded ARVN simulations with verbose policy traces against JSON
// fixtures, so individually they cost minutes. Excluded from the default lane
// to keep local `pnpm turbo test` fast; covered by a dedicated shard in
// engine-tests.yml.
export const SLOW_ARCHITECTURE_TESTS = [
  'policy-preview-inner-outcome-parity.test.ts',
];

// Heavy parametric runGame parity tests. Each iterates a seed × profile-variant
// matrix and runs full bounded simulations, so individually they cost minutes.
// Excluded from the default/integration:core lane to keep local development
// `pnpm turbo test` fast; covered by sharded slow-parity lanes in
// engine-tests.yml. Lifecycle regression corpus tests also live here: they are
// architectural invariants, but their multi-seed FITL simulations and boundary
// sweeps are too expensive for default/core integration feedback.
export const SLOW_INTEGRATION_TESTS = [
  'classified-move-parity.test.ts',
  'diagnose-parity-runGame.test.ts',
  'decision-per-card-presence.test.ts',
  'drive-fingerprint-property.test.ts',
  'fitl-no-turn-1-terminal.test.ts',
  'lifecycle-invariants-property.test.ts',
  'lifecycle-token-conservation.test.ts',
  'spec-140-bounded-termination.test.ts',
  'spec-140-compound-turn-summary.test.ts',
  'spec-140-foundations-conformance.test.ts',
  'spec-140-profile-migration.test.ts',
];

// Policy-runtime and preview canaries that are too expensive for the
// default/local feedback lane but remain blocking architectural/golden
// coverage in engine-tests.yml.
export const POLICY_CANARY_INTEGRATION_TESTS = [
  'arvn-tournament-wasm-equivalence.test.ts',
  'arvn-tournament-parallel-determinism.test.ts',
  'policy-bytecode-equivalence.test.ts',
  'policy-preview-inner-choosenstep-fitl-canary-golden.test.ts',
];

// Shard assignment for slow-parity. Hand-balanced from observed CI durations
// to keep each shard well under the 30-min lane timeout.
// shard-a ~12.5m, shard-b ~16m, shard-c ~6-12m.
const SLOW_INTEGRATION_SHARD_BASENAMES = {
  'shard-a': new Set([
    'classified-move-parity.test.ts',
    'spec-140-bounded-termination.test.ts',
  ]),
  'shard-b': new Set([
    'diagnose-parity-runGame.test.ts',
    'drive-fingerprint-property.test.ts',
    'spec-140-foundations-conformance.test.ts',
  ]),
  'shard-c': new Set([
    'decision-per-card-presence.test.ts',
    'fitl-no-turn-1-terminal.test.ts',
    'lifecycle-invariants-property.test.ts',
    'lifecycle-token-conservation.test.ts',
    'spec-140-compound-turn-summary.test.ts',
    'spec-140-profile-migration.test.ts',
  ]),
};

const FITL_EVENTS_SHARD_COUNT = 3;

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(relative(ENGINE_ROOT, absolutePath).replaceAll('\\', '/'));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export const ALL_ARCHITECTURE_TESTS = collectTestFiles(ARCHITECTURE_TEST_ROOT);
export const ALL_INTEGRATION_TESTS = collectTestFiles(INTEGRATION_TEST_ROOT);
export const ALL_E2E_TESTS = collectTestFiles(E2E_TEST_ROOT);
export const ALL_DETERMINISM_TESTS = collectTestFiles(DETERMINISM_TEST_ROOT);
export const ALL_POLICY_PROFILE_QUALITY_TESTS = collectTestFiles(POLICY_PROFILE_QUALITY_TEST_ROOT);

const gamePackageSmokeTests = new Set(GAME_PACKAGE_SMOKE_TESTS.map((testPath) => `test/integration/${testPath}`));

export function isSlowArchitectureTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return SLOW_ARCHITECTURE_TESTS.includes(baseName);
}

export function listArchitectureTestsForLane(lane) {
  switch (lane) {
    case 'architecture:default':
      return ALL_ARCHITECTURE_TESTS.filter((sourcePath) => !isSlowArchitectureTest(sourcePath));
    case 'architecture:policy-preview-parity':
      return ALL_ARCHITECTURE_TESTS.filter((sourcePath) => isSlowArchitectureTest(sourcePath));
    default:
      throw new Error(`Unknown architecture test lane: ${lane}`);
  }
}

export function isSlowIntegrationTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return SLOW_INTEGRATION_TESTS.includes(baseName);
}

export function isPolicyCanaryIntegrationTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return POLICY_CANARY_INTEGRATION_TESTS.includes(baseName);
}

export function isGamePackageIntegrationTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;

  return (
    GAME_PACKAGE_TEST_PREFIXES.some((prefix) => baseName.startsWith(prefix)) ||
    GAME_PACKAGE_EXACT_TESTS.includes(baseName) ||
    GAME_PACKAGE_SMOKE_TESTS.includes(baseName)
  );
}

export function isFitlEventCardTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return baseName.startsWith('fitl-events-');
}

export function listIntegrationTestsForLane(lane) {
  switch (lane) {
    case 'integration':
      return [...ALL_INTEGRATION_TESTS];
    case 'integration:core':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) =>
          (!isGamePackageIntegrationTest(sourcePath) || gamePackageSmokeTests.has(sourcePath)) &&
          !isSlowIntegrationTest(sourcePath) &&
          !isPolicyCanaryIntegrationTest(sourcePath),
      );
    case 'integration:policy-canaries':
      return ALL_INTEGRATION_TESTS.filter((sourcePath) => isPolicyCanaryIntegrationTest(sourcePath));
    case 'integration:slow-parity':
      return ALL_INTEGRATION_TESTS.filter((sourcePath) => isSlowIntegrationTest(sourcePath));
    case 'integration:slow-parity-shard-a':
    case 'integration:slow-parity-shard-b':
    case 'integration:slow-parity-shard-c': {
      const shardKey = lane.slice('integration:slow-parity-'.length);
      const shardSet = SLOW_INTEGRATION_SHARD_BASENAMES[shardKey];
      return ALL_INTEGRATION_TESTS.filter((sourcePath) => {
        if (!isSlowIntegrationTest(sourcePath)) return false;
        const baseName = sourcePath.split('/').at(-1) ?? sourcePath;
        return shardSet.has(baseName);
      });
    }
    case 'integration:game-packages':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) =>
          isGamePackageIntegrationTest(sourcePath)
          && !gamePackageSmokeTests.has(sourcePath)
          && !isSlowIntegrationTest(sourcePath),
      );
    case 'integration:fitl-events':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) =>
          isGamePackageIntegrationTest(sourcePath)
          && !gamePackageSmokeTests.has(sourcePath)
          && !isSlowIntegrationTest(sourcePath)
          && isFitlEventCardTest(sourcePath),
      );
    case 'integration:fitl-events-shard-a':
    case 'integration:fitl-events-shard-b':
    case 'integration:fitl-events-shard-c': {
      const shardKey = lane.slice('integration:fitl-events-'.length);
      const shardIndex = { 'shard-a': 0, 'shard-b': 1, 'shard-c': 2 }[shardKey];
      const all = ALL_INTEGRATION_TESTS.filter(
        (sourcePath) =>
          isGamePackageIntegrationTest(sourcePath)
          && !gamePackageSmokeTests.has(sourcePath)
          && !isSlowIntegrationTest(sourcePath)
          && isFitlEventCardTest(sourcePath),
      );
      const chunkSize = Math.ceil(all.length / FITL_EVENTS_SHARD_COUNT);
      return all.slice(shardIndex * chunkSize, (shardIndex + 1) * chunkSize);
    }
    case 'integration:fitl-rules':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) =>
          isGamePackageIntegrationTest(sourcePath)
          && !gamePackageSmokeTests.has(sourcePath)
          && !isSlowIntegrationTest(sourcePath)
          && sourcePath.split('/').at(-1)?.startsWith('fitl-')
          && !isFitlEventCardTest(sourcePath),
      );
    case 'integration:texas-cross-game':
      return ALL_INTEGRATION_TESTS.filter((sourcePath) => {
        if (gamePackageSmokeTests.has(sourcePath)) return false;
        if (isSlowIntegrationTest(sourcePath)) return false;
        if (!isGamePackageIntegrationTest(sourcePath)) return false;
        const baseName = sourcePath.split('/').at(-1) ?? sourcePath;
        return baseName.startsWith('texas-') || GAME_PACKAGE_EXACT_TESTS.includes(baseName);
      });
    default:
      throw new Error(`Unknown integration test lane: ${lane}`);
  }
}

export function isSlowE2eTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return E2E_SLOW_EXACT_TESTS.includes(baseName);
}

export function listE2eTestsForLane(lane) {
  switch (lane) {
    case 'e2e':
      return ALL_E2E_TESTS.filter((sourcePath) => !isSlowE2eTest(sourcePath));
    case 'e2e:slow':
      return ALL_E2E_TESTS.filter((sourcePath) => isSlowE2eTest(sourcePath));
    case 'e2e:all':
      return [...ALL_E2E_TESTS];
    default:
      throw new Error(`Unknown e2e test lane: ${lane}`);
  }
}

export function toDistTestPath(sourcePath) {
  return `dist/${sourcePath.replace(/\.ts$/u, '.js')}`;
}
