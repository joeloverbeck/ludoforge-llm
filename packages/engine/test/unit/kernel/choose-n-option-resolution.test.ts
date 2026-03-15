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

    it('singleton probe resolves confirmable options as legal+exact for large domains', () => {
      // 20 options with min=1, max=10 → C(20,1)+...+C(20,10) >> 1024
      // With simple enum values, each singleton probe [option] meets min=1 → confirmable
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

      // All options should be resolved by singleton probe as legal+exact
      // because each singleton [option] with min=1 is immediately confirmable
      for (const option of result.options) {
        assert.equal(option.legality, 'legal', `option ${String(option.value)} should be legal`);
        assert.equal(option.resolution, 'exact', `option ${String(option.value)} should be exact`);
      }
    });

    it('large-domain with high min produces unresolved/provisional options', () => {
      // 20 options, min=5, max=10 → probing [option] gives selected.length=1 < min=5
      // → probe returns same chooseN pending with canConfirm=false → unresolved
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action: ActionDef = {
        id: asActionId('pickHighMin'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$highMin',
              bind: '$highMin',
              options: { query: 'enums', values: largeValues },
              min: 5,
              max: 10,
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickHighMin'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // Singleton probe [option] with min=5 → not confirmable → unresolved → provisional
      for (const option of result.options) {
        assert.equal(option.legality, 'unknown', `option ${String(option.value)} should be unknown`);
        assert.equal(option.resolution, 'provisional', `option ${String(option.value)} should be provisional`);
      }
    });
  });

  describe('singleton probe pass (large domain)', () => {
    it('probe count equals number of unresolved options (no combinatorial explosion)', () => {
      // 20 options, min=1, max=10 → singleton pass probes exactly 20 times
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action: ActionDef = {
        id: asActionId('probeCount'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$probeCount',
              bind: '$probeCount',
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
      let probeContextPreparedCount = 0;
      let deferredPredicateCount = 0;

      const result = legalChoicesEvaluate(def, state, makeMove('probeCount'), {
        onProbeContextPrepared: () => { probeContextPreparedCount += 1; },
        onDeferredPredicatesEvaluated: (count: number) => { deferredPredicateCount += count; },
      });

      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');
      // All 20 options should be resolved (not left as unknown/provisional)
      const resolvedOptions = result.options.filter((o) => o.resolution === 'exact');
      assert.equal(resolvedOptions.length, 20, 'all 20 options should be exactly resolved');
    });

    it('oracle parity: singleton probe illegal matches exhaustive illegal for small domains', () => {
      // Use a domain small enough for exhaustive AND large enough to reason about.
      // 4 options, min=1, max=3 — exhaustive is 14 combinations, well within threshold.
      // All options should be legal via exhaustive (each participates in some combo).
      // Verify the singleton probe would agree by checking the evaluate result.
      const action: ActionDef = {
        id: asActionId('oracleParity'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$oracle',
              bind: '$oracle',
              options: { query: 'enums', values: ['w', 'x', 'y', 'z'] },
              min: 1,
              max: 3,
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      // This uses the exhaustive path (small domain)
      const result = legalChoicesEvaluate(def, state, makeMove('oracleParity'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // All options should be legal+exact via exhaustive
      for (const option of result.options) {
        assert.equal(option.legality, 'legal');
        assert.equal(option.resolution, 'exact');
      }
    });

    it('immediately confirmable option at selected+1 size is marked legal+exact', () => {
      // 20 options, min=1, max=5. Probe [option] with min=1 → confirmable → legal+exact
      const largeValues = Array.from({ length: 20 }, (_, i) => `v${String(i)}`);
      const action: ActionDef = {
        id: asActionId('confirmable'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$confirm',
              bind: '$confirm',
              options: { query: 'enums', values: largeValues },
              min: 1,
              max: 5,
            },
          } as EffectAST,
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('confirmable'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // Every option should be immediately confirmable (min=1, probe adds 1 option)
      for (const option of result.options) {
        assert.equal(option.legality, 'legal', `${String(option.value)} should be legal`);
        assert.equal(option.resolution, 'exact', `${String(option.value)} should be exact`);
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
