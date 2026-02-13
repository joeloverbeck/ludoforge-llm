import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../../src/cnl/index.js';
import { validateGameDef } from '../../../src/kernel/index.js';
import { assertNoDiagnostics } from '../../helpers/diagnostic-helpers.js';
import { readCompilerFixture } from '../../helpers/production-spec-helpers.js';

const reorderedValidMarkdown = [
  '# Compiler Valid Fixture (Reordered)',
  '',
  '```yaml',
  'actions:',
  '  - limits: []',
  '    effects:',
  '      - draw:',
  '          count: 1',
  '          to: hand:each',
  '          from: deck:none',
  '    cost: []',
  '    pre: null',
  '    params: []',
  '    phase: main',
  '    actor: active',
  '    id: drawEach',
  'turnStructure:',
  '  activePlayerOrder: roundRobin',
  '  phases:',
  '    - id: main',
  'zones:',
  '  - ordering: stack',
  '    visibility: hidden',
  '    owner: none',
  '    id: deck',
  '  - ordering: set',
  '    visibility: owner',
  '    owner: player',
  '    id: hand',
  'metadata:',
  '  players:',
  '    max: 2',
  '    min: 2',
  '  id: compiler-valid',
  'endConditions:',
  '  - result:',
  '      type: draw',
  '    when:',
  '      right: 1',
  '      left: 1',
  '      op: "=="',
  '```',
].join('\n');

const reorderedMalformedMarkdown = [
  '# Compiler Malformed Fixture (Reordered)',
  '',
  '```yaml',
  'actions:',
  '  - effects: {}',
  '    limits: []',
  '    pre: null',
  '    params: []',
  '    phase: main',
  '    actor:',
  '      currentPlayer: true',
  '    cost: []',
  '    id: draw',
  'metadata:',
  '  players:',
  '    max: -1',
  '    min: 0',
  '  id: ""',
  'zones:',
  '  - ordering: stack',
  '    visibility: hidden',
  '    owner: any',
  '    id: deck',
  'turnStructure:',
  '  activePlayerOrder: zigzag',
  '  phases:',
  '    - id: main',
  'endConditions:',
  '  - result:',
  '      type: draw',
  '    when:',
  '      always: false',
  '```',
].join('\n');

describe('compiler property-style invariants', () => {
  it('zero-error compile implies validateGameDef returns zero errors', () => {
    const corpus = [readCompilerFixture('compile-valid.md'), reorderedValidMarkdown];

    corpus.forEach((markdown) => {
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

      assertNoDiagnostics(compiled);
      const { gameDef } = compiled;
      assert.notEqual(gameDef, null);
      if (gameDef === null) {
        throw new Error('Expected compiler fixture to produce a non-null gameDef');
      }
      assert.deepEqual(validateGameDef(gameDef), []);
    });
  });

  it('compiler diagnostics keep required fields non-empty and suggestions, when present, are non-empty', () => {
    const corpus = [readCompilerFixture('compile-malformed.md'), reorderedMalformedMarkdown];

    corpus.forEach((markdown) => {
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

      assert.equal(compiled.diagnostics.length > 0, true);
      compiled.diagnostics.forEach((diagnostic) => {
        assert.equal(diagnostic.code.trim().length > 0, true);
        assert.equal(diagnostic.path.trim().length > 0, true);
        assert.equal(diagnostic.message.trim().length > 0, true);

        if (diagnostic.suggestion !== undefined) {
          assert.equal(diagnostic.suggestion.trim().length > 0, true);
        }
      });
    });
  });

  it('diagnostic ordering is stable for semantically identical docs under YAML key reorderings', () => {
    const base = parseGameSpec(readCompilerFixture('compile-malformed.md'));
    const reordered = parseGameSpec(reorderedMalformedMarkdown);
    const baseCompiled = compileGameSpecToGameDef(base.doc);
    const reorderedCompiled = compileGameSpecToGameDef(reordered.doc);

    assert.deepEqual(reorderedCompiled.diagnostics, baseCompiled.diagnostics);
    assert.equal(reorderedCompiled.gameDef, baseCompiled.gameDef);
  });
});
