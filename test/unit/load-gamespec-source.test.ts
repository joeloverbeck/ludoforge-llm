import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { loadGameSpecSource } from '../../src/cnl/load-gamespec-source.js';

describe('loadGameSpecSource', () => {
  it('loads a single markdown file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamespec-file-'));
    try {
      const filePath = join(dir, 'game.md');
      writeFileSync(filePath, '# test\n```yaml\nmetadata: { id: test, players: { min: 2, max: 2 } }\n```', 'utf8');

      const loaded = loadGameSpecSource(filePath);
      assert.equal(loaded.sourcePaths.length, 1);
      assert.equal(loaded.sourcePaths[0], filePath);
      assert.equal(loaded.markdown.includes('metadata'), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads markdown files from a directory in deterministic lexicographic order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamespec-dir-'));
    try {
      const a = join(dir, '00-a.md');
      const b = join(dir, '10-b.md');
      const z = join(dir, '99-z.md');
      writeFileSync(z, 'Z', 'utf8');
      writeFileSync(b, 'B', 'utf8');
      writeFileSync(a, 'A', 'utf8');
      writeFileSync(join(dir, 'ignore.txt'), 'ignored', 'utf8');

      const loaded = loadGameSpecSource(dir);
      assert.deepEqual(loaded.sourcePaths, [a, b, z]);
      assert.equal(loaded.markdown, 'A\n\nB\n\nZ');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when directory has no markdown files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamespec-empty-'));
    try {
      writeFileSync(join(dir, 'notes.txt'), 'not markdown', 'utf8');
      assert.throws(() => loadGameSpecSource(dir), /No markdown source files found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
