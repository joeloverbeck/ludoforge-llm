import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec, validateGameSpec } from '../../../src/cnl/index.js';

const corpus: readonly string[] = [
  '',
  'not yaml',
  '\u0000\u0001\u0002 random bytes',
  '```\nfoo: bar\n```',
  '```yaml\nmetadata:\n  id: game\n  players:\n    min: 2\n    max: 2\n```',
  '```yaml\nmetadata:\n  id: [oops\n```',
  [
    '```yaml',
    'metadata:',
    '  id: t',
    '  players: { min: 2, max: 4 }',
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
  ].join('\n'),
];

describe('parser/validator property-style invariants', () => {
  it('parseGameSpec and validateGameSpec are total for representative arbitrary markdown inputs', () => {
    corpus.forEach((markdown) => {
      assert.doesNotThrow(() => {
        const parsed = parseGameSpec(markdown);
        validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
      });
    });
  });

  it('combined parse+validate diagnostics are deterministic for identical inputs', () => {
    corpus.forEach((markdown) => {
      const run = () => {
        const parsed = parseGameSpec(markdown);
        return [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];
      };

      const first = run();
      for (let repeat = 0; repeat < 8; repeat += 1) {
        assert.deepEqual(run(), first);
      }
    });
  });

  it('all emitted diagnostics keep non-empty path/message and optional alternatives shape', () => {
    corpus.forEach((markdown) => {
      const parsed = parseGameSpec(markdown);
      const diagnostics = [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];

      diagnostics.forEach((diagnostic) => {
        assert.equal(diagnostic.path.trim().length > 0, true);
        assert.equal(diagnostic.message.trim().length > 0, true);

        if (diagnostic.alternatives !== undefined) {
          assert.equal(Array.isArray(diagnostic.alternatives), true);
          assert.equal(diagnostic.alternatives.every((value) => typeof value === 'string' && value.trim().length > 0), true);
        }
      });
    });
  });
});
