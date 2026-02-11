import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  expandMacros,
  parseGameSpec,
  validateGameSpec,
} from '../../src/cnl/index.js';
import { validateGameDef } from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('compile pipeline integration', () => {
  it('is deterministic when compiling raw vs pre-expanded docs', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-deterministic', players: { min: 2, max: 2 } },
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        {
          id: 'drawEach',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [{ draw: { from: 'deck:none', to: 'hand:each', count: 1 } }],
          limits: [],
        },
      ],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const raw = compileGameSpecToGameDef(doc);
    const expanded = compileGameSpecToGameDef(expandMacros(doc).doc);

    assert.deepEqual(raw.diagnostics, []);
    assert.deepEqual(expanded.diagnostics, []);
    assert.deepEqual(raw, expanded);
  });

  it('merges adjacency validation diagnostics and nulls gameDef on any error', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-adjacency-error', players: { min: 2, max: 2 } },
      zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: ['missing-zone'] }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.deepEqual(first, second);
    assert.equal(
      first.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'SPATIAL_DANGLING_ZONE_REF' && diagnostic.path === 'zones[0].adjacentTo[0]',
      ),
      true,
    );
  });

  it('runs parse/validate/expand/compile/validate end-to-end for compile-valid fixture', () => {
    const markdown = readCompilerFixture('compile-valid.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const expanded = expandMacros(parsed.doc, { sourceMap: parsed.sourceMap });
    const raw = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    const preExpanded = compileGameSpecToGameDef(expanded.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(expanded.diagnostics, []);
    assert.deepEqual(raw.diagnostics, []);
    assert.deepEqual(raw, preExpanded);
    assert.notEqual(raw.gameDef, null);
    assert.deepEqual(validateGameDef(raw.gameDef!), []);
  });

  it('compiles map-driven zones from embedded dataAssets with no zones section', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-only',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: fitl-map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          spaceType: province',
      '          population: 1',
      '          econ: 1',
      '          terrainTags: [lowland]',
      '          country: south-vietnam',
      '          coastal: false',
      '          adjacentTo: [beta:none]',
      '        - id: beta:none',
      '          spaceType: city',
      '          population: 1',
      '          econ: 1',
      '          terrainTags: [urban]',
      '          country: south-vietnam',
      '          coastal: true',
      '          adjacentTo: [alpha:none]',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '  activePlayerOrder: roundRobin',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'endConditions:',
      '  - when: { op: "==", left: 1, right: 1 }',
      '    result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.zones.map((zone) => String(zone.id)),
      ['alpha:none', 'beta:none'],
    );
  });

  it('resolves scenario asset references using the same NFC normalization as validation', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-normalized-refs',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-cafe\u0301',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          spaceType: province',
      '          population: 1',
      '          econ: 1',
      '          terrainTags: [lowland]',
      '          country: south-vietnam',
      '          coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-café',
      '      pieceCatalogAssetId: pieces-foundation',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '  activePlayerOrder: roundRobin',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'endConditions:',
      '  - when: { op: "==", left: 1, right: 1 }',
      '    result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.zones.map((zone) => String(zone.id)),
      ['alpha:none'],
    );
  });

  it('runs parse/validate/expand/compile/validate deterministically for malformed fixture', () => {
    const markdown = readCompilerFixture('compile-malformed.md');

    const run = () => {
      const parsed = parseGameSpec(markdown);
      const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
      const expanded = expandMacros(parsed.doc, { sourceMap: parsed.sourceMap });
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      return { parsed, validatorDiagnostics, expanded, compiled };
    };

    const first = run();
    const second = run();

    assert.deepEqual(second, first);
    assert.equal(first.validatorDiagnostics.length > 0, true);
    assert.equal(first.compiled.gameDef, null);
    assert.equal(first.compiled.diagnostics.length > 0, true);

    first.compiled.diagnostics.forEach((diagnostic) => {
      assert.equal(diagnostic.code.trim().length > 0, true);
      assert.equal(diagnostic.path.trim().length > 0, true);
      assert.equal(diagnostic.message.trim().length > 0, true);

      if (diagnostic.suggestion !== undefined) {
        assert.equal(diagnostic.suggestion.trim().length > 0, true);
      }
    });
  });
});
