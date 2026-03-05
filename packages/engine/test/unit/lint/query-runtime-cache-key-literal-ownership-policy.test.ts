import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { QUERY_RUNTIME_CACHE_INDEX_KEYS } from '../../../src/kernel/query-runtime-cache.js';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

type LiteralViolation = {
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
  readonly literal: string;
};

const QUOTES = [`'`, `"`, '`'] as const;

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
  it('keeps raw query cache key literals owned only by query-runtime-cache.ts', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const canonicalFile = resolve(engineRoot, 'src', 'kernel', 'query-runtime-cache.ts');

    const sourceFiles = [
      ...listTypeScriptFiles(resolve(engineRoot, 'src', 'kernel')),
      ...listTypeScriptFiles(resolve(engineRoot, 'test')),
    ];
    const disallowedCandidates = sourceFiles.filter((file) => file !== canonicalFile);

    const literals = Object.values(QUERY_RUNTIME_CACHE_INDEX_KEYS);
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
        'Use QUERY_RUNTIME_CACHE_INDEX_KEYS or typed cache helper accessors instead of inline key strings.',
        'Violations:',
        ...violations.map((violation) => `- ${violation.file}:${violation.line} (${violation.literal}) -> ${violation.excerpt}`),
      ].join('\n'),
    );
  });
});
