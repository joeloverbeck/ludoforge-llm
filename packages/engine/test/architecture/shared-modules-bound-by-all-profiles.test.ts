// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { assertSharedModulesBoundByAllProfiles } from '../policy-profile-quality/shared-doctrine-witness-helpers.js';

describe('Spec 201 shared doctrine profile bindings', () => {
  it('binds every shared module in every FITL baseline profile', () => {
    assertSharedModulesBoundByAllProfiles();
  });
});
