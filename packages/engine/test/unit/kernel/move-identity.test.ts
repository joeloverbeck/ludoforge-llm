import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, type GameDef, type Move } from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'move-identity-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'], overrideWindows: [] },
          actionClassByActionId: { operation: 'operation' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('toMoveIdentityKey', () => {
  it('uses effective mapped action class instead of submitted conflicting class', () => {
    const def = makeDef();
    const withMappedClass: Move = {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'operation',
    };
    const withConflictingClass: Move = {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'limitedOperation',
    };

    assert.equal(
      toMoveIdentityKey(def, withMappedClass),
      toMoveIdentityKey(def, withConflictingClass),
    );
  });

  it('differentiates free-operation and class-distinct variants', () => {
    const def = makeDef();
    const turnOrder = def.turnOrder;
    if (turnOrder === undefined || turnOrder.type !== 'cardDriven') {
      throw new Error('Expected cardDriven turn order in move identity test fixture.');
    }
    const base: Move = { actionId: asActionId('operation'), params: {}, actionClass: 'operation' };
    const freeOperation = { ...base, freeOperation: true };
    const freeLimited = { ...freeOperation, actionClass: 'limitedOperation' };
    const noMapDef: GameDef = {
      ...def,
      turnOrder: {
        ...turnOrder,
        config: {
          ...turnOrder.config,
          turnFlow: {
            ...turnOrder.config.turnFlow,
            actionClassByActionId: {},
          },
        },
      },
    };

    assert.notEqual(toMoveIdentityKey(def, base), toMoveIdentityKey(def, freeOperation));
    assert.notEqual(
      toMoveIdentityKey(noMapDef, freeOperation),
      toMoveIdentityKey(noMapDef, freeLimited),
    );
  });
});
