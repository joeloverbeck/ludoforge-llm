import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

function assertNoUnboundBindingDiagnostics(
  diagnostics: readonly { code: string; path: string; severity: string; message: string }[],
): void {
  const unbound = diagnostics.filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_BINDING_UNBOUND');
  assert.deepEqual(unbound, []);
}

describe('production spec strict-binding regression', () => {
  it('keeps FITL production GameSpec free of unbound-binding compiler diagnostics', () => {
    const { parsed, validatorDiagnostics, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assertNoUnboundBindingDiagnostics(compiled.diagnostics);
  });

  it('keeps Texas production GameSpec free of unbound-binding compiler diagnostics', () => {
    const { parsed, validatorDiagnostics, compiled } = compileTexasProductionSpec();

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assertNoUnboundBindingDiagnostics(compiled.diagnostics);
  });
});
