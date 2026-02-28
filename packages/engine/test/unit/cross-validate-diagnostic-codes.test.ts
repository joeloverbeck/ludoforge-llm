import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_XREF_DIAGNOSTIC_CODES } from '../../src/cnl/cross-validate-diagnostic-codes.js';

describe('cross-validate diagnostic codes', () => {
  it('keeps canonical xref code ownership in one typed registry', () => {
    for (const [key, value] of Object.entries(CNL_XREF_DIAGNOSTIC_CODES)) {
      assert.equal(value, key);
    }
  });
});
