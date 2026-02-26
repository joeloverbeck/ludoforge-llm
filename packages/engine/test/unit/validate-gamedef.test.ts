import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  type GameDef,
  type ScenarioPiecePlacement,
  type StackingConstraint,
  type ZoneDef,
  type ZoneId,
  isValidatedGameDef,
  validateGameDef,
  validateGameDefBoundary,
  validateInitialPlacementsAgainstStackingConstraints,
} from '../../src/kernel/index.js';
import { createValidGameDef } from '../helpers/gamedef-fixtures.js';

const loadFixtureGameDef = (fixtureName: string): GameDef => {
  const distRelativeFixturePath = fileURLToPath(new URL(`../../../test/fixtures/gamedef/${fixtureName}`, import.meta.url));
  const sourceRelativeFixturePath = fileURLToPath(new URL(`../fixtures/gamedef/${fixtureName}`, import.meta.url));
  const fixturePath = existsSync(distRelativeFixturePath) ? distRelativeFixturePath : sourceRelativeFixturePath;
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as GameDef;
};

const withCardDrivenTurnFlow = (
  base: GameDef,
  cardSeatOrderMapping: Readonly<Record<string, string>>,
  seatOrder: readonly string[],
): GameDef =>
  ({
    ...base,
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: {
            played: 'market:none',
            lookahead: 'deck:none',
            leader: 'deck:none',
          },
          eligibility: {
            seats: ['0', '1'],
            overrideWindows: [],
          },
          actionClassByActionId: {
            playCard: 'event',
          },
          optionMatrix: [{ first: 'event', second: ['pass'] }],
          passRewards: [],
          durationWindows: ['turn'],
          cardSeatOrderMetadataKey: 'seatOrder',
          cardSeatOrderMapping,
        },
      },
    },
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'deck:none',
        discardZone: 'market:none',
        cards: [{ id: 'card-1', metadata: { seatOrder } }],
      },
    ],
  }) as unknown as GameDef;

describe('validateGameDef reference checks', () => {
  it('validates cardSeatOrderMapping targets against eligibility seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', NVA: '2' }, ['US', 'NVA']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_UNKNOWN_SEAT'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["NVA"]',
      ),
    );
  });

  it('requires unique cardSeatOrderMapping targets', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', ARVN: '0' }, ['US', 'ARVN']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_DUPLICATE'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["ARVN"]',
      ),
    );
  });

  it('rejects cardSeatOrderMapping source key normalization collisions', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', 'u-s': '1' }, ['US', 'u-s']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_SOURCE_COLLISION'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["u-s"]',
      ),
    );
  });

  it('warns when card metadata seat-order entries are unresolved and dropped', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0' }, ['US', 'NVA']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DROPPED'
          && diag.path === 'eventDecks[0].cards[0].metadata.seatOrder[1]'
          && diag.severity === 'warning',
      ),
    );
  });

  it('emits deterministic duplicate action diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [...base.actions, { ...base.actions[0], limits: [] }],
    } as unknown as GameDef;

    const first = validateGameDef(def);
    const second = validateGameDef(def);

    assert.deepEqual(first, second);
    const duplicate = first.find((diag) => diag.code === 'DUPLICATE_ACTION_ID');
    assert.ok(duplicate);
    assert.equal(duplicate.severity, 'error');
    assert.equal(duplicate.path, 'actions[1]');
  });

  it('reports missing zone references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ draw: { from: 'deck:none', to: 'markte:none', count: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingZone = diagnostics.find((diag) => diag.code === 'REF_ZONE_MISSING');

    assert.ok(missingZone);
    assert.equal(missingZone.path, 'actions[0].effects[0].draw.to');
    assert.deepEqual(missingZone.alternatives, ['market:none']);
    assert.equal(typeof missingZone.suggestion, 'string');
  });

  it('reports out-of-bounds player selectors for conceal.from', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ conceal: { zone: 'market:none', from: { id: 99 } } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].effects[0].conceal.from',
      ),
    );
  });

  it('validates conceal.filter value expressions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              conceal: {
                zone: 'market:none',
                filter: [{ prop: 'faction', op: 'eq', value: { ref: 'gvar', var: 'missingVar' } }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].effects[0].conceal.filter[0].value.var',
      ),
    );
  });

  it('reports unknown map-space properties used by zoneProp references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'controlClass' }, right: 'coin' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_PROP_MISSING' && diag.path === 'actions[0].pre.left.prop',
      ),
    );
  });

  it('reports map-space property kind mismatches for zoneProp', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'terrainTags' }, right: 'urban' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_PROP_KIND_INVALID' && diag.path === 'actions[0].pre.left.prop',
      ),
    );
  });

  it('reports map-space property kind mismatches for zonePropIncludes', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: 'zonePropIncludes', zone: 'market:none', prop: 'category', value: 'city' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_MAP_SPACE_PROP_KIND_INVALID' && diag.path === 'actions[0].pre.prop'),
    );
  });

  it('reports missing zone references in derived metric filters', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal',
          zoneFilter: { zoneIds: ['missing-zone' as ZoneId] },
          requirements: [{ key: 'population', expectedType: 'number' }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DERIVED_METRIC_ZONE_REFERENCE_MISSING' && diag.path === 'derivedMetrics[0].zoneFilter.zoneIds[0]',
      ),
    );
  });

  it('reports non-numeric zone attributes required by derived metrics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: '2', econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal',
          zoneFilter: { zoneKinds: ['board'] as const, category: ['city'] },
          requirements: [{ key: 'population', expectedType: 'number' }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DERIVED_METRIC_ZONE_ATTRIBUTE_INVALID' && diag.path === 'zones[0].attributes.population',
      ),
    );
  });

  it('reports explicit zoneProp selectors that are not declared map spaces', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'deck:none', prop: 'category' }, right: 'city' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_MISSING' && diag.path === 'actions[0].pre.left.zone',
      ),
    );
  });

  it('does not treat category on aux zones as map-space identity', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'board-space:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        {
          id: 'market:none',
          zoneKind: 'aux',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'category' }, right: 'city' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MAP_SPACE_MISSING' && diag.path === 'actions[0].pre.left.zone'));
  });

  it('accepts binding-qualified zone selectors for player-owned zone bases', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        ...base.zones,
        { id: 'hand:0', owner: 'player', visibility: 'owner', ordering: 'set' },
        { id: 'hand:1', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: '$p',
                over: { query: 'players' },
                effects: [{ draw: { from: 'deck:none', to: 'hand:$p', count: 1 } }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path === 'actions[0].effects[0].forEach.effects[0].draw.to'),
      false,
    );
  });

  it('accepts dynamic bound zone selectors in query filters', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          id: 'market:none',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 1, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: '$zone',
                over: { query: 'zones' },
                effects: [
                  {
                    chooseOne: {
                      internalDecisionId: 'pick',
                      bind: '$target',
                      options: {
                        query: 'zones',
                        filter: {
                          condition: {
                            op: '==',
                            left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                            right: 'city',
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'REF_ZONE_MISSING' && diag.path.includes('.left.zone')),
      false,
    );
  });

  it('reports undefined gvar references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 1 },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].pre.left.var'));
  });

  it('reports undefined pvar references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setVar: { scope: 'pvar', player: 'active', var: 'health', value: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].setVar.var'),
    );
  });

  it('rejects addVar targeting boolean global vars', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      globalVars: [...base.globalVars, { name: 'flag', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'global', var: 'flag', delta: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].addVar.var'
          && diag.severity === 'error',
      ),
    );
  });

  it('rejects addVar targeting boolean per-player vars', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      perPlayerVars: [...base.perPlayerVars, { name: 'ready', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'pvar', player: 'active', var: 'ready', delta: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].addVar.var'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports undefined zoneVar references for setVar and addVar', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            { setVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', value: 1 } },
            { addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', delta: 1 } },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING' && diag.path === 'actions[0].effects[0].setVar.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING' && diag.path === 'actions[0].effects[1].addVar.var'),
    );
  });

  it('rejects boolean zoneVars at structural validation time', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
  });

  it('keeps boolean zoneVar diagnostics at structure layer for addVar', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'locked', delta: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID' && diag.path === 'actions[0].effects[0].addVar.var',
      ),
      false,
    );
  });

  it('accepts valid zoneVar setVar and addVar targets', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            { setVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', value: 2 } },
            { addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', delta: 1 } },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING'), false);
    assert.equal(diagnostics.some((diag) => diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'), false);
  });

  it('reports missing runtime data assets for assetRows domains', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_RUNTIME_TABLE_MISSING' && diag.path === 'actions[0].params[0].domain.tableId',
      ),
    );
  });

  it('reports invalid runtime table field references in assetRows where predicates', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'smallBlind', op: 'eq', value: 10 }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_FIELD_MISSING' &&
          diag.path === 'actions[0].params[0].domain.where[0].field',
      ),
    );
  });

  it('reports invalid runtime table field references in assetField refs', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' as const }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              setVar: {
                scope: 'global',
                var: 'turn',
                value: {
                  ref: 'assetField',
                  row: '$row',
                  tableId: 'tournament-standard::blindSchedule.levels',
                  field: 'smallBlind',
                },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_RUNTIME_TABLE_FIELD_MISSING' && diag.path === 'actions[0].effects[0].setVar.value.field',
      ),
    );
  });

  it('reports malformed runtime table uniqueBy declarations', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [[], ['missing'], ['level', 'level'], ['level'], ['level']],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_EMPTY' && diag.path === 'tableContracts[0].uniqueBy[0]'));
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_UNIQUE_KEY_FIELD_MISSING' && diag.path === 'tableContracts[0].uniqueBy[1][0]',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_FIELD_DUPLICATE' && diag.path === 'tableContracts[0].uniqueBy[2][1]',
      ),
    );
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_DUPLICATE' && diag.path === 'tableContracts[0].uniqueBy[4]'));
  });

  it('enforces uniqueBy tuples against runtime table rows', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, smallBlind: 10 },
                { level: 1, smallBlind: 15 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_VIOLATION' && diag.path === 'tableContracts[0].uniqueBy[0]'));
  });

  it('enforces monotonic/contiguous/numericRange runtime table constraints', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            settings: {
              blindSchedule: [
                { level: 0, handsUntilNext: 10 },
                { level: 2, handsUntilNext: 0 },
                { level: 4, handsUntilNext: 5 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::settings.blindSchedule',
          assetId: 'tournament-standard',
          tablePath: 'settings.blindSchedule',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'handsUntilNext', type: 'int' as const },
          ],
          constraints: [
            { kind: 'monotonic', field: 'handsUntilNext', direction: 'desc' as const },
            { kind: 'contiguousInt', field: 'level', start: 0, step: 1 },
            { kind: 'numericRange', field: 'handsUntilNext', min: 1 },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_MONOTONIC_VIOLATION'));
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION'));
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION'));
  });

  it('accepts valid runtime table constraints', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            settings: {
              blindSchedule: [
                { level: 0, handsUntilNext: 10 },
                { level: 1, handsUntilNext: 8 },
                { level: 2, handsUntilNext: 6 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::settings.blindSchedule',
          assetId: 'tournament-standard',
          tablePath: 'settings.blindSchedule',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'handsUntilNext', type: 'int' as const },
          ],
          uniqueBy: [['level']],
          constraints: [
            { kind: 'monotonic', field: 'level', direction: 'asc' as const },
            { kind: 'contiguousInt', field: 'level', start: 0, step: 1 },
            { kind: 'numericRange', field: 'handsUntilNext', min: 1 },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_MONOTONIC_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION',
      ),
      false,
    );
  });

  it('reports exactlyOne assetRows queries without key-constraining where predicates', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_WHERE_REQUIRED' && diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('reports exactlyOne assetRows queries when table contracts lack uniqueBy', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' as const }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'level', op: 'eq', value: 1 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_UNIQUE_KEY_REQUIRED' &&
          diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('reports exactlyOne assetRows queries when predicates do not constrain a unique key', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'smallBlind', op: 'eq', value: 10 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_NOT_KEY_CONSTRAINED' &&
          diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('accepts exactlyOne assetRows queries when predicates constrain a declared unique key', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'level', op: 'eq', value: 2 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_WHERE_REQUIRED' ||
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_UNIQUE_KEY_REQUIRED' ||
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_NOT_KEY_CONSTRAINED',
      ),
      false,
    );
  });

  it('reports concat queries with empty sources', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'concat',
                sources: [],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_INVALID' && diag.path === 'actions[0].params[0].domain.sources',
      ),
    );
  });

  it('reports concat queries with mixed runtime item shapes', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'concat',
                sources: [
                  { query: 'players' },
                  { query: 'zones' },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_SHAPE_MISMATCH' && diag.path === 'actions[0].params[0].domain.sources',
      ),
    );
  });

  it('accepts tokensInZone domains with dynamic zoneExpr selectors', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'tokensInZone',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[0].domain.zone')),
      false,
    );
  });

  it('validates nested zoneExpr ValueExpr in dynamic tokensInZone domains', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'tokensInZone',
                zone: { zoneExpr: { ref: 'gvar', var: 'missingGlobal' } },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].params[0].domain.zone.zoneExpr.var',
      ),
    );
  });

  it('accepts adjacent/connected zone queries with dynamic zoneExpr selectors', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$adj',
              domain: {
                query: 'adjacentZones',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
            {
              name: '$conn',
              domain: {
                query: 'connectedZones',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[0].domain.zone')),
      false,
    );
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[1].domain.zone')),
      false,
    );
  });

  it('accepts aggregate valueExpr over non-numeric query items', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      mapSpaces: [
        {
          id: 'market:none',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              setVar: {
                scope: 'global',
                var: 'money',
                value: {
                  aggregate: {
                    op: 'sum',
                    query: { query: 'mapSpaces' },
                    bind: '$zone',
                    valueExpr: { ref: 'zoneProp', zone: '$zone', prop: 'population' },
                  },
                },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].effects[0].setVar.value.aggregate')),
      false,
    );
  });

  it('validates transferVar variable references by scope', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'pvar', player: 'actor', var: 'health' },
                to: { scope: 'global', var: 'bank' },
                amount: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].transferVar.from.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].effects[0].transferVar.to.var'),
    );
  });

  it('does not duplicate structural transferVar endpoint diagnostics handled by schema contracts', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'global', player: 'actor', var: 'money' },
                to: { scope: 'zoneVar', zone: 'deck:none', player: 'actor', var: 'supply' },
                amount: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_TRANSFER_VAR_TO_PLAYER_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_FROM_PLAYER_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_GLOBAL_SCOPE_PLAYER_FORBIDDEN'
          || diag.code === 'EFFECT_TRANSFER_VAR_NON_ZONE_SCOPE_ZONE_FORBIDDEN'
          || diag.code === 'EFFECT_TRANSFER_VAR_FROM_ZONE_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_TO_ZONE_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_ZONE_SCOPE_PLAYER_FORBIDDEN',
      ),
      false,
    );
  });

  it('rejects transferVar boolean variable targets', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      perPlayerVars: [...base.perPlayerVars, { name: 'ready', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'pvar', player: 'actor', var: 'ready' },
                to: { scope: 'pvar', player: 'active', var: 'vp' },
                amount: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].transferVar.from.var',
      ),
    );
  });

  it('keeps boolean zoneVar diagnostics at structure layer for transferVar', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'zoneVar', zone: 'deck:none', var: 'locked' },
                to: { scope: 'global', var: 'vp' },
                amount: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].transferVar.from.var',
      ),
      false,
    );
  });

  it('reports invalid phase references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], phase: ['mian'] }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].phase[0]');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports invalid gotoPhaseExact target references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ gotoPhaseExact: { phase: 'mian' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].effects[0].gotoPhaseExact.phase');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports invalid action references in actionResolved triggers', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      triggers: [
        {
          ...base.triggers[0],
          event: { type: 'actionResolved', action: 'playCrad' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'triggers[0].event.action',
      ),
    );
  });

  it('reports invalid createToken type references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ createToken: { type: 'crad', zone: 'market:none' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_TOKEN_TYPE_MISSING' && diag.path === 'actions[0].effects[0].createToken.type',
      ),
    );
  });

  it('reports invalid var references in varChanged triggers', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      triggers: [
        {
          id: 'onMissingVar',
          event: { type: 'varChanged', scope: 'global', var: 'monee' },
          effects: [],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_VAR_MISSING' && diag.path === 'triggers[0].event.var',
      ),
    );
  });

  it('reports malformed intsInRange param domains', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInRange', min: 5, max: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_INVALID' &&
          diag.path === 'actions[0].params[0].domain' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports duplicate action param names', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            { name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } },
            { name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DUPLICATE_ACTION_PARAM_NAME' &&
          diag.path === 'actions[0].params[1]' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports reserved runtime binding names used as action param names', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '__freeOperation', domain: { query: 'intsInRange', min: 0, max: 3 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ACTION_PARAM_RESERVED_NAME' &&
          diag.path === 'actions[0].params[0].name' &&
          diag.severity === 'error',
      ),
    );
  });

  it('accepts intsInRange dynamic bounds as ValueExpr', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInRange',
                min: 1,
                max: { ref: 'gvar', var: 'money' },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_INTS_RANGE_INVALID' || diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID'),
      false,
    );
  });

  it('reports non-integer literal intsInRange bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInRange', min: 0.5, max: 3 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID' &&
          diag.path === 'actions[0].params[0].domain.min' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports malformed intsInRange cardinality controls', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInRange',
                min: 1,
                max: 5,
                step: 0,
                alwaysInclude: [2.5],
                maxResults: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_STEP_INVALID'
          && diag.path === 'actions[0].params[0].domain.step'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_ALWAYS_INCLUDE_INVALID'
          && diag.path === 'actions[0].params[0].domain.alwaysInclude[0]'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_MAX_RESULTS_INVALID'
          && diag.path === 'actions[0].params[0].domain.maxResults'
          && diag.severity === 'error',
      ),
    );
  });

  it('accepts nextInOrderByCondition domain with numeric from and condition predicate', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: { ref: 'gvar', var: 'money' },
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID' ||
          diag.code === 'VALUE_EXPR_NUMERIC_REQUIRED' ||
          diag.code === 'CNL_COMPILER_MISSING_CAPABILITY',
      ),
      false,
    );
  });

  it('reports shape-mismatched nextInOrderByCondition.source domains', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: {
                  query: 'concat',
                  sources: [{ query: 'players' }, { query: 'zones' }],
                },
                from: 1,
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.source.sources' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports nextInOrderByCondition source/anchor mismatch for string source and numeric anchor', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'enums', values: ['preflop', 'flop', 'turn', 'river'] },
                from: 1,
                bind: '$street',
                where: { op: '==', left: { ref: 'binding', name: '$street' }, right: 'river' },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.from' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports nextInOrderByCondition source/anchor mismatch for numeric source and string anchor', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 'dealer-button',
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.from' &&
          diag.severity === 'error',
      ),
    );
  });

  it('accepts shape-compatible nextInOrderByCondition source/anchor pairs', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'enums', values: ['preflop', 'flop', 'turn', 'river'] },
                from: 'turn',
                bind: '$street',
                where: { op: '==', left: { ref: 'binding', name: '$street' }, right: 'river' },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH'),
      false,
    );
  });

  it('does not report source/anchor mismatch when nextInOrderByCondition source shape is unknown', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'binding', name: '$runtimeOrder' },
                from: 1,
                bind: '$candidate',
                where: { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 2 },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH'),
      false,
    );
  });

  it('reports non-canonical nextInOrderByCondition.bind', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
                bind: 'seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_BIND_INVALID' &&
          diag.path === 'actions[0].params[0].domain.bind' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports missing intsInVarRange source variable', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: 'monye' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_SOURCE_MISSING' &&
          diag.path === 'actions[0].params[0].domain.var' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports non-int intsInVarRange source variable', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      globalVars: [...base.globalVars, { name: 'flag', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: 'flag' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_SOURCE_TYPE_INVALID' &&
          diag.path === 'actions[0].params[0].domain.var' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports malformed intsInVarRange cardinality controls', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInVarRange',
                var: 'money',
                min: 1,
                max: 5,
                step: 0,
                alwaysInclude: [2.5],
                maxResults: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_STEP_INVALID'
          && diag.path === 'actions[0].params[0].domain.step'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_ALWAYS_INCLUDE_INVALID'
          && diag.path === 'actions[0].params[0].domain.alwaysInclude[0]'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_MAX_RESULTS_INVALID'
          && diag.path === 'actions[0].params[0].domain.maxResults'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports unknown marker lattice references in setMarker effects', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setMarker: { space: 'market:none', marker: 'unknownMarker', state: 'neutral' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].setMarker.marker',
      ),
    );
  });

  it('reports unknown marker lattice references in shiftMarker effects', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ shiftMarker: { space: 'market:none', marker: 'unknownMarker', delta: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].shiftMarker.marker',
      ),
    );
  });

  it('reports invalid static marker state literals in setMarker effects', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setMarker: { space: 'market:none', marker: 'supportOpposition', state: 'notAState' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MARKER_STATE_MISSING' && diag.path === 'actions[0].effects[0].setMarker.state',
      ),
    );
  });

  it('reports unknown marker lattice references in markerState refs', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'markerState', space: 'market:none', marker: 'unknownMarker' },
            right: 'neutral',
          },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].pre.left.marker'));
  });

  it('reports invalid static marker-state comparisons against marker lattices', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'markerState', space: 'market:none', marker: 'supportOpposition' },
            right: 'illegalState',
          },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MARKER_STATE_MISSING' && diag.path === 'actions[0].pre.right'));
  });

  it('reports unknown global marker lattice references in globalMarkerState refs', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'globalMarkerState', marker: 'unknownGlobalMarker' },
            right: 'inactive',
          },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GLOBAL_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].pre.left.marker',
      ),
    );
  });

  it('reports unknown global marker lattice references in setGlobalMarker effects', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setGlobalMarker: { marker: 'unknownGlobalMarker', state: 'inactive' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_GLOBAL_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].setGlobalMarker.marker',
      ),
    );
  });

  it('reports operation profile action references missing from actions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'actionPipelines[0].actionId'),
    );
  });

  it('reports ambiguous operation profile action mappings', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'profile-b',
          actionId: 'playCard',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'partial',
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS' && diag.path === 'actionPipelines',
      ),
    );
  });

  it('reports unknown coupPlan final-round omitted phases', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            finalRoundOmitPhases: ['resources'],
            maxConsecutiveRounds: 1,
          },
        },
      },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE' &&
          diag.path === 'turnOrder.config.coupPlan.finalRoundOmitPhases[0]',
      ),
    );
  });

  it('reports empty coupPlan phases when coupPlan is declared', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [],
          },
        },
      },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'COUP_PLAN_PHASES_EMPTY' && diag.path === 'turnOrder.config.coupPlan.phases'),
    );
  });

  it('requires coupPlan phase ids to match turnStructure phase ids', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      turnStructure: {
        phases: [{ id: 'operations' }],
      },
      actions: [{ ...base.actions[0], phase: ['operations'] }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            finalRoundOmitPhases: ['victory'],
            maxConsecutiveRounds: 1,
          },
        },
      },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'COUP_PLAN_PHASE_NOT_IN_TURN_STRUCTURE' &&
          diag.path === 'turnOrder.config.coupPlan.phases[0].id',
      ),
      true,
    );
  });

  it('reports missing references inside victory expressions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      terminal: {
        ...base.terminal,
        checkpoints: [
          {
            id: 'us-threshold',
            seat: 'us',
            timing: 'duringCoup',
            when: { op: '>=', left: { ref: 'gvar', var: 'unknown' }, right: 50 },
          },
        ],
        margins: [{ seat: 'us', value: { ref: 'pvar', player: 'active', var: 'missingPvar' } }],
        ranking: { order: 'desc' },
      },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'terminal.checkpoints[0].when.left.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'terminal.margins[0].value.var'),
    );
  });
});

describe('validateGameDef constraints and warnings', () => {
  it('reports PlayerSel.id outside configured bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], actor: { id: 4 } }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].actor',
      ),
    );
  });

  it('reports action executor id outside configured bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], executor: { id: 4 } }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].executor',
      ),
    );
  });

  it('reports invalid players metadata', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      metadata: { ...base.metadata, players: { min: 0, max: 0 } },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'META_PLAYERS_MIN_INVALID' && diag.path === 'metadata.players.min'),
    );
  });

  it('reports invalid maxTriggerDepth metadata', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      metadata: { ...base.metadata, maxTriggerDepth: 1.5 },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'META_MAX_TRIGGER_DEPTH_INVALID' && diag.path === 'metadata.maxTriggerDepth',
      ),
    );
  });

  it('reports variable bounds inconsistency', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      globalVars: [{ name: 'money', type: 'int', min: 2, init: 1, max: 99 }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'VAR_BOUNDS_INVALID' && diag.path === 'globalVars[0]'));
  });

  it('reports score end-condition without scoring definition', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }] },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'SCORING_REQUIRED_FOR_SCORE_RESULT' && diag.path === 'terminal.conditions[0].result',
      ),
    );
  });

  it('warns when scoring is configured but never used by end-conditions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      terminal: {
        ...base.terminal,
        scoring: { method: 'highest', value: 1 },
      },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SCORING_UNUSED' && diag.path === 'terminal.scoring' && diag.severity === 'warning'),
    );
  });

  it('warns on asymmetric adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        { ...base.zones[0], adjacentTo: [{ to: 'deck:none', direction: 'bidirectional' }] },
        { ...base.zones[1], adjacentTo: [] },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find((diag) => diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].to');
    assert.equal(diagnostic.severity, 'warning');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports dangling adjacency references with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: [{ to: 'missing:none', direction: 'bidirectional' }] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_DANGLING_ZONE_REF');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].to');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports unsorted adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          ...base.zones[0],
          adjacentTo: [
            { to: 'market:none', direction: 'bidirectional' },
            { to: 'deck:none', direction: 'bidirectional' },
          ],
        },
        base.zones[1],
      ],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_NEIGHBORS_UNSORTED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1].to');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports missing adjacency direction as an error', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: [{ to: 'deck:none' }] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_ADJACENCY_DIRECTION_REQUIRED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].direction');
    assert.equal(diagnostic.severity, 'error');
  });

  it('reports conflicting directions for duplicate adjacency target as an error', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        {
          ...base.zones[0],
          adjacentTo: [
            { to: 'deck:none', direction: 'bidirectional' },
            { to: 'deck:none', direction: 'unidirectional' },
          ],
        },
        base.zones[1],
      ],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_CONFLICTING_NEIGHBOR_DIRECTION');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1].direction');
    assert.equal(diagnostic.severity, 'error');
  });

  it('reports ownership mismatch for :none selector targeting player-owned zone', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_SELECTOR_OWNERSHIP_INVALID' &&
          diag.path === 'actions[0].effects[0].draw.to' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports unowned zone ids that do not use :none qualifier', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'market:0', owner: 'none' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'ZONE_ID_OWNERSHIP_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids without numeric qualifiers', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:actor', owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_QUALIFIER_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids that exceed metadata.players.max bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:4', owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS' &&
          diag.path === 'zones[0].id' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports invalid chooseN range cardinality declarations', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseN: {
                bind: '$pick',
                options: { query: 'players' },
                n: 1,
                max: 2,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOOSE_N_CARDINALITY_INVALID' &&
          diag.path === 'actions[0].effects[0].chooseN' &&
          diag.severity === 'error',
      ),
    );
  });

  it('accepts chooseN expression-valued range bounds in behavior validation', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      globalVars: [...base.globalVars, { name: 'dynamicMax', type: 'int', init: 2, min: 0, max: 6 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseN: {
                bind: '$pick',
                options: { query: 'players' },
                min: { if: { when: true, then: 0, else: 1 } },
                max: { ref: 'gvar', var: 'dynamicMax' },
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'EFFECT_CHOOSE_N_CARDINALITY_INVALID'),
      false,
    );
  });

  it('returns no diagnostics for fully valid game def', () => {
    const diagnostics = validateGameDef(createValidGameDef());
    assert.deepEqual(diagnostics, []);
  });

  it('returns no diagnostics for FITL foundation map fixture', () => {
    const diagnostics = validateGameDef(loadFixtureGameDef('fitl-map-foundation-valid.json'));
    assert.deepEqual(diagnostics, []);
  });

  it('reports error when stacking faction filters lack canonical tokenType faction metadata', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      tokenTypes: [{ id: 'troops', props: { faction: 'string' } }],
      stackingConstraints: [
        {
          id: 'nv-restriction',
          description: 'Only NVA/VC in North Vietnam',
          spaceFilter: { country: ['northVietnam'] },
          pieceFilter: { seats: ['US', 'ARVN'] },
          rule: 'prohibit' as const,
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'STACKING_CONSTRAINT_TOKEN_TYPE_SEAT_MISSING'));
  });

  it('reports error when token type faction references undeclared faction id', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      seats: [{ id: 'us' }],
      tokenTypes: [{ id: 'troops', seat: 'arvn', props: { faction: 'string' } }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TOKEN_TYPE_SEAT_UNDECLARED'
          && diag.path === 'tokenTypes[0].seat'
          && diag.severity === 'error',
      ),
    );
  });
});

describe('validateInitialPlacementsAgainstStackingConstraints', () => {
  const spaces: readonly ZoneDef[] = [
    { id: 'quang-tri' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, country: 'south-vietnam', coastal: false } },
    { id: 'hue' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 2, econ: 0, country: 'south-vietnam', coastal: true } },
    { id: 'route-1' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'loc', attributes: { population: 0, econ: 1, country: 'south-vietnam', coastal: false } },
    { id: 'hanoi' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 3, econ: 0, country: 'north-vietnam', coastal: false } },
  ];

  const maxBasesConstraint: StackingConstraint = {
    id: 'max-2-bases',
    description: 'Max 2 bases per province or city',
    spaceFilter: { category: ['province', 'city'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'maxCount',
    maxCount: 2,
  };

  const noBasesOnLocConstraint: StackingConstraint = {
    id: 'no-bases-on-loc',
    description: 'No bases on LoCs',
    spaceFilter: { category: ['loc'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'prohibit',
  };

  const nvRestrictionConstraint: StackingConstraint = {
    id: 'nv-restriction',
    description: 'Only NVA/VC in North Vietnam',
    spaceFilter: { attributeEquals: { country: 'north-vietnam' } },
    pieceFilter: { seats: ['US', 'ARVN'] },
    rule: 'prohibit',
  };
  const pieceTypeFactionById = new Map<string, string>([
    ['troops', 'US'],
    ['base', 'US'],
    ['guerrilla', 'NVA'],
    ['us-troops', 'us'],
  ]);

  it('reports error when 3 bases placed in province (maxCount 2)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'NVA', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint],
      placements,
      spaces,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.equal(diag.severity, 'error');
    assert.ok(diag.message.includes('3'));
    assert.ok(diag.message.includes('quang-tri'));
  });

  it('reports error when base placed on LoC (prohibit)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'route-1', pieceTypeId: 'base', seat: 'NVA', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [noBasesOnLocConstraint],
      placements,
      spaces,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('route-1'));
  });

  it('reports error when US piece placed in North Vietnam (prohibit by faction+country)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'troops', seat: 'US', count: 2 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('hanoi'));
    assert.ok(diag.message.includes('2'));
  });

  it('produces no diagnostics for valid placements within all constraints', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'troops', seat: 'US', count: 5 },
      { spaceId: 'hue', pieceTypeId: 'base', seat: 'NVA', count: 2 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'NVA', count: 3 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint, noBasesOnLocConstraint, nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('produces no diagnostics when no stacking constraints defined (backward-compatible)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 5 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [],
      placements,
      spaces,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('reports multiple violations across different constraints', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 3 },
      { spaceId: 'route-1', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'hanoi', pieceTypeId: 'troops', seat: 'ARVN', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint, noBasesOnLocConstraint, nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 3);
    assert.ok(diagnostics.every((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION'));
  });

  it('does not flag non-matching piece types against constraint', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'troops', seat: 'US', count: 10 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint],
      placements,
      spaces,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('does not flag NVA/VC pieces in North Vietnam against restriction', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'NVA', count: 5 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'VC', count: 3 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('uses canonical piece-type faction mapping when provided', () => {
    const canonicalConstraint: StackingConstraint = {
      id: 'nv-restriction-canonical',
      description: 'Only nva/vc in North Vietnam (canonical ids)',
      spaceFilter: { attributeEquals: { country: 'north-vietnam' } },
      pieceFilter: { seats: ['us', 'arvn'] },
      rule: 'prohibit',
    };
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'us-troops', seat: 'US', count: 1 },
    ];
    const pieceTypeFactionById = new Map<string, string>([['us-troops', 'us']]);

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [canonicalConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('hanoi'));
  });

  it('matches array-valued attributeEquals filters by value', () => {
    const arrayConstraint: StackingConstraint = {
      id: 'terrain-array-filter',
      description: 'No bases in terrain-tagged spaces',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spacesWithTerrain: readonly ZoneDef[] = [
      {
        ...spaces[0]!,
        attributes: {
          ...(spaces[0]!.attributes ?? {}),
          terrainTags: ['highland', 'jungle'],
        },
      } as ZoneDef,
    ];
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [arrayConstraint],
      placements,
      spacesWithTerrain,
    );

    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]?.code, 'STACKING_CONSTRAINT_VIOLATION');
  });

  it('does not match array-valued attributeEquals filters when order differs', () => {
    const arrayConstraint: StackingConstraint = {
      id: 'terrain-array-filter-order',
      description: 'No bases in terrain-tagged spaces',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spacesWithTerrain: readonly ZoneDef[] = [
      {
        ...spaces[0]!,
        attributes: {
          ...(spaces[0]!.attributes ?? {}),
          terrainTags: ['jungle', 'highland'],
        },
      } as ZoneDef,
    ];
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [arrayConstraint],
      placements,
      spacesWithTerrain,
    );

    assert.deepEqual(diagnostics, []);
  });
});

describe('validateGameDef arithmetic diagnostics', () => {
  it('reports static divide-by-zero diagnostics for integer division operators', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            { addVar: { scope: 'global', var: 'money', delta: { op: '/', left: 10, right: 0 } } },
            { addVar: { scope: 'global', var: 'money', delta: { op: 'floorDiv', left: 10, right: 0 } } },
            { addVar: { scope: 'global', var: 'money', delta: { op: 'ceilDiv', left: 10, right: 0 } } },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const staticDivideByZeroDiagnostics = diagnostics.filter((diag) => diag.code === 'VALUE_EXPR_DIVISION_BY_ZERO_STATIC');

    assert.equal(staticDivideByZeroDiagnostics.length, 3);
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[0].addVar.delta.right'),
      true,
    );
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[1].addVar.delta.right'),
      true,
    );
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[2].addVar.delta.right'),
      true,
    );
  });
});

describe('validated GameDef boundary', () => {
  it('brands only when validation has no errors and caches the branded identity', () => {
    const valid = createValidGameDef();

    assert.equal(isValidatedGameDef(valid), false);
    const first = validateGameDefBoundary(valid);
    assert.notEqual(first.gameDef, null);
    assert.equal(first.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(isValidatedGameDef(valid), true);

    const second = validateGameDefBoundary(valid);
    assert.equal(second.gameDef, first.gameDef);
    assert.deepEqual(second.diagnostics, []);
  });

  it('does not brand invalid definitions', () => {
    const invalid = {
      ...createValidGameDef(),
      actions: [
        {
          ...createValidGameDef().actions[0],
          phase: ['missing-phase'],
        },
      ],
    } as unknown as GameDef;

    const result = validateGameDefBoundary(invalid);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), true);
    assert.equal(isValidatedGameDef(invalid), false);
  });
});
