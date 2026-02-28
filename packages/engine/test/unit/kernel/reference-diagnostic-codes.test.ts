import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isKernelReferenceDiagnosticCode } from '../../../src/kernel/reference-diagnostic-codes.js';

describe('kernel reference diagnostic codes', () => {
  it('classifies REF_* diagnostics via canonical helper', () => {
    assert.equal(isKernelReferenceDiagnosticCode('REF_GVAR_MISSING'), true);
    assert.equal(isKernelReferenceDiagnosticCode('CNL_XREF_GVAR_MISSING'), false);
    assert.equal(isKernelReferenceDiagnosticCode('CNL_COMPILER_REQUIRED_SECTION_MISSING'), false);
  });
});
