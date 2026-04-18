// @test-class: architectural-invariant
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
const LEGACY_QUERY_CACHE_LITERALS = ['tokenZoneByTokenId'];

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
  it('keeps legacy token-zone cache literals out of kernel and test modules', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const policyTestFile = resolve(engineRoot, 'test', 'unit', 'lint', 'query-runtime-cache-key-literal-ownership-policy.test.ts');
    const sourceFiles = [
      ...listTypeScriptFiles(resolve(engineRoot, 'src', 'kernel')),
      ...listTypeScriptFiles(resolve(engineRoot, 'test')),
    ].filter((file) => file !== policyTestFile);

    const violations: LiteralViolation[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const literal of LEGACY_QUERY_CACHE_LITERALS) {
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
        'Legacy query runtime cache key literals are forbidden after canonical token-state-index adoption.',
        'Violations:',
        ...violations.map((violation) => `- ${violation.file}:${violation.line} (${violation.literal}) -> ${violation.excerpt}`),
      ].join('\n'),
    );
  });
});
