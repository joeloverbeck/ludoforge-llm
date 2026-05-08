// @test-class: architectural-invariant
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sourceRoot = existsSync('packages/engine/src') ? 'packages/engine/src' : 'src';

function findSourceReferences(searchText: string): string {
  const matches: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || !path.endsWith('.ts')) {
        continue;
      }
      const lines = readFileSync(path, 'utf8').split(/\r?\n/u);
      lines.forEach((line, index) => {
        if (line.includes(searchText)) {
          matches.push(`${path}:${index + 1}:${line}`);
        }
      });
    }
  };

  visit(sourceRoot);
  return matches.join('\n');
}

describe('decision-stack serialization walker enforcement (spec 151)', () => {
  it('sanitizeNestedBigInts is fully deleted from packages/engine/src', () => {
    const output = findSourceReferences('sanitizeNestedBigInts');
    assert.equal(output, '', `Residual references to sanitizeNestedBigInts:\n${output}`);
  });

  it('restoreNestedSerializedBigInts is fully deleted from packages/engine/src', () => {
    const output = findSourceReferences('restoreNestedSerializedBigInts');
    assert.equal(output, '', `Residual references to restoreNestedSerializedBigInts:\n${output}`);
  });
});
