// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAP_CLASS_BUDGETS,
  INNER_PREVIEW_HARD_CAP,
  type CapClass,
} from '../../../src/cnl/compile-agents.js';

describe('preview cap-class registry', () => {
  it('keeps standard256 tied to the existing hard cap', () => {
    assert.equal(CAP_CLASS_BUDGETS.standard256, INNER_PREVIEW_HARD_CAP);
    assert.equal(CAP_CLASS_BUDGETS.standard256, 256);
  });

  it('records deep1024 as the opt-in deepening tier', () => {
    assert.equal(CAP_CLASS_BUDGETS.deep1024, 1024);
  });

  it('is a closed registry of the Spec 164 cap classes', () => {
    const capClasses = Object.keys(CAP_CLASS_BUDGETS).sort() as CapClass[];

    assert.deepEqual(capClasses, ['deep1024', 'standard256']);
  });
});
