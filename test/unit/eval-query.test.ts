import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalQuery,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-query-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    {
      id: asZoneId('deck:none'),
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: [asZoneId('hand:1'), asZoneId('hand:0')],
    },
    {
      id: asZoneId('hand:0'),
      owner: 'player',
      visibility: 'owner',
      ordering: 'stack',
      adjacentTo: [asZoneId('deck:none'), asZoneId('bench:1')],
    },
    {
      id: asZoneId('hand:1'),
      owner: 'player',
      visibility: 'owner',
      ordering: 'stack',
      adjacentTo: [asZoneId('deck:none')],
    },
    {
      id: asZoneId('bench:1'),
      owner: 'player',
      visibility: 'public',
      ordering: 'queue',
      adjacentTo: [asZoneId('hand:0'), asZoneId('tableau:2')],
    },
    {
      id: asZoneId('tableau:2'),
      owner: 'player',
      visibility: 'public',
      ordering: 'set',
      adjacentTo: [asZoneId('bench:1')],
    },
    {
      id: asZoneId('battlefield:none'),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
    },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { cost: 1 },
});

const makeFactionToken = (id: string, faction: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 3,
  zones: {
    'deck:none': [makeToken('deck-1'), makeToken('deck-2')],
    'hand:0': [makeToken('hand-0'), makeToken('hand-0b')],
    'hand:1': [makeToken('hand-1')],
    'bench:1': [],
    'tableau:2': [],
    'battlefield:none': [
      makeFactionToken('us-troop-1', 'US'),
      makeFactionToken('us-troop-2', 'US'),
      makeFactionToken('arvn-troop-1', 'ARVN'),
      makeFactionToken('nva-guerrilla-1', 'NVA'),
      makeFactionToken('vc-guerrilla-1', 'VC'),
    ],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(2),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    activePlayer: asPlayerId(2),
    actorPlayer: asPlayerId(1),
    bindings: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('evalQuery', () => {
  it('returns tokensInZone in state container order and without mutating zone arrays', () => {
    const ctx = makeCtx();

    const result = evalQuery({ query: 'tokensInZone', zone: 'deck:none' }, ctx);
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('deck-1'), asTokenId('deck-2')],
    );

    const mutableCopy = [...result] as Token[];
    mutableCopy.push(makeToken('deck-3'));
    assert.equal(ctx.state.zones['deck:none']?.length, 2);
  });

  it('evaluates intsInRange edge cases', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 1, max: 5 }, ctx), [1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 3, max: 3 }, ctx), [3]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 5, max: 3 }, ctx), []);
  });

  it('echoes enums and returns players sorted ascending', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'enums', values: ['red', 'blue', 'green'] }, ctx), ['red', 'blue', 'green']);
    assert.deepEqual(evalQuery({ query: 'players' }, ctx), [asPlayerId(0), asPlayerId(1), asPlayerId(2)]);
  });

  it('returns zones sorted, and filter.owner=actor resolves correctly', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'zones' }, ctx), ['battlefield:none', 'bench:1', 'deck:none', 'hand:0', 'hand:1', 'tableau:2']);
    assert.deepEqual(evalQuery({ query: 'zones', filter: { owner: 'actor' } }, ctx), ['bench:1', 'hand:1']);
  });

  it('applies zones filter.condition and composes it with owner filtering', () => {
    const ctx = makeCtx({
      bindings: {
        $allowedZones: [asZoneId('hand:0'), asZoneId('hand:1')],
      },
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'zones',
          filter: {
            condition: {
              op: 'in',
              item: { ref: 'binding', name: '$zone' },
              set: { ref: 'binding', name: '$allowedZones' },
            },
          },
        },
        ctx,
      ),
      ['hand:0', 'hand:1'],
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'zones',
          filter: {
            owner: 'actor',
            condition: {
              op: 'in',
              item: { ref: 'binding', name: '$zone' },
              set: { ref: 'binding', name: '$allowedZones' },
            },
          },
        },
        ctx,
      ),
      ['hand:1'],
    );
  });

  it('resolves templated binding query names against current bindings', () => {
    const ctx = makeCtx({
      bindings: {
        $space: 'hand:0',
        '$choices@hand:0': [asZoneId('hand:0'), asZoneId('hand:1')],
      },
    });

    assert.deepEqual(
      evalQuery({ query: 'binding', name: '$choices@{$space}' }, ctx),
      ['hand:0', 'hand:1'],
    );
  });

  it('mapSpaces query evaluates zoneProp filters only across map spaces', () => {
    const ctx = makeCtx({
      mapSpaces: [
        {
          id: 'battlefield:none',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: ['lowland'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
        {
          id: 'tableau:2',
          spaceType: 'city',
          population: 2,
          econ: 0,
          terrainTags: ['urban'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
      ],
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'mapSpaces',
          filter: {
            condition: {
              op: '==',
              left: { ref: 'zoneProp', zone: '$zone', prop: 'spaceType' },
              right: 'city',
            },
          },
        },
        ctx,
      ),
      ['tableau:2'],
    );
  });

  it('tokensInMapSpaces query composes map-space condition filters with token filters', () => {
    const ctx = makeCtx({
      mapSpaces: [
        {
          id: 'battlefield:none',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: ['lowland'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
        {
          id: 'tableau:2',
          spaceType: 'city',
          population: 2,
          econ: 0,
          terrainTags: ['urban'],
          country: 'northVietnam',
          coastal: false,
          adjacentTo: [],
        },
      ],
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'tokensInMapSpaces',
          spaceFilter: {
            condition: {
              op: '==',
              left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
              right: 'southVietnam',
            },
          },
          filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        },
        ctx,
      ).map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('zones query no longer suppresses zoneProp lookup errors from non-map zones', () => {
    const ctx = makeCtx({
      mapSpaces: [
        {
          id: 'battlefield:none',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: ['lowland'],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
      ],
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'zones',
            filter: {
              condition: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'spaceType' },
                right: 'city',
              },
            },
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'ZONE_PROP_NOT_FOUND'),
    );
  });

  it('filters owner-scoped zones using canonical ZoneDef.owner metadata', () => {
    const def = makeDef();
    const malformedZoneId = asZoneId('ghost:1');
    const zones = [
      ...def.zones,
      {
        id: malformedZoneId,
        owner: 'none' as const,
        visibility: 'public' as const,
        ordering: 'set' as const,
      },
    ];
    const state = makeState();
    const ctx = makeCtx({
      def: { ...def, zones },
      adjacencyGraph: buildAdjacencyGraph(zones),
      state: {
        ...state,
        zones: {
          ...state.zones,
          [malformedZoneId]: [],
        },
      },
    });

    assert.deepEqual(evalQuery({ query: 'zones' }, ctx), [
      'battlefield:none',
      'bench:1',
      'deck:none',
      'ghost:1',
      'hand:0',
      'hand:1',
      'tableau:2',
    ]);
    assert.deepEqual(evalQuery({ query: 'zones', filter: { owner: 'actor' } }, ctx), ['bench:1', 'hand:1']);
  });

  it('evaluates spatial query variants with deterministic ordering', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'adjacentZones', zone: 'deck:none' }, ctx), [
      asZoneId('hand:0'),
      asZoneId('hand:1'),
    ]);
    assert.deepEqual(
      evalQuery({ query: 'tokensInAdjacentZones', zone: 'deck:none' }, ctx).map((token) => (token as Token).id),
      [asTokenId('hand-0'), asTokenId('hand-0b'), asTokenId('hand-1')],
    );
    assert.deepEqual(
      evalQuery(
        {
          query: 'connectedZones',
          zone: 'deck:none',
          via: {
            op: 'in',
            item: { ref: 'binding', name: '$zone' },
            set: { ref: 'binding', name: '$allowed' },
          },
        },
        {
          ...ctx,
          bindings: {
            ...ctx.bindings,
            $allowed: [asZoneId('hand:0'), asZoneId('bench:1')],
          },
        },
      ),
      [asZoneId('hand:0'), asZoneId('bench:1')],
    );
  });

  it('tokensInZone with no filter returns all tokens (backward-compatible)', () => {
    const ctx = makeCtx();

    const result = evalQuery({ query: 'tokensInZone', zone: 'battlefield:none' }, ctx);
    assert.equal(result.length, 5);
  });

  it('tokensInZone with filter op=eq returns only matching tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('tokensInZone filter supports token identity via prop=id', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'id', op: 'eq', value: 'nva-guerrilla-1' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('nva-guerrilla-1')],
    );
  });

  it('tokensInZone with filter op=neq returns non-matching tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'faction', op: 'neq', value: 'US' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('arvn-troop-1'), asTokenId('nva-guerrilla-1'), asTokenId('vc-guerrilla-1')],
    );
  });

  it('tokensInZone with filter op=in returns tokens matching any value in array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'faction', op: 'in', value: ['US', 'ARVN'] }],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2'), asTokenId('arvn-troop-1')],
    );
  });

  it('tokensInZone with filter op=notIn returns tokens not matching any value in array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'faction', op: 'notIn', value: ['US', 'ARVN'] }],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('nva-guerrilla-1'), asTokenId('vc-guerrilla-1')],
    );
  });

  it('tokensInZone with filter on missing token prop returns empty array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'nonexistent', op: 'eq', value: 'anything' }],
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('tokensInZone with compound filter (AND) returns only tokens matching all predicates', () => {
    const ctx = makeCtx();

    // Tokens have only 'faction' prop, so filter on faction=US AND faction!=ARVN
    // Both US troops match faction=US AND faction!=ARVN
    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [
          { prop: 'faction', op: 'in', value: ['US', 'ARVN'] },
          { prop: 'faction', op: 'neq', value: 'ARVN' },
        ],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('tokensInZone with empty filter array returns all tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [] },
      ctx,
    );
    assert.equal(result.length, 5);
  });

  it('throws QUERY_BOUNDS_EXCEEDED when a query would exceed maxQueryResults', () => {
    const ctx = makeCtx({ maxQueryResults: 3 });

    assert.throws(
      () => evalQuery({ query: 'intsInRange', min: 1, max: 10 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
    assert.throws(
      () => evalQuery({ query: 'adjacentZones', zone: 'deck:none' }, makeCtx({ maxQueryResults: 1 })),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
  });
});
