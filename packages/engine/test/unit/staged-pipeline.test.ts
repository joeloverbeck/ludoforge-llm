import * as assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { runGameSpecStagesFromEntrypoint } from '../../src/cnl/staged-pipeline.js';

describe('runGameSpecStagesFromEntrypoint', () => {
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

      const staged = runGameSpecStagesFromEntrypoint(entryPath, {
        parseOptions: { maxInputBytes: combinedBytes - 1 },
      });

      assert.equal(
        staged.parsed.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED'),
        false,
      );
      assert.equal(staged.validation.blocked, false);
      assert.equal(staged.compilation.blocked, false);
      assert.notEqual(staged.compilation.result?.gameDef, null);
      assert.deepEqual(staged.sourcePaths, [metadataPath, boardPath, rulesPath, entryPath]);
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

      const staged = runGameSpecStagesFromEntrypoint(entryPath, {
        parseOptions: { maxInputBytes: 64 },
      });

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
});

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}
