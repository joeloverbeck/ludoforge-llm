import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EVAL_ERROR_DEFER_CLASS, EVAL_ERROR_DEFER_CLASSES_BY_CODE } from '../../src/kernel/index.js';

describe('eval error defer-class taxonomy', () => {
  it('keeps canonical defer-class literals stable', () => {
    assert.deepEqual(EVAL_ERROR_DEFER_CLASS, {
      UNRESOLVED_BINDING_SELECTOR_CARDINALITY: 'unresolvedBindingSelectorCardinality',
    });
  });

  it('maps defer classes to explicit eval-error codes', () => {
    assert.deepEqual(EVAL_ERROR_DEFER_CLASSES_BY_CODE.SELECTOR_CARDINALITY, [
      EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
    ]);
    assert.equal('MISSING_BINDING' in EVAL_ERROR_DEFER_CLASSES_BY_CODE, false);
    assert.equal('MISSING_VAR' in EVAL_ERROR_DEFER_CLASSES_BY_CODE, false);
  });
});

