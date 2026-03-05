import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { collectCallExpressionsByIdentifier, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const GUARD_IDENTIFIER = 'assertEvalRuntimeResourcesContract';
const CANONICAL_IMPORT_SPECIFIER = './eval-runtime-resources-contract.js';

/**
 * Declared boundary manifest: each entry maps a kernel module basename
 * to the number of distinct boundary entry-points in that module that
 * accept caller-provided evalRuntimeResources and must call the guard.
 *
 * When you add a new boundary that accepts evalRuntimeResources from
 * callers, add it here. The policy test will fail if you don't.
 */
const BOUNDARY_MANIFEST: ReadonlyMap<string, number> = new Map([
  ['boundary-expiry.ts', 1],
  ['trigger-dispatch.ts', 1],
  ['action-applicability-preflight.ts', 1],
  ['action-executor.ts', 1],
  ['phase-lifecycle.ts', 1],
  ['action-actor.ts', 1],
  ['phase-advance.ts', 2],
]);

function hasImportFrom(source: string, specifier: string, identifier: string): boolean {
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from\\s*['"]${specifier.replace(/\./gu, '\\.')}['"]`,
    'u',
  );
  return pattern.test(source);
}

describe('eval-runtime-resources boundary guard policy', () => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const engineRoot = findEnginePackageRoot(thisDir);
  const kernelDir = resolve(engineRoot, 'src', 'kernel');
  const allKernelFiles = listTypeScriptFiles(kernelDir);

  it('every declared boundary module imports and calls the guard the expected number of times', () => {
    const missingImports: string[] = [];
    const callCountMismatches: string[] = [];

    for (const [basename, expectedCalls] of BOUNDARY_MANIFEST) {
      const filePath = resolve(kernelDir, basename);
      const source = readFileSync(filePath, 'utf8');

      if (!hasImportFrom(source, CANONICAL_IMPORT_SPECIFIER, GUARD_IDENTIFIER)) {
        missingImports.push(basename);
        continue;
      }

      const sourceFile = parseTypeScriptSource(source, basename);
      const calls = collectCallExpressionsByIdentifier(sourceFile, GUARD_IDENTIFIER);

      if (calls.length !== expectedCalls) {
        callCountMismatches.push(
          `${basename}: expected ${expectedCalls} guard call(s), found ${calls.length}`,
        );
      }
    }

    assert.deepEqual(
      missingImports,
      [],
      [
        'Boundary modules must import assertEvalRuntimeResourcesContract from the canonical module.',
        `Missing import in: ${missingImports.join(', ')}`,
        `Remediation: add import { ${GUARD_IDENTIFIER} } from '${CANONICAL_IMPORT_SPECIFIER}';`,
      ].join('\n'),
    );

    assert.deepEqual(
      callCountMismatches,
      [],
      [
        'Boundary modules must call assertEvalRuntimeResourcesContract exactly once per boundary entry-point.',
        'Mismatches:',
        ...callCountMismatches.map((m) => `  - ${m}`),
        'Remediation: ensure each boundary function that accepts caller-provided evalRuntimeResources',
        'calls assertEvalRuntimeResourcesContract exactly once near function entry.',
        'Update BOUNDARY_MANIFEST in this test if the number of entry-points has changed.',
      ].join('\n'),
    );
  });

  it('no kernel module imports the guard without being declared in the boundary manifest', () => {
    const canonicalBasename = 'eval-runtime-resources-contract.ts';
    const undeclaredGuardUsers: string[] = [];

    for (const filePath of allKernelFiles) {
      const basename = filePath.split('/').at(-1) ?? filePath;
      if (basename === canonicalBasename || BOUNDARY_MANIFEST.has(basename)) {
        continue;
      }

      const source = readFileSync(filePath, 'utf8');
      if (hasImportFrom(source, CANONICAL_IMPORT_SPECIFIER, GUARD_IDENTIFIER)) {
        undeclaredGuardUsers.push(basename);
      }
    }

    assert.deepEqual(
      undeclaredGuardUsers,
      [],
      [
        'Kernel modules that import assertEvalRuntimeResourcesContract must be declared in BOUNDARY_MANIFEST.',
        `Undeclared: ${undeclaredGuardUsers.join(', ')}`,
        'Remediation: add the module to BOUNDARY_MANIFEST with its expected guard call count.',
      ].join('\n'),
    );
  });
});
