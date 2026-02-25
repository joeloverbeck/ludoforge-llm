import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EvalError,
  asZoneId,
  createEvalError,
  dataAssetEvalError,
  divisionByZeroError,
  getMaxQueryResults,
  isEvalError,
  isEvalErrorCode,
  missingBindingError,
  missingVarError,
  queryBoundsExceededError,
  selectorCardinalityError,
  spatialNotImplementedError,
  typeMismatchError,
  zonePropNotFoundError,
} from '../../src/kernel/index.js';

describe('eval error surface', () => {
  it('constructing each error code sets .code correctly', () => {
    assert.equal(missingBindingError('missing').code, 'MISSING_BINDING');
    assert.equal(missingVarError('missing').code, 'MISSING_VAR');
    assert.equal(typeMismatchError('bad type').code, 'TYPE_MISMATCH');
    assert.equal(selectorCardinalityError('bad selector').code, 'SELECTOR_CARDINALITY');
    assert.equal(queryBoundsExceededError('too many').code, 'QUERY_BOUNDS_EXCEEDED');
    assert.equal(spatialNotImplementedError('todo').code, 'SPATIAL_NOT_IMPLEMENTED');
    assert.equal(
      dataAssetEvalError('DATA_ASSET_TABLE_CONTRACT_MISSING', 'missing contract').code,
      'DATA_ASSET_TABLE_CONTRACT_MISSING',
    );
  });

  it('stores structured context separately from message when provided', () => {
    const err = createEvalError('MISSING_BINDING', 'Binding not found', {
      binding: '$x',
      availableBindings: ['$y'],
    });

    assert.equal(err.message, 'Binding not found');
    assert.deepEqual(err.context, {
      binding: '$x',
      availableBindings: ['$y'],
    });
  });

  it('typed helper constructors preserve structured context payloads', () => {
    const queryError = queryBoundsExceededError('too many', {
      query: { query: 'players' },
      maxQueryResults: 10,
      resultLength: 11,
    });
    const divisionError = divisionByZeroError('division by zero', {
      expr: { op: '/', left: 1, right: 0 },
      left: 1,
      right: 0,
    });
    const zonePropError = zonePropNotFoundError('missing zone prop', {
      zoneId: asZoneId('market'),
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
      availableZoneIds: [asZoneId('market')],
      availableProps: ['terrain'],
    });

    assert.deepEqual(queryError.context, {
      query: { query: 'players' },
      maxQueryResults: 10,
      resultLength: 11,
    });
    assert.deepEqual(divisionError.context, {
      expr: { op: '/', left: 1, right: 0 },
      left: 1,
      right: 0,
    });
    assert.deepEqual(zonePropError.context, {
      zoneId: asZoneId('market'),
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
      availableZoneIds: [asZoneId('market')],
      availableProps: ['terrain'],
    });

    assert.equal(queryError.message, 'too many');
    assert.equal(divisionError.message, 'division by zero');
    assert.equal(zonePropError.message, 'missing zone prop');
  });

  it('guards detect eval errors and specific eval error codes', () => {
    const err = new EvalError('TYPE_MISMATCH', 'Expected number');

    assert.equal(isEvalError(err), true);
    assert.equal(isEvalErrorCode(err, 'TYPE_MISMATCH'), true);
    assert.equal(isEvalErrorCode(err, 'MISSING_VAR'), false);
    assert.equal(
      isEvalErrorCode(dataAssetEvalError('DATA_ASSET_FIELD_MISSING', 'missing field'), 'DATA_ASSET_FIELD_MISSING'),
      true,
    );
    assert.equal(isEvalError(new Error('plain')), false);
  });
});

describe('eval context helpers', () => {
  it('default maxQueryResults resolves to 10_000', () => {
    assert.equal(getMaxQueryResults({}), 10_000);
    assert.equal(getMaxQueryResults({ maxQueryResults: 17 }), 17);
  });
});
