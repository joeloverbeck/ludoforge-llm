import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeIdentifier } from '../../../src/contracts/index.js';

describe('canonical identifier contract', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(canonicalizeIdentifier('  window-a  '), 'window-a');
  });

  it('normalizes unicode to NFC', () => {
    assert.equal(canonicalizeIdentifier('cafe\u0301'), 'caf\u00e9');
  });
});

