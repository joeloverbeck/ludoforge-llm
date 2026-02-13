import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';

describe('fitl production data scaffold', () => {
  it('parses data/games/fire-in-the-lake.md and exposes required scaffold envelopes', () => {
    const markdown = readFileSync(join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md'), 'utf8');
    const parsed = parseGameSpec(markdown);

    assertNoErrors(parsed);
    assert.equal(parsed.doc.metadata?.id, 'fire-in-the-lake');

    const dataAssets = parsed.doc.dataAssets;
    assert.ok(dataAssets !== null);
    assert.equal(dataAssets.length, 6);
    assert.deepEqual(
      dataAssets.map((asset) => asset.kind),
      ['map', 'pieceCatalog', 'scenario', 'scenario', 'scenario', 'eventCardSet'],
    );
  });
});
