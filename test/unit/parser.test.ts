import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/parser.js';

describe('parseGameSpec API shape', () => {
  it('returns a total deterministic stub result', () => {
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

  it('does not throw for arbitrary input', () => {
    assert.doesNotThrow(() => parseGameSpec('\u0000\u0001 not yaml'));
  });
});
