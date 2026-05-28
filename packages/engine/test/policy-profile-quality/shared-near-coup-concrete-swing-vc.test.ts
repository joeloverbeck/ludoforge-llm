// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('VC shared.nearCoupConcreteSwing witness', () => {
  it('compiles, binds, and scores the near-Coup concrete swing doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'vc', 'nearCoupConcreteSwing');
  });
});
