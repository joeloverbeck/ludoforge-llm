import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EvalError,
  createEvalError,
  getMaxQueryResults,
  isEvalError,
  isEvalErrorCode,
  missingBindingError,
  missingVarError,
  queryBoundsExceededError,
  selectorCardinalityError,
  spatialNotImplementedError,
  typeMismatchError,
} from '../../src/kernel/index.js';

describe('eval error surface', () => {
  it('constructing each error code sets .code correctly', () => {
    assert.equal(missingBindingError('missing').code, 'MISSING_BINDING');
    assert.equal(missingVarError('missing').code, 'MISSING_VAR');
    assert.equal(typeMismatchError('bad type').code, 'TYPE_MISMATCH');
    assert.equal(selectorCardinalityError('bad selector').code, 'SELECTOR_CARDINALITY');
    assert.equal(queryBoundsExceededError('too many').code, 'QUERY_BOUNDS_EXCEEDED');
    assert.equal(spatialNotImplementedError('todo').code, 'SPATIAL_NOT_IMPLEMENTED');
  });

  it('error message includes structured context payload when provided', () => {
    const err = createEvalError('MISSING_BINDING', 'Binding not found', {
      binding: '$x',
      availableBindings: ['$y'],
    });

    assert.match(err.message, /Binding not found/);
    assert.match(err.message, /"binding":"\$x"/);
    assert.match(err.message, /"availableBindings":\["\$y"\]/);
  });

  it('guards detect eval errors and specific eval error codes', () => {
    const err = new EvalError('TYPE_MISMATCH', 'Expected number');

    assert.equal(isEvalError(err), true);
    assert.equal(isEvalErrorCode(err, 'TYPE_MISMATCH'), true);
    assert.equal(isEvalErrorCode(err, 'MISSING_VAR'), false);
    assert.equal(isEvalError(new Error('plain')), false);
  });
});

describe('eval context helpers', () => {
  it('default maxQueryResults resolves to 10_000', () => {
    assert.equal(getMaxQueryResults({}), 10_000);
    assert.equal(getMaxQueryResults({ maxQueryResults: 17 }), 17);
  });
});
