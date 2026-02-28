import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, relative } from 'node:path';
import { describe, it } from 'node:test';

const CNL_SOURCE_DIR = existsSync(join(process.cwd(), 'src/cnl'))
  ? join(process.cwd(), 'src/cnl')
  : fileURLToPath(new URL('../../../src/cnl/', import.meta.url));
const ALLOWED_LITERAL_FILES = new Set<string>(['compiler-diagnostic-codes.ts']);
const INLINE_COMPILER_DIAGNOSTIC_LITERAL = /(['"`])(?:\\.|(?!\1)[^\\\r\n])*CNL_COMPILER_[A-Z0-9_]*(?:\\.|(?!\1)[^\\\r\n])*\1/g;

const collectTsFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
};

describe('compiler diagnostic registry audit', () => {
  it('forbids inline CNL_COMPILER_* string literals outside canonical registry files', () => {
    const root = process.cwd();
    const violations: string[] = [];

    for (const file of collectTsFiles(CNL_SOURCE_DIR)) {
      if (ALLOWED_LITERAL_FILES.has(basename(file))) {
        continue;
      }

      const source = readFileSync(file, 'utf8');
      const matches = source.match(INLINE_COMPILER_DIAGNOSTIC_LITERAL);
      if (matches !== null && matches.length > 0) {
        violations.push(`${relative(root, file)} contains ${matches.join(', ')}`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found inline CNL_COMPILER_* literals outside canonical registry:\n${violations.map((v) => `- ${v}`).join('\n')}`,
    );
  });
});
