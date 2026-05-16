// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import {
  assertDeepProjectedStateUnsupportedParity,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

describe('policy WASM preview-drive projectedState unsupported parity', () => {
  it('preserves byte-equivalent deep preview output when projected state materialization is unsupported', () => {
    assertDeepProjectedStateUnsupportedParity();
  });
});
