import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  type GameDef,
  type MapSpaceDef,
  type ScenarioPiecePlacement,
  type StackingConstraint,
  isValidatedGameDef,
  validateGameDef,
  validateGameDefBoundary,
  validateInitialPlacementsAgainstStackingConstraints,
} from '../../src/kernel/index.js';

const loadFixtureGameDef = (fixtureName: string): GameDef => {
  const distRelativeFixturePath = fileURLToPath(new URL(`../../../test/fixtures/gamedef/${fixtureName}`, import.meta.url));
  const sourceRelativeFixturePath = fileURLToPath(new URL(`../fixtures/gamedef/${fixtureName}`, import.meta.url));
  const fixturePath = existsSync(distRelativeFixturePath) ? distRelativeFixturePath : sourceRelativeFixturePath;
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as GameDef;
};

const createValidGameDef = (): GameDef =>
  ({
    metadata: { id: 'test-game', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [{ name: 'money', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
    zones: [
      { id: 'market:none', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    markerLattices: [
      {
        id: 'supportOpposition',
        states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
        defaultState: 'neutral',
      },
    ],
    setup: [{ shuffle: { zone: 'deck:none' } }],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'playCard',
actor: 'active',
executor: 'actor',
phase: 'main',
        params: [{ name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } }],
        pre: null,
        cost: [],
        effects: [{ draw: { from: 'deck:none', to: 'market:none', count: 1 } }],
        limits: [],
      },
    ],
    triggers: [{ id: 'onPlay', event: { type: 'actionResolved', action: 'playCard' }, effects: [] }],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

describe('validateGameDef reference checks', () => {
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

  it('reports unknown map-space properties used by zoneProp references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      mapSpaces: [
        {
          id: 'market:none',
          spaceType: 'city',
          population: 2,
          econ: 1,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
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
      mapSpaces: [
        {
          id: 'market:none',
          spaceType: 'city',
          population: 2,
          econ: 1,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
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
      mapSpaces: [
        {
          id: 'market:none',
          spaceType: 'city',
          population: 2,
          econ: 1,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: 'zonePropIncludes', zone: 'market:none', prop: 'spaceType', value: 'city' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_MAP_SPACE_PROP_KIND_INVALID' && diag.path === 'actions[0].pre.prop'),
    );
  });

  it('reports explicit zoneProp selectors that are not declared map spaces', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      mapSpaces: [
        {
          id: 'market:none',
          spaceType: 'city',
          population: 2,
          econ: 1,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'deck:none', prop: 'spaceType' }, right: 'city' },
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
                            left: { ref: 'zoneProp', zone: '$zone', prop: 'spaceType' },
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
      mapSpaces: [
        {
          id: 'market:none',
          spaceType: 'city',
          population: 1,
          econ: 1,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
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

  it('reports aggregate query shape mismatches statically', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              setVar: {
                scope: 'global',
                var: 'turn',
                value: {
                  aggregate: {
                    op: 'sum',
                    query: { query: 'zones' },
                  },
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
        (diag) =>
          diag.code === 'VALUE_EXPR_AGGREGATE_SOURCE_SHAPE_INVALID' &&
          diag.path === 'actions[0].effects[0].setVar.value.aggregate.query',
      ),
    );
  });

  it('validates commitResource variable references by scope', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              commitResource: {
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
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].commitResource.from.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].effects[0].commitResource.to.var'),
    );
  });

  it('requires commitResource.to.player when targeting per-player variables', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              commitResource: {
                from: { scope: 'pvar', player: 'actor', var: 'vp' },
                to: { scope: 'pvar', var: 'vp' },
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
        (diag) => diag.code === 'EFFECT_COMMIT_RESOURCE_TO_PLAYER_REQUIRED' &&
          diag.path === 'actions[0].effects[0].commitResource.to.player',
      ),
    );
  });

  it('rejects commitResource boolean variable targets', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      perPlayerVars: [...base.perPlayerVars, { name: 'ready', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              commitResource: {
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
        (diag) => diag.code === 'EFFECT_COMMIT_RESOURCE_BOOLEAN_TARGET_INVALID' &&
          diag.path === 'actions[0].effects[0].commitResource.from.var',
      ),
    );
  });

  it('reports invalid phase references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], phase: 'mian' }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].phase');
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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

  it('does not require coupPlan phase ids to match turnStructure phase ids', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      turnStructure: {
        phases: [{ id: 'operations' }],
      },
      actions: [{ ...base.actions[0], phase: 'operations' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
      diagnostics.some((diag) => diag.code.startsWith('COUP_PLAN_')),
      false,
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
            faction: 'us',
            timing: 'duringCoup',
            when: { op: '>=', left: { ref: 'gvar', var: 'unknown' }, right: 50 },
          },
        ],
        margins: [{ faction: 'us', value: { ref: 'pvar', player: 'active', var: 'missingPvar' } }],
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
        { ...base.zones[0], adjacentTo: ['deck:none'] },
        { ...base.zones[1], adjacentTo: [] },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find((diag) => diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0]');
    assert.equal(diagnostic.severity, 'warning');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports dangling adjacency references with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: ['missing:none'] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_DANGLING_ZONE_REF');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0]');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports unsorted adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: ['market:none', 'deck:none'] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_NEIGHBORS_UNSORTED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1]');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
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
          pieceFilter: { factions: ['US', 'ARVN'] },
          rule: 'prohibit' as const,
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'STACKING_CONSTRAINT_TOKEN_TYPE_FACTION_MISSING'));
  });
});

describe('validateInitialPlacementsAgainstStackingConstraints', () => {
  const spaces: readonly MapSpaceDef[] = [
    { id: 'quang-tri', spaceType: 'province', population: 1, econ: 0, terrainTags: [], country: 'south-vietnam', coastal: false, adjacentTo: [] },
    { id: 'hue', spaceType: 'city', population: 2, econ: 0, terrainTags: [], country: 'south-vietnam', coastal: true, adjacentTo: [] },
    { id: 'route-1', spaceType: 'loc', population: 0, econ: 1, terrainTags: [], country: 'south-vietnam', coastal: false, adjacentTo: [] },
    { id: 'hanoi', spaceType: 'city', population: 3, econ: 0, terrainTags: [], country: 'north-vietnam', coastal: false, adjacentTo: [] },
  ];

  const maxBasesConstraint: StackingConstraint = {
    id: 'max-2-bases',
    description: 'Max 2 bases per province or city',
    spaceFilter: { spaceTypes: ['province', 'city'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'maxCount',
    maxCount: 2,
  };

  const noBasesOnLocConstraint: StackingConstraint = {
    id: 'no-bases-on-loc',
    description: 'No bases on LoCs',
    spaceFilter: { spaceTypes: ['loc'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'prohibit',
  };

  const nvRestrictionConstraint: StackingConstraint = {
    id: 'nv-restriction',
    description: 'Only NVA/VC in North Vietnam',
    spaceFilter: { country: ['north-vietnam'] },
    pieceFilter: { factions: ['US', 'ARVN'] },
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
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'NVA', count: 1 },
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
      { spaceId: 'route-1', pieceTypeId: 'base', faction: 'NVA', count: 1 },
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
      { spaceId: 'hanoi', pieceTypeId: 'troops', faction: 'US', count: 2 },
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
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'troops', faction: 'US', count: 5 },
      { spaceId: 'hue', pieceTypeId: 'base', faction: 'NVA', count: 2 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', faction: 'NVA', count: 3 },
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
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'US', count: 5 },
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
      { spaceId: 'quang-tri', pieceTypeId: 'base', faction: 'US', count: 3 },
      { spaceId: 'route-1', pieceTypeId: 'base', faction: 'ARVN', count: 1 },
      { spaceId: 'hanoi', pieceTypeId: 'troops', faction: 'ARVN', count: 1 },
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
      { spaceId: 'quang-tri', pieceTypeId: 'troops', faction: 'US', count: 10 },
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
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', faction: 'NVA', count: 5 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', faction: 'VC', count: 3 },
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
      spaceFilter: { country: ['north-vietnam'] },
      pieceFilter: { factions: ['us', 'arvn'] },
      rule: 'prohibit',
    };
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'us-troops', faction: 'US', count: 1 },
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
          phase: 'missing-phase',
        },
      ],
    } as unknown as GameDef;

    const result = validateGameDefBoundary(invalid);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), true);
    assert.equal(isValidatedGameDef(invalid), false);
  });
});
