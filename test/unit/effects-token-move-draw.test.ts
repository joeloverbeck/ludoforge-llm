import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  nextInt,
  type EffectContext,
  type GameDef,
  type GameState,
  type MapSpaceDef,
  type StackingConstraint,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-token-move-draw-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const token = (id: string): Token => ({ id: asTokenId(id), type: 'card', props: {} });

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1'), token('d2'), token('d3')],
    'discard:none': [token('x1'), token('x2')],
    'hand:0': [],
    'hand:1': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(123n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects moveToken and draw', () => {
  it('moveToken to top inserts at destination index 0', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[1];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'top' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.equal(result.state.zones['discard:none']?.[0]?.id, movingToken.id);
  });

  it('moveToken to bottom appends at destination end', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'bottom' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    const destination = result.state.zones['discard:none'];
    const destinationLastIndex = (destination?.length ?? 1) - 1;
    assert.equal(destination?.[destinationLastIndex]?.id, movingToken.id);
  });

  it('moveToken with random chooses deterministic index for known seed', () => {
    const ctx = makeCtx({ rng: createRng(7n) });
    const movingToken = ctx.state.zones['deck:none']?.[2];
    assert.ok(movingToken !== undefined);

    const destinationSizeAfterRemoval = ctx.state.zones['discard:none']?.length ?? 0;
    const [expectedIndex, expectedRng] = nextInt(ctx.rng, 0, destinationSizeAfterRemoval);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'random' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.equal(result.state.zones['discard:none']?.[expectedIndex]?.id, movingToken.id);
    assert.deepEqual(result.rng.state, expectedRng.state);
  });

  it('moveToken updates source and destination counts by exactly one and conserves total tokens', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const sourceBefore = ctx.state.zones['deck:none']?.length ?? 0;
    const destinationBefore = ctx.state.zones['discard:none']?.length ?? 0;
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    const sourceAfter = result.state.zones['deck:none']?.length ?? 0;
    const destinationAfter = result.state.zones['discard:none']?.length ?? 0;
    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    assert.equal(sourceAfter, sourceBefore - 1);
    assert.equal(destinationAfter, destinationBefore + 1);
    assert.equal(totalAfter, totalBefore);
  });

  it('moveToken throws when token is not in resolved from zone', () => {
    const ctx = makeCtx();
    const tokenInDiscard = ctx.state.zones['discard:none']?.[0];
    assert.ok(tokenInDiscard !== undefined);

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
          { ...ctx, bindings: { $token: tokenInDiscard } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('resolved from zone'),
    );
  });

  it('moveToken throws when token appears in multiple zones', () => {
    const duplicate = token('dup');
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [duplicate, ...(state.zones['deck:none'] ?? [])],
          'discard:none': [duplicate, ...(state.zones['discard:none'] ?? [])],
        },
      },
    });

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'hand:0' } },
          { ...ctx, bindings: { $token: duplicate } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('multiple zones'),
    );
  });

  it('draw moves min(count, sourceSize) tokens from source front', () => {
    const ctx = makeCtx();

    const result = applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 5 } }, ctx);

    assert.equal(result.state.zones['deck:none']?.length, 0);
    assert.equal(result.state.zones['discard:none']?.length, 5);
    assert.equal(result.state.zones['discard:none']?.[0]?.id, asTokenId('d1'));
    assert.equal(result.state.zones['discard:none']?.[1]?.id, asTokenId('d2'));
    assert.equal(result.state.zones['discard:none']?.[2]?.id, asTokenId('d3'));
  });

  it('draw from empty source is a no-op', () => {
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [],
        },
      },
    });

    const result = applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 2 } }, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('draw throws on negative or non-integer count', () => {
    const ctx = makeCtx();

    assert.throws(
      () => applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: -1 } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('draw.count'),
    );

    assert.throws(
      () => applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 1.5 } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('draw.count'),
    );
  });

  it('moveToken random with empty destination does not advance rng', () => {
    const state = makeState();
    const ctx = makeCtx({
      rng: createRng(99n),
      state: {
        ...state,
        zones: {
          ...state.zones,
          'discard:none': [],
        },
      },
    });
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'random' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.deepEqual(result.rng.state, ctx.rng.state);
  });
});

describe('effects moveToken stacking enforcement', () => {
  const stackingConstraints: StackingConstraint[] = [
    {
      id: 'max-2-bases',
      description: 'Max 2 Bases per Province',
      spaceFilter: { spaceTypes: ['province'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'maxCount',
      maxCount: 2,
    },
  ];

  const mapSpaces: MapSpaceDef[] = [
    {
      id: 'discard:none',
      spaceType: 'province',
      population: 2,
      econ: 0,
      terrainTags: [],
      country: 'southVietnam',
      coastal: false,
      adjacentTo: [],
    },
  ];

  const base = (id: string): Token => ({ id: asTokenId(id), type: 'base', props: { faction: 'US' } });

  it('moveToken to zone exceeding maxCount throws STACKING_VIOLATION', () => {
    const def = { ...makeDef(), stackingConstraints };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'deck:none': [base('b3')],
        'discard:none': [base('b1'), base('b2')],
      },
    };
    const ctx = makeCtx({ def, state, mapSpaces });

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
          { ...ctx, bindings: { $token: 'b3' } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
    );
  });

  it('moveToken to zone within maxCount succeeds normally', () => {
    const def = { ...makeDef(), stackingConstraints };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'deck:none': [base('b2')],
        'discard:none': [base('b1')],
      },
    };
    const ctx = makeCtx({ def, state, mapSpaces });

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
      { ...ctx, bindings: { $token: 'b2' } },
    );

    assert.equal(result.state.zones['discard:none']!.length, 2);
  });
});
