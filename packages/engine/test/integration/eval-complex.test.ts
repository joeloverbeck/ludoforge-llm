import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPlayerId,
  deserializeGameState,
  evalCondition,
  serializeGameState,
  type ConditionAST,
  type EvalContext,
  type GameDef,
  type SerializedGameState,
} from '../../src/kernel/index.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';

describe('evaluation integration - complex scenario', () => {
  it('evaluates combined pvar/gvar/query condition and leaves state unchanged', () => {
    const def = readFixtureJson<GameDef>('gamedef/eval-complex-valid.json');
    const serializedState = readFixtureJson<SerializedGameState>('trace/eval-state-snapshot.json');
    const state = deserializeGameState(serializedState);

    const ctx: EvalContext = {
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state,
      activePlayer: asPlayerId(1),
      actorPlayer: asPlayerId(0),
      bindings: {},
      collector: createCollector(),
    };

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

    const before = serializeGameState(state);
    const result = evalCondition(condition, ctx);
    const after = serializeGameState(state);

    assert.equal(result, true);
    assert.deepEqual(after, before);
  });
});
