import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('crossValidateSpec production coverage', () => {
  it('FITL production spec produces zero cross-ref diagnostics', () => {
    const production = compileProductionSpec();
    const crossRefDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));
    assert.deepEqual(crossRefDiagnostics, []);
  });
});
