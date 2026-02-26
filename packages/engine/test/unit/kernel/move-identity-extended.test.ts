import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, type GameDef, type Move } from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'move-identity-ext-test', players: { min: 2, max: 2 } },
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
          actionClassByActionId: { attack: 'operation', defend: 'limitedOperation' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('attack'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('defend'),
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

describe('toMoveIdentityKey — extended', () => {
  it('produces consistent key for empty params', () => {
    const def = makeDef();
    const move: Move = { actionId: asActionId('attack'), params: {} };
    const key1 = toMoveIdentityKey(def, move);
    const key2 = toMoveIdentityKey(def, move);
    assert.equal(key1, key2);
  });

  it('produces consistent key for array params', () => {
    const def = makeDef();
    const move: Move = {
      actionId: asActionId('attack'),
      params: { targets: ['zone-a', 'zone-b'], count: 3 },
    };
    const key1 = toMoveIdentityKey(def, move);
    const key2 = toMoveIdentityKey(def, move);
    assert.equal(key1, key2);
  });

  it('differentiates moves with different params', () => {
    const def = makeDef();
    const moveA: Move = { actionId: asActionId('attack'), params: { target: 'a' } };
    const moveB: Move = { actionId: asActionId('attack'), params: { target: 'b' } };
    assert.notEqual(toMoveIdentityKey(def, moveA), toMoveIdentityKey(def, moveB));
  });

  it('includeFreeOperation: false omits freeOperation segment', () => {
    const def = makeDef();
    const base: Move = { actionId: asActionId('attack'), params: {} };
    const free: Move = { ...base, freeOperation: true };

    const baseKey = toMoveIdentityKey(def, base, { includeFreeOperation: false });
    const freeKey = toMoveIdentityKey(def, free, { includeFreeOperation: false });
    assert.equal(baseKey, freeKey);
  });

  it('includeEffectiveActionClass: false omits class segment', () => {
    const def = makeDef();
    const moveA: Move = { actionId: asActionId('attack'), params: {} };
    const moveD: Move = { actionId: asActionId('defend'), params: {} };

    const keyA = toMoveIdentityKey(def, moveA, { includeEffectiveActionClass: false });
    const keyD = toMoveIdentityKey(def, moveD, { includeEffectiveActionClass: false });
    assert.notEqual(keyA, keyD); // different actionId
  });

  it('custom unresolvedActionClassSentinel replaces default', () => {
    const noMapDef: GameDef = {
      ...makeDef(),
      turnOrder: undefined,
    } as unknown as GameDef;
    const move: Move = { actionId: asActionId('attack'), params: {} };

    const defaultKey = toMoveIdentityKey(noMapDef, move);
    const customKey = toMoveIdentityKey(noMapDef, move, {
      unresolvedActionClassSentinel: 'UNKNOWN',
    });

    assert.ok(defaultKey.includes('unclassified'));
    assert.ok(customKey.includes('UNKNOWN'));
    assert.ok(!customKey.includes('unclassified'));
  });

  it('identity key is stable across repeated calls', () => {
    const def = makeDef();
    const move: Move = {
      actionId: asActionId('attack'),
      params: { x: 1, y: 'hello' },
      freeOperation: true,
    };
    const keys = Array.from({ length: 10 }, () => toMoveIdentityKey(def, move));
    assert.ok(keys.every((k) => k === keys[0]));
  });

  it('both options false produces minimal key', () => {
    const def = makeDef();
    const move: Move = { actionId: asActionId('attack'), params: { t: 1 } };
    const key = toMoveIdentityKey(def, move, {
      includeFreeOperation: false,
      includeEffectiveActionClass: false,
    });
    const parts = key.split('|');
    assert.equal(parts.length, 2); // actionId + params only
  });
});
