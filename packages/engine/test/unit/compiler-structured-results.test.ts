import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CompileSectionResults } from '../../src/cnl/index.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';

describe('compiler structured section results', () => {
  function createMinimalCompilableDoc() {
    return {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'asset-cascade', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }] as const,
      turnStructure: { phases: [{ id: 'main' }] } as const,
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }] as const,
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] } as const,
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
    assert.notEqual(result.sections.terminal, null);
    assert.deepEqual(result.sections.zones, result.gameDef?.zones);
    assert.deepEqual(result.sections.actions, result.gameDef?.actions);
    assert.deepEqual(result.sections.turnStructure, result.gameDef?.turnStructure);
  });

  it('broken actions section nulls only actions while preserving independent sections', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'broken-actions', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        { id: 'bad', actor: 42, executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.notEqual(result.sections.metadata, null);
    assert.notEqual(result.sections.zones, null);
    assert.equal(result.sections.actions, null);
  });

  it('actions failure does not prevent later independent sections from compiling', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'actions-fail-later-sections-still-compile', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        { id: 'bad', actor: 42, executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [{ id: 'after-turn', event: { type: 'turnEnd' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.sections.actions, null);
    assert.notEqual(result.sections.triggers, null);
    assert.notEqual(result.sections.terminal, null);
  });

  it('missing metadata nulls gameDef while allowing zones section compilation', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
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

  it('merges map-derived zones with explicit YAML zones when both are declared', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [
        {
          id: 'fitl-map-foundation',
          kind: 'map' as const,
          payload: {
            spaces: [
              {
                id: 'alpha:none',
                category: 'province',
                attributes: { population: 1, econ: 1, terrainTags: ['lowland'], country: 'south-vietnam', coastal: false },
                adjacentTo: [],
              },
            ],
          },
        },
      ],
      zones: [{ id: 'available-US', owner: 'none', visibility: 'public', ordering: 'set' }],
    };

    const result = compileGameSpecToGameDef(doc);
    const zoneIds = result.sections.zones?.map((zone) => zone.id);

    assert.notEqual(result.gameDef, null);
    assert.deepEqual(zoneIds, ['alpha:none', 'available-US:none']);
  });

  it('fails when explicit zones collide with map-derived zone ids', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [
        {
          id: 'fitl-map-foundation',
          kind: 'map' as const,
          payload: {
            spaces: [
              {
                id: 'alpha:none',
                category: 'province',
                attributes: { population: 1, econ: 1, terrainTags: ['lowland'], country: 'south-vietnam', coastal: false },
                adjacentTo: [],
              },
            ],
          },
        },
      ],
      zones: [{ id: 'alpha:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_ZONE_ID'), true);
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

  it('projects factions into gameDef when selected piece catalog declares them', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            seats: [{ id: 'us' }],
            pieceTypes: [
              {
                id: 'us-troops',
                seat: 'us',
                statusDimensions: [],
                transitions: [],
              },
            ],
            inventory: [{ pieceTypeId: 'us-troops', seat: 'us', total: 5 }],
          },
        },
      ],
      tokenTypes: null,
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assert.deepEqual(result.gameDef?.seats, [{ id: 'us' }]);
  });

  it('prefers named turn-flow seats over piece-catalog seats for selector lowering when both are present', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            seats: [{ id: 'VC' }],
            pieceTypes: [
              { id: 'vc-guerrilla', seat: 'VC', statusDimensions: [], transitions: [] },
            ],
            inventory: [
              { pieceTypeId: 'vc-guerrilla', seat: 'VC', total: 1 },
            ],
          },
        },
      ],
      tokenTypes: null,
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['us', 'nva'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' } as const,
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'nva', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assert.deepEqual(result.gameDef?.actions[0]?.actor, { id: 1 });
  });

  it('rejects numeric turn-flow seat ids even when piece-catalog seats are present in matching count', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      metadata: { id: 'asset-cascade-seat-index-canonicalization', players: { min: 4, max: 4 } },
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
            pieceTypes: [
              { id: 'us-troops', seat: 'US', statusDimensions: [], transitions: [] },
              { id: 'arvn-troops', seat: 'ARVN', statusDimensions: [], transitions: [] },
              { id: 'nva-troops', seat: 'NVA', statusDimensions: [], transitions: [] },
              { id: 'vc-troops', seat: 'VC', statusDimensions: [], transitions: [] },
            ],
            inventory: [
              { pieceTypeId: 'us-troops', seat: 'US', total: 1 },
              { pieceTypeId: 'arvn-troops', seat: 'ARVN', total: 1 },
              { pieceTypeId: 'nva-troops', seat: 'NVA', total: 1 },
              { pieceTypeId: 'vc-troops', seat: 'VC', total: 1 },
            ],
          },
        },
      ],
      tokenTypes: null,
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1', '2', '3'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' } as const,
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'nva', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === 'CNL_COMPILER_SEAT_IDENTITY_INDEX_FORBIDDEN',
      ),
      true,
    );
  });

  it('emits explicit index-seat-forbidden diagnostic for index turn-flow/piece-catalog count mismatch', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      metadata: { id: 'asset-cascade-seat-index-incoherent', players: { min: 2, max: 2 } },
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }],
            pieceTypes: [
              { id: 'us-troops', seat: 'US', statusDimensions: [], transitions: [] },
              { id: 'arvn-troops', seat: 'ARVN', statusDimensions: [], transitions: [] },
              { id: 'nva-troops', seat: 'NVA', statusDimensions: [], transitions: [] },
            ],
            inventory: [
              { pieceTypeId: 'us-troops', seat: 'US', total: 1 },
              { pieceTypeId: 'arvn-troops', seat: 'ARVN', total: 1 },
              { pieceTypeId: 'nva-troops', seat: 'NVA', total: 1 },
            ],
          },
        },
      ],
      tokenTypes: null,
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' } as const,
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'ARVN', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === 'CNL_COMPILER_SEAT_IDENTITY_INDEX_FORBIDDEN',
      ),
      true,
    );
  });

  it('fails compile when selected piece catalog omits required factions catalog', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [
              {
                id: 'us-troops',
                seat: 'us',
                statusDimensions: [],
                transitions: [],
              },
            ],
            inventory: [{ pieceTypeId: 'us-troops', seat: 'us', total: 5 }],
          },
        },
      ],
      tokenTypes: null,
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID'
          && diagnostic.path.endsWith('.payload.seats'),
      ),
      true,
    );
  });

  it('eventDecks section compiles when declared', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      eventDecks: [
        {
          id: 'foundation',
          drawZone: 'board:none',
          discardZone: 'board:none',
          cards: [
            {
              id: 'card-a',
              title: 'Card A',
              sideMode: 'single' as const,
              unshaded: { effects: [{ shuffle: { zone: 'board:none' } }] },
            },
          ],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.sections.eventDecks, null);
    assert.equal(result.sections.eventDecks?.[0]?.id, 'foundation');
  });

  it('allows explicit action id "event" and synthesizes a separate event-capable action when none is declared', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      actions: [
        ...base.actions,
        { id: 'event', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      eventDecks: [
        {
          id: 'foundation',
          drawZone: 'board:none',
          discardZone: 'board:none',
          cards: [
            {
              id: 'card-a',
              title: 'Card A',
              sideMode: 'single' as const,
              unshaded: { effects: [{ shuffle: { zone: 'board:none' } }] },
            },
          ],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      false,
    );
    assert.equal(
      result.gameDef!.actions.some((action) => String(action.id) === 'event_2' && action.capabilities?.includes('cardEvent') === true),
      true,
    );
  });

  it('keeps a declared event-capable action without synthesizing another one', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      actions: [
        ...base.actions,
        {
          id: 'resolve-card',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          capabilities: ['cardEvent'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      eventDecks: [
        {
          id: 'foundation',
          drawZone: 'board:none',
          discardZone: 'board:none',
          cards: [
            {
              id: 'card-a',
              title: 'Card A',
              sideMode: 'single' as const,
              unshaded: { effects: [{ shuffle: { zone: 'board:none' } }] },
            },
          ],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assert.equal(result.gameDef!.actions.filter((action) => action.capabilities?.includes('cardEvent') === true).length, 1);
    assert.equal(result.gameDef!.actions.some((action) => String(action.id) === 'event_2'), false);
  });

  it('fails deterministically when multiple event-capable actions are declared with eventDecks', () => {
    const base = createMinimalCompilableDoc();
    const doc = {
      ...base,
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      actions: [
        ...base.actions,
        {
          id: 'resolve-card-a',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          capabilities: ['cardEvent'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: 'resolve-card-b',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          capabilities: ['cardEvent'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      eventDecks: [
        {
          id: 'foundation',
          drawZone: 'board:none',
          discardZone: 'board:none',
          cards: [
            {
              id: 'card-a',
              title: 'Card A',
              sideMode: 'single' as const,
              unshaded: { effects: [{ shuffle: { zone: 'board:none' } }] },
            },
          ],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_EVENT_ACTION_CAPABILITY_AMBIGUOUS'), true);
  });

  it('CompileSectionResults keys stay aligned with the structured compiler contract', () => {
    type ExpectedKeys =
      | 'metadata'
      | 'constants'
      | 'globalVars'
      | 'globalMarkerLattices'
      | 'perPlayerVars'
      | 'zoneVars'
      | 'zones'
      | 'tokenTypes'
      | 'setup'
      | 'turnStructure'
      | 'turnOrder'
      | 'actionPipelines'
      | 'derivedMetrics'
      | 'terminal'
      | 'actions'
      | 'triggers'
      | 'eventDecks';

    type Missing = Exclude<ExpectedKeys, keyof CompileSectionResults>;
    type Extra = Exclude<keyof CompileSectionResults, ExpectedKeys>;

    const noMissing: Missing extends never ? true : never = true;
    const noExtra: Extra extends never ? true : never = true;

    assert.equal(noMissing, true);
    assert.equal(noExtra, true);
  });
});
