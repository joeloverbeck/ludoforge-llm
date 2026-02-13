import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CompileSectionResults } from '../../src/cnl/index.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, readCompilerFixture } from '../helpers/production-spec-helpers.js';

describe('compiler structured section results', () => {
  function createMinimalCompilableDoc() {
    return {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'asset-cascade', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }] as const,
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' } as const,
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }] as const,
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] as const,
    };
  }

  it('valid fixture produces non-null gameDef and populated required sections', () => {
    const parsed = parseGameSpec(readCompilerFixture('compile-valid.md'));
    assertNoErrors(parsed);

    const result = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.notEqual(result.gameDef, null);
    assert.notEqual(result.sections.metadata, null);
    assert.notEqual(result.sections.constants, null);
    assert.notEqual(result.sections.globalVars, null);
    assert.notEqual(result.sections.perPlayerVars, null);
    assert.notEqual(result.sections.zones, null);
    assert.notEqual(result.sections.tokenTypes, null);
    assert.notEqual(result.sections.setup, null);
    assert.notEqual(result.sections.turnStructure, null);
    assert.notEqual(result.sections.actions, null);
    assert.notEqual(result.sections.triggers, null);
    assert.notEqual(result.sections.endConditions, null);
    assert.deepEqual(result.sections.zones, result.gameDef?.zones);
    assert.deepEqual(result.sections.actions, result.gameDef?.actions);
    assert.deepEqual(result.sections.turnStructure, result.gameDef?.turnStructure);
  });

  it('broken actions section nulls only actions while preserving independent sections', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'broken-actions', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        { id: 'bad', actor: 42, phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.notEqual(result.sections.metadata, null);
    assert.notEqual(result.sections.zones, null);
    assert.equal(result.sections.actions, null);
  });

  it('missing metadata nulls gameDef while allowing zones section compilation', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.sections.metadata, null);
    assert.notEqual(result.sections.zones, null);
  });

  it('map data asset failure nulls zones when no explicit YAML zones exist', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      zones: null,
      dataAssets: [{ id: 'broken-map', kind: 'map', payload: {} }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.sections.zones, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_DATA_ASSET_CASCADE_ZONES_MISSING' && diagnostic.severity === 'warning',
      ),
      true,
    );
  });

  it('map data asset failure does not null zones when explicit YAML zones exist', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [{ id: 'broken-map', kind: 'map', payload: {} }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.sections.zones, null);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_DATA_ASSET_CASCADE_ZONES_MISSING'),
      false,
    );
  });

  it('pieceCatalog failure nulls tokenTypes when no explicit YAML tokenTypes exist', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      tokenTypes: null,
      dataAssets: [{ id: 'broken-piece-catalog', kind: 'pieceCatalog', payload: {} }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.sections.tokenTypes, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING' && diagnostic.severity === 'warning',
      ),
      true,
    );
  });

  it('eventCardSet failure does not emit cascade diagnostics', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [{ id: 'broken-event-cards', kind: 'eventCardSet', payload: { cards: {} } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.sections.eventCards, null);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code.startsWith('CNL_DATA_ASSET_CASCADE_')),
      false,
    );
  });

  it('production FITL section values align with gameDef for populated section fields', () => {
    const production = compileProductionSpec();
    const { compiled } = production;

    assert.notEqual(compiled.gameDef, null);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);

    const keys: ReadonlyArray<keyof CompileSectionResults> = [
      'metadata',
      'constants',
      'globalVars',
      'perPlayerVars',
      'zones',
      'tokenTypes',
      'setup',
      'turnStructure',
      'turnFlow',
      'actionPipelines',
      'coupPlan',
      'victory',
      'actions',
      'triggers',
      'endConditions',
      'eventCards',
    ];

    for (const key of keys) {
      const sectionValue = compiled.sections[key];
      if (sectionValue !== null) {
        assert.deepEqual(sectionValue, compiled.gameDef?.[key]);
      }
    }
  });

  it('CompileSectionResults keys stay aligned with the structured compiler contract', () => {
    type ExpectedKeys =
      | 'metadata'
      | 'constants'
      | 'globalVars'
      | 'perPlayerVars'
      | 'zones'
      | 'tokenTypes'
      | 'setup'
      | 'turnStructure'
      | 'turnFlow'
      | 'actionPipelines'
      | 'coupPlan'
      | 'victory'
      | 'actions'
      | 'triggers'
      | 'endConditions'
      | 'eventCards';

    type Missing = Exclude<ExpectedKeys, keyof CompileSectionResults>;
    type Extra = Exclude<keyof CompileSectionResults, ExpectedKeys>;

    const noMissing: Missing extends never ? true : never = true;
    const noExtra: Extra extends never ? true : never = true;

    assert.equal(noMissing, true);
    assert.equal(noExtra, true);
  });
});
