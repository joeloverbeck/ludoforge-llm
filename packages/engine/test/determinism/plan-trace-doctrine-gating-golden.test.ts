// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PolicyPlanTrace } from '../../src/kernel/types.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';
import { richDoctrineGatingTrace } from '../helpers/doctrine-gating-fixtures.js';

const readGolden = (): PolicyPlanTrace =>
  readFixtureJson<PolicyPlanTrace>('trace/plan-trace-doctrine-gating.golden.json');

describe('doctrine-gated plan trace golden', () => {
  it('pins filteredOutTemplates provenance and reason shape byte-for-byte', () => {
    const actual = richDoctrineGatingTrace();
    const expected = readGolden();

    assert.equal(JSON.stringify(actual, null, 2), JSON.stringify(expected, null, 2));
    assert.deepEqual(actual.filteredOutTemplates, [
      { templateId: 'beta', gatedBy: ['doctrine.suppress'], reason: 'suppressed' },
      { templateId: 'gamma', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
    ]);
  });

  it('is byte-identical across repeated construction', () => {
    assert.equal(
      JSON.stringify(richDoctrineGatingTrace()),
      JSON.stringify(richDoctrineGatingTrace()),
    );
  });
});
