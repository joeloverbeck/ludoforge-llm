import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalValue,
  isEvalErrorCode,
  type ReadContext,
  type GameDef,
  type GameState,
  type Token,
  type ValueExpr,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-value-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), zoneKind: 'aux', owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), zoneKind: 'aux', owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('tableau:0'), zoneKind: 'aux', owner: 'player', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeToken = (id: string, props: Readonly<Record<string, number | string | boolean>>): Token => ({
  id: asTokenId(id),
  type: 'card',
  props,
});

const makeState = (): GameState => ({
  globalVars: { a: 3, b: 4 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [makeToken('deck-1', { vp: 1, cost: 3 }), makeToken('deck-2', { vp: 2, cost: 1 })],
    'hand:0': [],
    'hand:1': [makeToken('hand-1', { vp: 10, cost: 5, label: 'x' })],
    'tableau:0': [makeToken('tab-1', { vp: 3, cost: 8 }), makeToken('tab-2', { vp: 4, cost: 2 })],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeCtx = (overrides?: Partial<ReadContext>): ReadContext =>
  makeEvalContext({
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(1),
    bindings: { '$x': 42 },
    ...overrides,
  });

describe('evalValue', () => {
  it('passes through literal number/boolean/string values', () => {
    const ctx = makeCtx();

    assert.equal(evalValue(7, ctx), 7);
    assert.equal(evalValue(true, ctx), true);
    assert.equal(evalValue('ok', ctx), 'ok');
  });

  it('passes through homogeneous scalar-array values', () => {
    const ctx = makeCtx();
    assert.deepEqual(evalValue({ _t: 1, scalarArray: ['NVA', 'VC'] } as const, ctx), ['NVA', 'VC']);
  });

  it('delegates reference evaluation to resolveRef', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ _t: 2, ref: 'gvar', var: 'a' } as const, ctx), 3);
  });

  it('resolves binding and grantContext refs that carry scalar arrays', () => {
    const bindingCtx = makeCtx({ bindings: { '$targetFactions': ['NVA', 'VC'] } });
    assert.deepEqual(evalValue({ _t: 2, ref: 'binding', name: '$targetFactions' } as const, bindingCtx), ['NVA', 'VC']);

    const grantCtx = makeCtx({
      freeOperationOverlay: {
        grantContext: {
          allowedTargets: ['NVA', 'VC'],
        },
      },
    });
    assert.deepEqual(evalValue({ _t: 2, ref: 'grantContext', key: 'allowedTargets' } as const, grantCtx), ['NVA', 'VC']);
  });

  it('evaluates integer arithmetic (+, -, *, /, floorDiv, ceilDiv, min, max)', () => {
    const ctx = makeCtx();

    assert.equal(evalValue({ _t: 6, op: '+', left: 3, right: 4 }, ctx), 7);
    assert.equal(evalValue({ _t: 6, op: '-', left: 10, right: 3 }, ctx), 7);
    assert.equal(evalValue({ _t: 6, op: '*', left: 5, right: 2 }, ctx), 10);
    assert.equal(evalValue({ _t: 6, op: '/', left: 7, right: 2 }, ctx), 3);
    assert.equal(evalValue({ _t: 6, op: '/', left: -7, right: 2 }, ctx), -3);
    assert.equal(evalValue({ _t: 6, op: '/', left: 0, right: 5 }, ctx), 0);
    assert.equal(evalValue({ _t: 6, op: '/', left: 6, right: 3 }, ctx), 2);
    assert.equal(evalValue({ _t: 6, op: 'floorDiv', left: 7, right: 2 }, ctx), 3);
    assert.equal(evalValue({ _t: 6, op: 'floorDiv', left: -7, right: 2 }, ctx), -4);
    assert.equal(evalValue({ _t: 6, op: 'ceilDiv', left: 7, right: 2 }, ctx), 4);
    assert.equal(evalValue({ _t: 6, op: 'ceilDiv', left: -7, right: 2 }, ctx), -3);
    assert.equal(evalValue({ _t: 6, op: 'min', left: 7, right: 2 }, ctx), 2);
    assert.equal(evalValue({ _t: 6, op: 'max', left: -7, right: 2 }, ctx), 2);
  });

  it('throws DIVISION_BY_ZERO for division by zero', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ _t: 6, op: '/', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evalValue({ _t: 6, op: 'floorDiv', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evalValue({ _t: 6, op: 'ceilDiv', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
  });

  it('evaluates division with aggregate sub-expressions', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 6,
      op: '/',
      left: {
        _t: 5,
        aggregate: {
          op: 'sum',
          query: { query: 'tokensInZone', zone: 'tableau:0' },
          bind: '$token',
          valueExpr: { _t: 2, ref: 'tokenProp', token: '$token', prop: 'vp' } as const,
        },
      },
      right: { _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'tableau:0' } } },
    };
    assert.equal(evalValue(expr, ctx), 3);
  });

  it('throws TYPE_MISMATCH for non-numeric arithmetic operands', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ _t: 6, op: '+', left: 1, right: 'bad' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates count/sum/min/max aggregates with expected empty defaults', () => {
    const ctx = makeCtx();

    const countExpr: ValueExpr = { _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } };
    assert.equal(evalValue(countExpr, ctx), 2);

    const emptyCountExpr: ValueExpr = {
      _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'hand:0' } },
    };
    assert.equal(evalValue(emptyCountExpr, ctx), 0);

    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'sum',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      7,
    );
    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'min',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'cost' },
          },
        },
        ctx,
      ),
      2,
    );
    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'max',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'cost' },
          },
        },
        ctx,
      ),
      8,
    );

    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'sum',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'min',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'max',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
  });

  it('counts prioritized qualifierKey aggregates using the admissible selection pool', () => {
    const def: GameDef = {
      metadata: { id: 'eval-value-prioritized-count', players: { min: 1, max: 4 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('available:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('map:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'piece', props: { pieceType: 'string' } }],
      setup: [],
      turnStructure: { phases: [] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };
    const state: GameState = {
      globalVars: {},
      perPlayerVars: {},
      zoneVars: {},
      playerCount: 2,
      zones: {
        'available:none': [
          { id: asTokenId('available-police-1'), type: 'piece', props: { pieceType: 'police' } },
        ],
        'map:none': [
          { id: asTokenId('map-troop-1'), type: 'piece', props: { pieceType: 'troop' } },
          { id: asTokenId('map-police-1'), type: 'piece', props: { pieceType: 'police' } },
        ],
      },
      nextTokenOrdinal: 0,
      currentPhase: asPhaseId('main'),
      activePlayer: asPlayerId(0),
      turnCount: 1,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
      stateHash: 0n,
      _runningHash: 0n,
      actionUsage: {},
      turnOrderState: { type: 'roundRobin' },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
    };
    const ctx = makeEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph([]),
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'count',
            query: {
              query: 'prioritized',
              qualifierKey: 'pieceType',
              tiers: [
                { query: 'tokensInZone', zone: 'available:none' },
                { query: 'tokensInZone', zone: 'map:none' },
              ],
            },
          },
        },
        ctx,
      ),
      2,
    );
  });

  it('throws TYPE_MISMATCH when aggregate valueExpr is missing or non-numeric', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        evalValue(
          {
            _t: 5, aggregate: {
              op: 'sum',
              query: { query: 'tokensInZone', zone: 'deck:none' },
              bind: '$token',
              valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'missing' },
            },
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );

    assert.throws(
      () =>
        evalValue(
          {
            _t: 5, aggregate: {
              op: 'sum',
              query: { query: 'tokensInZone', zone: 'hand:1' },
              bind: '$token',
              valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'label' },
            },
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports numeric aggregates via item binding and enforces safe integer outputs', () => {
    const ctx = makeCtx();

    assert.equal(
      evalValue(
        {
          _t: 5, aggregate: {
            op: 'sum',
            query: { query: 'intsInRange', min: 1, max: 3 },
            bind: '$n',
            valueExpr: { _t: 2 as const, ref: 'binding', name: '$n' },
          },
        },
        ctx,
      ),
      6,
    );

    assert.throws(
      () => evalValue({ _t: 6, op: '+', left: Number.MAX_SAFE_INTEGER, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports aggregate valueExpr evaluation over players', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 5, aggregate: {
        op: 'sum',
        query: { query: 'players' },
        bind: '$player',
        valueExpr: { _t: 2 as const, ref: 'binding', name: '$player' },
      },
    };

    assert.equal(evalValue(expr, ctx), 1);
  });

  it('supports aggregate valueExpr evaluation over composed numeric queries', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 5, aggregate: {
        op: 'sum',
        query: {
          query: 'concat',
          sources: [
            { query: 'intsInRange', min: 1, max: 2 },
            { query: 'intsInRange', min: 4, max: 4 },
          ],
        },
        bind: '$n',
        valueExpr: { _t: 2 as const, ref: 'binding', name: '$n' },
      },
    };

    assert.equal(evalValue(expr, ctx), 7);
  });

  it('supports aggregate valueExpr evaluation from filtered map spaces', () => {
    const def: GameDef = {
      ...makeDef(),
      zones: [
        ...makeDef().zones,
        {
          id: asZoneId('alpha:none'),
          zoneKind: 'board',
          owner: 'none' as const,
          visibility: 'public' as const,
          ordering: 'set' as const,
          adjacentTo: [{ to: asZoneId('beta:none') }],
          category: 'city',
          attributes: { population: 3, econ: 1, country: 'sv', coastal: false },
        },
        {
          id: asZoneId('beta:none'),
          zoneKind: 'board',
          owner: 'none' as const,
          visibility: 'public' as const,
          ordering: 'set' as const,
          adjacentTo: [{ to: asZoneId('alpha:none') }],
          category: 'province',
          attributes: { population: 2, econ: 1, country: 'sv', coastal: false },
        },
      ],
    };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'alpha:none': [],
        'beta:none': [],
      },
      markers: {
        'alpha:none': { supportOpposition: 'activeSupport' },
        'beta:none': { supportOpposition: 'neutral' },
      },
    };
    const ctx = makeCtx({ def, state, adjacencyGraph: buildAdjacencyGraph(def.zones) });
    const expr: ValueExpr = {
      _t: 5, aggregate: {
        op: 'sum',
        query: {
          query: 'mapSpaces',
          filter: {
            condition: {
              op: '==',
              left: { _t: 2 as const, ref: 'markerState', space: '$zone', marker: 'supportOpposition' },
              right: 'activeSupport',
            },
          },
        },
        bind: '$zone',
        valueExpr: { _t: 2 as const, ref: 'zoneProp', zone: '$zone', prop: 'population' },
      },
    };

    assert.equal(evalValue(expr, ctx), 3);
  });

  it('supports aggregate valueExpr evaluation from assetRows row objects', () => {
    const def = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, smallBlind: 10 },
                { level: 2, smallBlind: 20 },
                { level: 3, smallBlind: 40 },
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
          },
        ],
    };
    const ctx = makeCtx({ def });
    const expr: ValueExpr = {
      _t: 5, aggregate: {
        op: 'sum',
        query: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        bind: '$row',
        valueExpr: {
          _t: 2 as const, ref: 'assetField',
          row: '$row',
          tableId: 'tournament-standard::blindSchedule.levels',
          field: 'smallBlind',
        },
      },
    };
    assert.equal(evalValue(expr, ctx), 70);
  });

  it('throws TYPE_MISMATCH for non-safe arithmetic operands', () => {
    const ctx = makeCtx();

    assert.throws(
      () => evalValue({ _t: 6, op: '+', left: Number.MAX_SAFE_INTEGER + 1, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );

    assert.throws(
      () => evalValue({ _t: 6, op: '+', left: Number.POSITIVE_INFINITY, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates concat with string literals', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ _t: 3, concat: ['hello', ' ', 'world'] }, ctx), 'hello world');
  });

  it('evaluates concat with mixed types (coerced to string)', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ _t: 3, concat: ['count:', 42] }, ctx), 'count:42');
    assert.equal(evalValue({ _t: 3, concat: ['flag:', true] }, ctx), 'flag:true');
  });

  it('evaluates concat with refs', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ _t: 3, concat: ['var_a=', { _t: 2 as const, ref: 'gvar', var: 'a' }] }, ctx), 'var_a=3');
  });

  it('evaluates concat with nested expressions', () => {
    const ctx = makeCtx();
    assert.equal(
      evalValue({ _t: 3, concat: ['result:', { _t: 6 as const, op: '+', left: 1, right: 2 }] }, ctx),
      'result:3',
    );
  });

  it('evaluates empty concat as empty string', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ _t: 3, concat: [] }, ctx), '');
  });

  it('evaluates concat with scalar-array parts by flattening them left-to-right', () => {
    const ctx = makeCtx({
      bindings: {
        $enemySeats: ['NVA', 'VC'],
      },
    });

    assert.deepEqual(
      evalValue(
        {
          _t: 3, concat: [
            { _t: 1, scalarArray: ['US'] },
            { _t: 2 as const, ref: 'binding', name: '$enemySeats' },
            { _t: 1, scalarArray: ['ARVN'] },
          ],
        },
        ctx,
      ),
      ['US', 'NVA', 'VC', 'ARVN'],
    );
  });

  it('rejects concat expressions that mix scalar and scalar-array parts', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ _t: 3, concat: [{ _t: 1, scalarArray: ['US'] }, 'VC'] }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates conditional if/then/else — true branch', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 4, if: {
        when: { op: '>', left: { _t: 2 as const, ref: 'gvar', var: 'a' }, right: 0 },
        then: 100,
        else: 0,
      },
    };
    assert.equal(evalValue(expr, ctx), 100);
  });

  it('evaluates conditional if/then/else — false branch', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 4, if: {
        when: { op: '<', left: { _t: 2 as const, ref: 'gvar', var: 'a' }, right: 0 },
        then: 100,
        else: 0,
      },
    };
    assert.equal(evalValue(expr, ctx), 0);
  });

  it('evaluates nested conditional', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 4, if: {
        when: { op: '==', left: { _t: 2 as const, ref: 'gvar', var: 'a' }, right: 3 },
        then: {
          _t: 4, if: {
            when: { op: '==', left: { _t: 2 as const, ref: 'gvar', var: 'b' }, right: 4 },
            then: 'both-match',
            else: 'only-a',
          },
        },
        else: 'no-match',
      },
    };
    assert.equal(evalValue(expr, ctx), 'both-match');
  });

  it('evaluates conditional in arithmetic expression', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      _t: 6, op: '+',
      left: 10,
      right: {
        _t: 4, if: {
          when: { op: '>', left: { _t: 2 as const, ref: 'gvar', var: 'a' }, right: 2 },
          then: 5,
          else: 0,
        },
      },
    };
    assert.equal(evalValue(expr, ctx), 15);
  });
});
