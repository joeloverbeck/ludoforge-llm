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
import { applyMove, asActionId, initialState, validateGameDef } from '../../src/kernel/index.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';

describe('compile pipeline integration', () => {
  it('passes metadata name and description through to GameDef only when provided', () => {
    const withDisplayMetadata = compileGameSpecToGameDef({
      ...createEmptyGameSpecDoc(),
      metadata: {
        id: 'pipeline-display-metadata',
        name: 'Pipeline Display Metadata',
        description: 'Compile metadata pass-through verification.',
        players: { min: 2, max: 2 },
      },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    });

    const withoutDisplayMetadata = compileGameSpecToGameDef({
      ...createEmptyGameSpecDoc(),
      metadata: {
        id: 'pipeline-display-metadata-omitted',
        players: { min: 2, max: 2 },
      },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    });

    assertNoDiagnostics(withDisplayMetadata);
    assertNoDiagnostics(withoutDisplayMetadata);
    assert.equal(withDisplayMetadata.gameDef?.metadata.name, 'Pipeline Display Metadata');
    assert.equal(withDisplayMetadata.gameDef?.metadata.description, 'Compile metadata pass-through verification.');
    assert.equal('name' in (withoutDisplayMetadata.gameDef?.metadata ?? {}), false);
    assert.equal('description' in (withoutDisplayMetadata.gameDef?.metadata ?? {}), false);
  });

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
          executor: 'actor',
          phase: ['main'],
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
      zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: 'missing-zone' }] }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.deepEqual(first, second);
    assert.equal(
      first.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'SPATIAL_DANGLING_ZONE_REF' && diagnostic.path === 'doc.zones.0.adjacentTo.0.to',
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
    assert.deepEqual(
      compiled.gameDef?.zones.filter((z) => z.category !== undefined).map((z) => z.id),
      ['hue:none', 'quang-tri:none'],
    );
    assert.equal(compiled.gameDef?.turnOrder?.type, 'cardDriven');
    assert.deepEqual(compiled.gameDef?.setup ?? [], []);
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
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: [{ to: beta:none }]',
      '        - id: beta:none',
      '          category: city',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [urban]',
      '            country: south-vietnam',
      '            coastal: true',
      '          adjacentTo: [{ to: alpha:none }]',
      '      markerLattices:',
      '        - id: supportOpposition',
      '          states: [neutral, support]',
      '          defaultState: neutral',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 12',
      '      spaceMarkers:',
      '        - spaceId: alpha:none',
      '          markerId: supportOpposition',
      '          state: support',
      '      stackingConstraints:',
      '        - id: no-duplicate-base',
      '          description: Prevent duplicate bases in one space',
      '          spaceFilter:',
      '            category: [city]',
      '          pieceFilter:',
      '            pieceTypeIds: [base]',
      '          rule: prohibit',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.deepEqual(
      compiled.gameDef?.zones.filter((z) => z.category !== undefined).map((z) => z.id),
      ['alpha:none', 'beta:none'],
    );
    assert.deepEqual(
      compiled.gameDef?.markerLattices?.map((lattice) => lattice.id),
      ['supportOpposition'],
    );
    assert.deepEqual(
      compiled.gameDef?.tracks?.map((track) => track.id),
      ['aid'],
    );
    assert.deepEqual(compiled.gameDef?.spaceMarkers, [
      { spaceId: 'alpha:none', markerId: 'supportOpposition', state: 'support' },
    ]);
    assert.deepEqual(
      compiled.gameDef?.stackingConstraints?.map((constraint) => constraint.id),
      ['no-duplicate-base'],
    );
  });

  it('executes runtime assetRows + assetField logic from embedded dataAssets', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-runtime-asset-rows',
      '  players:',
      '    min: 2',
      '    max: 2',
      'globalVars:',
      '  - name: currentSmallBlind',
      '    type: int',
      '    init: 0',
      '    min: 0',
      '    max: 1000000',
      'zones:',
      '  - id: table:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'dataAssets:',
      '  - id: tournament-standard',
      '    kind: scenario',
      '    payload:',
      '      blindSchedule:',
      '        levels:',
      '          - level: 1',
      '            smallBlind: 10',
      '            phase: early',
      '          - level: 2',
      '            smallBlind: 20',
      '            phase: early',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: syncBlind',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $row',
      '          over:',
      '            query: assetRows',
      '            tableId: blindSchedule.levels',
      '            where:',
      '              - field: level',
      '                op: eq',
      '                value: 2',
      '          effects:',
      '            - setVar:',
      '                scope: global',
      '                var: currentSmallBlind',
      '                value:',
      '                  ref: assetField',
      '                  row: $row',
      '                  tableId: blindSchedule.levels',
      '                  field: smallBlind',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 0 }',
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
    assert.equal(compiled.gameDef?.runtimeDataAssets?.length, 1);
    assert.equal(compiled.gameDef?.tableContracts?.length, 1);
    const serializedActions = JSON.stringify(compiled.gameDef?.actions ?? []);
    assert.equal(serializedActions.includes('tournament-standard::blindSchedule.levels'), true);
    assert.equal(serializedActions.includes('"tableId":"blindSchedule.levels"'), false);

    const def = compiled.gameDef!;
    const start = initialState(def, 101, 2).state;
    const next = applyMove(def, start, { actionId: asActionId('syncBlind'), params: {} }).state;
    assert.equal(next.globalVars.currentSmallBlind, 20);
  });

  it('rejects legacy GameSpec runtime table literals that embed scenario asset ids', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-runtime-asset-rows-legacy-literal',
      '  players:',
      '    min: 2',
      '    max: 2',
      'zones:',
      '  - id: table:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'dataAssets:',
      '  - id: tournament-standard',
      '    kind: scenario',
      '    payload:',
      '      blindSchedule:',
      '        levels:',
      '          - level: 1',
      '            smallBlind: 10',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: syncBlind',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $row',
      '          over:',
      '            query: assetRows',
      '            tableId: tournament-standard::blindSchedule.levels',
      '          effects: []',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 0 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TABLE_REF_LEGACY_LITERAL' &&
          diagnostic.path === 'doc.actions.0.effects.0.forEach.over.tableId',
      ),
      true,
    );
  });

  it('projects map tracks into gameDef globalVars without duplicated globalVars declarations', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-track-projection',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: fitl-map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: [{ to: beta:none }]',
      '        - id: beta:none',
      '          category: city',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [urban]',
      '            country: south-vietnam',
      '            coastal: true',
      '          adjacentTo: [{ to: alpha:none }]',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 12',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'turnOrder:',
      '  type: cardDriven',
      '  config:',
      '    turnFlow:',
      '      cardLifecycle:',
      '        played: alpha:none',
      '        lookahead: beta:none',
      '        leader: alpha:none',
      '      eligibility:',
      '        seats: ["0", "1"]',
      '        overrideWindows: []',
      '      actionClassByActionId:',
      '        pass: pass',
      '      optionMatrix: []',
      '      passRewards:',
      '        - seat: "0"',
      '          resource: aid',
      '          amount: 1',
      '      durationWindows: [turn, nextTurn, round, cycle]',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
      compiled.gameDef?.globalVars.find((variable) => variable.name === 'aid'),
      { name: 'aid', type: 'int', init: 12, min: 0, max: 80 },
    );
  });

  it('fails compile when map tracks are also declared in globalVars (no alias path)', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-track-mismatch',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: fitl-map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 12',
      'globalVars:',
      '  - name: aid',
      '    type: int',
      '    init: 12',
      '    min: 0',
      '    max: 80',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_TRACK_GLOBAL_VAR_DUPLICATE'),
      true,
    );
  });

  it('uses selected scenario initializations as canonical track initializers', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-scenario-track-init',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 0',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '        - id: arvn',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '      initializations:',
      '        - trackId: aid',
      '          value: 17',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'turnOrder:',
      '  type: cardDriven',
      '  config:',
      '    turnFlow:',
      '      cardLifecycle:',
      '        played: alpha:none',
      '        lookahead: alpha:none',
      '        leader: alpha:none',
      '      eligibility:',
      '        seats: ["0", "1"]',
      '        overrideWindows: []',
      '      actionClassByActionId:',
      '        pass: pass',
      '      optionMatrix: []',
      '      passRewards:',
      '        - seat: "0"',
      '          resource: aid',
      '          amount: 1',
      '      durationWindows: [turn, nextTurn, round, cycle]',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef?.globalVars.find((variable) => variable.name === 'aid')?.init, 17);
  });

  it('derives gameDef factions from the piece catalog selected by scenario', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-scenario-faction-selection',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-a',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 5',
      '  - id: pieces-b',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: nva',
      '      pieceTypes:',
      '        - id: nva-regular',
      '          seat: nva',
      '          statusDimensions: []',
      '          transitions: []',
      '      inventory:',
      '        - pieceTypeId: nva-regular',
      '          seat: nva',
      '          total: 5',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-b',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
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
    assert.deepEqual(compiled.gameDef?.seats, [{ id: 'nva' }]);
    assert.deepEqual(compiled.gameDef?.tokenTypes.map((tokenType) => tokenType.id), ['nva-regular']);
  });

  it('fails compile when selected piece catalog omits required factions catalog', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-scenario-no-faction-catalog',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 5',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID'
          && diagnostic.path.endsWith('.payload.seats'),
      ),
      true,
    );
  });

  const buildScenarioProjectionValidationMarkdown = (scenarioPayloadLines: readonly string[]): string =>
    [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-scenario-projection-validation',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 2',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      ...scenarioPayloadLines.map((line) => `      ${line}`),
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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

  it('fails compile when scenario initialPlacements references unknown piece type during projection', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'seatPools:',
      '  - seat: us',
      '    availableZoneId: available-US:none',
      '    outOfPlayZoneId: out-of-play-US:none',
      'initialPlacements:',
      '  - spaceId: alpha:none',
      '    pieceTypeId: missing-piece',
      '    seat: us',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_PLACEMENT_PIECE_INVALID' &&
          diagnostic.path === 'doc.dataAssets.2.payload.initialPlacements.0.pieceTypeId',
      ),
      true,
    );
  });

  it('fails compile when scenario outOfPlay references unknown piece type during projection', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'seatPools:',
      '  - seat: us',
      '    availableZoneId: available-US:none',
      '    outOfPlayZoneId: out-of-play-US:none',
      'outOfPlay:',
      '  - pieceTypeId: missing-piece',
      '    seat: us',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_OUT_OF_PLAY_PIECE_INVALID' &&
          diagnostic.path === 'doc.dataAssets.2.payload.outOfPlay.0.pieceTypeId',
      ),
      true,
    );
  });

  it('fails compile when scenario initialPlacements faction mismatches referenced piece type faction', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'seatPools:',
      '  - seat: us',
      '    availableZoneId: available-US:none',
      '    outOfPlayZoneId: out-of-play-US:none',
      'initialPlacements:',
      '  - spaceId: alpha:none',
      '    pieceTypeId: us-troops',
      '    seat: arvn',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_PLACEMENT_SEAT_MISMATCH' &&
          diagnostic.path === 'doc.dataAssets.2.payload.initialPlacements.0.seat',
      ),
      true,
    );
  });

  it('fails compile when scenario outOfPlay faction mismatches referenced piece type faction', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'seatPools:',
      '  - seat: us',
      '    availableZoneId: available-US:none',
      '    outOfPlayZoneId: out-of-play-US:none',
      '  - seat: arvn',
      '    availableZoneId: available-ARVN:none',
      '    outOfPlayZoneId: out-of-play-ARVN:none',
      'outOfPlay:',
      '  - pieceTypeId: us-troops',
      '    seat: arvn',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_OUT_OF_PLAY_SEAT_MISMATCH' &&
          diagnostic.path === 'doc.dataAssets.2.payload.outOfPlay.0.seat',
      ),
      true,
    );
  });

  it('fails compile when scenario oversubscribes piece inventory during projection', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'seatPools:',
      '  - seat: us',
      '    availableZoneId: available-US:none',
      '    outOfPlayZoneId: out-of-play-US:none',
      'initialPlacements:',
      '  - spaceId: alpha:none',
      '    pieceTypeId: us-troops',
      '    seat: us',
      '    count: 2',
      'outOfPlay:',
      '  - pieceTypeId: us-troops',
      '    seat: us',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_PIECE_CONSERVATION_VIOLATED' &&
          diagnostic.path === 'doc.dataAssets.2.payload',
      ),
      true,
    );
  });

  it('fails compile when scenario setup projection fields are present without seatPools', () => {
    const markdown = buildScenarioProjectionValidationMarkdown([
      'mapAssetId: map-foundation',
      'pieceCatalogAssetId: pieces-foundation',
      'scenarioName: Foundation',
      'yearRange: 1964-1965',
      'initialPlacements:',
      '  - spaceId: alpha:none',
      '    pieceTypeId: us-troops',
      '    seat: us',
      '    count: 1',
    ]);

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SCENARIO_SEAT_POOLS_REQUIRED' &&
          diagnostic.path === 'doc.dataAssets.2.payload.seatPools',
      ),
      true,
    );
  });

  it('fails compile when multiple scenarios exist without metadata.defaultScenarioAssetId', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-ambiguous-scenario',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 0',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      initializations:',
      '        - trackId: aid',
      '          value: 17',
      '  - id: scenario-late-war',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      initializations:',
      '        - trackId: aid',
      '          value: 33',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS'),
      true,
    );
  });

  it('uses metadata.defaultScenarioAssetId for deterministic scenario selection', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-explicit-scenario',
      '  players:',
      '    min: 2',
      '    max: 2',
      '  defaultScenarioAssetId: scenario-late-war',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 0',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      initializations:',
      '        - trackId: aid',
      '          value: 17',
      '  - id: scenario-late-war',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      initializations:',
      '        - trackId: aid',
      '          value: 33',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal('defaultScenarioAssetId' in (compiled.gameDef?.metadata ?? {}), false);
    assert.equal(compiled.gameDef?.globalVars.find((variable) => variable.name === 'aid')?.init, 33);
  });

  it('resolves scenario-relative table refs against metadata.defaultScenarioAssetId for runtime behavior', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-scenario-relative-table-refs',
      '  players:',
      '    min: 2',
      '    max: 2',
      '  defaultScenarioAssetId: scenario-late-war',
      'globalVars:',
      '  - name: currentSmallBlind',
      '    type: int',
      '    init: 0',
      '    min: 0',
      '    max: 1000000',
      'zones:',
      '  - id: table:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'dataAssets:',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      blindSchedule:',
      '        levels:',
      '          - level: 1',
      '            smallBlind: 10',
      '  - id: scenario-late-war',
      '    kind: scenario',
      '    payload:',
      '      blindSchedule:',
      '        levels:',
      '          - level: 1',
      '            smallBlind: 40',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: syncBlind',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $row',
      '          over:',
      '            query: assetRows',
      '            tableId: blindSchedule.levels',
      '            where:',
      '              - field: level',
      '                op: eq',
      '                value: 1',
      '          effects:',
      '            - setVar:',
      '                scope: global',
      '                var: currentSmallBlind',
      '                value:',
      '                  ref: assetField',
      '                  row: $row',
      '                  tableId: blindSchedule.levels',
      '                  field: smallBlind',
      '    limits: []',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 0 }',
      '      result: { type: draw }',
      '```',
    ].join('\n');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);
    const serializedActions = JSON.stringify(compiled.gameDef?.actions ?? []);
    assert.equal(serializedActions.includes('scenario-late-war::blindSchedule.levels'), true);
    assert.equal(serializedActions.includes('scenario-foundation::blindSchedule.levels'), false);

    const start = initialState(compiled.gameDef!, 101, 2).state;
    const next = applyMove(compiled.gameDef!, start, { actionId: asActionId('syncBlind'), params: {} }).state;
    assert.equal(next.globalVars.currentSmallBlind, 40);
  });

  it('fails compile when scenario initializations references unknown track ids', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-assets-scenario-track-init-unknown',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '      tracks:',
      '        - id: aid',
      '          scope: global',
      '          min: 0',
      '          max: 80',
      '          initial: 0',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes: []',
      '      inventory: []',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '      initializations:',
      '        - trackId: missing-track',
      '          value: 17',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_TRACK_SCENARIO_INIT_UNKNOWN'), true);
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
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
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
    '    executor: actor',
      '    phase: [main]',
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
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: fitl-pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
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
    '    executor: actor',
      '    phase: [main]',
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

  it('lowers embedded event decks into GameDef with deterministic card and branch ordering', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-set',
      '  players:',
      '    min: 2',
      '    max: 2',
      'eventDecks:',
      '  - id: fitl-events-foundation',
      '    drawZone: board:none',
      '    discardZone: board:none',
      '    cards:',
      '      - id: card-b',
      '        title: B Card',
      '        sideMode: single',
      '        order: 2',
      '        unshaded:',
      '          branches:',
      '            - id: z',
      '              order: 2',
      '              effects: [{ shuffle: { zone: board:none } }]',
      '            - id: a',
      '              order: 1',
      '              effects: [{ shuffle: { zone: board:none } }]',
      '      - id: card-a',
      '        title: A Card',
      '        sideMode: single',
      '        order: 1',
      '        unshaded:',
      '          effects: [{ shuffle: { zone: board:none } }]',
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
    '    executor: actor',
      '    phase: [main]',
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
    assert.deepEqual(compiled.gameDef?.eventDecks?.[0]?.cards.map((card) => card.id), ['card-a', 'card-b']);
    assert.deepEqual(compiled.gameDef?.eventDecks?.[0]?.cards[1]?.unshaded?.branches?.map((branch) => branch.id), ['a', 'z']);
  });

  it('emits event-deck zone cross-ref diagnostics through full compile pipeline', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-deck-xref-errors',
      '  players:',
      '    min: 2',
      '    max: 2',
      'eventDecks:',
      '  - id: fitl-events-foundation',
      '    drawZone: decj:none',
      '    discardZone: discard:none',
      '    cards:',
      '      - id: card-a',
      '        title: A Card',
      '        sideMode: single',
      '        unshaded:',
      '          effects:',
      '            - draw: { from: deck:none, to: discrad:none, count: 1 }',
      '```',
      '```yaml',
      'zones:',
      '  - id: deck:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      '  - id: discard:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_EVENT_DECK_ZONE_MISSING' && diagnostic.path === 'doc.eventDecks.0.drawZone',
      ),
      true,
    );
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING' &&
          diagnostic.path === 'doc.eventDecks.0.cards.0.unshaded.effects.0.draw.to',
      ),
      true,
    );
  });

  it('rejects ambiguous duplicate ordering declarations in embedded event-deck lowering', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-set-duplicate-order',
      '  players:',
      '    min: 2',
      '    max: 2',
      'eventDecks:',
      '  - id: fitl-events-foundation',
      '    drawZone: board:none',
      '    discardZone: board:none',
      '    cards:',
      '      - id: card-a',
      '        title: A Card',
      '        sideMode: single',
      '        order: 1',
      '        unshaded:',
      '          effects: [{ shuffle: { zone: board:none } }]',
      '      - id: card-b',
      '        title: B Card',
      '        sideMode: single',
      '        order: 1',
      '        unshaded:',
      '          effects: [{ shuffle: { zone: board:none } }]',
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
    '    executor: actor',
      '    phase: [main]',
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
          diagnostic.path === 'doc.eventDecks.0.cards.1.order',
      ),
      true,
    );
  });

  it('rejects non-canonical event target query kind "spaces" (use mapSpaces)', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-non-canonical-query',
      '  players:',
      '    min: 2',
      '    max: 2',
      'eventDecks:',
      '  - id: fitl-events-foundation',
      '    drawZone: board:none',
      '    discardZone: board:none',
      '    cards:',
      '      - id: card-a',
      '        title: A Card',
      '        sideMode: single',
      '        unshaded:',
      '          targets:',
      '            - id: target-space',
      '              selector: { query: spaces }',
      '              cardinality: { max: 1 }',
      '          effects: [{ shuffle: { zone: board:none } }]',
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
    '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MISSING_CAPABILITY' &&
          diagnostic.path === 'doc.eventDecks.0.cards.0.unshaded.targets.0.selector',
      ),
      true,
    );
  });

  it('emits missing-capability diagnostics when an event target id is missing', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-event-card-missing-target-id',
      '  players:',
      '    min: 2',
      '    max: 2',
      'eventDecks:',
      '  - id: fitl-events-foundation',
      '    drawZone: board:none',
      '    discardZone: board:none',
      '    cards:',
      '      - id: card-a',
      '        title: A Card',
      '        sideMode: single',
      '        unshaded:',
      '          targets:',
      '            - selector: { query: activePlayer }',
      '              cardinality: { max: 1 }',
      '          effects: [{ shuffle: { zone: board:none } }]',
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
      '    executor: actor',
      '    phase: [main]',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MISSING_CAPABILITY'
          && diagnostic.path === 'doc.eventDecks.0.cards.0.unshaded.targets.0.id',
      ),
      true,
    );
  });

  it('rejects non-canonical token filter trait literals against selected piece-catalog vocabulary', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-non-canonical-token-trait-filter',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '          runtimeProps: { faction: us, type: troops }',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 2',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '      seatPools:',
      '        - seat: us',
      '          availableZoneId: alpha:none',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $token',
      '          over:',
      '            query: tokensInZone',
      '            zone: alpha:none',
      '            filter:',
      '              - { prop: type, op: eq, value: troop }',
      '          effects: []',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL' &&
          diagnostic.path === 'doc.actions.0.effects.0.forEach.over.filter.0.value',
      ),
      true,
    );
  });

  it('accepts canonical token filter trait literals from selected piece-catalog vocabulary', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-canonical-token-trait-filter',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '          runtimeProps: { faction: us, type: troops }',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 2',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '      seatPools:',
      '        - seat: us',
      '          availableZoneId: alpha:none',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
    '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $token',
      '          over:',
      '            query: tokensInZone',
      '            zone: alpha:none',
      '            filter:',
      '              - { prop: type, op: eq, value: troops }',
      '          effects: []',
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
  });

  it('rejects token filter props not declared by selected piece-catalog token types', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: embedded-unknown-token-filter-prop',
      '  players:',
      '    min: 2',
      '    max: 2',
      'dataAssets:',
      '  - id: map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces:',
      '        - id: alpha:none',
      '          category: province',
      '          attributes:',
      '            population: 1',
      '            econ: 1',
      '            terrainTags: [lowland]',
      '            country: south-vietnam',
      '            coastal: false',
      '          adjacentTo: []',
      '  - id: pieces-foundation',
      '    kind: pieceCatalog',
      '    payload:',
      '      seats:',
      '        - id: us',
      '      pieceTypes:',
      '        - id: us-troops',
      '          seat: us',
      '          statusDimensions: []',
      '          transitions: []',
      '          runtimeProps: { faction: us, type: troops }',
      '      inventory:',
      '        - pieceTypeId: us-troops',
      '          seat: us',
      '          total: 2',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      mapAssetId: map-foundation',
      '      pieceCatalogAssetId: pieces-foundation',
      '      scenarioName: Foundation',
      '      yearRange: 1964-1965',
      '      seatPools:',
      '        - seat: us',
      '          availableZoneId: alpha:none',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $token',
      '          over:',
      '            query: tokensInZone',
      '            zone: alpha:none',
      '            filter:',
      '              - { prop: typeTypo, op: eq, value: troops }',
      '          effects: []',
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
    assert.equal(compiled.gameDef, null);
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN' &&
          diagnostic.path === 'doc.actions.0.effects.0.forEach.over.filter.0.prop',
      ),
      true,
    );
  });

  it('accepts scenario-deck synthetic token props in token filters before lowering', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: scenario-deck-token-filter-ordering',
      '  players:',
      '    min: 2',
      '    max: 2',
      '  defaultScenarioAssetId: scenario-foundation',
      'zones:',
      '  - id: deck:none',
      '    owner: none',
      '    visibility: hidden',
      '    ordering: stack',
      '  - id: played:none',
      '    owner: none',
      '    visibility: public',
      '    ordering: set',
      'tokenTypes: []',
      'setup: []',
      'dataAssets:',
      '  - id: scenario-foundation',
      '    kind: scenario',
      '    payload:',
      '      eventDeckAssetId: deck-a',
      '      deckComposition:',
      '        materializationStrategy: pile-coup-mix-v1',
      '        pileCount: 1',
      '        eventsPerPile: 1',
      '        coupsPerPile: 1',
      'eventDecks:',
      '  - id: deck-a',
      '    drawZone: deck:none',
      '    discardZone: played:none',
      '    cards:',
      '      - id: card-event-1',
      '        title: Event 1',
      '        sideMode: single',
      '        tags: []',
      '        unshaded: { text: event }',
      '      - id: card-coup-1',
      '        title: Coup 1',
      '        sideMode: single',
      '        tags: [coup]',
      '        unshaded: { text: coup }',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      'actions:',
      '  - id: pass',
      '    actor: active',
      '    executor: actor',
      '    phase: [main]',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects:',
      '      - forEach:',
      '          bind: $card',
      '          over:',
      '            query: tokensInZone',
      '            zone: deck:none',
      '            filter:',
      '              - { prop: cardId, op: eq, value: card-event-1 }',
      '              - { prop: isCoup, op: eq, value: false }',
      '          effects: []',
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
    assert.equal(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN'),
      false,
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
