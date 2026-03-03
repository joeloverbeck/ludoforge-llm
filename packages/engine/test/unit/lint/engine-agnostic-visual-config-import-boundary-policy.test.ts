import * as assert from 'node:assert/strict';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  findEnginePackageRoot,
  findImportBoundaryViolations,
  listTypeScriptFiles,
} from '../../helpers/lint-policy-helpers.js';

const AGNOSTIC_ENGINE_DIRS = ['cnl', 'kernel', 'sim'] as const;

function isRunnerVisualConfigImport(specifier: string, filePath: string, runnerConfigRoot: string): boolean {
  const normalizedSpecifier = normalize(specifier);
  if (
    normalizedSpecifier.includes('packages/runner/src/config/')
    || normalizedSpecifier.endsWith('packages/runner/src/config')
    || normalizedSpecifier.includes('@ludoforge/runner/src/config/')
    || normalizedSpecifier.endsWith('@ludoforge/runner/src/config')
    || normalizedSpecifier.includes('@ludoforge/runner/config/')
    || normalizedSpecifier.endsWith('@ludoforge/runner/config')
  ) {
    return true;
  }

  if (!specifier.startsWith('.')) {
    return false;
  }

  const resolvedImportPath = normalize(resolve(dirname(filePath), specifier));
  return resolvedImportPath === runnerConfigRoot || resolvedImportPath.startsWith(`${runnerConfigRoot}/`);
}

describe('engine agnostic visual-config import boundary policy', () => {
  it('prevents cnl/kernel/sim modules from importing runner visual-config ownership surfaces', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const repoRoot = resolve(engineRoot, '..', '..');
    const runnerConfigRoot = normalize(resolve(repoRoot, 'packages', 'runner', 'src', 'config'));

    const files = AGNOSTIC_ENGINE_DIRS.flatMap((segment) =>
      listTypeScriptFiles(resolve(engineRoot, 'src', segment)),
    );

    const violations = findImportBoundaryViolations(files, ({ filePath, specifier }) =>
      isRunnerVisualConfigImport(specifier, filePath, runnerConfigRoot),
    );

    assert.deepEqual(
      violations,
      [],
      'Agnostic engine layers must not import runner visual-config ownership modules',
    );
  });
});
