import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createEligibilityOverride,
} from './fitl-events-test-helpers.js';

describe('FITL events test helpers', () => {
  it('composes deterministic typed eligibility overrides for active and faction targets', () => {
    assert.deepEqual(
      createEligibilityOverride({
        target: 'self',
        eligible: true,
        windowId: 'remain-eligible',
      }),
      {
        target: { kind: 'active' },
        eligible: true,
        windowId: 'remain-eligible',
      },
    );

    assert.deepEqual(
      createEligibilityOverride({
        target: 2,
        eligible: false,
        windowId: 'force-ineligible',
      }),
      {
        target: { kind: 'faction', faction: '2' },
        eligible: false,
        windowId: 'force-ineligible',
      },
    );
  });
});
