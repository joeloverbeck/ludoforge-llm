import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const SHARED_ENGINE_DIRS = ['src/kernel', 'src/cnl'] as const;
const BANNED_PATTERNS = [
  /fitl/i,
  /fire in the lake/i,
  /\barvn\b/i,
  /\bnva\b/i,
  /\bvc\b/i,
  /westys/i,
] as const;

const collectTsFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
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

describe('no-hardcoded FITL audit', () => {
  it('keeps shared kernel/compiler modules free of FITL-specific ids and names', () => {
    const root = process.cwd();
    const violations: string[] = [];

    for (const relativeDir of SHARED_ENGINE_DIRS) {
      const absoluteDir = join(root, relativeDir);
      for (const file of collectTsFiles(absoluteDir)) {
        const source = readFileSync(file, 'utf8');
        for (const pattern of BANNED_PATTERNS) {
          if (pattern.test(source)) {
            violations.push(`${relative(root, file)} matches ${String(pattern)}`);
          }
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
