import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_COMPILE_LIMITS,
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  expandMacros,
  resolveCompileLimits,
} from '../../src/cnl/index.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('compiler API foundation', () => {
  it('uses spec-aligned default compile limits', () => {
    assert.deepEqual(DEFAULT_COMPILE_LIMITS, {
      maxExpandedEffects: 20_000,
      maxGeneratedZones: 10_000,
      maxDiagnosticCount: 500,
    });
  });

  it('resolves compile limits from partial overrides', () => {
    const resolved = resolveCompileLimits({ maxDiagnosticCount: 7 });
    assert.deepEqual(resolved, {
      maxExpandedEffects: 20_000,
      maxGeneratedZones: 10_000,
      maxDiagnosticCount: 7,
    });
  });

  it('returns total expandMacros contract', () => {
    const doc = createEmptyGameSpecDoc();
    const result = expandMacros(doc, { limits: { maxExpandedEffects: 25 } });

    assert.deepEqual(result.doc, doc);
    assertNoDiagnostics(result);
  });

  it('returns total compile contract with deterministic diagnostics shape', () => {
    const doc = createEmptyGameSpecDoc();
    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.equal(second.gameDef, null);
    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.deepEqual(first.sections, second.sections);
    assert.equal(first.diagnostics.length > 0, true);
    assert.equal(first.sections.metadata, null);
    assert.deepEqual(first.sections.constants, {});

    const diagnostic = first.diagnostics[0];
    assert.ok(diagnostic !== undefined);
    assert.ok(diagnostic.code.length > 0);
    assert.ok(diagnostic.path.length > 0);
    assert.ok(diagnostic.message.length > 0);
    assert.equal(diagnostic.severity, 'error');
  });

  it('rejects invalid compile limit overrides', () => {
    assert.throws(() => resolveCompileLimits({ maxExpandedEffects: -1 }), /maxExpandedEffects/);
    assert.throws(() => resolveCompileLimits({ maxGeneratedZones: 1.5 }), /maxGeneratedZones/);
    assert.throws(() => resolveCompileLimits({ maxDiagnosticCount: Number.NaN }), /maxDiagnosticCount/);
  });
});
