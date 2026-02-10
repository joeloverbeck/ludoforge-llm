import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

const readFixture = (name: string): string => readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', name), 'utf8');

describe('parse + validate full-spec integration', () => {
  it('accepts a realistic valid full markdown spec end-to-end', () => {
    const markdown = readFixture('full-valid-spec.md');
    const parsed = parseGameSpec(markdown);
    const diagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(diagnostics, []);

    assert.equal(parsed.doc.metadata?.id, 'fixture-valid');
    assert.equal(parsed.doc.zones?.[0]?.id, 'deck');
    assert.equal(parsed.doc.actions?.[0]?.id, 'draw');
    assert.equal(parsed.doc.turnStructure?.phases[0]?.id, 'main');
  });

  it('reports stable deterministic diagnostics for a multi-issue spec end-to-end', () => {
    const markdown = readFixture('full-invalid-spec.md');

    const runOnce = () => {
      const parsed = parseGameSpec(markdown);
      return [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];
    };

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(second, first);
    assert.equal(first.length > 0, true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_PLAYERS_MIN_TOO_LOW'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_ACTION_EFFECTS_SHAPE_INVALID'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_TURN_STRUCTURE_PHASES_INVALID'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_UNKNOWN_KEY'), true);
  });
});
