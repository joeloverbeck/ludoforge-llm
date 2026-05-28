// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { assertNoPerFactionBlockImmediateWin } from '../policy-profile-quality/shared-doctrine-witness-helpers.js';

describe('Spec 201 retired blockImmediateWin modules', () => {
  it('keeps the three retired per-faction blockImmediateWin modules out of compiled profiles', () => {
    assertNoPerFactionBlockImmediateWin();
  });
});
