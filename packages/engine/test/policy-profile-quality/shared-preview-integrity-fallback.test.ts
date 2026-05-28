// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { assertSharedPreviewIntegrityFallback } from './shared-doctrine-witness-helpers.js';

describe('Spec 201 shared preview integrity fallback', () => {
  it('reattests explicit noContribution fallback for every shared preview-derived candidate feature', () => {
    assertSharedPreviewIntegrityFallback();
  });
});
