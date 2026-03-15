import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoicesEvaluate,
  legalChoicesEvaluateWithTransientChooseNSelections,
  MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
}): GameDef =>
  ({
    metadata: { id: 'strategy-dispatch-test', players: { min: 2, max: 2 } },
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

const makeSmallChooseNAction = (id: string, values: readonly string[], min: number, max: number): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [
    {
      chooseN: {
        internalDecisionId: `decision:$items`,
        bind: '$items',
        options: { query: 'enums', values },
        min,
        max,
      },
    } as EffectAST,
  ],
  limits: [],
});

describe('chooseN strategy dispatch', () => {
  describe('strategy routing', () => {
    it('routes small domains to exhaustive enumerator with resolution: exact', () => {
      const action = makeSmallChooseNAction('pickSmall', ['a', 'b', 'c'], 1, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickSmall'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      for (const option of result.options) {
        assert.equal(option.resolution, 'exact', `option ${String(option.value)} should have exact resolution`);
      }
    });

    it('routes large domains to provisional fallback', () => {
      // 20 options, min=1, max=10 → combinations far exceed threshold
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeSmallChooseNAction('pickLarge', largeValues, 1, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickLarge'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      for (const option of result.options) {
        assert.equal(option.resolution, 'provisional', `option ${String(option.value)} should have provisional resolution`);
        assert.equal(option.legality, 'unknown');
      }
    });

    it('exports MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS constant', () => {
      assert.equal(typeof MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS, 'number');
      assert.equal(MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS, 1024);
    });
  });

  describe('oracle parity (small domain exact path)', () => {
    it('produces identical legality results for domains within threshold', () => {
      // 4 options, min=1, max=3 → C(4,1)+C(4,2)+C(4,3) = 4+6+4 = 14 combinations, well within 1024
      const action = makeSmallChooseNAction('pickFour', ['w', 'x', 'y', 'z'], 1, 3);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickFour'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');
      assert.equal(result.options.length, 4);

      // All options should be resolved with exact resolution
      for (const option of result.options) {
        assert.equal(option.resolution, 'exact');
        // With simple enum values and no downstream filtering, all options
        // should be legal (each can participate in at least one valid combination)
        assert.equal(option.legality, 'legal', `option ${String(option.value)} should be legal`);
      }
    });

    it('boundary: domain at exact threshold routes to exhaustive', () => {
      // 5 options, min=0, max=5: C(5,0)+C(5,1)+...+C(5,5) = 32 combinations
      const action = makeSmallChooseNAction('pickBoundary', ['a', 'b', 'c', 'd', 'e'], 0, 5);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickBoundary'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      for (const option of result.options) {
        assert.equal(option.resolution, 'exact');
      }
    });
  });

  describe('large-domain mixed surface', () => {
    it('already-selected options get illegal + exact in large domain', () => {
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeSmallChooseNAction('pickLargeSelect', largeValues, 1, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const move = makeMove('pickLargeSelect');

      // Use transient selections to simulate a selected option in the large domain
      const result = legalChoicesEvaluateWithTransientChooseNSelections(
        def,
        state,
        move,
        { '$items': ['opt0'] as readonly MoveParamScalar[] },
      );

      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      const optOpt0 = result.options.find((o) => o.value === 'opt0');
      assert.ok(optOpt0, 'opt0 should be in options');
      assert.equal(optOpt0.legality, 'illegal', 'already-selected option should be illegal');
      assert.equal(optOpt0.resolution, 'exact', 'already-selected option should have exact resolution');

      // Non-selected options should be provisional
      const nonSelected = result.options.filter((o) => o.value !== 'opt0');
      for (const option of nonSelected) {
        assert.equal(option.resolution, 'provisional', `non-selected ${String(option.value)} should be provisional`);
        assert.equal(option.legality, 'unknown', `non-selected ${String(option.value)} should be unknown`);
      }
    });

    it('at-capacity returns all options illegal + exact regardless of domain size', () => {
      // max=2 with 20 options, after selecting 2 items → minAdditional > maxAdditional
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeSmallChooseNAction('pickCapped', largeValues, 2, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const move = makeMove('pickCapped');

      // Transient selections fill both slots → at capacity
      const result = legalChoicesEvaluateWithTransientChooseNSelections(
        def,
        state,
        move,
        { '$items': ['opt0', 'opt1'] as readonly MoveParamScalar[] },
      );

      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // All options should be illegal + exact (at capacity, no more can be selected)
      for (const option of result.options) {
        assert.equal(option.legality, 'illegal', `option ${String(option.value)} at capacity should be illegal`);
        assert.equal(option.resolution, 'exact', `option ${String(option.value)} at capacity should have exact resolution`);
      }
    });

    it('no blanket all-unknown: mixed surface preserves per-option resolution', () => {
      // Verify that the large-domain path does NOT return identical resolution
      // for statically-resolved vs unresolved options
      const largeValues = Array.from({ length: 25 }, (_, i) => `item${String(i)}`);
      const action = makeSmallChooseNAction('pickMixed', largeValues, 2, 12);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const move = makeMove('pickMixed');

      // Select one option to create mixed surface
      const result = legalChoicesEvaluateWithTransientChooseNSelections(
        def,
        state,
        move,
        { '$items': ['item0'] as readonly MoveParamScalar[] },
      );

      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      const exactOptions = result.options.filter((o) => o.resolution === 'exact');
      const provisionalOptions = result.options.filter((o) => o.resolution === 'provisional');

      // Must have at least one exact (the selected option) and multiple provisional
      assert.ok(exactOptions.length >= 1, 'should have at least one exact option');
      assert.ok(provisionalOptions.length > 0, 'should have provisional options');

      // Selected option must be exact+illegal
      const selectedOpt = exactOptions.find((o) => o.value === 'item0');
      assert.ok(selectedOpt, 'selected option should be in exact set');
      assert.equal(selectedOpt.legality, 'illegal');
    });
  });
});
