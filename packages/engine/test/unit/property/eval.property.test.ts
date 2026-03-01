import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPlayerId,
  deserializeGameState,
  evalCondition,
  evalQuery,
  evalValue,
  isEvalErrorCode,
  type ConditionAST,
  type EvalContext,
  type GameDef,
  type SerializedGameState,
  type ValueExpr,
} from '../../../src/kernel/index.js';
import { readFixtureJson } from '../../helpers/fixture-reader.js';

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => {
  const def = readFixtureJson<GameDef>('gamedef/eval-complex-valid.json');
  const serializedState = readFixtureJson<SerializedGameState>('trace/eval-state-snapshot.json');

  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: deserializeGameState(serializedState),
    activePlayer: asPlayerId(1),
    actorPlayer: asPlayerId(0),
    bindings: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('evaluation property-style checks', () => {
  it('evalCondition returns boolean for a deterministic set of valid condition trees', () => {
    const conditions: readonly ConditionAST[] = [
      { op: '==', left: 1, right: 1 },
      { op: 'and', args: [{ op: '==', left: 1, right: 1 }, { op: '!=', left: 1, right: 2 }] },
      { op: 'or', args: [{ op: '<', left: 1, right: 0 }, { op: '>=', left: 2, right: 2 }] },
      {
        op: 'not',
        arg: {
          op: 'in',
          item: 4,
          set: { ref: 'binding', name: '$set' },
        },
      },
      {
        op: 'and',
        args: [
          { op: '<', left: { ref: 'gvar', var: 'threat' }, right: 20 },
          { op: '>', left: { ref: 'pvar', player: 'actor', var: 'money' }, right: 0 },
        ],
      },
    ];

    const bindingCtx = makeCtx({ bindings: { '$set': [1, 2, 3] } });

    conditions.forEach((cond) => {
      const value = evalCondition(cond, bindingCtx);
      assert.equal(typeof value, 'boolean');
    });
  });

  it('evalValue does not produce NaN or Infinity for valid integer-input expressions', () => {
    const ctx = makeCtx();

    const expressions: ValueExpr[] = [
      { op: '+', left: 3, right: 4 },
      { op: '-', left: 10, right: 7 },
      { op: '*', left: 6, right: 5 },
      { aggregate: { op: 'sum', query: { query: 'intsInRange', min: 1, max: 4 }, bind: '$n', valueExpr: { ref: 'binding', name: '$n' } } },
      { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } },
      { aggregate: { op: 'min', query: { query: 'intsInRange', min: 2, max: 5 }, bind: '$n', valueExpr: { ref: 'binding', name: '$n' } } },
      { aggregate: { op: 'max', query: { query: 'intsInRange', min: 2, max: 5 }, bind: '$n', valueExpr: { ref: 'binding', name: '$n' } } },
    ];

    expressions.forEach((expr) => {
      const value = evalValue(expr, ctx);
      assert.equal(typeof value, 'number');
      assert.equal(Number.isFinite(value), true);
      assert.equal(Number.isNaN(value), false);
    });
  });

  it('intsInRange(a,b) length is b-a+1 whenever a <= b and bounds permit', () => {
    const ctx = makeCtx({ maxQueryResults: 50 });

    for (let min = -5; min <= 5; min += 1) {
      for (let max = min; max <= min + 5; max += 1) {
        const result = evalQuery({ query: 'intsInRange', min, max }, ctx);
        assert.equal(result.length, max - min + 1);
      }
    }
  });

  it('evalQuery enforces maxQueryResults so result length never exceeds the limit', () => {
    const withinBoundsCtx = makeCtx({ maxQueryResults: 3 });

    const boundedQueries = [
      { query: 'players' } as const,
      { query: 'tokensInZone', zone: 'deck:none' } as const,
      { query: 'intsInRange', min: 2, max: 4 } as const,
    ];

    boundedQueries.forEach((query) => {
      const result = evalQuery(query, withinBoundsCtx);
      assert.equal(result.length <= 3, true);
    });

    assert.throws(
      () => evalQuery({ query: 'intsInRange', min: 0, max: 4 }, withinBoundsCtx),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
  });
});
