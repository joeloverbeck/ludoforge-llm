// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSharedModuleWitness } from './shared-doctrine-witness-helpers.js';

describe('VC shared.blockCurrentLeader witness', () => {
  it('compiles, binds, and scores the leader-block doctrine', () => {
    assertSharedModuleWitness(fileURLToPath(import.meta.url), 'vc', 'blockCurrentLeader');
  });
});
