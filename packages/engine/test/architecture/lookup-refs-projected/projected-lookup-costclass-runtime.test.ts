// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createProjectedCatalog,
  readyProjectedState,
  scoreProjectedOption,
  zonePopulationRef,
} from './projected-lookup-runtime-test-helpers.js';

describe('projected lookup runtime cost class', () => {
  it('evaluates the runtime consideration that the compiler classifies as preview cost', () => {
    const catalog = createProjectedCatalog({
      projected0: {
        scopes: ['microturn'],
        costClass: 'preview',
        weight: { kind: 'literal', value: 1 },
        value: { kind: 'ref', ref: zonePopulationRef },
        hasPreviewRef: true,
        hasLookupRef: true,
        previewFallback: { onUnavailable: 'noContribution' },
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    });
    const result = scoreProjectedOption([zonePopulationRef], 'public-zone:none', readyProjectedState);

    assert.equal(catalog.compiled.considerations.projected0?.costClass, 'preview');
    assert.deepEqual(result.scoreContributions, [{ termId: 'projected0', contribution: 11 }]);
  });
});
