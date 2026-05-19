// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import {
  assertProductionSupportedReasonScoreParity,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

describe('policy WASM preview-drive victoryCurrentMargin seat-matrix supported parity', () => {
  it('routes seatAgg $seat victory-margin refs through supported seat-context dynamic rows', () => {
    assertProductionSupportedReasonScoreParity('victoryCurrentMarginSeatMatrix');
  });
});
