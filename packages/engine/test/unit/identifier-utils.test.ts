import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeIdentifier } from '../../src/cnl/identifier-utils.js';

describe('normalizeIdentifier', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(normalizeIdentifier('  seat-a  '), 'seat-a');
  });

  it('normalizes unicode to NFC', () => {
    assert.equal(normalizeIdentifier('se\u0301at-b'), 'séat-b');
  });
});
