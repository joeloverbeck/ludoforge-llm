import * as assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { loadGameSpecBundleFromEntrypoint } from '../../src/cnl/load-gamespec-source.js';
import { runGameSpecStagesFromBundle } from '../../src/cnl/staged-pipeline.js';

describe('runGameSpecStagesFromBundle', () => {
  it('compiles multi-fragment specs without tripping a combined-size maxInputBytes limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staged-entrypoint-'));
    try {
      const entryPath = join(dir, 'game-spec.md');
      const metadataPath = join(dir, 'metadata.md');
      const boardPath = join(dir, 'board.md');
      const rulesPath = join(dir, 'rules.md');

      writeFileSync(
        entryPath,
        '```yaml\nimports:\n  - ./metadata.md\n  - ./board.md\n  - ./rules.md\n```',
        'utf8',
      );
      writeFileSync(
        metadataPath,
        '```yaml\nmetadata:\n  id: fragment-sized\n  players: { min: 2, max: 2 }\n```',
        'utf8',
      );
      writeFileSync(
        boardPath,
        [
          '```yaml',
          'zones:',
          '  - id: deck:none',
          '    owner: none',
          '    visibility: hidden',
          '    ordering: stack',
          '  - id: hand:player',
          '    owner: player',
          '    visibility: owner',
          '    ordering: set',
          '```',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        rulesPath,
        [
          '```yaml',
          'turnStructure:',
          '  phases:',
          '    - id: main',
          'actions:',
          '  - id: draw',
          '    actor: active',
          '    executor: actor',
          '    phase: [main]',
          '    params: []',
          '    pre: null',
          '    cost: []',
          '    effects:',
          '      - draw: { from: deck:none, to: hand:active, count: 1 }',
          '    limits: []',
          'terminal:',
          '  conditions:',
          '    - when: { op: "==", left: 1, right: 1 }',
          '      result: { type: draw }',
          '```',
        ].join('\n'),
        'utf8',
      );

      const combinedBytes =
        Buffer.byteLength(readFile(entryPath), 'utf8') +
        Buffer.byteLength(readFile(metadataPath), 'utf8') +
        Buffer.byteLength(readFile(boardPath), 'utf8') +
        Buffer.byteLength(readFile(rulesPath), 'utf8');

      const bundle = loadGameSpecBundleFromEntrypoint(entryPath, {
        parseOptions: { maxInputBytes: combinedBytes - 1 },
      });
      const staged = runGameSpecStagesFromBundle(bundle);

      assert.equal(
        staged.parsed.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED'),
        false,
      );
      assert.equal(staged.validation.blocked, false);
      assert.equal(staged.compilation.blocked, false);
      assert.notEqual(staged.compilation.result?.gameDef, null);
      assert.deepEqual(staged.sourcePaths, [metadataPath, boardPath, rulesPath, entryPath]);
      assert.equal(staged.sourceFingerprint, bundle.sourceFingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies parser limits to individual fragments and blocks later stages on fragment errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staged-entrypoint-limit-'));
    try {
      const entryPath = join(dir, 'game-spec.md');
      const metadataPath = join(dir, 'metadata.md');

      writeFileSync(entryPath, '```yaml\nimports:\n  - ./metadata.md\n```', 'utf8');
      writeFileSync(
        metadataPath,
        ['```yaml', 'metadata:', `  id: ${'x'.repeat(256)}`, '  players: { min: 2, max: 2 }', '```'].join('\n'),
        'utf8',
      );

      const bundle = loadGameSpecBundleFromEntrypoint(entryPath, {
        parseOptions: { maxInputBytes: 64 },
      });
      const staged = runGameSpecStagesFromBundle(bundle);

      assert.equal(
        staged.parsed.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED'),
        true,
      );
      assert.equal(staged.validation.blocked, true);
      assert.equal(staged.compilation.blocked, true);
      assert.equal(staged.compilation.result, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reuses the preloaded bundle without reading sources again during later stages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staged-preloaded-bundle-'));
    try {
      const entryPath = join(dir, 'game-spec.md');
      const metadataPath = join(dir, 'metadata.md');
      const rulesPath = join(dir, 'rules.md');

      writeFileSync(entryPath, '```yaml\nimports:\n  - ./metadata.md\n  - ./rules.md\n```', 'utf8');
      writeFileSync(
        metadataPath,
        '```yaml\nmetadata:\n  id: preloaded-bundle\n  players: { min: 2, max: 2 }\n```',
        'utf8',
      );
      writeFileSync(
        rulesPath,
        [
          '```yaml',
          'zones:',
          '  - id: deck:none',
          '    owner: none',
          '    visibility: hidden',
          '    ordering: stack',
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

      const bundle = loadGameSpecBundleFromEntrypoint(entryPath);
      rmSync(metadataPath, { force: true });
      rmSync(rulesPath, { force: true });
      rmSync(entryPath, { force: true });

      const staged = runGameSpecStagesFromBundle(bundle);
      assert.equal(staged.validation.blocked, false);
      assert.equal(staged.compilation.blocked, false);
      assert.notEqual(staged.compilation.result?.gameDef, null);
      assert.equal(staged.parsed.doc.metadata?.id, 'preloaded-bundle');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}
