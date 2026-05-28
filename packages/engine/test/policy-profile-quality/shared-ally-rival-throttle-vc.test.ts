// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('VC shared.allyRivalThrottle witness', () => {
  it('compiles, binds, and scores the ally-rival throttle doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'vc', 'allyRivalThrottle');
  });
});
