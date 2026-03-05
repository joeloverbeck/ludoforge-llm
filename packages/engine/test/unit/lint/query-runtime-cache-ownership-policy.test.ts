import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const OWNERSHIP_SYMBOLS = [
  'QUERY_RUNTIME_CACHE_INDEX_KEYS',
  'QueryRuntimeCacheIndexKey',
  'QueryRuntimeCache',
  'createQueryRuntimeCache',
  'getTokenZoneByTokenIdIndex',
  'setTokenZoneByTokenIdIndex',
] as const;

const CANONICAL_SPECIFIER = './query-runtime-cache.js';
const ALLOWED_BARREL_REEXPORTS = new Set(['index.ts', 'runtime.ts']);

type ParsedSpecifier = {
  readonly localName: string;
  readonly importedOrExportedName: string;
};

function parseSpecifierList(specifierList: string): ParsedSpecifier[] {
  const parsed: ParsedSpecifier[] = [];
  for (const part of specifierList.split(',')) {
    const normalized = part.trim().replace(/^type\s+/u, '');
    if (!normalized) {
      continue;
    }
    const asMatch = normalized.match(/^(?<local>\w+)\s+as\s+(?<renamed>\w+)$/u);
    if (asMatch?.groups?.local && asMatch.groups.renamed) {
      parsed.push({
        localName: asMatch.groups.local,
        importedOrExportedName: asMatch.groups.renamed,
      });
      continue;
    }
    const directMatch = normalized.match(/^(?<name>\w+)$/u);
    if (directMatch?.groups?.name) {
      parsed.push({
        localName: directMatch.groups.name,
        importedOrExportedName: directMatch.groups.name,
      });
    }
  }
  return parsed;
}

function hasExportedDefinition(source: string, symbolName: string): boolean {
  const exportedDeclarationPattern = new RegExp(
    `(?:^|\\n)\\s*export\\s+(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${symbolName}\\b`,
    'u',
  );
  if (exportedDeclarationPattern.test(source)) {
    return true;
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}(?!\s*from)/gmu)) {
    const specifierList = match[1];
    if (!specifierList) {
      continue;
    }
    for (const parsed of parseSpecifierList(specifierList)) {
      if (parsed.localName === symbolName || parsed.importedOrExportedName === symbolName) {
        return true;
      }
    }
  }
  return false;
}

function hasLocalDefinition(source: string, symbolName: string): boolean {
  const localDeclarationPattern = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${symbolName}\\b`,
    'u',
  );
  return localDeclarationPattern.test(source);
}

describe('query-runtime-cache ownership policy', () => {
  it('keeps query runtime cache ownership contracts on query-runtime-cache.ts without alias/re-export drift', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelDir = resolve(engineRoot, 'src', 'kernel');
    const canonicalFile = resolve(kernelDir, 'query-runtime-cache.ts');
    const files = listTypeScriptFiles(kernelDir);
    const ownershipSymbols = new Set<string>(OWNERSHIP_SYMBOLS);

    const missingCanonicalExports: string[] = [];
    const invalidLocalDefinitions: string[] = [];
    const invalidImports: string[] = [];
    const invalidNamedReExports: string[] = [];
    const invalidWildcardReExports: string[] = [];

    const canonicalSource = readFileSync(canonicalFile, 'utf8');
    for (const symbolName of OWNERSHIP_SYMBOLS) {
      if (!hasExportedDefinition(canonicalSource, symbolName)) {
        missingCanonicalExports.push(symbolName);
      }
    }

    for (const filePath of files) {
      if (filePath === canonicalFile) {
        continue;
      }
      const source = readFileSync(filePath, 'utf8');
      const fileName = filePath.split('/').at(-1) ?? filePath;

      for (const symbolName of OWNERSHIP_SYMBOLS) {
        if (hasLocalDefinition(source, symbolName)) {
          invalidLocalDefinitions.push(`${filePath}:${symbolName}`);
        }
      }

      for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
        const specifierList = match[1];
        const fromModule = match[2];
        if (!specifierList || !fromModule) {
          continue;
        }
        for (const parsed of parseSpecifierList(specifierList)) {
          if (!ownershipSymbols.has(parsed.localName)) {
            continue;
          }
          const hasAlias = parsed.localName !== parsed.importedOrExportedName;
          if (fromModule !== CANONICAL_SPECIFIER || hasAlias) {
            invalidImports.push(
              `${filePath}:${fromModule}:${parsed.localName}${hasAlias ? ` as ${parsed.importedOrExportedName}` : ''}`,
            );
          }
        }
      }

      for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
        const specifierList = match[1];
        const fromModule = match[2];
        if (!specifierList || !fromModule) {
          continue;
        }
        for (const parsed of parseSpecifierList(specifierList)) {
          if (!ownershipSymbols.has(parsed.localName) && !ownershipSymbols.has(parsed.importedOrExportedName)) {
            continue;
          }
          invalidNamedReExports.push(
            `${filePath}:${fromModule}:${parsed.localName}${parsed.localName !== parsed.importedOrExportedName ? ` as ${parsed.importedOrExportedName}` : ''}`,
          );
        }
      }

      for (const match of source.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/gmu)) {
        const fromModule = match[1];
        if (fromModule !== CANONICAL_SPECIFIER) {
          continue;
        }
        if (!ALLOWED_BARREL_REEXPORTS.has(fileName)) {
          invalidWildcardReExports.push(`${filePath}:export*:${fromModule}`);
        }
      }
    }

    const indexSource = readFileSync(resolve(kernelDir, 'index.ts'), 'utf8');
    const runtimeSource = readFileSync(resolve(kernelDir, 'runtime.ts'), 'utf8');

    assert.deepEqual(
      missingCanonicalExports,
      [],
      'query-runtime-cache.ts must export all canonical query runtime cache ownership symbols',
    );
    assert.deepEqual(
      invalidLocalDefinitions,
      [],
      'non-canonical kernel modules must not define query runtime cache ownership symbols locally',
    );
    assert.deepEqual(
      invalidImports,
      [],
      'kernel modules must import query runtime cache ownership symbols only from ./query-runtime-cache.js without aliasing',
    );
    assert.deepEqual(
      invalidNamedReExports,
      [],
      'non-canonical kernel modules must not named-re-export query runtime cache ownership symbols',
    );
    assert.deepEqual(
      invalidWildcardReExports,
      [],
      'only kernel barrels may wildcard re-export ./query-runtime-cache.js',
    );
    assert.equal(
      indexSource.includes(`export * from '${CANONICAL_SPECIFIER}';`) || indexSource.includes(`export * from "${CANONICAL_SPECIFIER}";`),
      true,
      'kernel/index.ts must expose query-runtime-cache.ts through direct canonical re-export',
    );
    assert.equal(
      runtimeSource.includes(`export * from '${CANONICAL_SPECIFIER}';`) || runtimeSource.includes(`export * from "${CANONICAL_SPECIFIER}";`),
      true,
      'kernel/runtime.ts must expose query-runtime-cache.ts through direct canonical re-export',
    );
  });
});
