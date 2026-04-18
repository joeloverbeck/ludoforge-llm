// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asPlayerId,
  deserializeGameState,
  evalCondition,
  evalValue,
  type ConditionAST,
  type ReadContext,
  type GameDef,
  type SerializedGameState,
  type ValueExpr,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';

const makeCtx = (): ReadContext => {
  const def = readFixtureJson<GameDef>('gamedef/eval-complex-valid.json');
  const serializedState = readFixtureJson<SerializedGameState>('trace/eval-state-snapshot.json');

  return makeEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: deserializeGameState(serializedState),
    activePlayer: asPlayerId(1),
    actorPlayer: asPlayerId(0),
    bindings: {},
  });
};

describe('evaluation golden outputs', () => {
  it('fixed state + complex condition yields stable expected boolean', () => {
    const ctx = makeCtx();

    const condition: ConditionAST = {
      op: 'and',
      args: [
        { op: '>=', left: { _t: 2 as const, ref: 'pvar', player: 'actor', var: 'money' }, right: 3 },
        { op: '<', left: { _t: 2 as const, ref: 'gvar', var: 'threat' }, right: 10 },
        {
          op: '>',
          left: { _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'hand:actor' } } },
          right: 0,
        },
      ],
    };

    assert.equal(evalCondition(condition, ctx), true);
  });

  it('fixed state + aggregate expression yields stable expected number', () => {
    const ctx = makeCtx();

    const aggregateExpr: ValueExpr = {
      _t: 5, aggregate: {
        op: 'sum',
        query: { query: 'tokensInZone', zone: 'deck:none' },
        bind: '$token',
        valueExpr: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'cost' },
      },
    };

    assert.equal(evalValue(aggregateExpr, ctx), 8);
  });
});
