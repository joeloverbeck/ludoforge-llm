import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const CANONICAL_MODULE_BASENAME = 'seat-reference-diagnostic-suggestion-policy.ts';
const CANONICAL_IMPORT_SPECIFIER = './seat-reference-diagnostic-suggestion-policy.js';
const POLICY_SYMBOLS = [
  'SEAT_REFERENCE_FALLBACK_SUGGESTION',
  'SEAT_REFERENCE_SELECTED_CATALOG_FALLBACK_SUGGESTION',
  'SELF_OR_SEAT_REFERENCE_FALLBACK_SUGGESTION',
] as const;

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

function parseExportedNames(specifierList: string): string[] {
  const exportedNames: string[] = [];
  for (const specifier of specifierList.split(',')) {
    const normalized = specifier.trim().replace(/^type\s+/u, '');
    if (!normalized) {
      continue;
    }
    const asMatch = normalized.match(/^(?<left>\w+)\s+as\s+(?<right>\w+)$/u);
    if (asMatch?.groups?.right) {
      exportedNames.push(asMatch.groups.right);
      continue;
    }
    const localMatch = normalized.match(/^(?<name>\w+)$/u);
    if (localMatch?.groups?.name) {
      exportedNames.push(localMatch.groups.name);
    }
  }
  return exportedNames;
}

function findPolicySymbolReExports(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
    const exported = match[1];
    const fromModule = match[2];
    if (!exported || !fromModule) {
      continue;
    }
    const exportedNames = parseExportedNames(exported);
    for (const exportedName of exportedNames) {
      if (POLICY_SYMBOLS.includes(exportedName as (typeof POLICY_SYMBOLS)[number])) {
        violations.push(`${fromModule}:${exportedName}`);
      }
    }
  }
  return violations;
}

function findCanonicalWildcardReExports(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/gmu)) {
    const fromModule = match[1];
    if (fromModule === CANONICAL_IMPORT_SPECIFIER) {
      violations.push(fromModule);
    }
  }
  return violations;
}

function findPolicySymbolLocalExports(source: string): string[] {
  const exportedSymbols = new Set<string>();
  for (const symbol of POLICY_SYMBOLS) {
    const declarationPattern = new RegExp(
      `export\\s+(?:const|let|var|function|class|type|interface|enum)\\s+${symbol}\\b`,
      'u',
    );
    if (declarationPattern.test(source)) {
      exportedSymbols.add(symbol);
    }
  }

  for (const match of source.matchAll(/export\s*\{([^}]+)\}(?!\s*from)/gmu)) {
    const exported = match[1];
    if (!exported) {
      continue;
    }
    const exportedNames = parseExportedNames(exported);
    for (const exportedName of exportedNames) {
      if (POLICY_SYMBOLS.includes(exportedName as (typeof POLICY_SYMBOLS)[number])) {
        exportedSymbols.add(exportedName);
      }
    }
  }
  return [...exportedSymbols];
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

  it('prevents non-canonical CNL modules from re-exporting seat suggestion policy symbols', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const canonicalFile = resolve(cnlDir, CANONICAL_MODULE_BASENAME);

    const invalidReExports: string[] = [];
    for (const file of files) {
      if (file === canonicalFile) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const violation of findPolicySymbolReExports(source)) {
        invalidReExports.push(`${file}:${violation}`);
      }
      for (const violation of findCanonicalWildcardReExports(source)) {
        invalidReExports.push(`${file}:export*:${violation}`);
      }
    }

    assert.deepEqual(
      invalidReExports,
      [],
      'non-canonical CNL modules must not re-export seat suggestion policy symbols or wildcard-re-export the canonical policy module',
    );
  });

  it('keeps seat suggestion policy symbol exports on the canonical module only', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const canonicalFile = resolve(cnlDir, CANONICAL_MODULE_BASENAME);

    const invalidPolicySymbolExports: string[] = [];
    for (const file of files) {
      if (file === canonicalFile) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const exportedSymbol of findPolicySymbolLocalExports(source)) {
        invalidPolicySymbolExports.push(`${file}:${exportedSymbol}`);
      }
    }

    assert.deepEqual(
      invalidPolicySymbolExports,
      [],
      'seat suggestion policy symbols must be exported only from the canonical policy module',
    );
  });
});
