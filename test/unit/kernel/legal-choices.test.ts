import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoices,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type OperationProfileDef,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  operationProfiles?: readonly OperationProfileDef[];
  globalVars?: GameDef['globalVars'];
}): GameDef =>
  ({
    metadata: { id: 'legal-choices-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
      activePlayerOrder: 'roundRobin',
    },
    actions: overrides?.actions ?? [],
    operationProfiles: overrides?.operationProfiles,
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'hand:0': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
  ...overrides,
});

const makeMove = (actionId: string, params: Record<string, unknown> = {}): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
});

describe('legalChoices()', () => {
  it('1. simple action with no chooseOne/chooseN returns { complete: true }', () => {
    const action: ActionDef = {
      id: asActionId('simpleAction'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        { setVar: { scope: 'global', var: 'score', value: 5 } },
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    });
    const state = makeBaseState({ globalVars: { score: 0 } });
    const move = makeMove('simpleAction');

    const result = legalChoices(def, state, move);
    assert.deepStrictEqual(result, { complete: true });
  });

  it('2. action with one chooseOne returns options on first call, { complete: true } after param filled', () => {
    const action: ActionDef = {
      id: asActionId('pickColor'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            bind: '$color',
            options: { query: 'enums', values: ['red', 'blue', 'green'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // First call: no params → returns choice request
    const result1 = legalChoices(def, state, makeMove('pickColor'));
    assert.equal(result1.complete, false);
    assert.equal(result1.name, '$color');
    assert.equal(result1.type, 'chooseOne');
    assert.deepStrictEqual(result1.options, ['red', 'blue', 'green']);

    // Second call: param filled → complete
    const result2 = legalChoices(def, state, makeMove('pickColor', { $color: 'blue' }));
    assert.deepStrictEqual(result2, { complete: true });
  });

  it('3. action with one chooseN (range mode) returns options with min/max, max clamped to domain size', () => {
    const action: ActionDef = {
      id: asActionId('pickTargets'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            min: 1,
            max: 10,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('pickTargets'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$targets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, ['a', 'b', 'c']);
    assert.equal(result.min, 1);
    assert.equal(result.max, 3); // clamped from 10 to domain size 3
  });

  it('4. action with multiple sequential chooseOnes returns them one at a time', () => {
    const action: ActionDef = {
      id: asActionId('multiChoice'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            bind: '$first',
            options: { query: 'enums', values: ['x', 'y'] },
          },
        },
        {
          chooseOne: {
            bind: '$second',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // No params → first choice
    const r1 = legalChoices(def, state, makeMove('multiChoice'));
    assert.equal(r1.name, '$first');
    assert.equal(r1.complete, false);

    // First param filled → second choice
    const r2 = legalChoices(def, state, makeMove('multiChoice', { $first: 'x' }));
    assert.equal(r2.name, '$second');
    assert.equal(r2.complete, false);

    // Both params filled → complete
    const r3 = legalChoices(def, state, makeMove('multiChoice', { $first: 'x', $second: 'b' }));
    assert.deepStrictEqual(r3, { complete: true });
  });

  it('5. invalid selection in params throws descriptive error', () => {
    const action: ActionDef = {
      id: asActionId('pickColor'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            bind: '$color',
            options: { query: 'enums', values: ['red', 'blue'] },
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    assert.throws(
      () => legalChoices(def, state, makeMove('pickColor', { $color: 'purple' })),
      (err: Error) => {
        assert.ok(err.message.includes('invalid selection'));
        assert.ok(err.message.includes('$color'));
        return true;
      },
    );
  });

  it('6. chooseOne inside if.then only appears when condition is true', () => {
    const action: ActionDef = {
      id: asActionId('conditionalChoice'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          if: {
            when: {
              op: '>=',
              left: { ref: 'gvar', var: 'score' },
              right: 5,
            },
            then: [
              {
                chooseOne: {
                  bind: '$bonus',
                  options: { query: 'enums', values: ['gold', 'silver'] },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    });

    // Condition false (score < 5) → complete (no choice)
    const stateLow = makeBaseState({ globalVars: { score: 2 } });
    const r1 = legalChoices(def, stateLow, makeMove('conditionalChoice'));
    assert.deepStrictEqual(r1, { complete: true });

    // Condition true (score >= 5) → choice appears
    const stateHigh = makeBaseState({ globalVars: { score: 7 } });
    const r2 = legalChoices(def, stateHigh, makeMove('conditionalChoice'));
    assert.equal(r2.complete, false);
    assert.equal(r2.name, '$bonus');
    assert.deepStrictEqual(r2.options, ['gold', 'silver']);
  });

  it('7. chooseN with min >= 1 and empty domain returns ChoiceRequest with options: []', () => {
    const action: ActionDef = {
      id: asActionId('emptyDomain'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            bind: '$targets',
            options: { query: 'tokensInZone', zone: 'board:none' },
            min: 1,
            max: 5,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ zones: { 'board:none': [], 'hand:0': [] } });

    const result = legalChoices(def, state, makeMove('emptyDomain'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$targets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, []);
    assert.equal(result.min, 1);
    assert.equal(result.max, 0); // clamped to domain size 0
  });

  it('8. legalChoices evaluates let bindings so subsequent options queries reference them correctly', () => {
    const action: ActionDef = {
      id: asActionId('letThenChoose'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          let: {
            bind: '$threshold',
            value: 3,
            in: [
              {
                chooseOne: {
                  bind: '$pick',
                  options: {
                    query: 'intsInRange',
                    min: 1,
                    max: 3,
                  },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('letThenChoose'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$pick');
    assert.equal(result.type, 'chooseOne');
    assert.deepStrictEqual(result.options, [1, 2, 3]);
  });

  it('9. legalChoices does NOT walk rollRandom.in effects (returns complete before inner choices)', () => {
    const action: ActionDef = {
      id: asActionId('randomThenChoose'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 6,
            in: [
              {
                chooseOne: {
                  bind: '$innerChoice',
                  options: { query: 'enums', values: ['a', 'b'] },
                },
              },
            ],
          },
        },
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // rollRandom stops traversal, inner chooseOne not reached
    const result = legalChoices(def, state, makeMove('randomThenChoose'));
    assert.deepStrictEqual(result, { complete: true });
  });

  it('10. action with chooseN exact-n mode returns options with correct cardinality constraint', () => {
    const action: ActionDef = {
      id: asActionId('exactPick'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            bind: '$exactTargets',
            options: { query: 'enums', values: ['alpha', 'beta', 'gamma', 'delta'] },
            n: 2,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoices(def, state, makeMove('exactPick'));
    assert.equal(result.complete, false);
    assert.equal(result.name, '$exactTargets');
    assert.equal(result.type, 'chooseN');
    assert.deepStrictEqual(result.options, ['alpha', 'beta', 'gamma', 'delta']);
    assert.equal(result.min, 2);
    assert.equal(result.max, 2);

    // Filled with valid exact-2 selection → complete
    const r2 = legalChoices(def, state, makeMove('exactPick', { $exactTargets: ['alpha', 'gamma'] }));
    assert.deepStrictEqual(r2, { complete: true });
  });

  describe('operation profile support', () => {
    it('walks resolution stage effects for profiled actions', () => {
      const action: ActionDef = {
        id: asActionId('trainOp'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: OperationProfileDef = {
        id: 'trainProfile',
        actionId: asActionId('trainOp'),
        legality: {},
        cost: {},
        targeting: {},
        resolution: [
          {
            stage: 'selectSpaces',
            effects: [
              {
                chooseN: {
                  bind: '$spaces',
                  options: { query: 'enums', values: ['saigon', 'hue', 'danang'] },
                  min: 1,
                  max: 10,
                },
              } as EffectAST,
            ],
          },
        ],
        partialExecution: { mode: 'allow' },
      };

      const def = makeBaseDef({ actions: [action], operationProfiles: [profile] });
      const state = makeBaseState();

      const result = legalChoices(def, state, makeMove('trainOp'));
      assert.equal(result.complete, false);
      assert.equal(result.name, '$spaces');
      assert.equal(result.type, 'chooseN');
      assert.deepStrictEqual(result.options, ['saigon', 'hue', 'danang']);
      assert.equal(result.min, 1);
      assert.equal(result.max, 3); // clamped from 10
    });

    it('returns complete when legality.when fails for profiled action', () => {
      const action: ActionDef = {
        id: asActionId('blockedOp'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };

      const profile: OperationProfileDef = {
        id: 'blockedProfile',
        actionId: asActionId('blockedOp'),
        legality: {
          when: {
            op: '>=',
            left: { ref: 'gvar', var: 'resources' },
            right: 5,
          },
        },
        cost: {},
        targeting: {},
        resolution: [
          {
            effects: [
              {
                chooseOne: {
                  bind: '$target',
                  options: { query: 'enums', values: ['a', 'b'] },
                },
              },
            ],
          },
        ],
        partialExecution: { mode: 'allow' },
      };

      const def = makeBaseDef({
        actions: [action],
        operationProfiles: [profile],
        globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
      });
      const state = makeBaseState({ globalVars: { resources: 2 } });

      const result = legalChoices(def, state, makeMove('blockedOp'));
      assert.deepStrictEqual(result, { complete: true });
    });
  });

  describe('purity invariant', () => {
    it('does not mutate state or partialMove', () => {
      const action: ActionDef = {
        id: asActionId('pureTest'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              bind: '$choice',
              options: { query: 'enums', values: ['a', 'b'] },
            },
          },
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const move = makeMove('pureTest');

      const bigIntReplacer = (_key: string, value: unknown) =>
        typeof value === 'bigint' ? `__bigint__${value.toString()}` : value;

      const stateBefore = JSON.stringify(state, bigIntReplacer);
      const moveBefore = JSON.stringify(move, bigIntReplacer);

      legalChoices(def, state, move);

      assert.equal(JSON.stringify(state, bigIntReplacer), stateBefore, 'state must not be mutated');
      assert.equal(JSON.stringify(move, bigIntReplacer), moveBefore, 'move must not be mutated');
    });
  });
});
