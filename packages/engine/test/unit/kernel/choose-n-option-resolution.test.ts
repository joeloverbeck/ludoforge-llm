import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceChooseN,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoicesDiscover,
  legalChoicesEvaluate,
  type ActionDef,
  type DecisionKey,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
}): GameDef =>
  ({
    metadata: { id: 'resolution-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
}) as unknown as GameState;

const makeMove = (actionId: string, params: Record<string, unknown> = {}): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
});

describe('chooseN option resolution field', () => {
  const smallChooseNAction: ActionDef = {
    id: asActionId('pickSmall'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [
      {
        chooseN: {
          internalDecisionId: 'decision:$items',
          bind: '$items',
          options: { query: 'enums', values: ['a', 'b', 'c'] },
          min: 1,
          max: 2,
        },
      } as EffectAST,
    ],
    limits: [],
  };

  describe('legalChoicesDiscover (buildChooseNPendingChoice path)', () => {
    it('does not set resolution on unresolved discovery options', () => {
      const def = makeBaseDef({ actions: [smallChooseNAction] });
      const state = makeBaseState();

      const result = legalChoicesDiscover(def, state, makeMove('pickSmall'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // Discovery options without selection are all 'unknown' with no resolution
      for (const option of result.options) {
        assert.equal(option.legality, 'unknown');
        assert.equal(option.resolution, undefined);
      }
    });
  });

  describe('advanceChooseN (statically-illegal tagging)', () => {
    it('tags selected-illegal option with resolution: exact after add', () => {
      const def = makeBaseDef({ actions: [smallChooseNAction] });
      const state = makeBaseState();
      const move = makeMove('pickSmall');

      const added = advanceChooseN(
        def,
        state,
        move,
        asDecisionKey('$items'),
        [],
        { type: 'add', value: 'a' },
      );

      assert.equal(added.done, false);
      if (added.done) {
        throw new Error('expected pending chooseN state');
      }

      const optionA = added.pending.options.find((o) => o.value === 'a');
      assert.ok(optionA);
      assert.equal(optionA.legality, 'illegal');
      assert.equal(optionA.resolution, 'exact');
    });
  });

  describe('legalChoicesEvaluate (mapChooseNOptions path)', () => {
    it('tags exhaustive-path options with resolution: exact for small domains', () => {
      const def = makeBaseDef({ actions: [smallChooseNAction] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickSmall'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      for (const option of result.options) {
        assert.equal(option.resolution, 'exact', `option ${String(option.value)} should be exact`);
      }
    });

    it('tags fallback-path options with resolution: provisional for large domains', () => {
      // 20 options with min=1, max=10 → C(20,1)+...+C(20,10) >> 1024
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action: ActionDef = {
        id: asActionId('pickLarge'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$large',
              bind: '$large',
              options: { query: 'enums', values: largeValues },
              min: 1,
              max: 10,
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickLarge'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      for (const option of result.options) {
        assert.equal(option.legality, 'unknown');
        assert.equal(option.resolution, 'provisional', `option ${String(option.value)} should be provisional`);
      }
    });
  });

  describe('legalChoicesEvaluate (chooseOne path)', () => {
    it('tags chooseOne options with resolution: exact', () => {
      const action: ActionDef = {
        id: asActionId('pickOne'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$pick',
              bind: '$pick',
              options: { query: 'enums', values: ['alpha', 'beta'] },
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickOne'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseOne');

      for (const option of result.options) {
        assert.equal(option.resolution, 'exact', `chooseOne option ${String(option.value)} should be exact`);
      }
    });
  });
});
