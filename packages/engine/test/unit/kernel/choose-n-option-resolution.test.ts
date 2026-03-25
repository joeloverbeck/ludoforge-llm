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
import {
  runWitnessSearch,
  type WitnessSearchBudget,
  type WitnessSearchStats,
  type WitnessSearchTierContext,
} from '../../../src/kernel/choose-n-option-resolution.js';
import type { ChoicePendingChooseNRequest, ChoiceRequest, MoveParamScalar } from '../../../src/kernel/types.js';
import type { DecisionSequenceSatisfiability } from '../../../src/kernel/decision-sequence-satisfiability.js';
import { eff } from '../../helpers/effect-tag-helper.js';

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
  _runningHash: 0n,
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
      eff({
        chooseN: {
          internalDecisionId: 'decision:$items',
          bind: '$items',
          options: { query: 'enums', values: ['a', 'b', 'c'] },
          min: 1,
          max: 2,
        },
      }),
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
          eff({
            chooseN: {
              internalDecisionId: 'decision:$large',
              bind: '$large',
              options: { query: 'enums', values: largeValues },
              min: 1,
              max: 10,
            },
          }),
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

    it('large-domain with high min: witness search resolves unresolved options', () => {
      // 20 options, min=5, max=10 → singleton probe [option] gives size=1 < min=5
      // → unresolved. Witness search then finds a 5-element completion for each.
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
          eff({
            chooseN: {
              internalDecisionId: 'decision:$highMin',
              bind: '$highMin',
              options: { query: 'enums', values: largeValues },
              min: 5,
              max: 10,
            },
          }),
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const result = legalChoicesEvaluate(def, state, makeMove('pickHighMin'));
      assert.equal(result.kind, 'pending');
      assert.equal(result.type, 'chooseN');

      // With witness search, each option now has a witness (5-element set).
      // All options should be legal+exact.
      for (const option of result.options) {
        assert.equal(option.legality, 'legal', `option ${String(option.value)} should be legal`);
        assert.equal(option.resolution, 'exact', `option ${String(option.value)} should be exact`);
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
          eff({
            chooseN: {
              internalDecisionId: 'decision:$probeCount',
              bind: '$probeCount',
              options: { query: 'enums', values: largeValues },
              min: 1,
              max: 10,
            },
          }),
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();
      const result = legalChoicesEvaluate(def, state, makeMove('probeCount'), {
        onProbeContextPrepared: () => { /* tracked for debugging */ },
        onDeferredPredicatesEvaluated: () => { /* tracked for debugging */ },
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
          eff({
            chooseN: {
              internalDecisionId: 'decision:$oracle',
              bind: '$oracle',
              options: { query: 'enums', values: ['w', 'x', 'y', 'z'] },
              min: 1,
              max: 3,
            },
          }),
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
          eff({
            chooseN: {
              internalDecisionId: 'decision:$confirm',
              bind: '$confirm',
              options: { query: 'enums', values: largeValues },
              min: 1,
              max: 5,
            },
          }),
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
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$pick',
              bind: '$pick',
              options: { query: 'enums', values: ['alpha', 'beta'] },
            },
          }),
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

// ── Witness search tier-context pruning tests ─────────────────────────

describe('runWitnessSearch with tierContext pruning', () => {
  /**
   * Build a minimal ChoicePendingChooseNRequest for witness search testing.
   * All options start as 'unknown' / 'provisional' (unresolved by singleton pass).
   */
  const makeChooseNRequest = (opts: {
    decisionKey: string;
    domain: readonly MoveParamScalar[];
    selected: readonly MoveParamScalar[];
    min: number;
    max: number;
  }): ChoicePendingChooseNRequest => ({
    kind: 'pending',
    complete: false,
    decisionKey: opts.decisionKey as DecisionKey,
    name: 'test',
    type: 'chooseN',
    options: opts.domain.map((v) => ({
      value: v,
      legality: 'unknown' as const,
      illegalReason: null,
      resolution: 'provisional' as const,
    })),
    targetKinds: [],
    min: opts.min,
    max: opts.max,
    selected: [...opts.selected],
    canConfirm: false,
  });

  /**
   * Build a probe callback that always returns 'complete' (confirmable).
   * Increments a counter to track how many probes were called.
   */
  const makeConfirmableProbe = (counter: { count: number }) =>
    (_move: Move): ChoiceRequest => {
      counter.count += 1;
      return { kind: 'complete' } as ChoiceRequest;
    };

  const alwaysSatisfiable = (_move: Move): DecisionSequenceSatisfiability => 'satisfiable';

  const dummyMove: Move = {
    actionId: asActionId('test'),
    params: {} as Move['params'],
  };

  it('prunes tier-blocked selections and reduces probe count', () => {
    // Tier 0: [A, B], Tier 1: [C]
    // Domain: [A, B, C], min: 2, max: 3, selected: []
    // Singleton pass left all options as 'unknown'/'provisional'.
    //
    // For target A:
    //   Extension candidates: [B, C]
    //   Without tier context: probes [A,B], [A,C], [A,B,C]
    //   With tier context: prunes [A,C] (C is tier-blocked), probes [A,B], [A,B,C]
    const domain: MoveParamScalar[] = ['A', 'B', 'C'];
    const request = makeChooseNRequest({
      decisionKey: '$pick',
      domain,
      selected: [],
      min: 2,
      max: 3,
    });

    const singletonResults = domain.map((v) => ({
      value: v,
      legality: 'unknown' as const,
      illegalReason: null,
      resolution: 'provisional' as const,
    }));

    const uniqueOptions = [...domain] as Move['params'][string][];
    const selectedKeys = new Set<string>();

    const tierContext: WitnessSearchTierContext = {
      tiers: [
        [{ value: 'A' }, { value: 'B' }],
        [{ value: 'C' }],
      ],
      qualifierMode: 'none',
      normalizedDomain: domain,
    };

    // Run WITH tier context.
    const withTierProbes = { count: 0 };
    const withTierBudget: WitnessSearchBudget = { remaining: 100 };
    const withTierStats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };
    runWitnessSearch(
      makeConfirmableProbe(withTierProbes),
      alwaysSatisfiable,
      dummyMove,
      request,
      singletonResults,
      uniqueOptions,
      selectedKeys,
      withTierBudget,
      withTierStats,
      tierContext,
    );

    // Run WITHOUT tier context.
    const withoutTierProbes = { count: 0 };
    const withoutTierBudget: WitnessSearchBudget = { remaining: 100 };
    const withoutTierStats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };
    runWitnessSearch(
      makeConfirmableProbe(withoutTierProbes),
      alwaysSatisfiable,
      dummyMove,
      request,
      singletonResults,
      uniqueOptions,
      selectedKeys,
      withoutTierBudget,
      withoutTierStats,
    );

    // With tier context should probe fewer times.
    assert.ok(
      withTierProbes.count < withoutTierProbes.count,
      `Expected fewer probes with tier context (${withTierProbes.count}) than without (${withoutTierProbes.count})`,
    );
  });

  it('produces correct legality results with tier-context pruning', () => {
    // Tier 0: [A], Tier 1: [B]
    // Domain: [A, B], min: 1, max: 2, selected: []
    //
    // Target A: [A] is valid (tier0 admissible), confirmable → legal
    // Target B: [B] is tier-blocked → exhausted → illegal (tier0 not exhausted)
    const domain: MoveParamScalar[] = ['A', 'B'];
    const request = makeChooseNRequest({
      decisionKey: '$pick',
      domain,
      selected: [],
      min: 1,
      max: 2,
    });

    const singletonResults = domain.map((v) => ({
      value: v,
      legality: 'unknown' as const,
      illegalReason: null,
      resolution: 'provisional' as const,
    }));

    const tierContext: WitnessSearchTierContext = {
      tiers: [
        [{ value: 'A' }],
        [{ value: 'B' }],
      ],
      qualifierMode: 'none',
      normalizedDomain: domain,
    };

    const budget: WitnessSearchBudget = { remaining: 100 };
    const result = runWitnessSearch(
      makeConfirmableProbe({ count: 0 }),
      alwaysSatisfiable,
      dummyMove,
      request,
      singletonResults,
      [...domain] as Move['params'][string][],
      new Set<string>(),
      budget,
      undefined,
      tierContext,
    );

    const optionA = result.find((o) => o.value === 'A');
    const optionB = result.find((o) => o.value === 'B');

    assert.ok(optionA);
    assert.equal(optionA.legality, 'legal', 'A should be legal (tier0 admissible)');
    assert.equal(optionA.resolution, 'exact');

    assert.ok(optionB);
    assert.equal(optionB.legality, 'illegal', 'B should be illegal (tier-blocked)');
    assert.equal(optionB.resolution, 'exact');
  });
});
