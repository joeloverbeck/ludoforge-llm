import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertNoDiagnostics,
  assertNoErrors,
  assertNoWarnings,
  formatDiagnostics,
} from '../helpers/diagnostic-helpers.js';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { RuntimeWarning } from '../../src/kernel/types.js';

describe('diagnostic-helpers', () => {
  describe('assertNoDiagnostics', () => {
    it('passes when diagnostics array is empty', () => {
      assertNoDiagnostics({ diagnostics: [] });
    });

    it('fails with formatted message when diagnostics exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST_CODE', path: 'doc.actions', severity: 'warning', message: 'something wrong' },
      ];
      assert.throws(
        () => assertNoDiagnostics({ diagnostics }),
        (err: Error) => err.message.includes('Expected 0 diagnostics, got 1') && err.message.includes('TEST_CODE'),
      );
    });
  });

  describe('assertNoErrors', () => {
    it('passes when only warnings exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'WARN', path: 'doc.x', severity: 'warning', message: 'just a warning' },
      ];
      assertNoErrors({ diagnostics });
    });

    it('fails when errors exist', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'ERR', path: 'doc.x', severity: 'error', message: 'an error' },
      ];
      assert.throws(
        () => assertNoErrors({ diagnostics }),
        (err: Error) => err.message.includes('Expected 0 errors, got 1'),
      );
    });
  });

  describe('assertNoWarnings', () => {
    it('passes when warnings array is empty', () => {
      assertNoWarnings({ warnings: [] });
    });

    it('fails with formatted message when warnings exist', () => {
      const warnings: RuntimeWarning[] = [
        { code: 'ZERO_EFFECT_ITERATIONS', message: 'forEach matched 0', context: { bind: '$x' } },
      ];
      assert.throws(
        () => assertNoWarnings({ warnings }),
        (err: Error) =>
          err.message.includes('Expected 0 runtime warnings, got 1') &&
          err.message.includes('ZERO_EFFECT_ITERATIONS'),
      );
    });
  });

  describe('formatDiagnostics', () => {
    it('formats severity, code, path, and message', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST', path: 'doc.foo', severity: 'error', message: 'bad thing' },
      ];
      const result = formatDiagnostics(diagnostics);
      assert.ok(result.includes('[error]'));
      assert.ok(result.includes('TEST'));
      assert.ok(result.includes('doc.foo'));
      assert.ok(result.includes('bad thing'));
    });

    it('includes source line when sourceMap provided', () => {
      const diagnostics: Diagnostic[] = [
        { code: 'TEST', path: 'doc.foo', severity: 'warning', message: 'hmm' },
      ];
      const sourceMap = { byPath: { 'doc.foo': { blockIndex: 0, markdownLineStart: 42, markdownColStart: 1, markdownLineEnd: 42, markdownColEnd: 10 } } };
      const result = formatDiagnostics(diagnostics, sourceMap);
      assert.ok(result.includes('line 42'));
    });
  });
});
