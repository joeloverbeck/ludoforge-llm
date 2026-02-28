import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CNL_XREF_DIAGNOSTIC_CODES,
  isCnlXrefDiagnosticCode,
  toCnlXrefDiagnosticCode,
} from '../../src/cnl/cross-validate-diagnostic-codes.js';

describe('cross-validate diagnostic codes', () => {
  it('keeps canonical xref code ownership in one typed registry', () => {
    for (const [key, value] of Object.entries(CNL_XREF_DIAGNOSTIC_CODES)) {
      assert.equal(value, key);
    }
  });

  it('exposes deterministic xref code normalization helpers', () => {
    assert.equal(isCnlXrefDiagnosticCode('CNL_XREF_ZONEVAR_MISSING'), true);
    assert.equal(isCnlXrefDiagnosticCode('REF_ZONEVAR_MISSING'), false);

    assert.equal(toCnlXrefDiagnosticCode('REF_ZONEVAR_MISSING'), 'CNL_XREF_ZONEVAR_MISSING');
    assert.equal(toCnlXrefDiagnosticCode('CNL_XREF_ZONEVAR_MISSING'), 'CNL_XREF_ZONEVAR_MISSING');
    assert.equal(toCnlXrefDiagnosticCode('CNL_COMPILER_REQUIRED_SECTION_MISSING'), 'CNL_COMPILER_REQUIRED_SECTION_MISSING');
  });
});
