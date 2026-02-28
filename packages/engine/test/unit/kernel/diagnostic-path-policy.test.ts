import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import { hasErrorDiagnosticAtPathSince } from '../../../src/kernel/diagnostic-path-policy.js';

describe('diagnostic path policy', () => {
  it('detects error diagnostics at exact and nested paths after the given index', () => {
    const diagnostics: Diagnostic[] = [
      { code: 'X', path: 'actions[0].effects[0].chooseOne.options', severity: 'warning', message: 'warn' },
      { code: 'X', path: 'actions[0].effects[0].chooseOne.options.tableId', severity: 'error', message: 'error' },
      { code: 'X', path: 'actions[0].effects[0].chooseOne.options.where[0].field', severity: 'error', message: 'error' },
    ];

    assert.equal(
      hasErrorDiagnosticAtPathSince(diagnostics, 0, 'actions[0].effects[0].chooseOne.options'),
      true,
    );
    assert.equal(
      hasErrorDiagnosticAtPathSince(diagnostics, 2, 'actions[0].effects[0].chooseOne.options'),
      true,
    );
  });

  it('ignores diagnostics before the index and non-error severities', () => {
    const diagnostics: Diagnostic[] = [
      { code: 'X', path: 'actions[0].effects[0].chooseOne.options.tableId', severity: 'error', message: 'error' },
      { code: 'X', path: 'actions[0].effects[0].chooseOne.options.tableId', severity: 'warning', message: 'warn' },
    ];

    assert.equal(
      hasErrorDiagnosticAtPathSince(diagnostics, 1, 'actions[0].effects[0].chooseOne.options'),
      false,
    );
  });
});
