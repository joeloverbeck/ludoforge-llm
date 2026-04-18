// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, findModuleSpecifiers } from '../../helpers/lint-policy-helpers.js';

describe('cnl scenario-selection core diagnostics import boundary policy', () => {
  it('keeps scenario selection core free of diagnostics imports', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const coreModulePath = resolve(engineRoot, 'src', 'cnl', 'scenario-linked-asset-selection-core.ts');
    const source = readFileSync(coreModulePath, 'utf8');
    const imports = findModuleSpecifiers(source);
    const diagnosticsModulePath = normalize(resolve(engineRoot, 'src', 'kernel', 'diagnostics.ts'));
    const selectionDiagnosticsModulePath = normalize(
      resolve(engineRoot, 'src', 'cnl', 'scenario-linked-asset-selection-diagnostics.ts'),
    );

    const violations = imports.filter((specifier) => {
      const normalizedSpecifier = normalize(specifier);
      if (normalizedSpecifier.includes('/kernel/diagnostics') || normalizedSpecifier.includes('kernel/diagnostics')) {
        return true;
      }
      if (normalizedSpecifier.includes('scenario-linked-asset-selection-diagnostics')) {
        return true;
      }
      if (!specifier.startsWith('.')) {
        return false;
      }
      const resolvedImportPath = normalize(resolve(dirname(coreModulePath), specifier));
      return resolvedImportPath === diagnosticsModulePath || resolvedImportPath === selectionDiagnosticsModulePath;
    });

    assert.deepEqual(
      violations,
      [],
      'scenario-linked-asset-selection-core.ts must not import diagnostics infrastructure',
    );
  });
});
