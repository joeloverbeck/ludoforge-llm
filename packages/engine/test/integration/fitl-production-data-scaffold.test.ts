import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
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
    assert.equal(dataAssets.length, 6);
    assert.deepEqual(
      dataAssets.map((asset) => asset.kind),
      ['map', 'pieceCatalog', 'seatCatalog', 'scenario', 'scenario', 'scenario'],
    );

    const eventDecks = parsed.doc.eventDecks;
    assert.ok(eventDecks !== null);
    assert.equal(eventDecks.length, 1);
    assert.equal(eventDecks[0]?.id, 'fitl-events-initial-card-pack');
  });

  it('authors event moveToken.to with explicit zoneExpr wrappers', () => {
    const parsed = parseGameSpec(readProductionSpec());
    assertNoErrors(parsed);

    const moveTokenNodes = findDeep(parsed.doc.eventDecks ?? [], (node) => typeof node?.moveToken === 'object' && node.moveToken !== null).map(
      (node) => node.moveToken as Record<string, unknown>,
    );

    const nonCanonicalToNodes = moveTokenNodes.filter((moveToken) => {
      const toField = moveToken.to;
      return !(typeof toField === 'object' && toField !== null && 'zoneExpr' in toField);
    });

    assert.equal(
      nonCanonicalToNodes.length,
      0,
      `Expected moveToken.to to always use { zoneExpr: ... } shape; found non-canonical entries: ${JSON.stringify(nonCanonicalToNodes)}`,
    );
  });
});
