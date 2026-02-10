import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
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

const readJsonFixture = <T>(filePath: string): T => {
  const raw = readFileSync(join(process.cwd(), filePath), 'utf8');
  return JSON.parse(raw) as T;
};

const makeCtx = (): EvalContext => {
  const def = readJsonFixture<GameDef>('test/fixtures/gamedef/eval-complex-valid.json');
  const serializedState = readJsonFixture<SerializedGameState>('test/fixtures/trace/eval-state-snapshot.json');

  return {
    def,
    state: deserializeGameState(serializedState),
    activePlayer: asPlayerId(1),
    actorPlayer: asPlayerId(0),
    bindings: {},
  };
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
      aggregate: { op: 'sum', query: { query: 'tokensInZone', zone: 'deck:none' }, prop: 'cost' },
    };

    assert.equal(evalValue(aggregateExpr, ctx), 8);
  });
});
