import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { loadGameSpecEntrypoint, loadGameSpecSource } from '../../src/cnl/load-gamespec-source.js';

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

  it('loads and composes a filesystem entrypoint file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamespec-entry-'));
    try {
      const entryPath = join(dir, 'game-spec.md');
      const metaPath = join(dir, 'meta.md');
      const rulesPath = join(dir, 'rules.md');

      writeFileSync(entryPath, '```yaml\nimports:\n  - ./meta.md\n  - ./rules.md\n```', 'utf8');
      writeFileSync(metaPath, '```yaml\nmetadata:\n  id: test-game\n  players: { min: 2, max: 2 }\n```', 'utf8');
      writeFileSync(
        rulesPath,
        [
          '```yaml',
          'turnStructure:',
          '  phases:',
          '    - id: main',
          'actions:',
          '  - id: pass',
          '    actor: active',
          '    executor: actor',
          '    phase: [main]',
          '    params: []',
          '    pre: null',
          '    cost: []',
          '    effects: []',
          '    limits: []',
          'terminal:',
          '  conditions:',
          '    - when: { op: "==", left: 1, right: 1 }',
          '      result: { type: draw }',
          '```',
        ].join('\n'),
        'utf8',
      );

      const loaded = loadGameSpecEntrypoint(entryPath);
      assert.deepEqual(loaded.sourcePaths, [metaPath, rulesPath, entryPath]);
      assert.equal(loaded.parsed.doc.metadata?.id, 'test-game');
      assert.equal(loaded.parsed.doc.actions?.[0]?.id, 'pass');
      assert.equal(loaded.parsed.sourceMap.byPath['metadata.id']?.sourceId, metaPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects directory entrypoints for composed loading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamespec-entry-dir-'));
    try {
      assert.throws(() => loadGameSpecEntrypoint(dir), /must be a markdown file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
