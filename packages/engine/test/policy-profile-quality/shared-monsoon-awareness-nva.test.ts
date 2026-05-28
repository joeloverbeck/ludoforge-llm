// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertMonsoonAwarenessWitness } from './shared-doctrine-witness-helpers.js';

describe('NVA shared monsoon-awareness witness', () => {
  it('compiles the monsoon lifecycle condition consumed by the profile witness surface', () => {
    assertMonsoonAwarenessWitness(fileURLToPath(import.meta.url), 'nva');
  });
});
