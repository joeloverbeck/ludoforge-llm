import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalValue,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
  type ValueExpr,
} from '../../src/kernel/index.js';

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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(1),
  bindings: { '$x': 42 },
  collector: createCollector(),
  ...overrides,
});

describe('evalValue', () => {
  it('passes through literal number/boolean/string values', () => {
    const ctx = makeCtx();

    assert.equal(evalValue(7, ctx), 7);
    assert.equal(evalValue(true, ctx), true);
    assert.equal(evalValue('ok', ctx), 'ok');
  });

  it('delegates reference evaluation to resolveRef', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ ref: 'gvar', var: 'a' }, ctx), 3);
  });

  it('evaluates integer arithmetic (+, -, *, /)', () => {
    const ctx = makeCtx();

    assert.equal(evalValue({ op: '+', left: 3, right: 4 }, ctx), 7);
    assert.equal(evalValue({ op: '-', left: 10, right: 3 }, ctx), 7);
    assert.equal(evalValue({ op: '*', left: 5, right: 2 }, ctx), 10);
    assert.equal(evalValue({ op: '/', left: 7, right: 2 }, ctx), 3);
    assert.equal(evalValue({ op: '/', left: -7, right: 2 }, ctx), -3);
    assert.equal(evalValue({ op: '/', left: 0, right: 5 }, ctx), 0);
    assert.equal(evalValue({ op: '/', left: 6, right: 3 }, ctx), 2);
    assert.equal(evalValue({ op: 'floorDiv', left: 7, right: 2 }, ctx), 3);
    assert.equal(evalValue({ op: 'floorDiv', left: -7, right: 2 }, ctx), -4);
    assert.equal(evalValue({ op: 'ceilDiv', left: 7, right: 2 }, ctx), 4);
    assert.equal(evalValue({ op: 'ceilDiv', left: -7, right: 2 }, ctx), -3);
  });

  it('throws DIVISION_BY_ZERO for division by zero', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ op: '/', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evalValue({ op: 'floorDiv', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evalValue({ op: 'ceilDiv', left: 10, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
  });

  it('evaluates division with aggregate sub-expressions', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      op: '/',
      left: {
        aggregate: {
          op: 'sum',
          query: { query: 'tokensInZone', zone: 'tableau:0' },
          bind: '$token',
          valueExpr: { ref: 'tokenProp', token: '$token', prop: 'vp' },
        },
      },
      right: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'tableau:0' } } },
    };
    assert.equal(evalValue(expr, ctx), 3);
  });

  it('throws TYPE_MISMATCH for non-numeric arithmetic operands', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ op: '+', left: 1, right: 'bad' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates count/sum/min/max aggregates with expected empty defaults', () => {
    const ctx = makeCtx();

    const countExpr: ValueExpr = { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } };
    assert.equal(evalValue(countExpr, ctx), 2);

    const emptyCountExpr: ValueExpr = {
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'hand:0' } },
    };
    assert.equal(evalValue(emptyCountExpr, ctx), 0);

    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'sum',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      7,
    );
    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'min',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'cost' },
          },
        },
        ctx,
      ),
      2,
    );
    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'max',
            query: { query: 'tokensInZone', zone: 'tableau:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'cost' },
          },
        },
        ctx,
      ),
      8,
    );

    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'sum',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'min',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
    assert.equal(
      evalValue(
        {
          aggregate: {
            op: 'max',
            query: { query: 'tokensInZone', zone: 'hand:0' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'vp' },
          },
        },
        ctx,
      ),
      0,
    );
  });

  it('throws TYPE_MISMATCH when aggregate valueExpr is missing or non-numeric', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        evalValue(
          {
            aggregate: {
              op: 'sum',
              query: { query: 'tokensInZone', zone: 'deck:none' },
              bind: '$token',
              valueExpr: { ref: 'tokenProp', token: '$token', prop: 'missing' },
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
            aggregate: {
              op: 'sum',
              query: { query: 'tokensInZone', zone: 'hand:1' },
              bind: '$token',
              valueExpr: { ref: 'tokenProp', token: '$token', prop: 'label' },
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
          aggregate: {
            op: 'sum',
            query: { query: 'intsInRange', min: 1, max: 3 },
            bind: '$n',
            valueExpr: { ref: 'binding', name: '$n' },
          },
        },
        ctx,
      ),
      6,
    );

    assert.throws(
      () => evalValue({ op: '+', left: Number.MAX_SAFE_INTEGER, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports aggregate valueExpr evaluation over players', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      aggregate: {
        op: 'sum',
        query: { query: 'players' },
        bind: '$player',
        valueExpr: { ref: 'binding', name: '$player' },
      },
    };

    assert.equal(evalValue(expr, ctx), 1);
  });

  it('supports aggregate valueExpr evaluation over composed numeric queries', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      aggregate: {
        op: 'sum',
        query: {
          query: 'concat',
          sources: [
            { query: 'intsInRange', min: 1, max: 2 },
            { query: 'intsInRange', min: 4, max: 4 },
          ],
        },
        bind: '$n',
        valueExpr: { ref: 'binding', name: '$n' },
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
      aggregate: {
        op: 'sum',
        query: {
          query: 'mapSpaces',
          filter: {
            condition: {
              op: '==',
              left: { ref: 'markerState', space: '$zone', marker: 'supportOpposition' },
              right: 'activeSupport',
            },
          },
        },
        bind: '$zone',
        valueExpr: { ref: 'zoneProp', zone: '$zone', prop: 'population' },
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
      aggregate: {
        op: 'sum',
        query: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        bind: '$row',
        valueExpr: {
          ref: 'assetField',
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
      () => evalValue({ op: '+', left: Number.MAX_SAFE_INTEGER + 1, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );

    assert.throws(
      () => evalValue({ op: '+', left: Number.POSITIVE_INFINITY, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates concat with string literals', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ concat: ['hello', ' ', 'world'] }, ctx), 'hello world');
  });

  it('evaluates concat with mixed types (coerced to string)', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ concat: ['count:', 42] }, ctx), 'count:42');
    assert.equal(evalValue({ concat: ['flag:', true] }, ctx), 'flag:true');
  });

  it('evaluates concat with refs', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ concat: ['var_a=', { ref: 'gvar', var: 'a' }] }, ctx), 'var_a=3');
  });

  it('evaluates concat with nested expressions', () => {
    const ctx = makeCtx();
    assert.equal(
      evalValue({ concat: ['result:', { op: '+', left: 1, right: 2 }] }, ctx),
      'result:3',
    );
  });

  it('evaluates empty concat as empty string', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ concat: [] }, ctx), '');
  });

  it('evaluates conditional if/then/else — true branch', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      if: {
        when: { op: '>', left: { ref: 'gvar', var: 'a' }, right: 0 },
        then: 100,
        else: 0,
      },
    };
    assert.equal(evalValue(expr, ctx), 100);
  });

  it('evaluates conditional if/then/else — false branch', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      if: {
        when: { op: '<', left: { ref: 'gvar', var: 'a' }, right: 0 },
        then: 100,
        else: 0,
      },
    };
    assert.equal(evalValue(expr, ctx), 0);
  });

  it('evaluates nested conditional', () => {
    const ctx = makeCtx();
    const expr: ValueExpr = {
      if: {
        when: { op: '==', left: { ref: 'gvar', var: 'a' }, right: 3 },
        then: {
          if: {
            when: { op: '==', left: { ref: 'gvar', var: 'b' }, right: 4 },
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
      op: '+',
      left: 10,
      right: {
        if: {
          when: { op: '>', left: { ref: 'gvar', var: 'a' }, right: 2 },
          then: 5,
          else: 0,
        },
      },
    };
    assert.equal(evalValue(expr, ctx), 15);
  });
});
