import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSeatIdentityContract } from '../../src/cnl/seat-identity-contract.js';

describe('buildSeatIdentityContract', () => {
  it('returns none mode when seat catalog ids are undefined', () => {
    const result = buildSeatIdentityContract({
      seatCatalogSeatIds: undefined,
    });

    assert.equal(result.contract.mode, 'none');
    assert.equal(result.contract.selectorSeatIds, undefined);
    assert.equal(result.contract.referenceSeatIds, undefined);
    assert.deepEqual(result.diagnostics, []);
  });

  it('returns seat-catalog mode and mirrors seat ids for selectors and references', () => {
    const seatCatalogSeatIds = ['us', 'arvn'];
    const result = buildSeatIdentityContract({
      seatCatalogSeatIds,
    });

    assert.equal(result.contract.mode, 'seat-catalog');
    assert.equal(result.contract.selectorSeatIds, seatCatalogSeatIds);
    assert.equal(result.contract.referenceSeatIds, seatCatalogSeatIds);
    assert.deepEqual(result.diagnostics, []);
  });

  it('preserves catalog seat ordering and duplicates as provided', () => {
    const seatCatalogSeatIds = ['north', 'south', 'north'];
    const result = buildSeatIdentityContract({
      seatCatalogSeatIds,
    });

    assert.deepEqual(result.contract.selectorSeatIds, ['north', 'south', 'north']);
    assert.deepEqual(result.contract.referenceSeatIds, ['north', 'south', 'north']);
    assert.deepEqual(result.diagnostics, []);
  });
});
