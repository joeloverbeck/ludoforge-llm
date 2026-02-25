import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

describe('fitl production data scaffold', () => {
  it('parses production FITL GameSpec source and exposes required scaffold envelopes', () => {
    const markdown = readProductionSpec();
    const parsed = parseGameSpec(markdown);

    assertNoErrors(parsed);
    assert.equal(parsed.doc.metadata?.id, 'fire-in-the-lake');

    const dataAssets = parsed.doc.dataAssets;
    assert.ok(dataAssets !== null);
    assert.equal(dataAssets.length, 5);
    assert.deepEqual(
      dataAssets.map((asset) => asset.kind),
      ['map', 'pieceCatalog', 'scenario', 'scenario', 'scenario'],
    );

    const eventDecks = parsed.doc.eventDecks;
    assert.ok(eventDecks !== null);
    assert.equal(eventDecks.length, 1);
    assert.equal(eventDecks[0]?.id, 'fitl-events-initial-card-pack');
  });
});
