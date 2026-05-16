// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import {
  assertProductionUnsupportedReasonScoreParity,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

describe('policy WASM preview-drive chooseN unsupported parity', () => {
  it('falls back to byte-equivalent TypeScript scores for non-origin-seat chooseN publication', () => {
    assertProductionUnsupportedReasonScoreParity('chooseN');
  });
});
