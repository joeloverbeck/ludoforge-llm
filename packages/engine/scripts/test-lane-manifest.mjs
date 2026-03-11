import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(SCRIPT_DIR, '..');
const INTEGRATION_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'integration');

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
    default:
      throw new Error(`Unknown integration test lane: ${lane}`);
  }
}

export function toDistTestPath(sourcePath) {
  return `dist/${sourcePath.replace(/\.ts$/u, '.js')}`;
}
