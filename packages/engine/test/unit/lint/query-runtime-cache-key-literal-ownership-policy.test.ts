import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

type LiteralViolation = {
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
  readonly literal: string;
};

const QUOTES = [`'`, `"`, '`'] as const;

function toLowerCamelCase(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

function deriveQueryRuntimeCacheKeyLiterals(canonicalSource: string): string[] {
  const getDomains = new Set<string>();
  const setDomains = new Set<string>();

  for (const match of canonicalSource.matchAll(/\bget(?<domain>[A-Z]\w*)Index\s*\(/gmu)) {
    const domain = match.groups?.domain;
    if (domain) {
      getDomains.add(domain);
    }
  }
  for (const match of canonicalSource.matchAll(/\bset(?<domain>[A-Z]\w*)Index\s*\(/gmu)) {
    const domain = match.groups?.domain;
    if (domain) {
      setDomains.add(domain);
    }
  }

  const getterOnly = [...getDomains].filter((domain) => !setDomains.has(domain));
  const setterOnly = [...setDomains].filter((domain) => !getDomains.has(domain));
  assert.deepEqual(
    { getterOnly, setterOnly },
    { getterOnly: [], setterOnly: [] },
    [
      'query-runtime-cache.ts must expose paired get*/set*Index accessors per query cache domain.',
      `Getter-only domains: ${getterOnly.join(', ') || '(none)'}`,
      `Setter-only domains: ${setterOnly.join(', ') || '(none)'}`,
    ].join('\n'),
  );

  return [...getDomains].sort((left, right) => left.localeCompare(right)).map(toLowerCamelCase);
}

function findLineLiteralViolations(source: string, literal: string): LiteralViolation[] {
  const violations: LiteralViolation[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const hasQuotedLiteral = QUOTES.some((quote) => line.includes(`${quote}${literal}${quote}`));
    if (!hasQuotedLiteral) {
      continue;
    }
    violations.push({
      file: '',
      line: index + 1,
      excerpt: line.trim(),
      literal,
    });
  }
  return violations;
}

describe('query-runtime-cache key literal ownership policy', () => {
  it('derives key literals from canonical query-runtime-cache accessor signatures', () => {
    const source = [
      'export interface QueryRuntimeCache {',
      '  getTokenZoneByTokenIdIndex(state: GameState): ReadonlyMap<string, string> | undefined;',
      '  setTokenZoneByTokenIdIndex(state: GameState, value: ReadonlyMap<string, string>): void;',
      '  getStackTopByZoneIdIndex(state: GameState): ReadonlyMap<string, string> | undefined;',
      '  setStackTopByZoneIdIndex(state: GameState, value: ReadonlyMap<string, string>): void;',
      '}',
    ].join('\n');

    assert.deepEqual(deriveQueryRuntimeCacheKeyLiterals(source), ['stackTopByZoneId', 'tokenZoneByTokenId']);
  });

  it('keeps raw query cache key literals owned only by query-runtime-cache.ts', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const canonicalFile = resolve(engineRoot, 'src', 'kernel', 'query-runtime-cache.ts');
    const policyTestFile = resolve(engineRoot, 'test', 'unit', 'lint', 'query-runtime-cache-key-literal-ownership-policy.test.ts');
    const canonicalSource = readFileSync(canonicalFile, 'utf8');
    const literals = deriveQueryRuntimeCacheKeyLiterals(canonicalSource);

    assert.notEqual(
      literals.length,
      0,
      'Failed to derive query cache key literals from canonical query-runtime-cache.ts accessor signatures.',
    );

    const sourceFiles = [
      ...listTypeScriptFiles(resolve(engineRoot, 'src', 'kernel')),
      ...listTypeScriptFiles(resolve(engineRoot, 'test')),
    ];
    const disallowedCandidates = sourceFiles.filter((file) => file !== canonicalFile && file !== policyTestFile);

    const violations: LiteralViolation[] = [];

    for (const file of disallowedCandidates) {
      const source = readFileSync(file, 'utf8');
      for (const literal of literals) {
        for (const violation of findLineLiteralViolations(source, literal)) {
          violations.push({
            ...violation,
            file: relative(engineRoot, file),
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      [
        'Raw query runtime cache key literals are only allowed in src/kernel/query-runtime-cache.ts.',
        'Use QueryRuntimeCache domain methods instead of inline key strings.',
        'Violations:',
        ...violations.map((violation) => `- ${violation.file}:${violation.line} (${violation.literal}) -> ${violation.excerpt}`),
      ].join('\n'),
    );
  });
});
