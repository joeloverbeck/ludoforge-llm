import * as assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, composeGameSpec, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';

function resolveImport(importPath: string, importer: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), importPath));
}

describe('compile pipeline compose integration', () => {
  it('compiles identical monolithic vs composed specs to equivalent GameDef outputs', () => {
    const monolithicMarkdown = [
      '```yaml',
      'metadata:',
      '  id: compose-equivalence',
      '  players:',
      '    min: 2',
      '    max: 2',
      'zones:',
      '  - id: deck:none',
      '    owner: none',
      '    visibility: hidden',
      '    ordering: stack',
      '  - id: hand:player',
      '    owner: player',
      '    visibility: owner',
      '    ordering: set',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: draw',
      '    actor: active',
    '    executor: actor',
      '    phase: main',
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
    ].join('\n');

    const composedSources: Record<string, string> = {
      '/spec/root.md': [
        '```yaml',
        'imports:',
        '  - ./meta.md',
        '  - ./board.md',
        '  - ./flow.md',
        '```',
      ].join('\n'),
      '/spec/meta.md': [
        '```yaml',
        'metadata:',
        '  id: compose-equivalence',
        '  players:',
        '    min: 2',
        '    max: 2',
        '```',
      ].join('\n'),
      '/spec/board.md': [
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
      '/spec/flow.md': [
        '```yaml',
        'turnStructure:',
        '  phases:',
        '    - id: main',
        'actions:',
        '  - id: draw',
        '    actor: active',
    '    executor: actor',
        '    phase: main',
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
    };

    const monolithicParsed = parseGameSpec(monolithicMarkdown, { sourceId: '/spec/mono.md' });
    const composedParsed = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => composedSources[sourceId] ?? null,
      resolveImport,
    });

    assertNoErrors(monolithicParsed);
    assertNoErrors(composedParsed);
    assert.deepEqual(validateGameSpec(monolithicParsed.doc, { sourceMap: monolithicParsed.sourceMap }), []);
    assert.deepEqual(validateGameSpec(composedParsed.doc, { sourceMap: composedParsed.sourceMap }), []);

    const monolithicCompiled = compileGameSpecToGameDef(monolithicParsed.doc, { sourceMap: monolithicParsed.sourceMap });
    const composedCompiled = compileGameSpecToGameDef(composedParsed.doc, { sourceMap: composedParsed.sourceMap });

    assertNoDiagnostics(monolithicCompiled);
    assertNoDiagnostics(composedCompiled);
    assert.deepEqual(composedCompiled, monolithicCompiled);
  });
});
