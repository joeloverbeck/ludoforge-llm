import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/parser.js';

describe('parseGameSpec API shape', () => {
  it('returns parsed sections while keeping total deterministic result shape', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: game',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.deepEqual(result.doc.metadata, {
      id: 'game',
      players: {
        min: 2,
        max: 4,
      },
    });
    assert.equal(result.doc.constants, null);
    assert.equal(result.doc.turnStructure, null);
    assert.ok('metadata' in result.sourceMap.byPath);
    assert.ok(result.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
  });

  it('surfaces YAML lint diagnostics from fenced YAML blocks', () => {
    const result = parseGameSpec('```yaml\nmetadata:  \n  id: on\n```');

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_004'));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_005'));
    assert.ok(result.diagnostics.every((diagnostic) => diagnostic.path.startsWith('yaml.block.0.')));
  });

  it('does not throw for arbitrary input', () => {
    assert.doesNotThrow(() => parseGameSpec('\u0000\u0001 not yaml'));
  });

  it('is equivalent for reversed singleton section order', () => {
    const forward = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: game-a',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '  activePlayerOrder: roundRobin',
      '```',
    ].join('\n'));
    const reversed = parseGameSpec([
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '  activePlayerOrder: roundRobin',
      '```',
      '```yaml',
      'metadata:',
      '  id: game-a',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.deepEqual(forward.doc.metadata, reversed.doc.metadata);
    assert.deepEqual(forward.doc.turnStructure, reversed.doc.turnStructure);
    assert.ok(forward.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
    assert.ok(reversed.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
  });

  it('uses first singleton section and emits a warning for duplicates', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: first',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
      '```yaml',
      'metadata:',
      '  id: second',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.equal(result.doc.metadata?.id, 'first');
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_DUPLICATE_SINGLETON_SECTION'));
  });

  it('appends repeated list sections preserving encounter order', () => {
    const result = parseGameSpec([
      '```yaml',
      'actions:',
      '  - id: a1',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
      '```yaml',
      'actions:',
      '  - id: a2',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
    ].join('\n'));

    assert.deepEqual(
      result.doc.actions?.map((action) => action.id),
      ['a1', 'a2'],
    );
  });

  it('emits ambiguity diagnostics when fallback cannot resolve uniquely', () => {
    const result = parseGameSpec([
      '```yaml',
      'foo: bar',
      '```',
    ].join('\n'));

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_SECTION_AMBIGUOUS'));
  });

  it('caps diagnostics and appends a trailing truncation warning', () => {
    const markdown = [
      '```yaml',
      'metadata:  ',
      '  id: on',
      '```',
      '```yaml',
      'metadata:  ',
      '  id: on',
      '```',
    ].join('\n');

    const result = parseGameSpec(markdown, { maxDiagnostics: 3 });

    assert.equal(result.diagnostics.length, 3);
    assert.equal(result.diagnostics[2]?.code, 'CNL_PARSER_DIAGNOSTICS_TRUNCATED');
    assert.equal(result.diagnostics[2]?.path, 'parser.diagnostics');
    assert.equal(result.diagnostics[2]?.severity, 'warning');
  });
});
