import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(SCRIPT_DIR, '..');
const INTEGRATION_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'integration');
const E2E_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'e2e');

export const GAME_PACKAGE_TEST_PREFIXES = ['fitl-', 'texas-'];

export const GAME_PACKAGE_EXACT_TESTS = [
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

export const ALL_INTEGRATION_TESTS = collectTestFiles(INTEGRATION_TEST_ROOT);
export const ALL_E2E_TESTS = collectTestFiles(E2E_TEST_ROOT);

const gamePackageSmokeTests = new Set(GAME_PACKAGE_SMOKE_TESTS.map((testPath) => `test/integration/${testPath}`));

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
        (sourcePath) => !isGamePackageIntegrationTest(sourcePath) || gamePackageSmokeTests.has(sourcePath),
      );
    case 'integration:game-packages':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) => isGamePackageIntegrationTest(sourcePath) && !gamePackageSmokeTests.has(sourcePath),
      );
    case 'integration:fitl-events':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) => isGamePackageIntegrationTest(sourcePath) && !gamePackageSmokeTests.has(sourcePath) && isFitlEventCardTest(sourcePath),
      );
    case 'integration:fitl-rules':
      return ALL_INTEGRATION_TESTS.filter(
        (sourcePath) => isGamePackageIntegrationTest(sourcePath) && !gamePackageSmokeTests.has(sourcePath) && sourcePath.split('/').at(-1)?.startsWith('fitl-') && !isFitlEventCardTest(sourcePath),
      );
    case 'integration:texas-cross-game':
      return ALL_INTEGRATION_TESTS.filter((sourcePath) => {
        if (gamePackageSmokeTests.has(sourcePath)) return false;
        if (!isGamePackageIntegrationTest(sourcePath)) return false;
        const baseName = sourcePath.split('/').at(-1) ?? sourcePath;
        return baseName.startsWith('texas-') || GAME_PACKAGE_EXACT_TESTS.includes(baseName);
      });
    default:
      throw new Error(`Unknown integration test lane: ${lane}`);
  }
}

export function isMctsE2eTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  return normalized.startsWith('test/e2e/mcts/') || normalized.startsWith('test/e2e/mcts-fitl/');
}

export function isMctsBudgetProfileTest(sourcePath, profile) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return baseName === `texas-holdem-mcts-${profile}.test.ts`;
}

export function isMctsFitlE2eTest(sourcePath) {
  return sourcePath.replaceAll('\\', '/').startsWith('test/e2e/mcts-fitl/');
}

export function isMctsFitlBudgetProfileTest(sourcePath, profile) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return baseName === `fitl-mcts-${profile}.test.ts`;
}

export function isMctsFitlCompetenceTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return baseName === 'fitl-competence.test.ts';
}

export function isSlowE2eTest(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  return E2E_SLOW_EXACT_TESTS.includes(baseName);
}

export function listE2eTestsForLane(lane) {
  switch (lane) {
    case 'e2e':
      return ALL_E2E_TESTS.filter((sourcePath) => !isMctsE2eTest(sourcePath));
    case 'e2e:slow':
      return ALL_E2E_TESTS.filter((sourcePath) => isSlowE2eTest(sourcePath));
    case 'e2e:mcts':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsE2eTest(sourcePath));
    case 'e2e:mcts:interactive':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsBudgetProfileTest(sourcePath, 'interactive'));
    case 'e2e:mcts:turn':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsBudgetProfileTest(sourcePath, 'turn'));
    case 'e2e:mcts:background':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsBudgetProfileTest(sourcePath, 'background'));
    case 'e2e:mcts:fitl':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsFitlE2eTest(sourcePath));
    case 'e2e:mcts:fitl:interactive':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsFitlBudgetProfileTest(sourcePath, 'interactive'));
    case 'e2e:mcts:fitl:turn':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsFitlBudgetProfileTest(sourcePath, 'turn'));
    case 'e2e:mcts:fitl:background':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsFitlBudgetProfileTest(sourcePath, 'background'));
    case 'e2e:mcts:fitl:competence':
      return ALL_E2E_TESTS.filter((sourcePath) => isMctsFitlCompetenceTest(sourcePath));
    case 'e2e:all':
      return [...ALL_E2E_TESTS];
    default:
      throw new Error(`Unknown e2e test lane: ${lane}`);
  }
}

export function toDistTestPath(sourcePath) {
  return `dist/${sourcePath.replace(/\.ts$/u, '.js')}`;
}
