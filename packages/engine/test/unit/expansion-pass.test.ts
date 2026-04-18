// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  topologicalSortPasses,
  runExpansionPipeline,
  substitutePlaceholders,
} from '../../src/cnl/expansion-pass.js';
import type { ExpansionPass } from '../../src/cnl/expansion-pass.js';
import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePass(
  id: string,
  dependsOn: string[] = [],
  transform?: (doc: ReturnType<typeof createEmptyGameSpecDoc>) => ReturnType<typeof createEmptyGameSpecDoc>,
): ExpansionPass {
  return {
    id,
    dependsOn,
    expand: (doc) => ({
      doc: transform ? transform(doc) : doc,
      diagnostics: [],
    }),
  };
}

function makePassWithDiagnostic(id: string, code: string): ExpansionPass {
  return {
    id,
    dependsOn: [],
    expand: (doc) => ({
      doc,
      diagnostics: [{ code, path: id, severity: 'warning', message: `from ${id}` }],
    }),
  };
}

// ---------------------------------------------------------------------------
// topologicalSortPasses
// ---------------------------------------------------------------------------

describe('topologicalSortPasses', () => {
  it('returns passes in a valid order when all are independent', () => {
    const a = makePass('a');
    const b = makePass('b');
    const c = makePass('c');

    const sorted = topologicalSortPasses([a, b, c]);
    assert.equal(sorted.length, 3);
    // All three must appear
    const ids = sorted.map((p) => p.id);
    assert.ok(ids.includes('a'));
    assert.ok(ids.includes('b'));
    assert.ok(ids.includes('c'));
  });

  it('respects declared dependencies', () => {
    const a = makePass('a');
    const b = makePass('b', ['a']);
    const c = makePass('c', ['b']);

    const sorted = topologicalSortPasses([c, a, b]); // scrambled input
    const ids = sorted.map((p) => p.id);
    assert.ok(ids.indexOf('a') < ids.indexOf('b'), 'a must come before b');
    assert.ok(ids.indexOf('b') < ids.indexOf('c'), 'b must come before c');
  });

  it('handles diamond dependencies', () => {
    const a = makePass('a');
    const b = makePass('b', ['a']);
    const c = makePass('c', ['a']);
    const d = makePass('d', ['b', 'c']);

    const sorted = topologicalSortPasses([d, c, b, a]);
    const ids = sorted.map((p) => p.id);
    assert.ok(ids.indexOf('a') < ids.indexOf('b'));
    assert.ok(ids.indexOf('a') < ids.indexOf('c'));
    assert.ok(ids.indexOf('b') < ids.indexOf('d'));
    assert.ok(ids.indexOf('c') < ids.indexOf('d'));
  });

  it('throws on cycle', () => {
    const a = makePass('a', ['b']);
    const b = makePass('b', ['a']);

    assert.throws(
      () => topologicalSortPasses([a, b]),
      (err: Error) => err.message.includes('Cycle detected'),
    );
  });

  it('throws on unknown dependency', () => {
    const a = makePass('a', ['nonexistent']);

    assert.throws(
      () => topologicalSortPasses([a]),
      (err: Error) => err.message.includes('unknown pass "nonexistent"'),
    );
  });

  it('preserves input order among independent passes', () => {
    const x = makePass('x');
    const y = makePass('y');
    const z = makePass('z');

    const sorted = topologicalSortPasses([x, y, z]);
    const ids = sorted.map((p) => p.id);
    assert.deepEqual(ids, ['x', 'y', 'z']);
  });
});

// ---------------------------------------------------------------------------
// runExpansionPipeline
// ---------------------------------------------------------------------------

describe('runExpansionPipeline', () => {
  it('threads doc through passes in sorted order', () => {
    const log: string[] = [];

    const a: ExpansionPass = {
      id: 'a',
      dependsOn: [],
      expand: (doc) => {
        log.push('a');
        return { doc: { ...doc, constants: { step: 1 } }, diagnostics: [] };
      },
    };

    const b: ExpansionPass = {
      id: 'b',
      dependsOn: ['a'],
      expand: (doc) => {
        log.push('b');
        const prev = (doc.constants as Record<string, number> | null)?.step ?? 0;
        return { doc: { ...doc, constants: { step: prev + 1 } }, diagnostics: [] };
      },
    };

    const result = runExpansionPipeline([b, a], createEmptyGameSpecDoc());
    assert.deepEqual(log, ['a', 'b']);
    assert.deepEqual(result.doc.constants, { step: 2 });
  });

  it('accumulates diagnostics from all passes', () => {
    const p1 = makePassWithDiagnostic('p1', 'CODE_A');
    const p2 = makePassWithDiagnostic('p2', 'CODE_B');
    const p3 = makePassWithDiagnostic('p3', 'CODE_C');

    const result = runExpansionPipeline([p1, p2, p3], createEmptyGameSpecDoc());
    assert.equal(result.diagnostics.length, 3);
    assert.deepEqual(
      result.diagnostics.map((d) => d.code),
      ['CODE_A', 'CODE_B', 'CODE_C'],
    );
  });

  it('returns unchanged doc when no passes are given', () => {
    const doc = createEmptyGameSpecDoc();
    const result = runExpansionPipeline([], doc);
    assert.equal(result.doc, doc);
    assert.equal(result.diagnostics.length, 0);
  });
});

// ---------------------------------------------------------------------------
// substitutePlaceholders
// ---------------------------------------------------------------------------

describe('substitutePlaceholders', () => {
  it('resolves all placeholders', () => {
    const { result, unresolved } = substitutePlaceholders(
      '{color}-{rank}',
      { color: 'red', rank: 5 },
    );
    assert.equal(result, 'red-5');
    assert.deepEqual(unresolved, []);
  });

  it('reports unresolved placeholders', () => {
    const { result, unresolved } = substitutePlaceholders(
      '{known}-{unknown}',
      { known: 'ok' },
    );
    assert.equal(result, 'ok-{unknown}');
    assert.deepEqual(unresolved, ['unknown']);
  });

  it('handles patterns with no placeholders', () => {
    const { result, unresolved } = substitutePlaceholders('literal', {});
    assert.equal(result, 'literal');
    assert.deepEqual(unresolved, []);
  });

  it('handles empty values map', () => {
    const { result, unresolved } = substitutePlaceholders('{a}-{b}', {});
    assert.equal(result, '{a}-{b}');
    assert.deepEqual(unresolved, ['a', 'b']);
  });
});
