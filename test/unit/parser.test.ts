import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/parser.js';

describe('parseGameSpec API shape', () => {
  it('returns a total deterministic result shape', () => {
    const result = parseGameSpec('```yaml\nmetadata:\n  id: game\n```');

    assert.deepEqual(result.doc, {
      metadata: null,
      constants: null,
      globalVars: null,
      perPlayerVars: null,
      zones: null,
      tokenTypes: null,
      setup: null,
      turnStructure: null,
      actions: null,
      triggers: null,
      endConditions: null,
    });
    assert.deepEqual(result.sourceMap, { byPath: {} });
    assert.deepEqual(result.diagnostics, []);
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
