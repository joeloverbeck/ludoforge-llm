// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('US shared.immediateWin witness', () => {
  it('compiles, binds, and scores the immediate-win doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'us', 'immediateWin');
  });
});
