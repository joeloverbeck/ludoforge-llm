// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

describe('crossValidateSpec production coverage', () => {
  it('FITL production spec produces zero cross-ref diagnostics', () => {
    const production = compileProductionSpec();
    const crossRefDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));
    assert.deepEqual(crossRefDiagnostics, []);
  });

  it('FITL production spec contains no monsoon-grant cross-ref violations', () => {
    const production = compileProductionSpec();
    const monsoonGrantDiagnostics = production.compiled.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'CNL_XREF_EVENT_DECK_GRANT_MONSOON_ALLOW_MISSING',
    );
    assert.deepEqual(
      monsoonGrantDiagnostics,
      [],
      `Expected zero Monsoon grant invariant diagnostics but found ${monsoonGrantDiagnostics.length}:\n${monsoonGrantDiagnostics.map((d) => `  ${d.path}: ${d.message}`).join('\n')}`,
    );
  });

  it('Texas production spec produces zero cross-ref diagnostics', () => {
    const production = compileTexasProductionSpec();
    const crossRefDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));
    assert.deepEqual(crossRefDiagnostics, []);
  });

  it('FITL production spec produces zero compiler error diagnostics of any kind', () => {
    const production = compileProductionSpec();
    const errorDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    assert.deepEqual(
      errorDiagnostics,
      [],
      `Expected zero compiler error diagnostics but found ${errorDiagnostics.length}:\n${errorDiagnostics.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });

  it('Texas production spec produces zero compiler error diagnostics of any kind', () => {
    const production = compileTexasProductionSpec();
    const errorDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    assert.deepEqual(
      errorDiagnostics,
      [],
      `Expected zero compiler error diagnostics but found ${errorDiagnostics.length}:\n${errorDiagnostics.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });
});
