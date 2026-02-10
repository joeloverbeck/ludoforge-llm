import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  type EffectContext,
  type EffectAST,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-lifecycle-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', label: 'string', frozen: 'boolean' } }],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const token = (id: string, type = 'card', props: Token['props'] = {}): Token => ({
  id: asTokenId(id),
  type,
  props,
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1'), token('d2')],
    'discard:none': [token('x1')],
    'hand:0': [],
  },
  nextTokenOrdinal: 3,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  state: makeState(),
  rng: createRng(99n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects token lifecycle', () => {
  it('createToken adds one token to target zone and increments nextTokenOrdinal once', () => {
    const ctx = makeCtx();
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect(
      { createToken: { type: 'card', zone: 'deck:none', props: { cost: 2, label: 'alpha', frozen: false } } },
      ctx,
    );

    const created = result.state.zones['deck:none']?.[0];
    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);
    assert.ok(created !== undefined);
    assert.equal(created.id, asTokenId('tok_card_3'));
    assert.equal(created.type, 'card');
    assert.deepEqual(created.props, { cost: 2, label: 'alpha', frozen: false });
    assert.equal(result.state.nextTokenOrdinal, 4);
    assert.equal(totalAfter, totalBefore + 1);
  });

  it('createToken evaluates prop expressions via evalValue', () => {
    const ctx = makeCtx({ bindings: { $baseCost: 4 } });

    const result = applyEffect(
      {
        createToken: {
          type: 'card',
          zone: 'deck:none',
          props: {
            cost: { op: '+', left: { ref: 'binding', name: '$baseCost' }, right: 1 },
            label: { ref: 'binding', name: '$label' },
            frozen: true,
          },
        },
      },
      { ...ctx, moveParams: { $label: 'beta' } },
    );

    assert.deepEqual(result.state.zones['deck:none']?.[0]?.props, { cost: 5, label: 'beta', frozen: true });
  });

  it('repeated createToken calls produce deterministic unique IDs', () => {
    const ctx = makeCtx();
    const effects: readonly EffectAST[] = [
      { createToken: { type: 'card', zone: 'deck:none' } },
      { createToken: { type: 'card', zone: 'deck:none' } },
    ];

    const result = applyEffects(effects, ctx);
    const createdIds = result.state.zones['deck:none']?.slice(0, 2).map((entry) => entry.id);

    assert.deepEqual(createdIds, [asTokenId('tok_card_4'), asTokenId('tok_card_3')]);
    assert.equal(result.state.nextTokenOrdinal, 5);
  });

  it('failed createToken does not increment nextTokenOrdinal', () => {
    const ctx = makeCtx();

    assert.throws(() =>
      applyEffect(
        {
          createToken: {
            type: 'card',
            zone: 'deck:none',
            props: { cost: { op: '+', left: 1, right: 'bad' } },
          },
        },
        ctx,
      ),
    );

    assert.equal(ctx.state.nextTokenOrdinal, 3);
    assert.equal(ctx.state.zones['deck:none']?.length, 2);
  });

  it('destroyToken removes exactly one token when present', () => {
    const ctx = makeCtx();
    const doomed = ctx.state.zones['deck:none']?.[1];
    assert.ok(doomed !== undefined);
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect({ destroyToken: { token: '$token' } }, { ...ctx, bindings: { $token: doomed } });

    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);
    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      [asTokenId('d1')],
    );
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('x1')],
    );
    assert.equal(totalAfter, totalBefore - 1);
    assert.equal(result.state.nextTokenOrdinal, ctx.state.nextTokenOrdinal);
  });

  it('destroyToken throws when token is not found', () => {
    const ctx = makeCtx({ bindings: { $token: asTokenId('missing') } });

    assert.throws(
      () => applyEffect({ destroyToken: { token: '$token' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not found'),
    );
  });

  it('destroyToken throws when token appears in multiple zones', () => {
    const dup = token('dup');
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [dup, ...(state.zones['deck:none'] ?? [])],
          'discard:none': [dup, ...(state.zones['discard:none'] ?? [])],
        },
      },
      bindings: { $token: dup.id },
    });

    assert.throws(
      () => applyEffect({ destroyToken: { token: '$token' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('multiple zones'),
    );
  });
});
