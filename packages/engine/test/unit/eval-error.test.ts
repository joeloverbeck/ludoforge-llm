import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EvalError,
  asPlayerId,
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
  selectorCardinalityPlayerCountContext,
  selectorCardinalityPlayerResolvedContext,
  selectorCardinalityZoneResolvedContext,
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

  it('selector-cardinality helper builders emit canonical context shapes', () => {
    const playerCountContext = selectorCardinalityPlayerCountContext({ relative: 'left' }, 0);
    assert.deepEqual(playerCountContext, {
      selectorKind: 'player',
      selector: { relative: 'left' },
      playerCount: 0,
    });

    const resolvedPlayers = [asPlayerId(0), asPlayerId(2)] as const;
    const playerResolvedContext = selectorCardinalityPlayerResolvedContext('all', resolvedPlayers);
    assert.deepEqual(playerResolvedContext, {
      selectorKind: 'player',
      selector: 'all',
      resolvedCount: 2,
      resolvedPlayers,
    });

    const resolvedZones = [asZoneId('hand:0')] as const;
    const zoneResolvedContextNoDefer = selectorCardinalityZoneResolvedContext('hand:0', resolvedZones);
    assert.deepEqual(zoneResolvedContextNoDefer, {
      selectorKind: 'zone',
      selector: 'hand:0',
      resolvedCount: 1,
      resolvedZones,
    });
    assert.equal('deferClass' in zoneResolvedContextNoDefer, false);

    const zoneResolvedContextWithDefer = selectorCardinalityZoneResolvedContext(
      '$zones',
      [],
      'unresolvedBindingSelectorCardinality',
    );
    assert.deepEqual(zoneResolvedContextWithDefer, {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: 'unresolvedBindingSelectorCardinality',
    });
  });
});
