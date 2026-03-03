import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const CANONICAL_MODULE_BASENAME = 'identifier-utils.ts';
const CANONICAL_IMPORT_SPECIFIER = './identifier-utils.js';

function hasLocalNormalizeIdentifierDefinition(source: string): boolean {
  return /^\s*(?:export\s+)?function\s+normalizeIdentifier\s*\(/mu.test(source)
    || /^\s*(?:export\s+)?(?:const|let|var)\s+normalizeIdentifier\b/mu.test(source);
}

function hasAnyNormalizeIdentifierExport(source: string): boolean {
  return /^\s*export\s+function\s+normalizeIdentifier\s*\(/mu.test(source)
    || /^\s*export\s+(?:const|let|var)\s+normalizeIdentifier\b/mu.test(source)
    || /^\s*export\s*\{[^}]*\bnormalizeIdentifier\b[^}]*\}/mu.test(source);
}

function findNormalizeIdentifierImports(source: string): string[] {
  const importSources: string[] = [];
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
    const importedSource = match[1];
    const fromModule = match[2];
    if (!importedSource || !fromModule) {
      continue;
    }
    const imported = importedSource.split(',').map((part) => part.trim());
    if (imported.some((part) => /^normalizeIdentifier(?:\s+as\s+\w+)?$/u.test(part))) {
      importSources.push(fromModule);
    }
  }
  return importSources;
}

describe('cnl identifier normalization single-source policy', () => {
  it('keeps normalizeIdentifier defined and exported only in identifier-utils.ts', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const canonicalFile = resolve(cnlDir, CANONICAL_MODULE_BASENAME);

    const exportedDefinitionFiles = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return hasAnyNormalizeIdentifierExport(source);
    });
    assert.deepEqual(
      exportedDefinitionFiles,
      [canonicalFile],
      'normalizeIdentifier export must exist only in src/cnl/identifier-utils.ts',
    );

    const duplicateDefinitionFiles = files.filter((file) => {
      if (file === canonicalFile) {
        return false;
      }
      const source = readFileSync(file, 'utf8');
      return hasLocalNormalizeIdentifierDefinition(source);
    });
    assert.deepEqual(
      duplicateDefinitionFiles,
      [],
      'non-canonical CNL modules must not define local normalizeIdentifier implementations',
    );
  });

  it('imports normalizeIdentifier only from ./identifier-utils.js', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);

    const invalidImports: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const normalizeImportSources = findNormalizeIdentifierImports(source);
      for (const importSource of normalizeImportSources) {
        if (importSource !== CANONICAL_IMPORT_SPECIFIER) {
          invalidImports.push(`${file}:${importSource}`);
        }
      }
    }

    assert.deepEqual(
      invalidImports,
      [],
      'CNL modules must import normalizeIdentifier only from ./identifier-utils.js',
    );
  });
});
