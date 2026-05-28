// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('ARVN shared.eventDirectSwing witness', () => {
  it('compiles, binds, and scores the event-swing doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'arvn', 'eventDirectSwing');
  });
});
