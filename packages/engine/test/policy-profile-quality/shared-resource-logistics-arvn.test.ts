// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('ARVN shared.resourceLogistics witness', () => {
  it('compiles, binds, and scores the logistics doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'arvn', 'resourceLogistics');
  });
});
