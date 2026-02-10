import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import { parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

interface ValidGolden {
  readonly expectedDoc: unknown;
  readonly requiredSourceMapAnchors: readonly string[];
  readonly expectedParseDiagnosticCodes: readonly string[];
}

interface InvalidGolden {
  readonly expectedCombinedDiagnostics: readonly Pick<
    Diagnostic,
    'code' | 'path' | 'severity' | 'message' | 'suggestion' | 'alternatives'
  >[];
}

const readFixture = (name: string): string => readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', name), 'utf8');

const readJsonFixture = <T>(name: string): T => JSON.parse(readFixture(name)) as T;

const normalizeDiagnostic = (diagnostic: Diagnostic) => ({
  code: diagnostic.code,
  path: diagnostic.path,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...(diagnostic.suggestion !== undefined ? { suggestion: diagnostic.suggestion } : {}),
  ...(diagnostic.alternatives !== undefined ? { alternatives: diagnostic.alternatives } : {}),
});

describe('parse/validate golden fixtures', () => {
  it('matches valid markdown golden doc + source-map anchor expectations', () => {
    const markdown = readFixture('full-valid-spec.md');
    const golden = readJsonFixture<ValidGolden>('full-valid-spec.golden.json');

    const parsed = parseGameSpec(markdown);

    assert.deepEqual(parsed.doc, golden.expectedDoc);
    assert.deepEqual(
      parsed.diagnostics.map((diagnostic) => diagnostic.code),
      golden.expectedParseDiagnosticCodes,
    );

    golden.requiredSourceMapAnchors.forEach((anchorPath) => {
      assert.ok(parsed.sourceMap.byPath[anchorPath] !== undefined, `Missing source-map anchor: ${anchorPath}`);
    });
  });

  it('matches invalid markdown golden diagnostics with stable shape', () => {
    const markdown = readFixture('full-invalid-spec.md');
    const golden = readJsonFixture<InvalidGolden>('full-invalid-spec.golden.json');

    const parsed = parseGameSpec(markdown);
    const combinedDiagnostics = [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];
    const normalized = combinedDiagnostics.map(normalizeDiagnostic);

    assert.equal(normalized.length, golden.expectedCombinedDiagnostics.length);
    golden.expectedCombinedDiagnostics.forEach((expected, index) => {
      const actual = normalized[index];
      assert.ok(actual !== undefined);

      assert.equal(actual?.code, expected.code);
      assert.equal(actual?.path, expected.path);
      assert.equal(actual?.severity, expected.severity);
      assert.equal(actual?.message, expected.message);

      if (expected.suggestion !== undefined) {
        assert.equal(actual?.suggestion, expected.suggestion);
      }

      if (expected.alternatives !== undefined) {
        assert.deepEqual(actual?.alternatives, expected.alternatives);
      }
    });

    normalized.forEach((diagnostic) => {
      assert.equal(diagnostic.path.trim().length > 0, true);
      assert.equal(diagnostic.message.trim().length > 0, true);

      if (diagnostic.suggestion !== undefined) {
        assert.equal(typeof diagnostic.suggestion, 'string');
        assert.equal(diagnostic.suggestion.trim().length > 0, true);
      }

      if (diagnostic.alternatives !== undefined) {
        assert.equal(Array.isArray(diagnostic.alternatives), true);
        assert.equal(diagnostic.alternatives.every((value) => typeof value === 'string' && value.trim().length > 0), true);
      }
    });
  });
});
