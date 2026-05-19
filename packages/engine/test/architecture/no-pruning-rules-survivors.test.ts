// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd().endsWith('/packages/engine')
  ? resolve(process.cwd(), '../..')
  : process.cwd();
const deprecatedKey = 'pruning' + 'Rules';
const roots = ['packages/engine/src', 'packages/engine/test', 'data/games', 'campaigns'];
const allowedFiles = new Set([
  'packages/engine/test/architecture/no-pruning-rules-survivors.test.ts',
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'archive' || entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (stat.isFile()) {
      yield path;
    }
  }
}

describe('no deprecated guardrail predecessor survivors', () => {
  it('keeps authored, source, and test surfaces on guardrails only', () => {
    const hits: string[] = [];

    for (const root of roots) {
      for (const path of walk(join(repoRoot, root))) {
        const rel = relative(repoRoot, path);
        if (allowedFiles.has(rel)) {
          continue;
        }
        const text = readFileSync(path, 'utf8');
        if (text.includes(deprecatedKey)) {
          hits.push(rel);
        }
      }
    }

    assert.deepEqual(hits.sort(), []);
  });
});
