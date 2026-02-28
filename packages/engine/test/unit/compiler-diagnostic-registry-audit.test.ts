import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';

const CNL_SOURCE_DIR = existsSync(join(process.cwd(), 'src/cnl'))
  ? join(process.cwd(), 'src/cnl')
  : fileURLToPath(new URL('../../../src/cnl/', import.meta.url));
const DIAGNOSTIC_LITERAL_POLICIES = [
  {
    namespace: 'CNL_COMPILER_*',
    allowedLiteralFiles: new Set<string>(['compiler-diagnostic-codes.ts']),
    literalPattern: /(['"`])(?:\\.|(?!\1)[^\\\r\n])*CNL_COMPILER_[A-Z0-9_]*(?:\\.|(?!\1)[^\\\r\n])*\1/g,
  },
  {
    namespace: 'CNL_XREF_*',
    allowedLiteralFiles: new Set<string>(['cross-validate-diagnostic-codes.ts']),
    literalPattern: /(['"`])(?:\\.|(?!\1)[^\\\r\n])*CNL_XREF_[A-Z0-9_]*(?:\\.|(?!\1)[^\\\r\n])*\1/g,
  },
] as const;
const normalizePath = (value: string): string => value.split(sep).join('/');

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
  it('keeps the audit scan scope constrained to src/cnl TypeScript sources', () => {
    const root = process.cwd();
    const sourceFiles = collectTsFiles(CNL_SOURCE_DIR).map((file) => normalizePath(relative(root, file)));
    const outsideScopeFiles = sourceFiles.filter((file) => !file.includes('src/cnl/')).sort((left, right) => left.localeCompare(right));

    assert.equal(sourceFiles.length > 0, true, `Expected at least one TypeScript source file under ${normalizePath(CNL_SOURCE_DIR)}`);
    assert.deepEqual(
      outsideScopeFiles,
      [],
      `Diagnostic literal audit scope drifted outside src/cnl:\n${outsideScopeFiles.map((file) => `- ${file}`).join('\n')}`,
    );
  });

  it('forbids inline diagnostic literals outside canonical registry files', () => {
    const root = process.cwd();
    const violations: string[] = [];
    const sourceFiles = collectTsFiles(CNL_SOURCE_DIR);

    for (const policy of DIAGNOSTIC_LITERAL_POLICIES) {
      for (const file of sourceFiles) {
        if (policy.allowedLiteralFiles.has(basename(file))) {
          continue;
        }

        const source = readFileSync(file, 'utf8');
        const matches = source.match(policy.literalPattern);
        if (matches !== null && matches.length > 0) {
          violations.push(`${policy.namespace}: ${normalizePath(relative(root, file))} contains ${matches.join(', ')}`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found inline diagnostic literals outside canonical registries:\n${violations.map((v) => `- ${v}`).join('\n')}`,
    );
  });
});
