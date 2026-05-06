// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyPreviewUtility } from '../../../src/agents/preview-utility-classifier.js';
import type { ReadyRefStats } from '../../../src/agents/policy-eval.js';

const stats = (
  readyCount: number,
  distinctValueCount: number,
): ReadyRefStats => ({
  readyCount,
  distinctValueCount,
  min: readyCount === 0 ? null : 1,
  max: readyCount === 0 ? null : distinctValueCount,
  range: readyCount === 0 ? null : Math.max(0, distinctValueCount - 1),
  allReadyValuesEqual: distinctValueCount <= 1,
});

describe('preview utility classifier', () => {
  it('returns none for an empty stats object', () => {
    assert.equal(classifyPreviewUtility({}), 'none');
  });

  it('returns none when refs exist but no ready values were resolved', () => {
    assert.equal(classifyPreviewUtility({ margin: stats(0, 0) }), 'none');
  });

  it('returns constant when every ready ref has one distinct value', () => {
    assert.equal(classifyPreviewUtility({
      margin: stats(9, 1),
      support: stats(9, 1),
    }), 'constant');
  });

  it('returns differentiating when every ready ref differentiates', () => {
    assert.equal(classifyPreviewUtility({
      margin: stats(9, 3),
      support: stats(9, 2),
    }), 'differentiating');
  });

  it('returns lowInformation when ready refs mix constant and differentiating values', () => {
    assert.equal(classifyPreviewUtility({
      margin: stats(9, 3),
      support: stats(9, 1),
    }), 'lowInformation');
  });

  it('is independent of input object insertion order', () => {
    assert.equal(classifyPreviewUtility({
      zeta: stats(2, 1),
      alpha: stats(2, 2),
    }), classifyPreviewUtility({
      alpha: stats(2, 2),
      zeta: stats(2, 1),
    }));
  });
});
