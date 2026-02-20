import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec, readTexasProductionSpec } from '../helpers/production-spec-helpers.js';

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
    assert.equal(compiled.gameDef?.metadata.name, 'Fire in the Lake');
    assert.equal(compiled.gameDef?.metadata.description, 'A 4-faction COIN-series wargame set in the Vietnam War');
  });

  it('keeps Texas production GameSpec free of unbound-binding compiler diagnostics', () => {
    const { parsed, validatorDiagnostics, compiled } = compileTexasProductionSpec();

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assertNoUnboundBindingDiagnostics(compiled.diagnostics);
    assert.equal(compiled.gameDef?.metadata.name, "Texas Hold'em");
    assert.equal(compiled.gameDef?.metadata.description, "No-limit Texas Hold'em poker tournament");
  });

  it('fails compile-time validation when Texas blind schedule violates declared table contracts', () => {
    const texasMarkdown = readTexasProductionSpec();
    const malformedMarkdown = texasMarkdown.replace(
      /(level:\s+1[\s\S]*?handsUntilNext:\s+)10/,
      '$10',
    );
    assert.notEqual(malformedMarkdown, texasMarkdown);
    const parsed = parseGameSpec(malformedMarkdown);
    assertNoErrors(parsed);

    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(validatorDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION' ||
          diagnostic.code === 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION',
      ),
      true,
    );
  });
});
