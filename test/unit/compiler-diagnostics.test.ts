import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { GameSpecSourceMap } from '../../src/cnl/source-map.js';
import {
  capDiagnostics,
  dedupeDiagnostics,
  getDiagnosticSeverityRank,
  getDiagnosticSortKey,
  sortDiagnosticsDeterministic,
} from '../../src/cnl/index.js';

function diagnostic(overrides: Partial<Diagnostic>): Diagnostic {
  let result: Diagnostic = {
    code: overrides.code ?? 'TEST_CODE',
    path: overrides.path ?? 'doc',
    severity: overrides.severity ?? 'error',
    message: overrides.message ?? 'Test diagnostic.',
  };

  if (overrides.suggestion !== undefined) {
    result = { ...result, suggestion: overrides.suggestion };
  }
  if (overrides.contextSnippet !== undefined) {
    result = { ...result, contextSnippet: overrides.contextSnippet };
  }
  if (overrides.alternatives !== undefined) {
    result = { ...result, alternatives: overrides.alternatives };
  }

  return result;
}

describe('compiler diagnostics helpers', () => {
  it('ranks severities canonically', () => {
    assert.equal(getDiagnosticSeverityRank('error'), 0);
    assert.equal(getDiagnosticSeverityRank('warning'), 1);
    assert.equal(getDiagnosticSeverityRank('info'), 2);
  });

  it('builds source-aware deterministic sort keys', () => {
    const sourceMap: GameSpecSourceMap = {
      byPath: {
        'actions[0].id': {
          blockIndex: 0,
          markdownLineStart: 4,
          markdownColStart: 2,
          markdownLineEnd: 4,
          markdownColEnd: 15,
        },
      },
    };

    const key = getDiagnosticSortKey(
      diagnostic({
        path: 'doc.actions.0.id',
        severity: 'warning',
        code: 'CNL_TEST',
      }),
      sourceMap,
    );

    assert.equal(key.sourceOrder < Number.POSITIVE_INFINITY, true);
    assert.equal(key.path, 'doc.actions.0.id');
    assert.equal(key.severityRank, 1);
    assert.equal(key.code, 'CNL_TEST');
  });

  it('sorts diagnostics by source offset, path, severity rank, and code', () => {
    const sourceMap: GameSpecSourceMap = {
      byPath: {
        'doc.a': {
          blockIndex: 0,
          markdownLineStart: 1,
          markdownColStart: 1,
          markdownLineEnd: 1,
          markdownColEnd: 1,
        },
        'doc.b': {
          blockIndex: 0,
          markdownLineStart: 2,
          markdownColStart: 1,
          markdownLineEnd: 2,
          markdownColEnd: 1,
        },
      },
    };

    const diagnostics = [
      diagnostic({ path: 'doc.b', severity: 'error', code: 'Z_CODE', message: 'z' }),
      diagnostic({ path: 'doc.a', severity: 'warning', code: 'A_CODE', message: 'a warning' }),
      diagnostic({ path: 'doc.a', severity: 'error', code: 'B_CODE', message: 'a error b' }),
      diagnostic({ path: 'doc.a', severity: 'error', code: 'A_CODE', message: 'a error a' }),
    ];

    const sorted = sortDiagnosticsDeterministic(diagnostics, sourceMap);
    assert.deepEqual(
      sorted.map((entry) => `${entry.path}:${entry.severity}:${entry.code}`),
      ['doc.a:error:A_CODE', 'doc.a:error:B_CODE', 'doc.a:warning:A_CODE', 'doc.b:error:Z_CODE'],
    );
  });

  it('dedupes equivalent diagnostics deterministically while preserving first occurrence', () => {
    const first = diagnostic({
      path: 'doc.a',
      code: 'ONE',
      message: 'same',
      suggestion: 'fix it',
      alternatives: ['a', 'b'],
    });
    const duplicate = diagnostic({
      path: 'doc.a',
      code: 'ONE',
      message: 'same',
      suggestion: 'fix it',
      alternatives: ['a', 'b'],
    });
    const distinct = diagnostic({
      path: 'doc.a',
      code: 'ONE',
      message: 'same',
      suggestion: 'different',
      alternatives: ['a', 'b'],
    });

    const deduped = dedupeDiagnostics([first, duplicate, distinct]);
    assert.deepEqual(deduped, [first, distinct]);
  });

  it('caps diagnostics to maxDiagnosticCount', () => {
    const diagnostics = [
      diagnostic({ code: 'A' }),
      diagnostic({ code: 'B' }),
      diagnostic({ code: 'C' }),
    ];

    assert.deepEqual(capDiagnostics(diagnostics, 2).map((entry) => entry.code), ['A', 'B']);
    assert.deepEqual(capDiagnostics(diagnostics, 3).map((entry) => entry.code), ['A', 'B', 'C']);
    assert.throws(() => capDiagnostics(diagnostics, -1), /maxDiagnosticCount/);
  });
});
