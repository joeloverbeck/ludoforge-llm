// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

const cwd = process.cwd();
const repoRoot = cwd.endsWith('packages/engine') ? resolve(cwd, '../..') : cwd;

describe('preview budget migration residue', () => {
  it('does not retain the deleted move-only gate helper in engine source', () => {
    assert.deepEqual(findInTree('packages/engine/src', 'pickTopKByMoveOnlyScore'), []);
  });

  it('does not retain authored profile or fixture preview cap fields', () => {
    const hits = [
      ...findInTree('data/games', 'top' + 'K'),
      ...findInTree('packages/engine/test/fixtures', '"top' + 'K"'),
      ...findInTree('packages/engine/test/golden', '"top' + 'K"'),
    ];

    assert.deepEqual(hits, []);
  });

  it('keeps allocator ordering locale-independent', () => {
    const hits = findInTree('packages/engine/src/agents', 'localeCompare')
      .filter((path) => path.endsWith('preview-budget-allocator.ts') || path.endsWith('preview-group-key.ts'));

    assert.deepEqual(hits, []);
  });
});

function findInTree(relativeDir: string, needle: string): readonly string[] {
  const root = join(repoRoot, relativeDir);
  if (!existsSync(root)) {
    return [];
  }
  return walk(root)
    .filter((path) => readFileSync(path, 'utf8').includes(needle))
    .map((path) => relative(repoRoot, path))
    .sort();
}

function walk(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'dist' || name === 'node_modules') {
      return [];
    }
    const path = join(dir, name);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}
