import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Diagnostic, validateGameDef } from '../../src/kernel/index.js';
import { readGameDefFixture } from '../helpers/gamedef-fixtures.js';

describe('validateGameDef golden diagnostics', () => {
  it('minimal valid fixture yields zero diagnostics', () => {
    const def = readGameDefFixture('minimal-valid.json');
    assert.deepEqual(validateGameDef(def), []);
  });

  it('known invalid fixture yields stable diagnostics', () => {
    const def = readGameDefFixture('invalid-reference.json');
    const diagnostics = validateGameDef(def);

    const golden = [
      {
        code: 'REF_PHASE_MISSING',
        path: 'actions[0].phase[0]',
        severity: 'error',
        messageSubstring: 'Unknown phase "mian".',
      },
      {
        code: 'REF_GVAR_MISSING',
        path: 'actions[0].pre.left.var',
        severity: 'error',
        messageSubstring: 'Unknown global variable "gold".',
      },
      {
        code: 'REF_ZONE_MISSING',
        path: 'actions[0].effects[0].draw.to',
        severity: 'error',
        messageSubstring: 'Unknown zone "markte:none".',
      },
      {
        code: 'REF_ACTION_MISSING',
        path: 'triggers[0].event.action',
        severity: 'error',
        messageSubstring: 'Unknown action "playCrad".',
      },
    ] as const;

    assert.equal(diagnostics.length, golden.length);

    golden.forEach((expected, index) => {
      const actual = diagnostics[index] as Diagnostic | undefined;
      assert.ok(actual);
      assert.equal(actual.code, expected.code);
      assert.equal(actual.path, expected.path);
      assert.equal(actual.severity, expected.severity);
      assert.equal(actual.message.includes(expected.messageSubstring), true);
    });
  });
});
