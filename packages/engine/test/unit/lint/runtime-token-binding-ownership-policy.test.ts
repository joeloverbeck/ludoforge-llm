// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  analyzeCanonicalSymbolOwnerPolicy,
  findEnginePackageRoot,
  listTypeScriptFiles,
} from '../../helpers/lint-policy-helpers.js';
import {
  collectCallExpressionsByIdentifier,
  collectNamedImportsByLocalName,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';

const CANONICAL_MODULE_BASENAME = 'token-binding.ts';
const CANONICAL_IMPORT_SPECIFIER = './token-binding.js';

describe('runtime token-binding ownership policy', () => {
  it('keeps resolveRuntimeTokenBindingValue owned by token-binding.ts with no alias boundaries', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const report = analyzeCanonicalSymbolOwnerPolicy(thisDir, {
      moduleSubdir: ['src', 'kernel'],
      canonicalModuleBasename: CANONICAL_MODULE_BASENAME,
      canonicalImportSpecifier: CANONICAL_IMPORT_SPECIFIER,
      symbolNames: ['resolveRuntimeTokenBindingValue'],
    });

    assert.deepEqual(
      report.exportedDefinitionFiles,
      [report.canonicalFile],
      'resolveRuntimeTokenBindingValue export must exist only in src/kernel/token-binding.ts',
    );
    assert.deepEqual(
      report.invalidLocalDefinitions,
      [],
      'non-canonical kernel modules must not define resolveRuntimeTokenBindingValue locally',
    );
    assert.deepEqual(
      report.invalidImports,
      [],
      'kernel modules must import resolveRuntimeTokenBindingValue only from ./token-binding.js without aliasing',
    );
    assert.deepEqual(
      report.invalidReExports,
      [],
      'non-canonical kernel modules must not re-export resolveRuntimeTokenBindingValue through alias or wildcard paths',
    );
    assert.deepEqual(
      report.invalidNonCanonicalExports,
      [],
      'resolveRuntimeTokenBindingValue must be exported only from src/kernel/token-binding.ts',
    );
  });

  it('disallows isRuntimeToken imports/calls outside token-binding.ts', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelRoot = resolve(engineRoot, 'src', 'kernel');
    const tokenBindingFile = resolve(kernelRoot, 'token-binding.ts');
    const tokenShapeFile = resolve(kernelRoot, 'token-shape.ts');

    const importViolations: string[] = [];
    const callViolations: string[] = [];

    for (const filePath of listTypeScriptFiles(kernelRoot)) {
      if (filePath === tokenBindingFile || filePath === tokenShapeFile) {
        continue;
      }
      const source = readFileSync(filePath, 'utf8');
      const sourceFile = parseTypeScriptSource(source, filePath);
      const fileLabel = relative(engineRoot, filePath).replaceAll('\\', '/');

      const namedImports = collectNamedImportsByLocalName(sourceFile, './token-shape.js');
      for (const [localName, importedName] of namedImports.entries()) {
        if (importedName !== 'isRuntimeToken') {
          continue;
        }
        importViolations.push(
          `${fileLabel}: imported token-shape symbol "${importedName}" as "${localName}" outside token-binding ownership`,
        );
      }

      const calls = collectCallExpressionsByIdentifier(sourceFile, 'isRuntimeToken');
      for (const call of calls) {
        const line = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1;
        callViolations.push(`${fileLabel}:${line}: ${call.getText(sourceFile)}`);
      }
    }

    assert.deepEqual(
      importViolations,
      [],
      [
        'isRuntimeToken must not be imported outside src/kernel/token-binding.ts.',
        'Route token binding checks through resolveRuntimeTokenBindingValue in token-binding.ts.',
        'Violations:',
        ...importViolations.map((violation) => `- ${violation}`),
      ].join('\n'),
    );

    assert.deepEqual(
      callViolations,
      [],
      [
        'isRuntimeToken callsites are forbidden outside src/kernel/token-binding.ts.',
        'Use resolveRuntimeTokenBindingValue for token-binding runtime checks.',
        'Violations:',
        ...callViolations.map((violation) => `- ${violation}`),
      ].join('\n'),
    );
  });
});
