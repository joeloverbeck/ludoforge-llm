import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  createCollector,
} from '../../src/kernel/index.js';

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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
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
    const ctx = makeCtx({ moveParams: { 'decision:$choice': 'beta' } });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne throws when move param binding is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('missing move param binding');
    });
  });

  it('chooseOne returns pending choice in discovery mode when move param binding is missing', () => {
    const ctx = makeCtx({ mode: 'discovery' });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.pendingChoice?.kind, 'pending');
    assert.equal(result.pendingChoice?.type, 'chooseOne');
    assert.equal(result.pendingChoice?.decisionId, 'decision:$choice');
    assert.deepEqual(result.pendingChoice?.options, ['alpha', 'beta']);
    assert.deepEqual(result.pendingChoice?.optionLegality, [
      { value: 'alpha', legality: 'legal', illegalReason: null },
      { value: 'beta', legality: 'legal', illegalReason: null },
    ]);
  });

  it('chooseOne throws when selected value is outside domain', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$choice': 'delta' } });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('chooseOne resolves templated bind names against current bindings', () => {
    const ctx = makeCtx({
      bindings: { $space: 'quang-nam:none' },
      moveParams: { 'decision:$adviseMode@{$space}::$adviseMode@quang-nam:none': 'assault' },
    });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$adviseMode@{$space}',
        bind: '$adviseMode@{$space}',
        options: { query: 'enums', values: ['sweep', 'assault', 'activate-remove'] },
      },
    };

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
      moveParams: { 'decision:$marker': 'cap_topGun' },
    });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$marker',
        bind: '$marker',
        options: { query: 'globalMarkers', states: ['unshaded', 'shaded'] },
      },
    };

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
      moveParams: { 'decision:$row': 'irrelevant' },
    });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$row',
        bind: '$row',
        options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not move-param encodable');
    });
  });

  it('chooseN succeeds for exact-length unique in-domain array', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha', 'gamma'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN throws on duplicate selections', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha', 'alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('must be unique');
    });
  });

  it('chooseN throws on wrong cardinality', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws on out-of-domain selections', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha', 'delta'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('rollRandom is a deterministic no-op in discovery mode', () => {
    const ctx = makeCtx({ mode: 'discovery' });
    const effect: EffectAST = {
      rollRandom: {
        bind: '$die',
        min: 1,
        max: 6,
        in: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$inside',
              bind: '$inside',
              options: { query: 'enums', values: ['x'] },
            },
          },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
    assert.equal(result.pendingChoice, undefined);
  });

  it('chooseN supports up-to cardinality with max only', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        max: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN supports min..max cardinality ranges', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha', 'beta'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN evaluates expression-valued min/max bounds', () => {
    const ctx = makeCtx({
      state: { ...makeState(), globalVars: { score: 2 } },
      moveParams: { 'decision:$picks': ['alpha', 'beta'] },
    });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: { if: { when: { op: '>', left: { ref: 'gvar', var: 'score' }, right: 0 }, then: 1, else: 0 } },
        max: { ref: 'gvar', var: 'score' },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN throws when expression-valued bounds evaluate to non-integers', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        max: true as unknown as number,
      },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('must evaluate to a non-negative integer'),
    );
  });

  it('chooseN range throws when selected count is outside min..max', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': [] } });
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws when n is negative or non-integer', () => {
    const negativeCtx = makeCtx({ moveParams: { 'decision:$picks': [] } });
    const nonIntegerCtx = makeCtx({ moveParams: { 'decision:$picks': ['alpha'] } });

    assert.throws(
      () =>
        applyEffect(
          {
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: -1,
            },
          },
          negativeCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );

    assert.throws(
      () =>
        applyEffect(
          {
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: 1.5,
            },
          },
          nonIntegerCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );
  });

  it('chooseN throws when cardinality declaration mixes n with max', () => {
    const ctx = makeCtx({ moveParams: { 'decision:$picks': ['alpha'] } });
    const effect = {
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
        max: 2,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('either exact n or range'),
    );
  });

  it('bindings shadow moveParams in options query evaluation for chooseOne', () => {
    const ctx = makeCtx({
      moveParams: { $owner: asPlayerId(0), 'decision:$pickedZone': 'hand:1' },
      bindings: { $owner: asPlayerId(1) },
    });
    const effect: EffectAST = {
      chooseOne: {
        internalDecisionId: 'decision:$pickedZone',
        bind: '$pickedZone',
        options: { query: 'zones', filter: { owner: { chosen: '$owner' } } },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('setMarker throws when marker lattice is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      setMarker: {
        space: 'discard:none',
        marker: 'unknownMarker',
        state: 'neutral',
      },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown marker lattice'),
    );
  });

  it('shiftMarker throws when marker lattice is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      shiftMarker: {
        space: 'discard:none',
        marker: 'unknownMarker',
        delta: 1,
      },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown marker lattice'),
    );
  });
});
