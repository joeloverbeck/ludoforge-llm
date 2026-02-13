import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  expandMacros,
  parseGameSpec,
  validateGameSpec,
} from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { validateGameDef } from '../../src/kernel/index.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';

describe('compile pipeline integration', () => {
  it('is deterministic when compiling raw vs pre-expanded docs', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-deterministic', players: { min: 2, max: 2 } },
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
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
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const raw = compileGameSpecToGameDef(doc);
    const expanded = compileGameSpecToGameDef(expandMacros(doc).doc);

    assertNoDiagnostics(raw);
    assertNoDiagnostics(expanded);
    assert.deepEqual(raw, expanded);
  });

  it('merges adjacency validation diagnostics and nulls gameDef on any error', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-adjacency-error', players: { min: 2, max: 2 } },
      zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: ['missing-zone'] }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
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

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(expanded);
    assertNoDiagnostics(raw);
    assert.deepEqual(raw, preExpanded);
    assert.notEqual(raw.gameDef, null);
    assert.deepEqual(validateGameDef(raw.gameDef!), []);
  });

  it('compiles FITL coup/victory fixture from embedded assets with no external data paths', () => {
    const markdown = readCompilerFixture('fitl-foundation-coup-victory-inline-assets.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(markdown.includes('data/fitl/'), false);
    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.zones.map((zone) => String(zone.id)),
      ['hue:none', 'quang-tri:none'],
    );
    assert.equal(compiled.gameDef?.turnOrder?.type, 'cardDriven');
    assert.equal(
      compiled.gameDef?.turnOrder?.type === 'cardDriven' ? compiled.gameDef.turnOrder.config.coupPlan?.phases[0]?.id : undefined,
      'victory',
    );
    assert.equal(compiled.gameDef?.terminal.checkpoints?.[0]?.id, 'us-threshold');
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
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(compiled);
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
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.zones.map((zone) => String(zone.id)),
      ['alpha:none'],
    );
  });

  it('fails fast for embedded scenario refs with stable path + entityId diagnostics', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-invalid-refs',
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
      '          adjacentTo: []',
      '  - id: fitl-pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: fitl-scenario-invalid',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: fitl-map-missing',
      '      pieceCatalogAssetId: fitl-pieces-missing',
      'zones:',
      '  - id: fallback:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DATA_ASSET_REF_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.mapAssetId' &&
          diagnostic.entityId === 'fitl-scenario-invalid',
      ),
      true,
    );
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DATA_ASSET_REF_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.pieceCatalogAssetId' &&
          diagnostic.entityId === 'fitl-scenario-invalid',
      ),
      true,
    );
  });

  it('lowers embedded event-card sets into GameDef with deterministic card and branch ordering', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-set',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: fitl-events-foundation',
      '    kind: eventCardSet',
      '    payload:',
      '      cards:',
      '        - id: card-b',
      '          title: B Card',
      '          sideMode: single',
      '          order: 2',
      '          unshaded:',
      '            branches:',
      '              - id: z',
      '                order: 2',
      '                effects: [{ op: z }]',
      '              - id: a',
      '                order: 1',
      '                effects: [{ op: a }]',
      '        - id: card-a',
      '          title: A Card',
      '          sideMode: single',
      '          order: 1',
      '          unshaded:',
      '            effects: [{ op: alpha }]',
      '```',
      '```yaml',
      'zones:',
      '  - id: board:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(compiled.gameDef?.eventCards?.map((card) => card.id), ['card-a', 'card-b']);
    assert.deepEqual(compiled.gameDef?.eventCards?.[1]?.unshaded?.branches?.map((branch) => branch.id), ['a', 'z']);
  });

  it('rejects ambiguous duplicate ordering declarations in embedded event-card lowering', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-set-duplicate-order',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: fitl-events-foundation',
      '    kind: eventCardSet',
      '    payload:',
      '      cards:',
      '        - id: card-a',
      '          title: A Card',
      '          sideMode: single',
      '          order: 1',
      '          unshaded:',
      '            effects: [{ op: alpha }]',
      '        - id: card-b',
      '          title: B Card',
      '          sideMode: single',
      '          order: 1',
      '          unshaded:',
      '            effects: [{ op: beta }]',
      '```',
      '```yaml',
      'zones:',
      '  - id: board:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_EVENT_CARD_ORDER_AMBIGUOUS' &&
          diagnostic.path === 'doc.dataAssets.0.payload.cards.1.order',
      ),
      true,
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
