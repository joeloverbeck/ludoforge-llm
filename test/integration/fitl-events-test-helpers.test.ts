import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createEligibilityOverrideDirective,
  createFreeOpGrantedDirective,
  FITL_NO_OVERRIDE,
} from './fitl-events-test-helpers.js';

describe('FITL events test helpers', () => {
  it('composes deterministic eligibility override directives for self and faction targets', () => {
    assert.equal(
      createEligibilityOverrideDirective({
        target: 'self',
        eligibility: 'eligible',
        windowId: 'remain-eligible',
      }),
      'eligibilityOverride:self:eligible:remain-eligible',
    );

    assert.equal(
      createEligibilityOverrideDirective({
        target: 2,
        eligibility: 'ineligible',
        windowId: 'force-ineligible',
      }),
      'eligibilityOverride:2:ineligible:force-ineligible',
    );
  });

  it('composes deterministic free-op directives and exposes the canonical no-override token', () => {
    assert.equal(createFreeOpGrantedDirective(3), 'freeOpGranted:3');
    assert.equal(FITL_NO_OVERRIDE, 'none');
  });
});
