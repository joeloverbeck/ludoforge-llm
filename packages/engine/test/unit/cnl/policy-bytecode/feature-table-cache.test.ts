// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  __featureTable_internal_for_tests,
  buildFeatureTable,
  getFeatureTable,
} from '../../../../src/cnl/policy-bytecode/index.js';
import { buildEncodedStateLayout } from '../../../../src/kernel/index.js';
import { getFitlProductionFixture } from '../../../helpers/production-spec-helpers.js';

describe('policy bytecode feature table cache', () => {
  it('returns a frozen table equal to the fresh builder and reuses it per GameDef', () => {
    __featureTable_internal_for_tests.resetFeatureTableCache();
    __featureTable_internal_for_tests.resetBuildFeatureTableCount();

    const def = getFitlProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const fresh = buildFeatureTable(def, layout);

    __featureTable_internal_for_tests.resetBuildFeatureTableCount();
    const cached = getFeatureTable(def, layout);
    const repeated = getFeatureTable(def, layout);

    assert.deepEqual(cached, fresh);
    assert.equal(repeated, cached);
    assert.equal(__featureTable_internal_for_tests.getBuildFeatureTableCount(), 1);
    assert.equal(Object.isFrozen(cached), true);
    assert.equal(Object.isFrozen(cached.refs), true);
    assert.equal(Object.isFrozen(cached.refToId), true);
    for (const ref of cached.refs) {
      assert.equal(Object.isFrozen(ref), true);
      assert.equal(Object.isFrozen(ref.aux), true);
    }
  });
});
