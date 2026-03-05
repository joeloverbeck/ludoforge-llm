import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asPlayerId,
  deserializeGameState,
  evalCondition,
  evalValue,
  type ConditionAST,
  type EvalContext,
  type GameDef,
  type SerializedGameState,
  type ValueExpr,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';

const makeCtx = (): EvalContext => {
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
        { op: '>=', left: { ref: 'pvar', player: 'actor', var: 'money' }, right: 3 },
        { op: '<', left: { ref: 'gvar', var: 'threat' }, right: 10 },
        {
          op: '>',
          left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'hand:actor' } } },
          right: 0,
        },
      ],
    };

    assert.equal(evalCondition(condition, ctx), true);
  });

  it('fixed state + aggregate expression yields stable expected number', () => {
    const ctx = makeCtx();

    const aggregateExpr: ValueExpr = {
      aggregate: {
        op: 'sum',
        query: { query: 'tokensInZone', zone: 'deck:none' },
        bind: '$token',
        valueExpr: { ref: 'tokenProp', token: '$token', prop: 'cost' },
      },
    };

    assert.equal(evalValue(aggregateExpr, ctx), 8);
  });
});
