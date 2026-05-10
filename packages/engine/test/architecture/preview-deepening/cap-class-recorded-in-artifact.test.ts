// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createProfile } from './continued-deepening-fixture.js';

describe('preview cap class artifact record', () => {
  it('records the selected cap class in the compiled profile inner-preview config', () => {
    const profile = createProfile('continuedDeepening');

    assert.equal(profile.preview.inner?.strategy, 'continuedDeepening');
    assert.equal(profile.preview.inner?.capClass, 'deep1024');
  });
});
