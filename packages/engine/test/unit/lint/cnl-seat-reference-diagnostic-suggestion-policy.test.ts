import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const CANONICAL_MODULE_BASENAME = 'seat-reference-diagnostic-suggestion-policy.ts';
const CANONICAL_IMPORT_SPECIFIER = './seat-reference-diagnostic-suggestion-policy.js';

const POLICY_LITERALS = [
  'Use one of the declared seat ids.',
  'Use one of the declared seat ids from the selected seat catalog.',
  'Use "self" or one of the declared seat ids.',
] as const;

function findSeatSuggestionPolicyImports(source: string): string[] {
  const importSources: string[] = [];
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
    const importedSource = match[1];
    const fromModule = match[2];
    if (!importedSource || !fromModule) {
      continue;
    }
    const imported = importedSource.split(',').map((part) => part.trim());
    if (
      imported.some((part) =>
        /^(SEAT_REFERENCE_FALLBACK_SUGGESTION|SEAT_REFERENCE_SELECTED_CATALOG_FALLBACK_SUGGESTION|SELF_OR_SEAT_REFERENCE_FALLBACK_SUGGESTION)(\s+as\s+\w+)?$/u.test(
          part,
        ),
      )
    ) {
      importSources.push(fromModule);
    }
  }
  return importSources;
}

describe('cnl seat-reference diagnostic suggestion policy boundary', () => {
  it('keeps canonical seat-reference suggestion literals defined only in policy module', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const canonicalFile = resolve(cnlDir, CANONICAL_MODULE_BASENAME);

    const duplicateLiteralLocations: string[] = [];
    for (const file of files) {
      if (file === canonicalFile) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const literal of POLICY_LITERALS) {
        if (source.includes(literal)) {
          duplicateLiteralLocations.push(`${file}:${literal}`);
        }
      }
    }

    assert.deepEqual(
      duplicateLiteralLocations,
      [],
      'seat-reference diagnostic suggestion literals must be defined only in the canonical policy module',
    );
  });

  it('imports seat-reference suggestion constants only from the canonical policy module', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);

    const invalidImports: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const policyImportSources = findSeatSuggestionPolicyImports(source);
      for (const importSource of policyImportSources) {
        if (importSource !== CANONICAL_IMPORT_SPECIFIER) {
          invalidImports.push(`${file}:${importSource}`);
        }
      }
    }

    assert.deepEqual(
      invalidImports,
      [],
      'CNL modules must import seat-reference diagnostic suggestion constants only from the canonical policy module',
    );
  });
});
