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
    const knownDeferClasses = new Set(Object.values(EVAL_ERROR_DEFER_CLASS));
    const entries = Object.entries(EVAL_ERROR_DEFER_CLASSES_BY_CODE);

    assert.equal(entries.length > 0, true);
    for (const [code, deferClasses] of entries) {
      assert.equal(Array.isArray(deferClasses), true, `defer class mapping for ${code} must be an array`);
      assert.equal(
        deferClasses.length > 0,
        true,
        `defer class mapping for ${code} must declare at least one defer class`,
      );
      for (const deferClass of deferClasses) {
        assert.equal(
          knownDeferClasses.has(deferClass),
          true,
          `defer class ${deferClass} mapped under ${code} must come from EVAL_ERROR_DEFER_CLASS`,
        );
      }
    }
    assert.equal('MISSING_BINDING' in EVAL_ERROR_DEFER_CLASSES_BY_CODE, false);
    assert.equal('MISSING_VAR' in EVAL_ERROR_DEFER_CLASSES_BY_CODE, false);
  });
});
