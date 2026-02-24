import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ScenarioPayload } from '../../src/kernel/types.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL short scenario deck exclusions', () => {
  it('encodes required pivotal-tag and failed-coup exclusions in short scenario deck composition', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const shortScenarioAsset = (parsed.doc.dataAssets ?? []).find(
      (asset) => asset.id === 'fitl-scenario-short' && asset.kind === 'scenario',
    );
    assert.notEqual(shortScenarioAsset, undefined, 'Expected fitl-scenario-short scenario asset');

    const shortScenario = shortScenarioAsset!.payload as ScenarioPayload;
    const deckComposition = shortScenario.deckComposition;
    assert.notEqual(deckComposition, undefined, 'Expected short scenario deckComposition');
    assert.equal(deckComposition?.materializationStrategy, 'pile-coup-mix-v1');
    assert.equal(deckComposition?.pileCount, 3);
    assert.equal(deckComposition?.eventsPerPile, 8);
    assert.equal(deckComposition?.coupsPerPile, 1);
    assert.deepEqual(deckComposition?.excludedCardTags, ['pivotal']);
    assert.deepEqual(deckComposition?.excludedCardIds, ['card-129']);
  });
});

describe('FITL medium/full scenario deck exclusions', () => {
  it('encodes required pivotal-tag exclusions in medium and full scenario deck compositions', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const assertScenarioPivotalExclusions = (scenarioId: 'fitl-scenario-medium' | 'fitl-scenario-full'): void => {
      const scenarioAsset = (parsed.doc.dataAssets ?? []).find((asset) => asset.id === scenarioId && asset.kind === 'scenario');
      assert.notEqual(scenarioAsset, undefined, `Expected ${scenarioId} scenario asset`);

      const scenario = scenarioAsset!.payload as ScenarioPayload;
      const deckComposition = scenario.deckComposition;
      assert.notEqual(deckComposition, undefined, `Expected ${scenarioId} deckComposition`);
      assert.deepEqual(deckComposition?.excludedCardTags, ['pivotal']);
      assert.equal(deckComposition?.excludedCardIds, undefined);
    };

    assertScenarioPivotalExclusions('fitl-scenario-medium');
    assertScenarioPivotalExclusions('fitl-scenario-full');
  });
});
