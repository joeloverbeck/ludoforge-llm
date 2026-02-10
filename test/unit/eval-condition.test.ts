import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  evalCondition,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-condition-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeState = (): GameState => ({
  globalVars: { a: 3, b: 5 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [],
    'hand:0': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  state: makeState(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(1),
  bindings: {},
  ...overrides,
});

describe('evalCondition', () => {
  it('evaluates comparison operators', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: '==', left: 3, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '==', left: 3, right: 4 }, ctx), false);
    assert.equal(evalCondition({ op: '!=', left: 3, right: 4 }, ctx), true);
    assert.equal(evalCondition({ op: '<', left: 3, right: 5 }, ctx), true);
    assert.equal(evalCondition({ op: '<', left: 5, right: 3 }, ctx), false);
    assert.equal(evalCondition({ op: '<=', left: 3, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '>', left: 5, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '>=', left: 3, right: 3 }, ctx), true);
  });

  it('evaluates boolean logic including vacuous and/or', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: 'and', args: [{ op: '==', left: 1, right: 1 }] }, ctx), true);
    assert.equal(
      evalCondition({ op: 'and', args: [{ op: '==', left: 1, right: 1 }, { op: '==', left: 1, right: 2 }] }, ctx),
      false,
    );
    assert.equal(evalCondition({ op: 'and', args: [] }, ctx), true);

    assert.equal(
      evalCondition({ op: 'or', args: [{ op: '==', left: 1, right: 2 }, { op: '==', left: 2, right: 2 }] }, ctx),
      true,
    );
    assert.equal(
      evalCondition({ op: 'or', args: [{ op: '==', left: 1, right: 2 }, { op: '==', left: 2, right: 3 }] }, ctx),
      false,
    );
    assert.equal(evalCondition({ op: 'or', args: [] }, ctx), false);

    assert.equal(evalCondition({ op: 'not', arg: { op: '==', left: 1, right: 1 } }, ctx), false);
    assert.equal(evalCondition({ op: 'not', arg: { op: '==', left: 1, right: 2 } }, ctx), true);
  });

  it('evaluates nested expressions', () => {
    const ctx = makeCtx();
    const condition = {
      op: 'and',
      args: [
        {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'gvar', var: 'a' }, right: 9 },
            { op: '==', left: { ref: 'gvar', var: 'a' }, right: 3 },
          ],
        },
        { op: 'not', arg: { op: '==', left: { ref: 'gvar', var: 'b' }, right: 9 } },
      ],
    } as const;

    assert.equal(evalCondition(condition, ctx), true);
  });

  it('short-circuits and/or evaluation', () => {
    const ctx = makeCtx();

    assert.equal(
      evalCondition(
        {
          op: 'and',
          args: [
            { op: '==', left: 1, right: 2 },
            { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
          ],
        },
        ctx,
      ),
      false,
    );

    assert.equal(
      evalCondition(
        {
          op: 'or',
          args: [
            { op: '==', left: 2, right: 2 },
            { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
          ],
        },
        ctx,
      ),
      true,
    );
  });

  it('throws TYPE_MISMATCH for non-numeric ordering comparisons', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalCondition({ op: '<', left: 1, right: 'bad' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports in membership against bound collections', () => {
    const ctx = makeCtx({ bindings: { '$set': [1, 3, 5] } });

    assert.equal(evalCondition({ op: 'in', item: 3, set: { ref: 'binding', name: '$set' } }, ctx), true);
    assert.equal(evalCondition({ op: 'in', item: 2, set: { ref: 'binding', name: '$set' } }, ctx), false);
  });

  it('throws TYPE_MISMATCH when in set is not a collection', () => {
    const ctx = makeCtx({ bindings: { '$set': 3 } });
    assert.throws(
      () => evalCondition({ op: 'in', item: 3, set: { ref: 'binding', name: '$set' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });
});
