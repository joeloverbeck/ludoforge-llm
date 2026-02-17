import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { GameSpecSourceMap } from '../../src/cnl/source-map.js';
import {
  annotateDiagnosticWithSourceSpans,
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
  if (overrides.assetPath !== undefined) {
    result = { ...result, assetPath: overrides.assetPath };
  }
  if (overrides.entityId !== undefined) {
    result = { ...result, entityId: overrides.entityId };
  }
  if (overrides.macroOrigin !== undefined) {
    result = { ...result, macroOrigin: overrides.macroOrigin };
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

  it('does not dedupe diagnostics that only differ by asset context', () => {
    const first = diagnostic({
      path: 'asset.kind',
      code: 'DATA_ASSET_KIND_UNSUPPORTED',
      message: 'Unsupported kind.',
      assetPath: 'data/fitl/map/foundation.v1.json',
      entityId: 'fitl-map-foundation',
    });
    const second = diagnostic({
      path: 'asset.kind',
      code: 'DATA_ASSET_KIND_UNSUPPORTED',
      message: 'Unsupported kind.',
      assetPath: 'data/fitl/scenarios/foundation-westys-war.v1.yaml',
      entityId: 'fitl-scenario-foundation',
    });

    const deduped = dedupeDiagnostics([first, second]);
    assert.deepEqual(deduped, [first, second]);
  });

  it('does not dedupe diagnostics that only differ by macro provenance', () => {
    const first = diagnostic({
      code: 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION',
      path: 'setup[0].args.faction',
      message: 'constraint violation',
      ...( {
        macroOrigin: {
          invocation: { path: 'setup[0]' },
          declaration: { path: 'effectMacros[0].params[0]' },
          expanded: { path: 'setup[0].args.faction' },
        },
      } as const),
    });
    const second = diagnostic({
      code: 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION',
      path: 'setup[0].args.faction',
      message: 'constraint violation',
      ...( {
        macroOrigin: {
          invocation: { path: 'setup[1]' },
          declaration: { path: 'effectMacros[0].params[0]' },
          expanded: { path: 'setup[0].args.faction' },
        },
      } as const),
    });

    const deduped = dedupeDiagnostics([first, second]);
    assert.deepEqual(deduped, [first, second]);
  });

  it('annotates macro provenance pointers with source-map spans', () => {
    const sourceMap: GameSpecSourceMap = {
      byPath: {
        'setup[0]': {
          blockIndex: 0,
          markdownLineStart: 10,
          markdownColStart: 1,
          markdownLineEnd: 10,
          markdownColEnd: 20,
        },
        'effectMacros[0].params': {
          blockIndex: 0,
          markdownLineStart: 2,
          markdownColStart: 1,
          markdownLineEnd: 2,
          markdownColEnd: 30,
        },
      },
    };

    const annotated = annotateDiagnosticWithSourceSpans(
      diagnostic({
        code: 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION',
        path: 'setup[0].args.faction',
        ...( {
          macroOrigin: {
            invocation: { path: 'setup[0]' },
            declaration: { path: 'effectMacros[0].params[0]' },
            expanded: { path: 'setup[0].args.faction' },
          },
        } as const),
      }),
      sourceMap,
    );

    assert.equal(annotated.macroOrigin?.invocation?.span?.markdownLineStart, 10);
    assert.equal(annotated.macroOrigin?.declaration?.span?.markdownLineStart, 2);
    assert.equal(annotated.macroOrigin?.expanded?.span?.markdownLineStart, 10);
  });

  it('resolves macro-expanded diagnostic paths to nearest source-mapped parent path', () => {
    const sourceMap: GameSpecSourceMap = {
      byPath: {
        'setup[0]': {
          blockIndex: 0,
          markdownLineStart: 12,
          markdownColStart: 1,
          markdownLineEnd: 12,
          markdownColEnd: 10,
        },
      },
    };

    const key = getDiagnosticSortKey(
      diagnostic({
        path: 'setup[0][macro:outer][0].args.faction',
        code: 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION',
      }),
      sourceMap,
    );

    assert.equal(key.sourceOrder < Number.POSITIVE_INFINITY, true);
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
