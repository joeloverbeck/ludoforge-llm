import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  makeDiscoveryEffectContext,
  makeDiscoveryProbeEffectContext,
  makeExecutionEffectContext,
  type EffectContextTestOverrides,
} from '../helpers/effect-context-test-helpers.js';
import {
  buildAdjacencyGraph,
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  EFFECT_RUNTIME_REASONS,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import { eff } from '../helpers/effect-tag-helper.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-choice-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 3 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [],
    'hand:1': [],
    'discard:none': [],
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
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(19n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

const makeDiscoveryCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeDiscoveryEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(19n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

const makeDiscoveryProbeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeDiscoveryProbeEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(19n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects choice assertions', () => {
  it('chooseOne succeeds when selected move param is in evaluated domain', () => {
    const ctx = makeCtx({ moveParams: { '$choice': 'beta' } });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne throws when move param binding is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('missing move param binding');
    });
  });

  it('chooseOne returns pending choice in discovery mode when move param binding is missing', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.type, 'chooseOne');
    assert.equal(result.pendingChoice.decisionKey, '$choice');
    assert.deepEqual(result.pendingChoice.options, [
      { value: 'alpha', legality: 'unknown', illegalReason: null },
      { value: 'beta', legality: 'unknown', illegalReason: null },
    ]);
  });

  it('chooseN returns initial engine-owned selection state in discovery mode when move param binding is missing', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        max: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.type, 'chooseN');
    assert.equal(result.pendingChoice.decisionKey, '$choice');
    assert.deepEqual(result.pendingChoice.selected, []);
    assert.equal(result.pendingChoice.canConfirm, true);
    assert.deepEqual(result.pendingChoice.options, [
      { value: 'alpha', legality: 'unknown', illegalReason: null },
      { value: 'beta', legality: 'unknown', illegalReason: null },
    ]);
  });

  it('chooseN discovery can materialize a transient in-progress selection without finalizing the move param', () => {
    const ctx = makeDiscoveryCtx({
      transientDecisionSelections: { '$choice': ['alpha'] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: {
          query: 'prioritized',
          tiers: [
            { query: 'enums', values: ['alpha'] },
            { query: 'enums', values: ['beta'] },
          ],
        },
        min: 1,
        max: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.type, 'chooseN');
    assert.deepEqual(result.pendingChoice.selected, ['alpha']);
    assert.equal(result.pendingChoice.canConfirm, true);
    assert.deepEqual(result.pendingChoice.options, [
      { value: 'alpha', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'beta', legality: 'unknown', illegalReason: null },
    ]);
  });

  it('chooseOne appends iterationPath to static decision IDs in discovery mode', () => {
    const ctx = makeDiscoveryCtx({ iterationPath: '[2]' });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.decisionKey, '$choice[2]');
  });

  it('chooseOne appends iterationPath to templated decision IDs in discovery mode', () => {
    const ctx = makeDiscoveryCtx({
      bindings: { $space: 'saigon:none' },
      iterationPath: '[2]',
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice@{$space}',
        bind: '$choice@{$space}',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.decisionKey, 'decision:$choice@{$space}::$choice@saigon:none[2]');
  });

  it('chooseOne execution resolves templated decision IDs with iteration-aware keys', () => {
    const ctx = makeCtx({
      bindings: { $space: 'saigon:none' },
      iterationPath: '[2]',
      moveParams: { 'decision:$choice@{$space}::$choice@saigon:none[2]': 'beta' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice@{$space}',
        bind: '$choice@{$space}',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.ok(result.bindings !== undefined);
    assert.equal(result.bindings['$choice@saigon:none'], 'beta');
  });

  it('chooseOne threads scope across sequential effects and requires #2 for the second occurrence', () => {
    const ctx = makeCtx({
      moveParams: {
        '$choice': 'alpha',
      },
    });
    const effects: readonly EffectAST[] = [
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$choice',
          bind: '$choice',
          options: { query: 'enums', values: ['alpha', 'beta'] },
        },
      }),
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$choice',
          bind: '$choice',
          options: { query: 'enums', values: ['alpha', 'beta'] },
        },
      }),
    ];

    assert.throws(() => applyEffects(effects, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME')
        && String(error).includes('$choice#2');
    });
  });

  it('chooseOne starts from a fresh scope on separate top-level calls', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    const first = applyEffect(effect, ctx);
    const second = applyEffect(effect, ctx);

    assert.equal(first.pendingChoice?.kind, 'pending');
    assert.equal(second.pendingChoice?.kind, 'pending');
    if (first.pendingChoice?.kind !== 'pending' || second.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choices');
    }
    assert.equal(first.pendingChoice.decisionKey, '$choice');
    assert.equal(second.pendingChoice.decisionKey, '$choice');
  });

  it('chooseOne throws when selected value is outside domain', () => {
    const ctx = makeCtx({ moveParams: { '$choice': 'delta' } });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('chooseOne owner mismatch emits strict validation reason in strict discovery contexts', () => {
    const ctx = makeDiscoveryCtx({
      decisionAuthorityPlayer: asPlayerId(1),
      moveParams: { '$choice': 'alpha' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) =>
      isEffectErrorCode(error, 'EFFECT_RUNTIME')
      && error.context?.reason === EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED);
  });

  it('chooseOne owner mismatch emits probe reason in probe discovery contexts', () => {
    const ctx = makeDiscoveryProbeCtx({
      decisionAuthorityPlayer: asPlayerId(1),
      moveParams: { '$choice': 'alpha' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) =>
      isEffectErrorCode(error, 'EFFECT_RUNTIME')
      && error.context?.reason === EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH);
  });

  it('chooseOne resolves templated bind names against current bindings', () => {
    const ctx = makeCtx({
      bindings: { $space: 'quang-nam:none' },
      moveParams: { 'decision:$adviseMode@{$space}::$adviseMode@quang-nam:none': 'assault' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$adviseMode@{$space}',
        bind: '$adviseMode@{$space}',
        options: { query: 'enums', values: ['sweep', 'assault', 'activate-remove'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne supports globalMarkers query domains filtered by marker state', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        globalMarkerLattices: [
          { id: 'cap_topGun', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
          { id: 'cap_migs', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
        ],
      },
      state: {
        ...makeState(),
        globalMarkers: { cap_topGun: 'unshaded', cap_migs: 'inactive' },
      },
      moveParams: { '$marker': 'cap_topGun' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$marker',
        bind: '$marker',
        options: { query: 'globalMarkers', states: ['unshaded', 'shaded'] },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne fails fast when options domain items are not move-param encodable', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: { blindSchedule: { levels: [{ level: 1, smallBlind: 10 }] } },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' },
            { field: 'smallBlind', type: 'int' },
          ],
        },
      ],
    };
    const ctx = makeCtx({
      def,
      moveParams: { '$row': 'irrelevant' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$row',
        bind: '$row',
        options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not move-param encodable');
    });
  });

  it('chooseN succeeds for exact-length unique in-domain array', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha', 'gamma'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN preserves token runtime bindings for downstream tokenProp usage', () => {
    const token: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 4 } };
    const baseState = makeState();
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        tokenTypes: [{ id: 'piece', props: { value: 'int' } }],
      },
      state: {
        ...baseState,
        zones: {
          ...baseState.zones,
          'hand:0': [token],
        },
      },
      moveParams: { '$picks': [asTokenId('tok-1')] },
    });
    const chooseEffect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'tokensInZone', zone: 'hand:0' },
        n: 1,
      },
    });

    const chooseResult = applyEffect(chooseEffect, ctx);
    assert.deepEqual(chooseResult.bindings?.$picks, [token]);

    const followupEffect: EffectAST = eff({
      forEach: {
        bind: '$pick',
        over: { query: 'binding', name: '$picks' },
        effects: [
          eff({ setVar: { scope: 'global', var: 'score', value: { _t: 2 as const, ref: 'tokenProp', token: '$pick', prop: 'value' } } }),
        ],
      },
    });
    const followupResult = applyEffect(followupEffect, {
      ...ctx,
      moveParams: {},
      bindings: chooseResult.bindings ?? {},
    });
    assert.equal(followupResult.state.globalVars.score, 4);
  });

  it('chooseOne rejects domains with ambiguous comparable collisions', () => {
    const tokenA: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 4 } };
    const tokenB: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 5 } };
    const baseState = makeState();
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        tokenTypes: [{ id: 'piece', props: { value: 'int' } }],
      },
      state: {
        ...baseState,
        zones: {
          ...baseState.zones,
          'hand:0': [tokenA, tokenB],
        },
      },
      moveParams: { '$pick': asTokenId('tok-1') },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$pick',
        bind: '$pick',
        options: { query: 'tokensInZone', zone: 'hand:0' },
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('ambiguous comparable values'),
    );
  });

  it('chooseN rejects domains with ambiguous comparable collisions', () => {
    const tokenA: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 4 } };
    const tokenB: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 5 } };
    const baseState = makeState();
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        tokenTypes: [{ id: 'piece', props: { value: 'int' } }],
      },
      state: {
        ...baseState,
        zones: {
          ...baseState.zones,
          'hand:0': [tokenA, tokenB],
        },
      },
      moveParams: { '$picks': [asTokenId('tok-1')] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        n: 1,
        options: { query: 'tokensInZone', zone: 'hand:0' },
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('ambiguous comparable values'),
    );
  });

  it('chooseN appends iterationPath to templated decision IDs in discovery mode', () => {
    const ctx = makeDiscoveryCtx({
      bindings: { $zone: 'saigon:none' },
      iterationPath: '[1]',
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks@{$zone}',
        bind: '$picks@{$zone}',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.decisionKey, 'decision:$picks@{$zone}::$picks@saigon:none[1]');
  });

  it('chooseN appends iterationPath to static decision IDs in discovery mode', () => {
    const ctx = makeDiscoveryCtx({ iterationPath: '[1]' });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    if (result.pendingChoice?.kind !== 'pending') {
      throw new Error('expected pending choice');
    }
    assert.equal(result.pendingChoice.decisionKey, '$picks[1]');
  });

  it('chooseN execution appends iterationPath to static decision IDs', () => {
    const ctx = makeCtx({
      iterationPath: '[1]',
      moveParams: { '$picks[1]': ['alpha'] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.ok(result.bindings !== undefined);
    assert.deepEqual(result.bindings.$picks, ['alpha']);
  });

  it('chooseN throws on duplicate selections', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha', 'alpha'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('must be unique');
    });
  });

  it('chooseN throws on wrong cardinality', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws on out-of-domain selections', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha', 'delta'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('chooseN rejects prioritized selections that skip an earlier tier', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['reserve-a'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: {
          query: 'prioritized',
          tiers: [
            { query: 'enums', values: ['available-a'] },
            { query: 'enums', values: ['reserve-a'] },
          ],
        },
        n: 1,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME')
        && String(error).includes('violates prioritized tier ordering');
    });
  });

  it('chooseN accepts prioritized selections that exhaust earlier tiers first', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['available-a', 'reserve-a'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: {
          query: 'prioritized',
          tiers: [
            { query: 'enums', values: ['available-a'] },
            { query: 'enums', values: ['reserve-a'] },
          ],
        },
        n: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN rejects qualifier-aware prioritized selections that skip an available same-type token', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        zones: [
          { id: asZoneId('available:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
          { id: asZoneId('map:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        ],
        tokenTypes: [{ id: 'piece', props: { type: 'string' } }],
      },
      state: {
        ...makeState(),
        zones: {
          'available:none': [
            { id: asTokenId('available-troop'), type: 'piece', props: { type: 'troops' } },
          ],
          'map:none': [
            { id: asTokenId('map-troop'), type: 'piece', props: { type: 'troops' } },
            { id: asTokenId('map-base'), type: 'piece', props: { type: 'base' } },
          ],
        },
      },
      moveParams: { '$picks': [asTokenId('map-troop'), asTokenId('map-base')] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: {
          query: 'prioritized',
          qualifierKey: 'type',
          tiers: [
            { query: 'tokensInZone', zone: 'available:none' },
            { query: 'tokensInZone', zone: 'map:none' },
          ],
        },
        n: 2,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME')
        && String(error).includes('violates prioritized tier ordering');
    });
  });

  it('chooseN leaves non-prioritized selections unchanged', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['reserve-a'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['available-a', 'reserve-a'] },
        n: 1,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('rollRandom discovery surfaces pending nested choices', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      rollRandom: {
        bind: '$die',
        min: 1,
        max: 6,
        in: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$inside',
              bind: '$inside',
              options: { query: 'enums', values: ['x'] },
            },
          }),
        ],
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
    assert.equal(result.pendingChoice?.kind, 'pending');
    assert.equal(result.pendingChoice?.decisionKey, '$inside');
    assert.deepEqual(result.pendingChoice?.options.map((option) => option.value), ['x']);
  });

  it('rollRandom discovery preserves chooseN alternatives when exact cardinality differs across outcomes', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      rollRandom: {
        bind: '$die',
        min: 1,
        max: 2,
        in: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$inside',
              bind: '$inside',
              options: { query: 'enums', values: ['a', 'b', 'c'] },
              min: 1,
              max: { _t: 2 as const, ref: 'binding' as const, name: '$die' },
            },
          }),
        ],
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pendingStochastic');
    if (result.pendingChoice?.kind !== 'pendingStochastic') {
      throw new Error('expected stochastic pending choice');
    }
    assert.deepEqual(
      result.pendingChoice.alternatives.map((alternative) => ({
        decisionKey: alternative.decisionKey,
        min: alternative.type === 'chooseN' ? alternative.min : undefined,
        max: alternative.type === 'chooseN' ? alternative.max : undefined,
        selected: alternative.type === 'chooseN' ? alternative.selected : null,
        canConfirm: alternative.type === 'chooseN' ? alternative.canConfirm : null,
        options: alternative.options.map((option) => option.value),
      })),
      [
        { decisionKey: '$inside', min: 1, max: 1, selected: [], canConfirm: false, options: ['a', 'b', 'c'] },
        { decisionKey: '$inside', min: 1, max: 2, selected: [], canConfirm: false, options: ['a', 'b', 'c'] },
      ],
    );
  });

  it('rollRandom discovery returns stochastic pending alternatives when outcome branches require different decisions', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      rollRandom: {
        bind: '$die',
        min: 1,
        max: 2,
        in: [
          eff({
            if: {
              when: { op: '==', left: { _t: 2 as const, ref: 'binding' as const, name: '$die' }, right: 1 },
              then: [
                eff({
                  chooseOne: {
                    internalDecisionId: 'decision:$alpha',
                    bind: '$alpha',
                    options: { query: 'enums', values: ['a1', 'a2'] },
                  },
                }),
              ],
              else: [
                eff({
                  chooseOne: {
                    internalDecisionId: 'decision:$beta',
                    bind: '$beta',
                    options: { query: 'enums', values: ['b1', 'b2'] },
                  },
                }),
              ],
            },
          }),
        ],
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pendingStochastic');
    if (result.pendingChoice?.kind !== 'pendingStochastic') {
      throw new Error('expected stochastic pending choice');
    }
    assert.equal(result.pendingChoice.source, 'rollRandom');
    assert.deepEqual(result.pendingChoice.alternatives.map((alt) => alt.decisionKey), ['$alpha', '$beta']);
  });

  it('chooseN supports up-to cardinality with max only', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        max: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN supports min..max cardinality ranges', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha', 'beta'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN evaluates expression-valued min/max bounds', () => {
    const ctx = makeCtx({
      state: { ...makeState(), globalVars: { score: 2 } },
      moveParams: { '$picks': ['alpha', 'beta'] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: { _t: 4 as const, if: { when: { op: '>', left: { _t: 2 as const, ref: 'gvar' as const, var: 'score' }, right: 0 }, then: 1, else: 0 } },
        max: { _t: 2 as const, ref: 'gvar' as const, var: 'score' },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN resolves min/max from a let binding in the same authored scope', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha', 'beta'] } });
    const effect: EffectAST = eff({
      let: {
        bind: '$pickCount',
        value: 2,
        in: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
              min: { _t: 2 as const, ref: 'binding' as const, name: '$pickCount' },
              max: { _t: 2 as const, ref: 'binding' as const, name: '$pickCount' },
            },
          }),
        ],
      },
    });

    const result = applyEffect(effect, ctx);
    // Spec 78: createMutableState always shallow-clones, so reference identity
    // is no longer guaranteed. Structural equality suffices.
    assert.deepStrictEqual(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN resolves templated binding refs through choice binding aliases', () => {
    const ctx = makeCtx({
      bindings: {
        $space: 'hand:0',
        '$limit@{$space}': 1,
      },
      moveParams: {
        'decision:$picks@{$space}::$picks@hand:0': ['alpha'],
      },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks@{$space}',
        bind: '$picks@{$space}',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        max: { _t: 2 as const, ref: 'binding' as const, name: '$limit@{$space}' },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.deepEqual(result.bindings?.['$picks@hand:0'], ['alpha']);
  });

  it('chooseN throws when expression-valued bounds evaluate to non-integers', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha'] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        max: true as unknown as number,
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('must evaluate to a non-negative integer'),
    );
  });

  it('chooseN range throws when selected count is outside min..max', () => {
    const ctx = makeCtx({ moveParams: { '$picks': [] } });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws when n is negative or non-integer', () => {
    const negativeCtx = makeCtx({ moveParams: { '$picks': [] } });
    const nonIntegerCtx = makeCtx({ moveParams: { '$picks': ['alpha'] } });

    assert.throws(
      () =>
        applyEffect(
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: -1,
            },
          }),
          negativeCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );

    assert.throws(
      () =>
        applyEffect(
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: 1.5,
            },
          }),
          nonIntegerCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );
  });

  it('chooseN throws when cardinality declaration mixes n with max', () => {
    const ctx = makeCtx({ moveParams: { '$picks': ['alpha'] } });
    const effect = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
        max: 2,
      },
    } as never);

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('either exact n or range'),
    );
  });

  it('bindings shadow moveParams in options query evaluation for chooseOne', () => {
    const ctx = makeCtx({
      moveParams: { $owner: asPlayerId(0), '$pickedZone': 'hand:1' },
      bindings: { $owner: asPlayerId(1) },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$pickedZone',
        bind: '$pickedZone',
        options: { query: 'zones', filter: { owner: { chosen: '$owner' } } },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne decision traces preserve effectPath provenance', () => {
    const collector = createCollector({ decisionTrace: true });
    const ctx = makeCtx({
      collector,
      traceContext: { eventContext: 'actionEffect', actionId: 'test-action', effectPathRoot: 'test.effects' },
      effectPath: '[3]',
      moveParams: { '$choice': 'beta' },
    });
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    });

    applyEffect(effect, ctx);

    assert.equal(collector.decisionTrace?.length, 1);
    assert.equal(collector.decisionTrace?.[0]?.provenance.effectPath, 'test.effects[3]');
  });

  it('chooseN decision traces preserve effectPath provenance', () => {
    const collector = createCollector({ decisionTrace: true });
    const ctx = makeCtx({
      collector,
      traceContext: { eventContext: 'actionEffect', actionId: 'test-action', effectPathRoot: 'test.effects' },
      effectPath: '[4]',
      moveParams: { '$picks': ['alpha'] },
    });
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 1,
      },
    });

    applyEffect(effect, ctx);

    assert.equal(collector.decisionTrace?.length, 1);
    assert.equal(collector.decisionTrace?.[0]?.provenance.effectPath, 'test.effects[4]');
  });

  it('setMarker throws when marker lattice is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({
      setMarker: {
        space: 'discard:none',
        marker: 'unknownMarker',
        state: 'neutral',
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown marker lattice'),
    );
  });

  it('shiftMarker throws when marker lattice is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({
      shiftMarker: {
        space: 'discard:none',
        marker: 'unknownMarker',
        delta: 1,
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown marker lattice'),
    );
  });

  it('setMarker normalizes unresolved space selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({
      setMarker: {
        space: { zoneExpr: { _t: 2 as const, ref: 'binding' as const, name: '$missingSpace' } },
        marker: 'unknownMarker',
        state: 'neutral',
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('setMarker.space zone resolution failed') &&
        String(error).includes('sourceErrorCode'),
    );
  });

  it('shiftMarker normalizes unresolved space selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({
      shiftMarker: {
        space: { zoneExpr: { _t: 2 as const, ref: 'binding' as const, name: '$missingSpace' } },
        marker: 'unknownMarker',
        delta: 1,
      },
    });

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('shiftMarker.space zone resolution failed') &&
        String(error).includes('sourceErrorCode'),
    );
  });

  it('setMarker passes through unresolved selector errors in discovery mode', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      setMarker: {
        space: { zoneExpr: { _t: 2 as const, ref: 'binding' as const, name: '$missingSpace' } },
        marker: 'unknownMarker',
        state: 'neutral',
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'));
  });

  it('shiftMarker passes through unresolved selector errors in discovery mode', () => {
    const ctx = makeDiscoveryCtx();
    const effect: EffectAST = eff({
      shiftMarker: {
        space: { zoneExpr: { _t: 2 as const, ref: 'binding' as const, name: '$missingSpace' } },
        marker: 'unknownMarker',
        delta: 1,
      },
    });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'));
  });

  it('shiftMarker is a no-op when destination state violates a space marker constraint', () => {
    const constrainedDef: GameDef = {
      ...makeDef(),
      zones: [
        {
          id: asZoneId('constrained-zone:none'),
          owner: 'none' as const,
          visibility: 'public' as const,
          ordering: 'stack' as const,
          attributes: { population: 0 },
        },
      ],
      markerLattices: [
        {
          id: 'mood',
          states: ['negative', 'neutral', 'positive'],
          defaultState: 'neutral',
          constraints: [
            {
              when: true as unknown as import('../../src/kernel/types.js').ConditionAST,
              allowedStates: ['neutral'],
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const constrainedState: GameState = {
      ...makeState(),
      zones: { 'constrained-zone:none': [] },
      markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
    };

    const ctx = makeCtx({
      def: constrainedDef,
      adjacencyGraph: buildAdjacencyGraph(constrainedDef.zones),
      state: constrainedState,
    });

    const effect: EffectAST = eff({
      shiftMarker: {
        space: 'constrained-zone:none',
        marker: 'mood',
        delta: 1,
      },
    });

    // Should be a no-op: the shift from neutral to positive violates the
    // pop-0 constraint, so the marker stays at neutral.
    const result = applyEffect(effect, ctx);
    const markers = result.state.markers['constrained-zone:none'] ?? {};
    const moodState = markers['mood'] ?? 'neutral';
    assert.equal(moodState, 'neutral', 'marker should stay at neutral when constraint blocks the shift');
  });
});
